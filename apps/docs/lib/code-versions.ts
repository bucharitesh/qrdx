import "server-only";

import { database as db, qrCode, qrCodeVersion, user } from "@repo/database";
import cuid from "cuid";
import { and, count, desc, eq, inArray, isNull, notInArray } from "drizzle-orm";
import {
  diffVersions,
  GATED_FIELDS,
  normalizeVersion,
  restorableColumns,
  VERSION_FIELDS,
  type VersionChange,
  type VersionField,
} from "@/app/dashboard/codes/_lib/version-diff";
import {
  assertBindableDomains,
  getDomainRefs,
} from "@/app/dashboard/domains/_lib/domains";
import { HttpError } from "@/lib/error-response";
import { getPlanForScope, getPlanLimits } from "@/lib/plans";
import { screenUrlChange } from "@/lib/safety/destinations";
import { type ActiveScope, isInScope } from "@/lib/scope";

/** Older versions are pruned beyond this many per code. */
export const MAX_VERSIONS_PER_CODE = 100;

/**
 * Stores the code's current row as a version. Call it before mutating a
 * qr_code's settings so the previous state can be restored from history.
 */
export async function snapshotCodeVersion(
  codeId: string,
  actorUserId: string,
): Promise<void> {
  const [current] = await db
    .select()
    .from(qrCode)
    .where(eq(qrCode.id, codeId))
    .limit(1);
  if (!current) {
    return;
  }

  // Secrets never go into history; only whether a password was set.
  const { passwordHash, ...snapshot } = current;
  await db.insert(qrCodeVersion).values({
    id: cuid(),
    qrCodeId: codeId,
    snapshot: { ...snapshot, hasPassword: Boolean(passwordHash) },
    createdBy: actorUserId,
    createdAt: new Date(),
  });

  const keep = db
    .select({ id: qrCodeVersion.id })
    .from(qrCodeVersion)
    .where(eq(qrCodeVersion.qrCodeId, codeId))
    .orderBy(desc(qrCodeVersion.createdAt), desc(qrCodeVersion.id))
    .limit(MAX_VERSIONS_PER_CODE);
  await db
    .delete(qrCodeVersion)
    .where(
      and(
        eq(qrCodeVersion.qrCodeId, codeId),
        notInArray(qrCodeVersion.id, keep),
      ),
    );
}

const notFound = (what = "QR code") =>
  new HttpError(404, "NOT_FOUND", `${what} not found`);

async function findLiveCode(scope: ActiveScope, codeId: string) {
  const [row] = await db
    .select()
    .from(qrCode)
    .where(and(eq(qrCode.id, codeId), isNull(qrCode.deletedAt)))
    .limit(1);
  if (!(row && isInScope(scope, row))) throw notFound();
  return row;
}

export interface CodeVersionEntry {
  id: string;
  /** When this version was replaced by the edit described in `changes` */
  createdAt: Date;
  actor: { id: string; name: string } | null;
  /** What the edit after this version changed (restoring undoes it) */
  changes: VersionChange[];
  /** Labels of the settings a restore would change (vs. the live code) */
  restores: string[];
  /** Hostnames for domain changes */
  domainNames: Record<string, string>;
}

/**
 * Newest first. Each entry is a past version and the changes that replaced
 * it; versions whose edit touched no tracked setting are left out.
 */
export async function listCodeVersions(
  scope: ActiveScope,
  codeId: string,
  { limit = 30 }: { limit?: number } = {},
): Promise<{ entries: CodeVersionEntry[]; total: number }> {
  const current = await findLiveCode(scope, codeId);
  const [versions, [totalRow]] = await Promise.all([
    db
      .select()
      .from(qrCodeVersion)
      .where(eq(qrCodeVersion.qrCodeId, codeId))
      .orderBy(desc(qrCodeVersion.createdAt), desc(qrCodeVersion.id))
      .limit(limit),
    db
      .select({ total: count() })
      .from(qrCodeVersion)
      .where(eq(qrCodeVersion.qrCodeId, codeId)),
  ]);

  const states = [
    normalizeVersion(current),
    ...versions.map((version) => normalizeVersion(version.snapshot)),
  ];
  const actorIds = [
    ...new Set(versions.flatMap((version) => version.createdBy ?? [])),
  ];
  const [domains, actors] = await Promise.all([
    getDomainRefs(states.map((state) => state.domainId as string | null)),
    actorIds.length > 0
      ? db
          .select({ id: user.id, name: user.name })
          .from(user)
          .where(inArray(user.id, actorIds))
      : Promise.resolve([]),
  ]);
  const actorById = new Map(actors.map((actor) => [actor.id, actor]));
  const domainNames = Object.fromEntries(
    [...domains.values()].map((domain) => [domain.id, domain.hostname]),
  );

  const entries: CodeVersionEntry[] = [];
  versions.forEach((version, index) => {
    // states[index] is the version that replaced this one (or the live row).
    const changes = diffVersions(
      states[index + 1] as (typeof states)[number],
      states[index] as (typeof states)[number],
      { domainName: (id) => domainNames[id] ?? null },
    );
    if (changes.length === 0) return;
    const restores = diffVersions(
      states[0] as (typeof states)[number],
      states[index + 1] as (typeof states)[number],
    ).map((change) => change.label);
    entries.push({
      id: version.id,
      createdAt: version.createdAt,
      actor: version.createdBy
        ? (actorById.get(version.createdBy) ?? null)
        : null,
      changes,
      restores,
      domainNames,
    });
  });
  return { entries, total: totalRow?.total ?? 0 };
}

export interface RestoreResult {
  /** Settings put back */
  restored: VersionChange[];
  /** Labels of settings left as they are (plan, domain or password) */
  skipped: string[];
}

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

/**
 * Puts a version's settings back. The current settings are saved as a new
 * version first, so a restore can itself be undone. Settings the plan no
 * longer includes, unusable domains and passwords (never stored) stay as
 * they are.
 */
export async function restoreCodeVersion(
  scope: ActiveScope,
  codeId: string,
  versionId: string,
): Promise<RestoreResult> {
  const current = await findLiveCode(scope, codeId);
  const [version] = await db
    .select()
    .from(qrCodeVersion)
    .where(
      and(eq(qrCodeVersion.id, versionId), eq(qrCodeVersion.qrCodeId, codeId)),
    )
    .limit(1);
  if (!version) throw notFound("Version");

  const limits = getPlanLimits(await getPlanForScope(scope));
  const allowed: Record<keyof typeof GATED_FIELDS, boolean> = {
    linkControls: limits.linkControls,
    routing: limits.routing,
    pixels: limits.pixels,
  };
  const blocked = new Set<VersionField>(
    (Object.keys(GATED_FIELDS) as (keyof typeof GATED_FIELDS)[]).flatMap(
      (group) => (allowed[group] ? [] : GATED_FIELDS[group]),
    ),
  );

  const target = restorableColumns(version.snapshot);
  const changes = diffVersions(
    normalizeVersion(current),
    normalizeVersion(version.snapshot),
  );
  const values: Partial<typeof qrCode.$inferInsert> = {};
  const restored: VersionChange[] = [];
  const skipped: string[] = [];

  for (const change of changes) {
    const field = change.field;
    if (field === "hasPassword" || blocked.has(field)) {
      skipped.push(VERSION_FIELDS[field].label);
      continue;
    }
    if (field === "destinationUrl") {
      if (!(target.destinationUrl && isHttpUrl(target.destinationUrl))) {
        skipped.push(change.label);
        continue;
      }
      // Old destinations are screened again like any edit (unsafe → error).
      if (
        await screenUrlChange(scope, current, {
          previous: current.destinationUrl,
          next: target.destinationUrl,
        })
      ) {
        values.isActive = false;
      }
      values.destinationUrl = target.destinationUrl;
    } else if (field === "fallbackUrl" && target.fallbackUrl) {
      if (
        await screenUrlChange(scope, current, {
          previous: current.fallbackUrl,
          next: target.fallbackUrl,
          field: "fallback URL",
        })
      ) {
        values.isActive = false;
      }
      values.fallbackUrl = target.fallbackUrl;
    } else if (field === "domainId") {
      if (target.domainId) {
        try {
          await assertBindableDomains(scope, [target.domainId]);
        } catch {
          skipped.push(change.label);
          continue;
        }
      }
      values.domainId = target.domainId;
    } else {
      // Title, design, schedule, routing, UTM and pixels copy over as stored.
      Object.assign(values, { [field]: target[field] });
    }
    restored.push(change);
  }

  if (restored.length === 0) return { restored, skipped };

  await snapshotCodeVersion(codeId, scope.userId);
  const [row] = await db
    .update(qrCode)
    .set(values)
    .where(and(eq(qrCode.id, codeId), isNull(qrCode.deletedAt)))
    .returning({ id: qrCode.id });
  if (!row) throw notFound();
  return { restored, skipped };
}
