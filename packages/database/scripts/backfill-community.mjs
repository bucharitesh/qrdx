#!/usr/bin/env node
// Backfill: copies every theme published in the old gallery (community_theme,
// community_theme_tag, theme_like) into the community tables made by
// manual-sql/0012_community.sql. The old tables are only read.
//
//   node --env-file=apps/docs/.env.local packages/database/scripts/backfill-community.mjs
//       dry run (the default): reads, prints every planned insert and update,
//       rolls back. Writes nothing.
//   ... backfill-community.mjs --apply --backup ./community-backup.json
//       writes the JSON backup first (what it will insert, and every row it
//       will update as it is now), then applies the plan in one transaction,
//       checks the counts and commits (or rolls back and exits 1).
//
// Options: --lock-timeout <5s>, --statement-timeout <60s>,
// --official-email <team@qrdx.dev>, --official-workspace <qrdx>.
//
// Order: apply 0012 → run this (dry run, then --apply) → deploy the code that
// reads community_item → run this again (it copies themes published in
// between and skips the ones already copied) → run seed-community.mjs.
//
// What it writes:
// - community_profile: one per creator (kind "person", no handle: handles are
//   opt-in, never derived), showing the name and picture the gallery already
//   showed; the official account's themes go to the official @qrdx profile
//   (kind "official", verified), made here if the seed hasn't made it yet.
// - community_item (type "theme", status "published", license CC0-1.0) per
//   published theme, keyed by legacy_community_theme_id, with version 1
//   (community_item_version), its tags and its likes. The payload is a
//   snapshot of the saved theme WITHOUT uploaded logos or image art; quick
//   logo icons are kept by id (apps/docs/lib/community/public-style.ts).
// - An item whose community_theme row is gone (unpublished after the first
//   run) is marked removed, as its creator asked.
// Nothing is deleted. Banned creators' items are copied too; every community
// query hides banned creators (apps/docs/lib/community/visibility.ts).
//
// Safe to run more than once: ids are derived from the old ids, inserts use
// ON CONFLICT DO NOTHING, and a second run plans nothing new.
//
// Self-contained on purpose (no app imports): apps/docs/tests/database/
// backfill-community.test.ts keeps the rules here equal to the app's and
// runs the script against a fake database.

import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// ─── Rules (mirror apps/docs/lib/community/*) ───────────────────────────────

export const OFFICIAL_EMAIL = "team@qrdx.dev";
export const OFFICIAL_WORKSPACE_SLUG = "qrdx";
export const OFFICIAL_PROFILE_ID = "cp_official_qrdx";
export const OFFICIAL_HANDLE = "qrdx";
export const LICENSE = "CC0-1.0";

/** Quick logo icons (apps/docs/lib/qr-design/style.ts LOGO_ICON_IDS). */
export const LOGO_ICON_IDS = [
  "wifi",
  "location",
  "phone",
  "email",
  "link",
  "file",
  "calendar",
  "whatsapp",
  "instagram",
];

/** The keys of themeStylePropsSchema (apps/docs/types/theme.ts). */
export const THEME_STYLE_KEYS = [
  "size",
  "bgColor",
  "fgColor",
  "eyeColor",
  "dotColor",
  "bodyPattern",
  "cornerEyePattern",
  "cornerEyeDotPattern",
  "level",
  "margin",
  "templateId",
  "frame",
  "showLogo",
  "customLogo",
  "art",
];

const sha = (text) => createHash("sha256").update(text).digest("hex");

export const personProfileId = (userId) =>
  `cp_${sha(`qrdx:community-profile:${userId}`).slice(0, 24)}`;
export const itemIdFor = (legacyId) =>
  `ci_${sha(`qrdx:community-theme:${legacyId}`).slice(0, 24)}`;
export const versionIdFor = (itemId) =>
  `civ_${sha(`qrdx:community-version:${itemId}:1`).slice(0, 24)}`;

/** A quick icon a stored logo is tagged with (by id only), else null. */
export function presetLogoIcon(logo) {
  if (typeof logo !== "string" || !logo.startsWith("data:image/svg+xml,")) {
    return null;
  }
  for (const id of LOGO_ICON_IDS) {
    if (logo.includes(encodeURIComponent(`data-qrdx-icon="${id}"`))) return id;
  }
  return null;
}

/**
 * The theme payload for a saved style: known keys only, no uploaded logo or
 * image art, quick icons by id (toPublishableStyle + themePayloadFromStyle).
 */
export function themePayload(style) {
  const source = style && typeof style === "object" ? style : {};
  const next = {};
  for (const key of THEME_STYLE_KEYS) {
    if (key === "customLogo" || key === "art") continue;
    if (source[key] !== undefined) next[key] = source[key];
  }
  let logoIcon = null;
  const removed = [];
  if (source.art !== undefined) removed.push("art");
  if (source.customLogo) {
    logoIcon = presetLogoIcon(source.customLogo);
    if (logoIcon) {
      next.showLogo = source.showLogo !== false;
    } else {
      removed.push("logo");
      next.showLogo = false;
    }
  }
  if (!next.showLogo) logoIcon = null;
  return {
    payload: { style: next, ...(logoIcon ? { logoIcon } : {}) },
    removed,
  };
}

/** JSON with sorted keys (apps/docs/lib/community/payloads.ts). */
export function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export const payloadHash = (payload) => sha(stableStringify(payload));

/** apps/docs/lib/community/text.ts slugify. */
export function slugify(text, max = 48) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/** apps/docs/lib/community/publish.ts itemSlug. */
export function itemSlug(name, id, fallback) {
  const base = slugify(name) || fallback;
  const suffix = createHash("sha256")
    .update(id)
    .digest("base64url")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase()
    .slice(0, 4);
  return `${base}-${suffix}`;
}

const DISPLAY_NAME_MAX = 40;
const displayName = (name) =>
  String(name ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, DISPLAY_NAME_MAX) || "QRdx creator";

// ─── SQL ─────────────────────────────────────────────────────────────────────

export const SQL = {
  lockTimeout: (value) => `SET LOCAL lock_timeout = '${value}'`,
  statementTimeout: (value) => `SET LOCAL statement_timeout = '${value}'`,
  advisoryLock: `SELECT pg_advisory_xact_lock(hashtext('qrdx:backfill-community'))`,
  themes: `SELECT ct.id, ct.theme_id, ct.user_id, ct.published_at, ct.like_count, p.name, p.style, u.name AS user_name, u.image AS user_image, lower(u.email) AS user_email FROM community_theme ct JOIN qr_preset p ON p.id = ct.theme_id JOIN "user" u ON u.id = ct.user_id ORDER BY ct.published_at, ct.id`,
  tags: "SELECT community_theme_id, tag FROM community_theme_tag ORDER BY community_theme_id, tag",
  likes:
    "SELECT user_id, theme_id, created_at FROM theme_like ORDER BY theme_id, user_id",
  profiles: "SELECT id, kind, user_id, handle FROM community_profile",
  items:
    "SELECT id, type, slug, status, legacy_community_theme_id FROM community_item",
  officialUser: `SELECT id FROM "user" WHERE lower(email) = $1`,
  officialWorkspace: "SELECT id FROM organization WHERE slug = $1",
  insertProfile:
    "INSERT INTO community_profile (id, kind, user_id, workspace_id, handle, display_name, avatar_url, verified_at, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, $9) ON CONFLICT DO NOTHING",
  personProfiles:
    "SELECT id, user_id FROM community_profile WHERE kind = 'person' AND user_id = ANY($1::text[])",
  insertItem:
    "INSERT INTO community_item (id, type, slug, profile_id, created_by, name, status, license, current_version, payload, payload_hash, is_official, source_kind, source_id, like_count, legacy_community_theme_id, published_at, created_at, updated_at) VALUES ($1, 'theme', $2, $3, $4, $5, 'published', $6, 1, $7, $8, $9, 'qr_preset', $10, $11, $12, $13, $14, $14) ON CONFLICT DO NOTHING",
  insertVersion:
    "INSERT INTO community_item_version (id, item_id, version, payload, payload_hash, created_by, created_at) VALUES ($1, $2, 1, $3, $4, $5, $6) ON CONFLICT DO NOTHING",
  insertTag:
    "INSERT INTO community_item_tag (item_id, tag) VALUES ($1, $2) ON CONFLICT DO NOTHING",
  insertLike:
    "INSERT INTO community_like (user_id, item_id, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
  removeItem:
    "UPDATE community_item SET status = 'removed', removed_at = $2, removed_reason = 'unpublished', updated_at = $2 WHERE id = $1 AND status <> 'removed'",
  countCopied:
    "SELECT count(*)::int AS n FROM community_item WHERE legacy_community_theme_id = ANY($1::text[])",
  countVersions:
    "SELECT count(*)::int AS n FROM community_item_version WHERE item_id = ANY($1::text[]) AND version = 1",
  countTags:
    "SELECT count(*)::int AS n FROM community_item_tag WHERE item_id = ANY($1::text[])",
  countLikes:
    "SELECT count(*)::int AS n FROM community_like WHERE item_id = ANY($1::text[])",
};

// ─── Plan ────────────────────────────────────────────────────────────────────

export async function loadSnapshot(client, options) {
  const read = async (text, params) => (await client.query(text, params)).rows;
  const [themes, tags, likes, profiles, items] = [
    await read(SQL.themes),
    await read(SQL.tags),
    await read(SQL.likes),
    await read(SQL.profiles),
    await read(SQL.items),
  ];
  const [officialUser] = await read(SQL.officialUser, [
    options.officialEmail.toLowerCase(),
  ]);
  const [officialWorkspace] = await read(SQL.officialWorkspace, [
    options.officialWorkspace,
  ]);
  return {
    themes,
    tags,
    likes,
    profiles,
    items,
    officialUserId: officialUser?.id ?? null,
    officialWorkspaceId: officialWorkspace?.id ?? null,
  };
}

/** The inserts and updates, from the snapshot alone (dry run = apply). */
export function planBackfill(snapshot, now = new Date()) {
  const warnings = [];
  const notes = [];
  const copied = new Map(
    snapshot.items
      .filter((item) => item.legacy_community_theme_id)
      .map((item) => [item.legacy_community_theme_id, item])
  );
  const takenSlugs = new Set(
    snapshot.items.filter((i) => i.type === "theme").map((i) => i.slug)
  );
  const profileByUser = new Map(
    snapshot.profiles
      .filter((p) => p.kind === "person" && p.user_id)
      .map((p) => [p.user_id, p.id])
  );
  const officialExists = snapshot.profiles.some(
    (p) => p.id === OFFICIAL_PROFILE_ID || p.kind === "official"
  );
  const officialProfileId =
    snapshot.profiles.find((p) => p.kind === "official")?.id ??
    OFFICIAL_PROFILE_ID;

  if (!snapshot.officialUserId) {
    warnings.push(
      "The official account wasn't found: no theme goes to the @qrdx profile."
    );
  }
  if (snapshot.officialUserId && !snapshot.officialWorkspaceId) {
    warnings.push(
      "The official workspace wasn't found: @qrdx is made without a workspace."
    );
  }

  const profiles = [];
  const items = [];
  const versions = [];
  const tags = [];
  const likes = [];
  const tagsByTheme = new Map();
  for (const row of snapshot.tags) {
    tagsByTheme.set(row.community_theme_id, [
      ...(tagsByTheme.get(row.community_theme_id) ?? []),
      row.tag,
    ]);
  }
  const likesByTheme = new Map();
  for (const row of snapshot.likes) {
    likesByTheme.set(row.theme_id, [
      ...(likesByTheme.get(row.theme_id) ?? []),
      row,
    ]);
  }

  let needsOfficial = false;
  let removedLogos = 0;
  let removedArt = 0;
  for (const theme of snapshot.themes) {
    if (copied.has(theme.id)) continue;
    const official =
      snapshot.officialUserId !== null &&
      theme.user_id === snapshot.officialUserId;
    let profileId;
    if (official) {
      profileId = officialProfileId;
      needsOfficial = true;
    } else {
      profileId = profileByUser.get(theme.user_id);
      if (!profileId) {
        profileId = personProfileId(theme.user_id);
        profileByUser.set(theme.user_id, profileId);
        profiles.push({
          id: profileId,
          kind: "person",
          userId: theme.user_id,
          workspaceId: null,
          handle: null,
          displayName: displayName(theme.user_name),
          avatarUrl: theme.user_image ?? null,
          verifiedAt: null,
          createdAt: now,
        });
      }
    }
    const id = itemIdFor(theme.id);
    const { payload, removed } = themePayload(theme.style);
    if (removed.includes("logo")) removedLogos += 1;
    if (removed.includes("art")) removedArt += 1;
    let slug = itemSlug(theme.name, id, "theme");
    for (let n = 2; takenSlugs.has(slug); n += 1) {
      slug = `${itemSlug(theme.name, id, "theme")}-${n}`;
    }
    takenSlugs.add(slug);
    const themeLikes = likesByTheme.get(theme.id) ?? [];
    if (themeLikes.length !== Number(theme.like_count)) {
      notes.push(
        `${theme.id}: like_count ${theme.like_count} but ${themeLikes.length} like row(s); the item counts the rows.`
      );
    }
    const hash = payloadHash(payload);
    const publishedAt = new Date(theme.published_at);
    items.push({
      id,
      slug,
      profileId,
      createdBy: theme.user_id,
      name: String(theme.name ?? "").slice(0, 60) || "Untitled theme",
      payload,
      payloadHash: hash,
      isOfficial: official,
      sourceId: theme.theme_id,
      likeCount: themeLikes.length,
      legacyId: theme.id,
      publishedAt,
      createdAt: now,
    });
    versions.push({
      id: versionIdFor(id),
      itemId: id,
      payload,
      payloadHash: hash,
      createdBy: theme.user_id,
      createdAt: publishedAt,
    });
    for (const tag of tagsByTheme.get(theme.id) ?? []) {
      tags.push({ itemId: id, tag });
    }
    for (const like of themeLikes) {
      likes.push({
        userId: like.user_id,
        itemId: id,
        createdAt: new Date(like.created_at),
      });
    }
  }

  if (needsOfficial && !officialExists) {
    profiles.unshift({
      id: OFFICIAL_PROFILE_ID,
      kind: "official",
      userId: snapshot.officialUserId,
      workspaceId: snapshot.officialWorkspaceId,
      handle: OFFICIAL_HANDLE,
      displayName: "QRdx",
      avatarUrl: null,
      verifiedAt: now,
      createdAt: now,
    });
  }

  const live = new Set(snapshot.themes.map((theme) => theme.id));
  const removals = snapshot.items
    .filter(
      (item) =>
        item.legacy_community_theme_id &&
        !live.has(item.legacy_community_theme_id) &&
        item.status !== "removed"
    )
    .map((item) => ({ id: item.id, legacyId: item.legacy_community_theme_id }));

  if (removedLogos > 0) {
    notes.push(
      `${removedLogos} theme(s) had an uploaded logo: copied without it (logo switched off).`
    );
  }
  if (removedArt > 0) {
    notes.push(`${removedArt} theme(s) had image art: copied without it.`);
  }
  if (copied.size > 0) {
    notes.push(`${copied.size} theme(s) were copied before and are skipped.`);
  }
  return { profiles, items, versions, tags, likes, removals, warnings, notes };
}

export const isEmptyPlan = (plan) =>
  plan.profiles.length === 0 &&
  plan.items.length === 0 &&
  plan.removals.length === 0;

export function describePlan(plan) {
  const lines = [];
  for (const p of plan.profiles) {
    lines.push(
      `INSERT community_profile id=${p.id} kind=${p.kind} user=${p.userId ?? "-"} handle=${p.handle ?? "-"} name=${JSON.stringify(p.displayName)}`
    );
  }
  for (const item of plan.items) {
    lines.push(
      `INSERT community_item id=${item.id} slug=${item.slug} profile=${item.profileId} legacy=${item.legacyId} likes=${item.likeCount}${item.isOfficial ? " official" : ""}`
    );
  }
  if (plan.versions.length > 0) {
    lines.push(`INSERT community_item_version x${plan.versions.length}`);
  }
  if (plan.tags.length > 0)
    lines.push(`INSERT community_item_tag x${plan.tags.length}`);
  if (plan.likes.length > 0)
    lines.push(`INSERT community_like x${plan.likes.length}`);
  for (const r of plan.removals) {
    lines.push(
      `UPDATE community_item id=${r.id} SET status=removed (community_theme ${r.legacyId} is gone)`
    );
  }
  return lines;
}

/** What --apply writes, and the rows it updates as they are now. */
export function backupOf(snapshot, plan) {
  const removing = new Set(plan.removals.map((r) => r.id));
  return {
    kind: "qrdx-backfill-community-backup",
    createdAt: new Date().toISOString(),
    note: "Inserted rows are listed by id (delete them to undo). Updated community_item rows are as they were before --apply.",
    insertedProfiles: plan.profiles.map((p) => p.id),
    insertedItems: plan.items.map((i) => i.id),
    insertedVersions: plan.versions.map((v) => v.id),
    insertedTags: plan.tags,
    insertedLikes: plan.likes.map(({ userId, itemId }) => ({ userId, itemId })),
    updatedItems: snapshot.items.filter((item) => removing.has(item.id)),
  };
}

// ─── Apply and verify ────────────────────────────────────────────────────────

export async function applyPlan(client, plan, now = new Date()) {
  for (const p of plan.profiles) {
    await client.query(SQL.insertProfile, [
      p.id,
      p.kind,
      p.userId,
      p.workspaceId,
      p.handle,
      p.displayName,
      p.avatarUrl,
      p.verifiedAt,
      p.createdAt,
    ]);
  }
  // A person may have made a profile in the app meanwhile: use the stored one.
  const people = [
    ...new Set(
      plan.items
        .filter((item) => !item.isOfficial)
        .map((item) => item.createdBy)
    ),
  ];
  const stored = new Map(
    (await client.query(SQL.personProfiles, [people])).rows.map((row) => [
      row.user_id,
      row.id,
    ])
  );
  for (const item of plan.items) {
    const profileId = item.isOfficial
      ? item.profileId
      : (stored.get(item.createdBy) ?? item.profileId);
    await client.query(SQL.insertItem, [
      item.id,
      item.slug,
      profileId,
      item.createdBy,
      item.name,
      LICENSE,
      JSON.stringify(item.payload),
      item.payloadHash,
      item.isOfficial,
      item.sourceId,
      item.likeCount,
      item.legacyId,
      item.publishedAt,
      item.createdAt,
    ]);
  }
  for (const v of plan.versions) {
    await client.query(SQL.insertVersion, [
      v.id,
      v.itemId,
      JSON.stringify(v.payload),
      v.payloadHash,
      v.createdBy,
      v.createdAt,
    ]);
  }
  for (const t of plan.tags) {
    await client.query(SQL.insertTag, [t.itemId, t.tag]);
  }
  for (const l of plan.likes) {
    await client.query(SQL.insertLike, [l.userId, l.itemId, l.createdAt]);
  }
  for (const r of plan.removals) {
    await client.query(SQL.removeItem, [r.id, now]);
  }
}

/** Problems found after applying (empty when every count is right). */
export async function verifyPlan(client, plan, snapshot) {
  const problems = [];
  const count = async (text, params) =>
    (await client.query(text, params)).rows[0]?.n ?? 0;
  const legacyIds = snapshot.themes.map((theme) => theme.id);
  const copied = await count(SQL.countCopied, [legacyIds]);
  if (copied !== legacyIds.length) {
    problems.push(
      `community_item: ${copied} of ${legacyIds.length} published theme(s) copied`
    );
  }
  const ids = plan.items.map((item) => item.id);
  const versions = await count(SQL.countVersions, [ids]);
  if (versions !== ids.length) {
    problems.push(`community_item_version: ${versions} of ${ids.length}`);
  }
  const tags = await count(SQL.countTags, [ids]);
  if (tags !== plan.tags.length) {
    problems.push(`community_item_tag: ${tags} of ${plan.tags.length}`);
  }
  const likes = await count(SQL.countLikes, [ids]);
  if (likes !== plan.likes.length) {
    problems.push(`community_like: ${likes} of ${plan.likes.length}`);
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
      duration.test(options.lockTimeout ?? "") &&
      duration.test(options.statementTimeout ?? "")
    )
  ) {
    throw new Error("Timeouts look like 5s, 500ms or 2min.");
  }
  if (options.apply && !options.backup) {
    throw new Error(
      "--apply needs --backup <file> (what it writes is saved there first)."
    );
  }
  return options;
}

/** The whole run on one connection, in one transaction. Returns the exit code. */
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

    const snapshot = await loadSnapshot(client, options);
    const plan = planBackfill(snapshot, now);
    log(
      `${snapshot.themes.length} published theme(s), ${snapshot.items.length} community item(s) before.`
    );
    for (const line of describePlan(plan)) log(`  ${line}`);
    for (const note of plan.notes) log(`note: ${note}`);
    for (const warning of plan.warnings) log(`warning: ${warning}`);

    if (isEmptyPlan(plan)) {
      log("Nothing to do: every published theme is in community_item.");
      await client.query("ROLLBACK");
      return 0;
    }
    if (!options.apply) {
      log(
        `Planned: ${plan.profiles.length} profile(s), ${plan.items.length} item(s), ${plan.tags.length} tag(s), ${plan.likes.length} like(s), ${plan.removals.length} removal(s). Run with --apply --backup <file> to write.`
      );
      await client.query("ROLLBACK");
      return 0;
    }

    await save(
      options.backup,
      `${JSON.stringify(backupOf(snapshot, plan), null, 2)}\n`
    );
    log(`Backup written to ${options.backup}`);
    await applyPlan(client, plan, now);
    const problems = await verifyPlan(client, plan, snapshot);
    if (problems.length > 0) {
      for (const problem of problems) log(`check failed: ${problem}`);
      await client.query("ROLLBACK");
      log("Rolled back: nothing was changed.");
      return 1;
    }
    await client.query("COMMIT");
    log(
      `Committed: ${plan.profiles.length} profile(s), ${plan.items.length} item(s), ${plan.tags.length} tag(s), ${plan.likes.length} like(s), ${plan.removals.length} removal(s). Counts checked.`
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
