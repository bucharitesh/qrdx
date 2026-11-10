#!/usr/bin/env node
// Backfill: gives every account its own workspace and moves the rows that
// belong to no workspace (organization_id IS NULL, the old "personal
// workspace") into it.
//
//   node --env-file=apps/docs/.env.local packages/database/scripts/backfill-workspaces.mjs
//       dry run (the default): reads, prints every planned insert and update,
//       rolls back. Writes nothing.
//   ... backfill-workspaces.mjs --apply --backup ./backfill-backup.json
//       writes the JSON backup of every row it will change, then applies the
//       plan in one transaction, checks the counts and commits (or rolls
//       back and exits 1 when a check fails).
//
// Options: --lock-timeout <5s>, --statement-timeout <60s>.
//
// Safe to run more than once: own workspaces have ids derived from the user
// id (the same formula as packages/auth/own-workspace-id.ts), inserts use
// ON CONFLICT (id) DO NOTHING, and only rows still without a workspace are
// moved, so a second run plans nothing. The app creates the same workspaces
// on sign-up and on a first dashboard visit (apps/docs/lib/workspaces.ts),
// so it may run before or after the app is deployed, and as often as needed.
//
// What it changes, and what it never touches:
// - INSERT organization + member (owner) for each account without its own
//   workspace; the slug comes from the name, else the email, never reserved.
// - UPDATE <table>.organization_id from NULL to the creator's own workspace
//   for qr_code, landing_page, custom_domain, qr_preset, brand_kit,
//   file_asset, folder, tag, webhook_endpoint, notification_setting, api_key,
//   and oauth_app rows with an owner (owner_user_id). Nothing else changes in
//   those rows: qr_code.slug, slug_scope and domain_id stay, so the unique
//   indexes (slug_scope, slug) and (domain_id, slug) and every printed
//   /q/<slug>, /p/<slug> and custom-domain link resolve exactly as before.
// - First-party OAuth apps (owner_user_id NULL) stay as they are: no owner,
//   no workspace. Their client ids, redirect URIs and tokens are untouched.
// - community_theme rows point at qr_preset.id, which doesn't change, so the
//   public gallery keeps every published theme.
//
// Self-contained on purpose (no app imports): apps/docs/tests/database/
// backfill-workspaces.test.ts checks that the ids, slugs, names and reserved
// words here match packages/auth, and runs it against a fake database.

import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// ─── Rules (mirror packages/auth/own-workspace-id.ts and workspace-rules.ts) ─

function digest(userId) {
  return createHash("sha256")
    .update(`qrdx:own-workspace:${userId}`)
    .digest("hex")
    .slice(0, 32);
}

export const ownWorkspaceId = (userId) => `ws_${digest(userId)}`;
export const ownWorkspaceMemberId = (userId) => `wsm_${digest(userId)}`;

export const WORKSPACE_SLUG_MAX = 48;

export const RESERVED_WORKSPACE_SLUGS = [
  "analytics",
  "api-keys",
  "codes",
  "developers",
  "domains",
  "files",
  "forms",
  "home",
  "import",
  "integrations",
  "new",
  "notifications",
  "pages",
  "settings",
  "team",
  "teams",
  "themes",
  "usage",
  "webhooks",
  "account",
  "admin",
  "api",
  "app",
  "auth",
  "billing",
  "create",
  "dashboard",
  "default",
  "docs",
  "help",
  "invite",
  "invites",
  "join",
  "login",
  "logout",
  "me",
  "oauth",
  "onboarding",
  "personal",
  "portal",
  "pricing",
  "qrdx",
  "register",
  "sign-in",
  "sign-out",
  "sign-up",
  "signin",
  "signup",
  "support",
  "workspace",
  "workspaces",
  "www",
];
const RESERVED = new Set(RESERVED_WORKSPACE_SLUGS);

export function slugifyWorkspaceName(text) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, WORKSPACE_SLUG_MAX)
    .replace(/-+$/g, "");
}

const emailLocalPart = (email) => (email ?? "").split("@")[0] ?? "";

export function ownWorkspaceSlugBase(person) {
  const candidates = [
    slugifyWorkspaceName(person.name ?? ""),
    slugifyWorkspaceName(emailLocalPart(person.email)),
  ];
  const trimToFit = (slug) =>
    slug.slice(0, WORKSPACE_SLUG_MAX - 5).replace(/-+$/g, "");
  for (const candidate of candidates) {
    const base = trimToFit(candidate);
    if (!base) continue;
    const long = base.length < 3 ? `${base}-workspace` : base;
    if (!RESERVED.has(long)) return long;
    return trimToFit(`${long}-workspace`);
  }
  return "workspace-1";
}

export function nextFreeSlug(base, taken) {
  if (!(taken.has(base) || RESERVED.has(base))) return base;
  for (let n = 2; n < 10_000; n++) {
    const slug = `${base}-${n}`;
    if (!taken.has(slug)) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export function ownWorkspaceName(person) {
  const first = (
    (person.name ?? "").trim().split(/\s+/)[0] || emailLocalPart(person.email)
  ).slice(0, 36);
  return first ? `${first}'s workspace` : "My workspace";
}

// ─── SQL ─────────────────────────────────────────────────────────────────────

/** Tables whose rows had "no workspace" before, keyed by their creator column. */
export const ADOPTED_TABLES = [
  { table: "qr_code", owner: "user_id" },
  { table: "landing_page", owner: "user_id" },
  { table: "custom_domain", owner: "user_id" },
  { table: "qr_preset", owner: "user_id" },
  { table: "brand_kit", owner: "user_id" },
  { table: "file_asset", owner: "user_id" },
  { table: "folder", owner: "user_id" },
  { table: "tag", owner: "user_id" },
  { table: "webhook_endpoint", owner: "user_id" },
  { table: "notification_setting", owner: "user_id" },
  { table: "api_key", owner: "user_id" },
  // First-party apps have no owner and never get a workspace.
  { table: "oauth_app", owner: "owner_user_id" },
];

export const SQL = {
  lockTimeout: (value) => `SET LOCAL lock_timeout = '${value}'`,
  statementTimeout: (value) => `SET LOCAL statement_timeout = '${value}'`,
  advisoryLock: `SELECT pg_advisory_xact_lock(hashtext('qrdx:backfill-workspaces'))`,
  users: `SELECT id, name, email FROM "user" ORDER BY created_at, id`,
  organizations: "SELECT id, slug FROM organization",
  members: "SELECT id, organization_id, user_id FROM member",
  /** Rows without a workspace, locked until the transaction ends. */
  personalRows: ({ table, owner }) =>
    `SELECT * FROM "${table}" WHERE organization_id IS NULL AND ${owner} IS NOT NULL ORDER BY id FOR UPDATE`,
  firstPartyApps: `SELECT count(*)::int AS n FROM "oauth_app" WHERE organization_id IS NULL AND owner_user_id IS NULL`,
  publishedThemes: "SELECT theme_id FROM community_theme",
  domains: "SELECT id, user_id, organization_id FROM custom_domain",
  pages: "SELECT id, user_id, organization_id FROM landing_page",
  insertOrganization:
    "INSERT INTO organization (id, name, slug, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING",
  // Any conflict (id, or the (organization_id, user_id) unique index) means
  // the membership already exists.
  insertMember: `INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES ($1, $2, $3, 'owner', $4) ON CONFLICT DO NOTHING`,
  moveRows: ({ table }) =>
    `UPDATE "${table}" SET organization_id = $1 WHERE id = ANY($2::text[]) AND organization_id IS NULL`,
  countPersonal: ({ table, owner }) =>
    `SELECT count(*)::int AS n FROM "${table}" WHERE organization_id IS NULL AND ${owner} IS NOT NULL`,
  ownMembers:
    "SELECT organization_id, user_id, role FROM member WHERE organization_id = ANY($1::text[])",
  countOrganizations:
    "SELECT count(*)::int AS n FROM organization WHERE id = ANY($1::text[])",
};

// ─── Plan ────────────────────────────────────────────────────────────────────

/** Everything the plan is made from, read inside the transaction. */
export async function loadSnapshot(client) {
  const [users, organizations, members] = [
    (await client.query(SQL.users)).rows,
    (await client.query(SQL.organizations)).rows,
    (await client.query(SQL.members)).rows,
  ];
  const personal = {};
  for (const spec of ADOPTED_TABLES) {
    personal[spec.table] = (await client.query(SQL.personalRows(spec))).rows;
  }
  const [firstParty] = (await client.query(SQL.firstPartyApps)).rows;
  const published = (await client.query(SQL.publishedThemes)).rows;
  const domains = (await client.query(SQL.domains)).rows;
  const pages = (await client.query(SQL.pages)).rows;
  return {
    users,
    organizations,
    members,
    personal,
    firstPartyApps: firstParty?.n ?? 0,
    publishedThemeIds: new Set(published.map((row) => row.theme_id)),
    domains,
    pages,
  };
}

/**
 * The inserts and updates that make the data consistent: pure, so the
 * dry run prints exactly what --apply does.
 */
export function planBackfill(snapshot, now = new Date()) {
  const orgIds = new Set(snapshot.organizations.map((org) => org.id));
  const taken = new Set(snapshot.organizations.map((org) => org.slug));
  const memberIds = new Set(snapshot.members.map((m) => m.id));
  const usersById = new Map(snapshot.users.map((u) => [u.id, u]));
  const warnings = [];

  const workspaces = [];
  const memberships = [];
  for (const person of snapshot.users) {
    const id = ownWorkspaceId(person.id);
    const memberId = ownWorkspaceMemberId(person.id);
    if (!orgIds.has(id)) {
      const slug = nextFreeSlug(ownWorkspaceSlugBase(person), taken);
      taken.add(slug);
      workspaces.push({
        id,
        name: ownWorkspaceName(person),
        slug,
        userId: person.id,
        createdAt: now,
      });
    }
    if (!memberIds.has(memberId)) {
      const own = snapshot.members.find(
        (m) => m.organization_id === id && m.user_id === person.id
      );
      if (!own) {
        if (orgIds.has(id)) {
          warnings.push(
            `${person.id}: own workspace ${id} exists without their membership; adding it back as owner`
          );
        }
        memberships.push({
          id: memberId,
          organizationId: id,
          userId: person.id,
          createdAt: now,
        });
      }
    }
  }

  const moves = [];
  for (const spec of ADOPTED_TABLES) {
    const byWorkspace = new Map();
    for (const row of snapshot.personal[spec.table] ?? []) {
      const userId = row[spec.owner];
      if (!usersById.has(userId)) {
        warnings.push(
          `${spec.table} ${row.id}: creator ${userId} has no account; left as it is`
        );
        continue;
      }
      const target = ownWorkspaceId(userId);
      const ids = byWorkspace.get(target) ?? [];
      ids.push(row.id);
      byWorkspace.set(target, ids);
    }
    for (const [organizationId, ids] of byWorkspace) {
      moves.push({ table: spec.table, organizationId, ids });
    }
  }

  // Cross-references that stay as they were, reported so nothing surprises.
  const notes = [];
  const domainById = new Map(snapshot.domains.map((d) => [d.id, d]));
  const pageById = new Map(snapshot.pages.map((p) => [p.id, p]));
  const scopeOf = (row) =>
    row.organization_id ?? (row.user_id ? ownWorkspaceId(row.user_id) : null);
  for (const code of snapshot.personal.qr_code ?? []) {
    const target = ownWorkspaceId(code.user_id);
    const domain = code.domain_id ? domainById.get(code.domain_id) : null;
    if (domain && scopeOf(domain) !== target) {
      warnings.push(
        `qr_code ${code.id}: its custom domain ${domain.id} is in another workspace; the code moves, the domain doesn't (its link keeps working)`
      );
    }
    const page = code.page_id ? pageById.get(code.page_id) : null;
    if (page && scopeOf(page) !== target) {
      warnings.push(
        `qr_code ${code.id}: its hosted page ${page.id} is in another workspace; both keep working`
      );
    }
  }
  const presets = snapshot.personal.qr_preset ?? [];
  const published = presets.filter((p) => snapshot.publishedThemeIds.has(p.id));
  if (published.length > 0) {
    notes.push(
      `${published.length} of the saved themes moved are published in the community gallery; community_theme keeps pointing at the same qr_preset ids.`
    );
  }
  if (snapshot.firstPartyApps > 0) {
    notes.push(
      `${snapshot.firstPartyApps} first-party OAuth app(s) (no owner) stay without a workspace, as before.`
    );
  }
  const codes = snapshot.personal.qr_code ?? [];
  if (codes.length > 0) {
    notes.push(
      `${codes.length} dynamic code(s) move with slug, slug_scope and domain_id unchanged: their short links resolve as before.`
    );
  }

  return { workspaces, memberships, moves, warnings, notes };
}

export const isEmptyPlan = (plan) =>
  plan.workspaces.length === 0 &&
  plan.memberships.length === 0 &&
  plan.moves.length === 0;

/** Every row the plan changes, as it is now (for --backup). */
export function backupOf(snapshot, plan) {
  const rows = {};
  for (const move of plan.moves) {
    const wanted = new Set(move.ids);
    rows[move.table] = [
      ...(rows[move.table] ?? []),
      ...(snapshot.personal[move.table] ?? []).filter((row) =>
        wanted.has(row.id)
      ),
    ];
  }
  return {
    kind: "qrdx-backfill-workspaces-backup",
    createdAt: new Date().toISOString(),
    note: "Rows below are as they were before --apply (organization_id NULL). Inserted organization and member rows are listed by id; nothing else was changed.",
    updatedRows: rows,
    insertedOrganizations: plan.workspaces,
    insertedMembers: plan.memberships,
  };
}

export function describePlan(plan) {
  const lines = [];
  for (const ws of plan.workspaces) {
    lines.push(
      `INSERT organization id=${ws.id} slug=${ws.slug} name=${JSON.stringify(ws.name)} (own workspace of user ${ws.userId})`
    );
  }
  for (const m of plan.memberships) {
    lines.push(
      `INSERT member id=${m.id} organization=${m.organizationId} user=${m.userId} role=owner`
    );
  }
  for (const move of plan.moves) {
    lines.push(
      `UPDATE ${move.table} SET organization_id=${move.organizationId} WHERE id IN (${move.ids.join(", ")}) [${move.ids.length} row(s)]`
    );
  }
  return lines;
}

// ─── Apply and verify ────────────────────────────────────────────────────────

export async function applyPlan(client, plan) {
  for (const ws of plan.workspaces) {
    await client.query(SQL.insertOrganization, [
      ws.id,
      ws.name,
      ws.slug,
      ws.createdAt,
    ]);
  }
  for (const m of plan.memberships) {
    await client.query(SQL.insertMember, [
      m.id,
      m.organizationId,
      m.userId,
      m.createdAt,
    ]);
  }
  const moved = {};
  for (const move of plan.moves) {
    const spec = ADOPTED_TABLES.find((t) => t.table === move.table);
    const result = await client.query(SQL.moveRows(spec), [
      move.organizationId,
      move.ids,
    ]);
    moved[move.table] = (moved[move.table] ?? 0) + (result.rowCount ?? 0);
  }
  return moved;
}

/** Problems found after applying (empty when every count is right). */
export async function verifyPlan(client, plan, snapshot, moved) {
  const problems = [];
  for (const spec of ADOPTED_TABLES) {
    const expected = plan.moves
      .filter((m) => m.table === spec.table)
      .reduce((sum, m) => sum + m.ids.length, 0);
    if ((moved[spec.table] ?? 0) !== expected) {
      problems.push(
        `${spec.table}: moved ${moved[spec.table] ?? 0} row(s), planned ${expected}`
      );
    }
    const [left] = (await client.query(SQL.countPersonal(spec))).rows;
    const orphans = (snapshot.personal[spec.table] ?? []).filter(
      (row) => !snapshot.users.some((u) => u.id === row[spec.owner])
    ).length;
    if ((left?.n ?? 0) !== orphans) {
      problems.push(
        `${spec.table}: ${left?.n ?? 0} row(s) still have no workspace (expected ${orphans})`
      );
    }
  }
  const ownIds = snapshot.users.map((u) => ownWorkspaceId(u.id));
  const [orgs] = (await client.query(SQL.countOrganizations, [ownIds])).rows;
  if ((orgs?.n ?? 0) !== ownIds.length) {
    problems.push(
      `organization: ${orgs?.n ?? 0} own workspace(s), expected ${ownIds.length}`
    );
  }
  const owners = (await client.query(SQL.ownMembers, [ownIds])).rows;
  const without = snapshot.users.filter(
    (u) =>
      !owners.some(
        (m) =>
          m.organization_id === ownWorkspaceId(u.id) &&
          m.user_id === u.id &&
          String(m.role).split(",").includes("owner")
      )
  );
  if (without.length > 0) {
    problems.push(
      `member: ${without.length} account(s) aren't an owner of their own workspace`
    );
  }
  return problems;
}

// ─── Command line ────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const options = {
    apply: false,
    backup: null,
    lockTimeout: "5s",
    statementTimeout: "60s",
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--dry-run") options.apply = false;
    else if (arg === "--backup") options.backup = argv[++i] ?? null;
    else if (arg === "--lock-timeout") options.lockTimeout = argv[++i];
    else if (arg === "--statement-timeout")
      options.statementTimeout = argv[++i];
    else throw new Error(`Unknown option: ${arg}`);
  }
  const duration = /^\d+(ms|s|min)$/;
  if (
    !(
      duration.test(options.lockTimeout ?? "") &&
      duration.test(options.statementTimeout ?? "")
    )
  ) {
    throw new Error("Timeouts look like 5s, 500ms or 2min.");
  }
  if (options.apply && !options.backup) {
    throw new Error(
      "--apply needs --backup <file> (the rows it changes are saved there first)."
    );
  }
  return options;
}

/**
 * The whole run on one connection, in one transaction. Returns the exit
 * code. `client` is anything with query(text, params) -> { rows, rowCount }.
 */
export async function run({
  client,
  argv,
  log = console.log,
  save = (path, text) => writeFile(path, text, { flag: "wx" }),
  now = new Date(),
}) {
  const options = parseArgs(argv);
  log(options.apply ? "Mode: APPLY" : "Mode: dry run (nothing is written)");
  await client.query("BEGIN");
  try {
    await client.query(SQL.lockTimeout(options.lockTimeout));
    await client.query(SQL.statementTimeout(options.statementTimeout));
    await client.query(SQL.advisoryLock);

    const snapshot = await loadSnapshot(client);
    const plan = planBackfill(snapshot, now);
    log(
      `${snapshot.users.length} account(s), ${snapshot.organizations.length} workspace(s) before.`
    );
    for (const line of describePlan(plan)) log(`  ${line}`);
    for (const note of plan.notes) log(`note: ${note}`);
    for (const warning of plan.warnings) log(`warning: ${warning}`);

    if (isEmptyPlan(plan)) {
      log(
        "Nothing to do: every account has its own workspace and every row has one."
      );
      await client.query("ROLLBACK");
      return 0;
    }
    if (!options.apply) {
      log(
        `Planned: ${plan.workspaces.length} workspace(s), ${plan.memberships.length} membership(s), ${plan.moves.reduce((n, m) => n + m.ids.length, 0)} row(s) to move. Run with --apply --backup <file> to write.`
      );
      await client.query("ROLLBACK");
      return 0;
    }

    await save(
      options.backup,
      `${JSON.stringify(backupOf(snapshot, plan), null, 2)}\n`
    );
    log(`Backup written to ${options.backup}`);
    const moved = await applyPlan(client, plan);
    const problems = await verifyPlan(client, plan, snapshot, moved);
    if (problems.length > 0) {
      for (const problem of problems) log(`check failed: ${problem}`);
      await client.query("ROLLBACK");
      log("Rolled back: nothing was changed.");
      return 1;
    }
    await client.query("COMMIT");
    log(
      `Committed: ${plan.workspaces.length} workspace(s), ${plan.memberships.length} membership(s), ${Object.values(moved).reduce((a, b) => a + b, 0)} row(s) moved. Counts checked.`
    );
    return 0;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {
      // The connection may be gone; the original error is what matters.
    });
    throw error;
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "Set DATABASE_URL (for example with node --env-file=apps/docs/.env.local)."
    );
    return 2;
  }
  let host = "the database";
  try {
    host = new URL(url).host;
  } catch {
    // Not a URL: print nothing about it (never the value itself).
  }
  console.log(`Database: ${host}`);
  const { Pool, neonConfig } = await import("@neondatabase/serverless");
  const { default: ws } = await import("ws");
  neonConfig.webSocketConstructor = ws;
  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    return await run({ client, argv: process.argv.slice(2) });
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  );
}
