#!/usr/bin/env node
// Seed: QRdx's official community items, published by the official @qrdx
// profile (the team@qrdx.dev account, workspace "qrdx"), verified:
// - the official frames of the qrdx engine (packages/qrdx/src/frames/
//   official/*.json, listed in ./community-seed.json in catalogue order),
//   with the engine's ids as their slugs, so /community/frames/<id> keeps
//   the same URL it had before the seed;
// - the 10 new themes and 8 collections in ./community-seed.json;
// - 41 of the app's built-in themes (apps/app/utils/qr-presets.ts), as
//   ./community-seed-presets.json stores them: written from the presets by
//   apps/app/scripts/community-seed/generate.ts, each payload what a
//   publish of that theme stores;
// - QRdx's own page templates (apps/app/lib/landing/templates), each run
//   through the publish scrub (sample text, no photos, no real data), and
//   8 official kits pairing one with a seeded theme and/or frame, as
//   ./community-seed-pages.json stores them (apps/app/scripts/
//   community-seed/page-templates.ts);
// - the official account's themes already in the gallery (copied by
//   backfill-community.mjs) are moved to @qrdx and marked official.
//
//   node --env-file=apps/app/.env.local packages/database/scripts/seed-community.mjs
//       dry run (the default): prints every planned insert and update,
//       rolls back. Writes nothing.
//   ... seed-community.mjs --apply --backup ./community-seed-backup.json
//       writes the backup, applies the plan in one transaction, checks the
//       counts and commits (or rolls back and exits 1).
//
// Run after manual-sql/0012_community.sql and backfill-community.mjs. Safe
// to run more than once: ids are fixed ("ci_official_frame_wifi-card"),
// inserts use ON CONFLICT DO NOTHING, so a second run plans nothing. An item
// already seeded is never changed (published versions are immutable). Like
// a publish, an item whose design is already published (same type and
// payload hash) is skipped with a warning.
//
// Every seeded design is checked to scan Great with the publish gate's
// samples by apps/app/tests/database/seed-community.test.ts, which also
// keeps this file's rules equal to the app's.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  LICENSE,
  OFFICIAL_EMAIL,
  OFFICIAL_HANDLE,
  OFFICIAL_PROFILE_ID,
  OFFICIAL_WORKSPACE_SLUG,
  payloadHash,
} from "./backfill-community.mjs";

const here = (path) => new URL(path, import.meta.url);

export const SEED = JSON.parse(
  readFileSync(here("./community-seed.json"), "utf8")
);

/** Page templates and kits, generated from the app (see the header). */
export const PAGES_SEED = JSON.parse(
  readFileSync(here("./community-seed-pages.json"), "utf8")
);

/** Built-in themes, generated from the app's presets (see the header). */
export const PRESET_SEED = JSON.parse(
  readFileSync(here("./community-seed-presets.json"), "utf8")
);

/** The engine's official frame files, in catalogue order. */
export function loadOfficialFrames() {
  return SEED.frames.map((id) =>
    JSON.parse(
      readFileSync(here(`../../qrdx/src/frames/official/${id}.json`), "utf8")
    )
  );
}

export const seedItemId = (type, id) => `ci_official_${type}_${id}`;
const versionId = (itemId) =>
  `civ_${createHash("sha256").update(`qrdx:community-version:${itemId}:1`).digest("hex").slice(0, 24)}`;

/** A seed theme's full style: its fields plus its official frame. */
export function resolveSeedTheme(theme, framesById) {
  const frame = framesById.get(theme.frame.official);
  if (!frame)
    throw new Error(`${theme.id}: no official frame ${theme.frame.official}`);
  const { official: _id, ...colors } = theme.frame;
  return {
    ...theme.style,
    frame: { style: "custom", spec: frame.spec, ...colors },
  };
}

// ─── SQL ─────────────────────────────────────────────────────────────────────

export const SQL = {
  lockTimeout: (value) => `SET LOCAL lock_timeout = '${value}'`,
  statementTimeout: (value) => `SET LOCAL statement_timeout = '${value}'`,
  advisoryLock: `SELECT pg_advisory_xact_lock(hashtext('qrdx:seed-community'))`,
  officialUser: `SELECT id FROM "user" WHERE lower(email) = $1`,
  officialWorkspace: "SELECT id FROM organization WHERE slug = $1",
  officialProfile:
    "SELECT id, user_id, workspace_id, verified_at FROM community_profile WHERE kind = 'official' OR id = $1",
  items:
    "SELECT id, type, slug, status, payload_hash, profile_id, is_official, created_by FROM community_item",
  insertProfile:
    "INSERT INTO community_profile (id, kind, user_id, workspace_id, handle, display_name, verified_at, status, created_at, updated_at) VALUES ($1, 'official', $2, $3, $4, 'QRdx', $5, 'active', $5, $5) ON CONFLICT DO NOTHING",
  verifyProfile:
    "UPDATE community_profile SET verified_at = $2, updated_at = $2 WHERE id = $1 AND verified_at IS NULL",
  insertItem:
    "INSERT INTO community_item (id, type, slug, profile_id, created_by, name, description, status, license, current_version, payload, payload_hash, facets, is_official, featured_at, published_at, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, 'published', $8, 1, $9, $10, $11, true, $12, $13, $13, $13) ON CONFLICT DO NOTHING",
  insertVersion:
    "INSERT INTO community_item_version (id, item_id, version, payload, payload_hash, created_by, created_at) VALUES ($1, $2, 1, $3, $4, $5, $6) ON CONFLICT DO NOTHING",
  insertTag:
    "INSERT INTO community_item_tag (item_id, tag) VALUES ($1, $2) ON CONFLICT DO NOTHING",
  insertEntry:
    "INSERT INTO community_collection_entry (collection_id, item_id, position) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
  adoptTheme:
    "UPDATE community_item SET profile_id = $2, is_official = true, updated_at = $3 WHERE id = $1",
  countSeeded:
    "SELECT count(*)::int AS n FROM community_item WHERE id = ANY($1::text[]) AND is_official = true AND profile_id = $2",
  countEntries:
    "SELECT count(*)::int AS n FROM community_collection_entry WHERE collection_id = ANY($1::text[])",
};

// ─── Plan ────────────────────────────────────────────────────────────────────

/** Every official item the seed publishes, built from the files alone. */
export function buildSeedItems(frames = loadOfficialFrames()) {
  const framesById = new Map(frames.map((frame) => [frame.id, frame]));
  const featured = new Set(SEED.featured);
  const items = [];
  for (const frame of frames) {
    const payload = { frame: { style: "custom", spec: frame.spec } };
    items.push({
      id: seedItemId("frame", frame.id),
      ref: `frame:${frame.id}`,
      type: "frame",
      slug: frame.id,
      name: frame.name,
      description: frame.description,
      tags: frame.tags.slice(0, 5),
      payload,
      facets: { contentTypes: frame.contentTypes, category: frame.category },
      featured: featured.has(`frame:${frame.id}`),
    });
  }
  for (const theme of SEED.themes) {
    const payload = { style: resolveSeedTheme(theme, framesById) };
    items.push({
      id: seedItemId("theme", theme.id),
      ref: `theme:${theme.id}`,
      type: "theme",
      slug: theme.id,
      name: theme.name,
      description: theme.description,
      tags: theme.tags.slice(0, 5),
      payload,
      facets: { pairedFrame: theme.frame.official },
      featured: featured.has(`theme:${theme.id}`),
    });
  }
  // Already in the shape a publish stores: the payload is used as it is.
  for (const theme of PRESET_SEED.themes) {
    items.push({
      id: seedItemId("theme", theme.id),
      ref: `theme:${theme.id}`,
      type: "theme",
      slug: theme.slug,
      name: theme.name,
      description: theme.description,
      tags: theme.tags.slice(0, 5),
      payload: theme.payload,
      facets: { preset: theme.id },
      featured: featured.has(`theme:${theme.id}`),
    });
  }
  // Already in the shape a publish stores, scrubbed by the app.
  for (const template of PAGES_SEED.templates) {
    items.push({
      id: seedItemId("page-template", template.id),
      ref: `page-template:${template.id}`,
      type: "page-template",
      slug: template.slug,
      name: template.name,
      description: template.description,
      tags: template.tags.slice(0, 5),
      payload: template.payload,
      facets: { pageType: template.payload.page.type },
      featured: false,
    });
  }
  const byRef = new Map(items.map((item) => [item.ref, item]));
  for (const kit of PAGES_SEED.kits) {
    const part = (ref) => {
      if (!ref) return;
      const item = byRef.get(ref);
      if (!item) throw new Error(`kit ${kit.id}: unknown item ${ref}`);
      return item.id;
    };
    const parts = {
      theme: part(kit.theme),
      frame: part(kit.frame),
      page: part(kit.page),
    };
    // As a publish orders a kit's entries: theme, frame, page.
    const entries = [parts.theme, parts.frame, parts.page].filter(Boolean);
    items.push({
      id: seedItemId("kit", kit.id),
      ref: `kit:${kit.id}`,
      type: "kit",
      slug: kit.slug,
      name: kit.name,
      description: kit.description,
      tags: [],
      payload: {
        kit: {
          ...(parts.theme ? { theme: parts.theme } : {}),
          ...(parts.frame ? { frame: parts.frame } : {}),
          page: parts.page,
        },
      },
      facets: null,
      featured: false,
      entries,
    });
  }
  for (const collection of SEED.collections) {
    const entries = collection.items.map((ref) => {
      const item = byRef.get(ref);
      if (!item) throw new Error(`${collection.id}: unknown item ${ref}`);
      return item.id;
    });
    items.push({
      id: seedItemId("collection", collection.id),
      ref: `collection:${collection.id}`,
      type: "collection",
      slug: collection.id,
      name: collection.name,
      description: collection.description,
      tags: [],
      payload: { items: entries },
      facets: null,
      featured: false,
      entries,
    });
  }
  return items;
}

export async function loadSnapshot(client, options) {
  const read = async (text, params) => (await client.query(text, params)).rows;
  const [user] = await read(SQL.officialUser, [
    options.officialEmail.toLowerCase(),
  ]);
  const [workspace] = await read(SQL.officialWorkspace, [
    options.officialWorkspace,
  ]);
  const profiles = await read(SQL.officialProfile, [OFFICIAL_PROFILE_ID]);
  const items = await read(SQL.items);
  return {
    officialUserId: user?.id ?? null,
    officialWorkspaceId: workspace?.id ?? null,
    officialProfile: profiles[0] ?? null,
    items,
  };
}

export function planSeed(snapshot, seedItems, now = new Date()) {
  const warnings = [];
  if (!snapshot.officialUserId) {
    throw new Error(
      "The official account isn't in the database: sign in once as it, or pass --official-email."
    );
  }
  if (!snapshot.officialWorkspaceId) {
    warnings.push(
      "The official workspace wasn't found: @qrdx gets no workspace."
    );
  }
  const profileId = snapshot.officialProfile?.id ?? OFFICIAL_PROFILE_ID;
  const profile = snapshot.officialProfile
    ? null
    : {
        id: OFFICIAL_PROFILE_ID,
        userId: snapshot.officialUserId,
        workspaceId: snapshot.officialWorkspaceId,
        handle: OFFICIAL_HANDLE,
        verifiedAt: now,
      };
  const verify =
    snapshot.officialProfile && !snapshot.officialProfile.verified_at
      ? snapshot.officialProfile.id
      : null;

  const existingIds = new Set(snapshot.items.map((item) => item.id));
  const takenSlugs = new Set(
    snapshot.items.map((item) => `${item.type}:${item.slug}`)
  );
  // Designs already published, as a publish refuses them (ALREADY_PUBLISHED)
  const published = new Map(
    snapshot.items
      .filter((item) => item.status === "published" && item.payload_hash)
      .map((item) => [`${item.type}:${item.payload_hash}`, item.slug])
  );
  const inserts = [];
  for (const item of seedItems) {
    if (existingIds.has(item.id)) continue;
    if (takenSlugs.has(`${item.type}:${item.slug}`)) {
      warnings.push(
        `${item.type} slug "${item.slug}" is taken by another item: ${item.id} is skipped.`
      );
      continue;
    }
    const design = `${item.type}:${payloadHash(item.payload)}`;
    if (published.has(design)) {
      warnings.push(
        `${item.type} ${item.slug} is already published as "${published.get(design)}": ${item.id} is skipped.`
      );
      continue;
    }
    published.set(design, item.slug);
    inserts.push(item);
  }
  // Seeding a collection or kit needs every item it lists in the database.
  const present = new Set([...existingIds, ...inserts.map((item) => item.id)]);
  const insertable = inserts.filter(
    (item) => !item.entries || item.entries.every((id) => present.has(id))
  );
  for (const item of inserts) {
    if (!insertable.includes(item)) {
      warnings.push(
        `${item.type} ${item.slug} lists an item that wasn't seeded: skipped.`
      );
    }
  }

  const adopt = snapshot.items
    .filter(
      (item) =>
        item.type === "theme" &&
        item.created_by === snapshot.officialUserId &&
        !item.id.startsWith("ci_official_") &&
        (item.is_official !== true || item.profile_id !== profileId)
    )
    .map((item) => item.id);

  return {
    profile,
    verify,
    profileId,
    inserts: insertable,
    adopt,
    warnings,
    now,
  };
}

export const isEmptySeed = (plan) =>
  !(plan.profile || plan.verify) &&
  plan.inserts.length === 0 &&
  plan.adopt.length === 0;

export function describeSeed(plan) {
  const lines = [];
  if (plan.profile) {
    lines.push(
      `INSERT community_profile id=${plan.profile.id} kind=official handle=@${plan.profile.handle} user=${plan.profile.userId} workspace=${plan.profile.workspaceId ?? "-"} verified`
    );
  }
  if (plan.verify)
    lines.push(`UPDATE community_profile id=${plan.verify} SET verified`);
  for (const item of plan.inserts) {
    lines.push(
      `INSERT community_item ${item.type} slug=${item.slug} id=${item.id}${item.featured ? " featured" : ""}${item.entries ? ` (${item.entries.length} items)` : ""}`
    );
  }
  for (const id of plan.adopt) {
    lines.push(`UPDATE community_item id=${id} SET profile=@qrdx, official`);
  }
  return lines;
}

export function backupOf(snapshot, plan) {
  const adopting = new Set(plan.adopt);
  return {
    kind: "qrdx-seed-community-backup",
    createdAt: new Date().toISOString(),
    note: "Inserted rows are listed by id (delete them to undo). Updated rows are as they were before --apply.",
    insertedProfile: plan.profile?.id ?? null,
    insertedItems: plan.inserts.map((item) => item.id),
    updatedItems: snapshot.items.filter((item) => adopting.has(item.id)),
    verifiedProfile: plan.verify,
  };
}

export async function applySeed(client, plan, userId) {
  const now = plan.now;
  if (plan.profile) {
    await client.query(SQL.insertProfile, [
      plan.profile.id,
      plan.profile.userId,
      plan.profile.workspaceId,
      plan.profile.handle,
      now,
    ]);
  }
  if (plan.verify) await client.query(SQL.verifyProfile, [plan.verify, now]);
  // Items first (collections and kits reference them), in seed order.
  const ordered = [
    ...plan.inserts.filter((item) => !item.entries),
    ...plan.inserts.filter((item) => item.entries),
  ];
  for (const item of ordered) {
    const hash = payloadHash(item.payload);
    await client.query(SQL.insertItem, [
      item.id,
      item.type,
      item.slug,
      plan.profileId,
      userId,
      item.name,
      item.description,
      LICENSE,
      JSON.stringify(item.payload),
      hash,
      item.facets ? JSON.stringify(item.facets) : null,
      item.featured ? now : null,
      now,
    ]);
    await client.query(SQL.insertVersion, [
      versionId(item.id),
      item.id,
      JSON.stringify(item.payload),
      hash,
      userId,
      now,
    ]);
    for (const tag of item.tags) {
      await client.query(SQL.insertTag, [item.id, tag]);
    }
    for (const [position, entry] of (item.entries ?? []).entries()) {
      await client.query(SQL.insertEntry, [item.id, entry, position]);
    }
  }
  for (const id of plan.adopt) {
    await client.query(SQL.adoptTheme, [id, plan.profileId, now]);
  }
}

export async function verifySeed(client, plan) {
  const problems = [];
  const count = async (text, params) =>
    (await client.query(text, params)).rows[0]?.n ?? 0;
  const ids = [...plan.inserts.map((item) => item.id), ...plan.adopt];
  const seeded = await count(SQL.countSeeded, [ids, plan.profileId]);
  if (seeded !== ids.length) {
    problems.push(
      `community_item: ${seeded} of ${ids.length} official item(s) in place`
    );
  }
  const collections = plan.inserts.filter((item) => item.entries);
  const expected = collections.reduce(
    (sum, item) => sum + item.entries.length,
    0
  );
  const entries = await count(SQL.countEntries, [
    collections.map((item) => item.id),
  ]);
  if (entries !== expected) {
    problems.push(`community_collection_entry: ${entries} of ${expected}`);
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
    officialEmail: OFFICIAL_EMAIL,
    officialWorkspace: OFFICIAL_WORKSPACE_SLUG,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--dry-run") options.apply = false;
    else if (arg === "--backup") options.backup = argv[++i] ?? null;
    else if (arg === "--lock-timeout") options.lockTimeout = argv[++i];
    else if (arg === "--statement-timeout")
      options.statementTimeout = argv[++i];
    else if (arg === "--official-email")
      options.officialEmail = argv[++i] ?? "";
    else if (arg === "--official-workspace")
      options.officialWorkspace = argv[++i] ?? "";
    else throw new Error(`Unknown option: ${arg}`);
  }
  const duration = /^\d+(ms|s|min)$/;
  if (
    !(
      duration.test(options.lockTimeout) &&
      duration.test(options.statementTimeout)
    )
  ) {
    throw new Error("Timeouts look like 5s, 500ms or 2min.");
  }
  if (options.apply && !options.backup) {
    throw new Error("--apply needs --backup <file>.");
  }
  return options;
}

export async function run({
  client,
  argv,
  log = console.log,
  save = (path, text) => writeFileSync(path, text, { flag: "wx" }),
  now = new Date(),
  seedItems = buildSeedItems(),
}) {
  const options = parseArgs(argv);
  log(options.apply ? "Mode: APPLY" : "Mode: dry run (nothing is written)");
  await client.query("BEGIN");
  try {
    await client.query(SQL.lockTimeout(options.lockTimeout));
    await client.query(SQL.statementTimeout(options.statementTimeout));
    await client.query(SQL.advisoryLock);
    const snapshot = await loadSnapshot(client, options);
    const plan = planSeed(snapshot, seedItems, now);
    for (const line of describeSeed(plan)) log(`  ${line}`);
    for (const warning of plan.warnings) log(`warning: ${warning}`);
    if (isEmptySeed(plan)) {
      log("Nothing to do: every official item is seeded.");
      await client.query("ROLLBACK");
      return 0;
    }
    const counts = (type) =>
      plan.inserts.filter((item) => item.type === type).length;
    const summary = `${counts("frame")} frame(s), ${counts("theme")} theme(s), ${counts("collection")} collection(s), ${plan.adopt.length} existing theme(s) marked official`;
    if (!options.apply) {
      log(`Planned: ${summary}. Run with --apply --backup <file> to write.`);
      await client.query("ROLLBACK");
      return 0;
    }
    await save(
      options.backup,
      `${JSON.stringify(backupOf(snapshot, plan), null, 2)}\n`
    );
    log(`Backup written to ${options.backup}`);
    await applySeed(client, plan, snapshot.officialUserId);
    const problems = await verifySeed(client, plan);
    if (problems.length > 0) {
      for (const problem of problems) log(`check failed: ${problem}`);
      await client.query("ROLLBACK");
      log("Rolled back: nothing was changed.");
      return 1;
    }
    await client.query("COMMIT");
    log(`Committed: ${summary}. Counts checked.`);
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
      "Set DATABASE_URL (for example with node --env-file=apps/app/.env.local)."
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
