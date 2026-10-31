import "server-only";

import {
  customDomain,
  database as db,
  integration,
  qrCode,
  qrCodeTag,
} from "@repo/database";
import { encryptApiKey } from "@repo/integrations";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { and, eq, ilike, inArray, isNull, or, type SQL } from "drizzle-orm";
import {
  existingTagNames,
  resolveFolderPaths,
  resolveTagNames,
} from "@/app/dashboard/codes/_lib/organize";
import {
  createCodes,
  destinationUrlSchema,
  getCodeUsage,
  scopeWhere,
} from "@/app/dashboard/codes/_lib/qr-codes";
import {
  assertBindableDomains,
  getDomainRefs,
} from "@/app/dashboard/domains/_lib/domains";
import { HttpError } from "@/lib/error-response";
import { baseUrl } from "@/lib/metadata";
import { getPlanForScope, getPlanLimits } from "@/lib/plans";
import type { ActiveScope } from "@/lib/scope";
import { SHORT_LINK_BASE, shortLinkUrl } from "@/lib/short-links";
import type { MigrateRepo, Scope } from "../importer";
import { readJobs } from "../jobs";
import {
  destinationKey,
  destinationVariants,
  importMarker,
  markerSearchPrefix,
  parseImportMarkers,
} from "../normalize";
import type { ProviderId } from "../providers";
import type { CodeRef, ImportJob } from "../types";

/**
 * Import records live in one `integration` row per user (provider below):
 * no schema change, and they survive disconnecting or reconnecting the
 * provider. The row holds no credentials.
 */
export const JOB_STORE_PROVIDER = "qrdx-import";

const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

// The importer always passes the session scope (lib/scope).
const asScope = (scope: Scope) => scope as ActiveScope;

type CodeRow = {
  id: string;
  slug: string;
  domainId: string | null;
  archivedAt: Date | null;
  deletedAt: Date | null;
};

async function toRefs(rows: CodeRow[]): Promise<Map<string, CodeRef>> {
  const domains = await getDomainRefs(rows.map((row) => row.domainId));
  return new Map(
    rows.map((row) => {
      const domain = row.domainId ? domains.get(row.domainId) : undefined;
      return [
        row.id,
        {
          id: row.id,
          shortLink: shortLinkUrl(
            row.slug,
            domain?.verified ? domain.hostname : null,
          ),
          state: row.deletedAt ? "trash" : row.archivedAt ? "archived" : "active",
        },
      ];
    }),
  );
}

const refColumns = {
  id: qrCode.id,
  slug: qrCode.slug,
  domainId: qrCode.domainId,
  archivedAt: qrCode.archivedAt,
  deletedAt: qrCode.deletedAt,
};

// One request per job chunk at a time (fails open when Redis is down).
const chunkLock = createRateLimiter({
  limiter: slidingWindow(1, "20 s"),
  prefix: "qrdx:migrate:chunk",
});

async function findImported(
  scope: Scope,
  provider: string,
  keys?: string[],
): Promise<Map<string, CodeRef>> {
  if (keys && keys.length === 0) return new Map();
  const pid = provider as ProviderId;
  const patterns = keys
    ? keys.map((key) => `%${escapeLike(importMarker(pid, key))}%`)
    : [`%${escapeLike(markerSearchPrefix(pid))}%`];
  const rows = await db
    .select({ ...refColumns, notes: qrCode.notes })
    .from(qrCode)
    .where(
      and(
        scopeWhere(asScope(scope)),
        or(...patterns.map((pattern) => ilike(qrCode.notes, pattern))),
      ),
    );
  const refs = await toRefs(rows);
  const byKey = new Map<string, CodeRef>();
  const prefix = `${provider}:`;
  for (const row of rows) {
    for (const marker of parseImportMarkers(row.notes)) {
      if (!marker.startsWith(prefix)) continue;
      const ref = refs.get(row.id);
      const key = marker.slice(prefix.length);
      if (ref && !byKey.has(key)) byKey.set(key, ref);
    }
  }
  return byKey;
}

async function findByDestinations(
  scope: Scope,
  urls: string[],
): Promise<Map<string, CodeRef>> {
  const variants = [...new Set(urls.flatMap(destinationVariants))];
  if (variants.length === 0) return new Map();
  const rows: (CodeRow & { destinationUrl: string })[] = [];
  for (let i = 0; i < variants.length; i += 500) {
    rows.push(
      ...(await db
        .select({ ...refColumns, destinationUrl: qrCode.destinationUrl })
        .from(qrCode)
        .where(
          and(
            scopeWhere(asScope(scope)),
            isNull(qrCode.deletedAt),
            inArray(qrCode.destinationUrl, variants.slice(i, i + 500)),
          ),
        )),
    );
  }
  const refs = await toRefs(rows);
  const byDestination = new Map<string, CodeRef>();
  for (const row of rows) {
    const key = destinationKey(row.destinationUrl);
    const ref = refs.get(row.id);
    if (key && ref && !byDestination.has(key)) byDestination.set(key, ref);
  }
  return byDestination;
}

async function domainFor(scope: Scope, hostname: string) {
  const [plan, [row]] = await Promise.all([
    getPlanForScope(scope),
    db
      .select({
        id: customDomain.id,
        verified: customDomain.verified,
        userId: customDomain.userId,
        organizationId: customDomain.organizationId,
      })
      .from(customDomain)
      .where(eq(customDomain.hostname, hostname.toLowerCase()))
      .limit(1),
  ]);
  const canUse = getPlanLimits(plan).customDomains > 0;
  const inScope =
    row &&
    (scope.organizationId
      ? row.organizationId === scope.organizationId
      : row.organizationId === null && row.userId === scope.userId);
  if (!inScope) return { id: null, qrdx: "missing" as const, canUse };
  return {
    id: row.id,
    qrdx: row.verified ? ("verified" as const) : ("pending" as const),
    canUse,
  };
}

async function loadJobs(userId: string): Promise<ImportJob[]> {
  const [row] = await db
    .select({ metadata: integration.metadata })
    .from(integration)
    .where(
      and(
        eq(integration.userId, userId),
        eq(integration.provider, JOB_STORE_PROVIDER),
      ),
    )
    .limit(1);
  return readJobs(row?.metadata);
}

async function saveJobs(userId: string, jobs: ImportJob[]): Promise<void> {
  const metadata = { v: 1, jobs };
  const now = new Date();
  const [row] = await db
    .select({ id: integration.id })
    .from(integration)
    .where(
      and(
        eq(integration.userId, userId),
        eq(integration.provider, JOB_STORE_PROVIDER),
      ),
    )
    .limit(1);
  if (row) {
    await db
      .update(integration)
      .set({ metadata, updatedAt: now })
      .where(eq(integration.id, row.id));
    return;
  }
  await db.insert(integration).values({
    id: crypto.randomUUID(),
    userId,
    provider: JOB_STORE_PROVIDER,
    // NOT NULL column; this row has no credential to hold.
    accessToken: encryptApiKey("none"),
    metadata,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
}

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  ((error as { code?: string }).code === "23505" ||
    /duplicate key|unique/i.test(String((error as Error).message)));

export const dbRepo: MigrateRepo = {
  async usage(scope) {
    const usage = await getCodeUsage(asScope(scope));
    return {
      remaining:
        usage.limit === null ? null : Math.max(0, usage.limit - usage.used),
      bulk: usage.bulkApi,
    };
  },
  findImported,
  findByDestinations,
  async findTakenSlugs(slugs) {
    const taken = new Set<string>();
    for (let i = 0; i < slugs.length; i += 500) {
      const rows = await db
        .select({ slug: qrCode.slug })
        .from(qrCode)
        .where(inArray(qrCode.slug, slugs.slice(i, i + 500)));
      for (const row of rows) taken.add(row.slug);
    }
    return taken;
  },
  existingTagNames: (scope) => existingTagNames(asScope(scope)),
  domainFor,
  async qrdxHosts(scope) {
    const rows = await db
      .select({ hostname: customDomain.hostname })
      .from(customDomain)
      .where(
        scope.organizationId
          ? eq(customDomain.organizationId, scope.organizationId)
          : (and(
              eq(customDomain.userId, scope.userId),
              isNull(customDomain.organizationId),
            ) as SQL),
      );
    return new Set([
      new URL(SHORT_LINK_BASE).host,
      baseUrl.host,
      ...rows.map((row) => row.hostname),
    ]);
  },
  checkDestination(url) {
    const result = destinationUrlSchema.safeParse(url);
    return result.success
      ? { ok: true, url: result.data }
      : {
          ok: false,
          message: result.error.issues[0]?.message ?? "Invalid destination",
        };
  },
  async createCodes(scope, inputs) {
    const views = await createCodes(
      asScope(scope),
      inputs.map((input) => ({ ...input, style: null })),
    );
    return views.map((view) => ({
      id: view.id,
      slug: view.slug,
      shortLink: view.shortLink,
    }));
  },
  async finishCodes(scope, rows) {
    const result = new Map<string, { shortLink: string; warning?: string }>();
    if (rows.length === 0) return result;
    const where = (ids: string[]) =>
      and(inArray(qrCode.id, ids), scopeWhere(asScope(scope)));

    // Notes first: they carry the marker that makes retries skip these codes.
    await Promise.all(
      rows.map((row) =>
        db
          .update(qrCode)
          .set({ notes: row.notes })
          .where(where([row.codeId])),
      ),
    );

    const warnings = new Map<string, string>();
    try {
      const folderName = rows[0]?.folderName?.replace(/\//g, "-").trim();
      const [folders, tagIds] = await Promise.all([
        folderName
          ? resolveFolderPaths(asScope(scope), [[folderName]])
          : new Map<string, string>(),
        resolveTagNames(
          asScope(scope),
          rows.flatMap((row) => row.tags),
        ),
      ]);
      const folderId = folderName
        ? folders.get(folderName.toLowerCase())
        : undefined;
      const pairs = rows.flatMap((row) =>
        row.tags.flatMap((name) => {
          const tagId = tagIds.get(name.toLowerCase());
          return tagId ? [{ qrCodeId: row.codeId, tagId }] : [];
        }),
      );
      await Promise.all([
        folderId
          ? db
              .update(qrCode)
              .set({ folderId })
              .where(where(rows.map((row) => row.codeId)))
          : null,
        pairs.length > 0
          ? db.insert(qrCodeTag).values(pairs).onConflictDoNothing()
          : null,
      ]);
    } catch (error) {
      const message =
        error instanceof HttpError || error instanceof Error
          ? error.message
          : "Folder and tags weren't applied";
      for (const row of rows) warnings.set(row.codeId, `Created, but ${message}`);
    }

    // Kept back-halves; a slug taken in the meantime keeps the random one.
    const slugged = new Map<string, string>();
    await Promise.all(
      rows.map(async (row) => {
        if (!row.slug) return;
        try {
          await db
            .update(qrCode)
            .set({ slug: row.slug })
            .where(where([row.codeId]));
          slugged.set(row.codeId, row.slug);
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
          warnings.set(
            row.codeId,
            `The back-half ${row.slug} was taken in the meantime, so the code got a random one`,
          );
        }
      }),
    );

    const final = await db
      .select(refColumns)
      .from(qrCode)
      .where(where(rows.map((row) => row.codeId)));
    const refs = await toRefs(final);
    for (const row of rows) {
      const ref = refs.get(row.codeId);
      if (!ref) continue;
      const warning = warnings.get(row.codeId);
      result.set(row.codeId, {
        shortLink: ref.shortLink,
        ...(warning && { warning }),
      });
    }
    return result;
  },
  async codesInScope(scope, ids) {
    if (ids.length === 0) return new Set();
    const rows = await db
      .select({ id: qrCode.id })
      .from(qrCode)
      .where(
        and(
          inArray(qrCode.id, ids),
          scopeWhere(asScope(scope)),
          isNull(qrCode.deletedAt),
        ),
      );
    return new Set(rows.map((row) => row.id));
  },
  async attachDomain(scope, ids, domainId) {
    await assertBindableDomains(asScope(scope), [domainId]);
    let total = 0;
    for (let i = 0; i < ids.length; i += 200) {
      const rows = await db
        .update(qrCode)
        .set({ domainId })
        .where(
          and(
            inArray(qrCode.id, ids.slice(i, i + 200)),
            scopeWhere(asScope(scope)),
          ),
        )
        .returning({ id: qrCode.id });
      total += rows.length;
    }
    return total;
  },
  loadJobs,
  saveJobs,
  async claimChunk(jobId, cursor, mode) {
    try {
      return (await chunkLock.limit(`${jobId}:${mode}:${cursor}`)).success;
    } catch {
      return true;
    }
  },
};
