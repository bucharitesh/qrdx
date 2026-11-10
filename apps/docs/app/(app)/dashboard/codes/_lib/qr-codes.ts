import "server-only";

import { database as db, qrCode, qrCodeTag, tag } from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import cuid from "cuid";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { notFound as pageNotFound, redirect } from "next/navigation";
import { z } from "zod";
import {
  assertBindableDomains,
  type DomainRef,
  getDomainRefs,
} from "@/app/(app)/dashboard/domains/_lib/domains";
import { getDefaultThemeStyle } from "@/app/(app)/dashboard/themes/_lib/queries";
import { codeEvents, codeUpdateEvents } from "@/ee/audit-log/code-events";
import { recordAuditEvent } from "@/ee/audit-log/record";
import { formatCount, MAX_CODES_PER_REQUEST } from "@/lib/bulk-limits";
import { snapshotCodeVersion } from "@/lib/code-versions";
import {
  contentTypeForDestination,
  isDestinationContentType,
} from "@/lib/dynamic-content";
import { HttpError } from "@/lib/error-response";
import { noteLimitUsage } from "@/lib/limit-notices";
import { baseUrl } from "@/lib/metadata";
import { can } from "@/lib/permissions";
import { assertCan } from "@/lib/permissions-server";
import {
  cheapestPlanWith,
  getPlanForScope,
  getPlanLimits,
  type Plan,
  plansWith,
} from "@/lib/plans";
import { PLAN_NAMES } from "@/lib/pricing";
import { enforceRateLimits } from "@/lib/request-guards";
import { signInPath } from "@/lib/safe-redirect";
import { screenNewCodes, screenUrlChange } from "@/lib/safety/destinations";
import { recheckAfterResponse } from "@/lib/safety/recheck";
import { asksPreciseLocation } from "@/lib/scan-location/server";
import {
  type ActiveScope,
  getActiveScope,
  isInScope,
  TwoFactorRequiredError,
  WorkspaceNotFoundError,
} from "@/lib/scope";
import {
  CUSTOM_SLUG_MAX,
  CUSTOM_SLUG_MIN,
  codeLinks,
  generateSlug,
  SHARED_SLUG_SCOPE,
  SHORT_LINK_BASE,
  SLUG_PROBLEM_MESSAGES,
  slugProblem,
} from "@/lib/short-links";
import {
  findTakenSlugs,
  isUniqueViolation,
  scopeForDomain,
} from "@/lib/slug-claims";
import { UnauthorizedError } from "@/types/errors";
import { type ThemeStyles, themeStylePropsSchema } from "@/types/theme";
import {
  batchMessage,
  chunkRows,
  INSERT_CHUNK,
  idempotentCodeId,
  type RowProblem,
  uniqueSlugs,
} from "./bulk";
import { formatPlanList } from "./code-options";

export const MAX_DESTINATION_LENGTH = 2048;
export const MAX_TITLE_LENGTH = 100;
/**
 * How long the re-check of skipped Web Risk lookups runs after a create
 * response (the request's function may run 60 s; screening stops at 20 s).
 */
const RECHECK_BUDGET_MS = 25_000;

/** Codes in one create request (lib/bulk-limits.ts). */
export const MAX_BULK_CREATE = MAX_CODES_PER_REQUEST;
// A custom logo is stored inline as a data URL (≤ 1MB file ≈ 1.4MB of text).
const MAX_STYLE_LENGTH = 1_500_000;

// ─── Validation ──────────────────────────────────────────────────────────────

const OWN_HOSTS = new Set([new URL(SHORT_LINK_BASE).host, baseUrl.host]);

export const destinationUrlSchema = z
  .string()
  .trim()
  .min(1, "Enter a destination URL")
  .max(MAX_DESTINATION_LENGTH, "The destination URL is too long")
  .transform((value, ctx) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Enter a full URL, starting with https://",
      });
      return z.NEVER;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      ctx.addIssue({
        code: "custom",
        message: "Only http:// and https:// links can be used",
      });
      return z.NEVER;
    }
    if (url.username || url.password) {
      ctx.addIssue({
        code: "custom",
        message: "Links with a username or password are not allowed",
      });
      return z.NEVER;
    }
    if (OWN_HOSTS.has(url.host) && /^\/q\//i.test(url.pathname)) {
      ctx.addIssue({
        code: "custom",
        message: "A dynamic code cannot point to another QRdx short link",
      });
      return z.NEVER;
    }
    if (url.href.length > MAX_DESTINATION_LENGTH) {
      ctx.addIssue({
        code: "custom",
        message: "The destination URL is too long",
      });
      return z.NEVER;
    }
    return url.href;
  })
  .describe(
    "Where a scan sends people: a full http(s) URL, up to 2,048 characters",
  );

const titleSchema = z
  .string()
  .trim()
  .max(MAX_TITLE_LENGTH, `Titles can be up to ${MAX_TITLE_LENGTH} characters`)
  .nullish()
  .transform((value) => value || null)
  .describe("Name shown in the dashboard, up to 100 characters");

const styleSchema = themeStylePropsSchema
  .refine((style) => JSON.stringify(style).length <= MAX_STYLE_LENGTH, {
    message: "The QR design is too large to save (try a smaller logo)",
  })
  .nullish();

/** A verified custom domain of the scope (Pro); null = the default short link. */
const domainIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .describe(
    "A verified custom domain of the workspace (Pro); null uses the default qrdx.dev short link",
  );

/**
 * A chosen back-half (Pro and Business). Shape here; reserved words depend on
 * the domain, so createCodes/updateCode check those (INVALID_SLUG).
 */
export const slugSchema = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    const problem = slugProblem(value, { onCustomDomain: true });
    if (problem && problem !== "reserved") {
      ctx.addIssue({ code: "custom", message: SLUG_PROBLEM_MESSAGES[problem] });
    }
  })
  .describe(
    "A custom back-half for the short link, such as spring-menu (Pro and Business)",
  );

export const createCodeSchema = z.object({
  destinationUrl: destinationUrlSchema,
  title: titleSchema,
  style: styleSchema,
  domainId: domainIdSchema.nullish(),
  /** Omitted or null = a generated 7-character slug */
  slug: slugSchema.nullish(),
});

/** Editable fields, all optional (extend this, not the refined schema). */
export const updateCodeFields = z.object({
  destinationUrl: destinationUrlSchema.optional(),
  title: titleSchema.optional(),
  style: styleSchema.optional(),
  domainId: domainIdSchema.nullable().optional(),
  slug: slugSchema.optional(),
});

export const hasAnyField = (patch: Record<string, unknown>) =>
  Object.values(patch).some((value) => value !== undefined);

export const updateCodeSchema = updateCodeFields.refine(hasAnyField, {
  message: "Nothing to update",
});

export const codeIdSchema = z.string().trim().min(1).max(64);

export type CreateCodeInput = z.infer<typeof createCodeSchema>;
export type UpdateCodeInput = z.infer<typeof updateCodeSchema>;

// ─── Views ───────────────────────────────────────────────────────────────────

export type QrCodeStatus = "active" | "archived" | "disabled";

export interface QrCodeView {
  id: string;
  slug: string;
  /** The link to encode: on the code's custom domain once it is verified */
  shortLink: string;
  /**
   * `${SHORT_LINK_BASE}/q/<slug>`, which always works; null for a back-half
   * chosen on a custom domain (it only exists there)
   */
  defaultShortLink: string | null;
  domain: DomainRef | null;
  destinationUrl: string;
  /** "redirect" sends visitors to destinationUrl; "page" opens the hosted page */
  kind: QrCodeRow["kind"];
  pageId: string | null;
  title: string | null;
  contentType: string;
  style: ThemeStyles | null;
  status: QrCodeStatus;
  scanCount: number;
  lastScannedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  organizationId: string | null;
  createdBy: string;
  /** Asks scanners for precise location (pixels.preciseLocation, lib/scan-location) */
  preciseLocation?: boolean;
}

type QrCodeRow = typeof qrCode.$inferSelect;

export function codeStatus(row: {
  isActive: boolean;
  archivedAt: Date | null;
}): QrCodeStatus {
  if (!row.isActive) return "disabled";
  return row.archivedAt ? "archived" : "active";
}

export function toCodeView(
  row: QrCodeRow,
  domain: DomainRef | null = null,
): QrCodeView {
  const links = codeLinks(row, domain);
  return {
    id: row.id,
    slug: row.slug,
    shortLink: links.link,
    defaultShortLink: links.defaultLink,
    domain,
    destinationUrl: row.destinationUrl,
    kind: row.kind,
    pageId: row.pageId,
    title: row.title,
    contentType: row.contentType,
    style: (row.style as ThemeStyles | null) ?? null,
    status: codeStatus(row),
    scanCount: row.scanCount,
    lastScannedAt: row.lastScannedAt,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    organizationId: row.organizationId,
    createdBy: row.userId,
    preciseLocation: asksPreciseLocation(row.pixels),
  };
}

/** Views for rows, with their custom domains loaded in one query. */
async function toCodeViews(rows: QrCodeRow[]): Promise<QrCodeView[]> {
  const domains = await getDomainRefs(rows.map((row) => row.domainId));
  return rows.map((row) =>
    toCodeView(row, row.domainId ? (domains.get(row.domainId) ?? null) : null),
  );
}

const toOneCodeView = async (row: QrCodeRow) =>
  (await toCodeViews([row]))[0] as QrCodeView;

// ─── Scope + plan ────────────────────────────────────────────────────────────

/**
 * For dashboard pages: the workspace in the URL, or sign in and come back to
 * `next` (proxy.ts sends signed-out visitors there first; this covers a
 * session that ended in between). A workspace the viewer can't open is a 404
 * (the [workspace] layout shows it; pages render alongside it). So is one
 * that requires two-step verification they haven't turned on: the layout
 * shows what to do instead, and the page stops here without reading
 * anything (quietly, rather than as an error in the server's log).
 */
export async function requireDashboardScope(
  next = "/dashboard",
): Promise<ActiveScope> {
  try {
    return await getActiveScope();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect(signInPath(next));
    if (
      error instanceof WorkspaceNotFoundError ||
      error instanceof TwoFactorRequiredError
    ) {
      pageNotFound();
    }
    throw error;
  }
}

export function scopeWhere(scope: ActiveScope): SQL {
  return scope.organizationId
    ? eq(qrCode.organizationId, scope.organizationId)
    : (and(
        eq(qrCode.userId, scope.userId),
        isNull(qrCode.organizationId),
      ) as SQL);
}

/** Codes that use a plan slot: not archived and not in the trash. */
export async function countUnarchived(scope: ActiveScope): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(qrCode)
    .where(
      and(
        scopeWhere(scope),
        isNull(qrCode.archivedAt),
        isNull(qrCode.deletedAt),
      ),
    );
  return row?.total ?? 0;
}

/** The cheapest plan without a cap on active dynamic codes (lib/plans.ts). */
const unlimitedCodesPlan = () =>
  cheapestPlanWith((limits) => !Number.isFinite(limits.dynamicCodes));

export interface CodeUsage {
  plan: Plan;
  /** null = unlimited */
  limit: number | null;
  /** The cheapest plan with no cap on active codes (for "upgrade to …"); null = none */
  unlimitedPlan: Plan | null;
  used: number;
  retentionDays: number;
  bulkApi: boolean;
  /** May choose back-halves */
  customSlugs: boolean;
}

export async function getCodeUsage(scope: ActiveScope): Promise<CodeUsage> {
  const [plan, used] = await Promise.all([
    getPlanForScope(scope),
    countUnarchived(scope),
  ]);
  const limits = getPlanLimits(plan);
  return {
    plan,
    limit: Number.isFinite(limits.dynamicCodes) ? limits.dynamicCodes : null,
    unlimitedPlan: unlimitedCodesPlan(),
    used,
    retentionDays: limits.analyticsRetentionDays,
    bulkApi: limits.bulkApi,
    customSlugs: limits.customSlugs,
  };
}

export function limitReached(limit: number): HttpError {
  const upgrade = unlimitedCodesPlan();
  return new HttpError(
    402,
    "LIMIT_REACHED",
    `Your plan includes ${limit} active dynamic QR codes. ${upgrade ? `Archive one or upgrade to ${PLAN_NAMES[upgrade]} for unlimited codes.` : "Archive one to make room."}`,
  );
}

const notFound = () => new HttpError(404, "NOT_FOUND", "QR code not found");

const createLimiter = createRateLimiter({
  limiter: slidingWindow(20, "60 s"),
});

/** Per-user cap on create requests (dashboard, editor and API). */
export function enforceCreateRateLimit(userId: string): Promise<void> {
  return enforceRateLimits([
    { limiter: createLimiter, key: `qr-codes:create:user:${userId}` },
  ]);
}

// The dialog checks as the user types (debounced): generous, but no scanner.
const slugCheckLimiter = createRateLimiter({
  limiter: slidingWindow(60, "60 s"),
});

export function enforceSlugCheckRateLimit(userId: string): Promise<void> {
  return enforceRateLimits([
    { limiter: slugCheckLimiter, key: `qr-codes:slug-check:user:${userId}` },
  ]);
}

// ─── Back-halves ─────────────────────────────────────────────────────────────

const slugPlanRequired = () =>
  new HttpError(
    402,
    "PLAN_REQUIRED",
    `Custom back-halves are part of ${formatPlanList(plansWith((limits) => limits.customSlugs))}.`,
  );

const slugTaken = (slug: string) =>
  new HttpError(
    409,
    "SLUG_TAKEN",
    `${slug} is already taken. Try another back-half.`,
  );

/** Rules that depend on where the code lives (reserved words); throws INVALID_SLUG. */
function assertSlugAllowed(slug: string, domainId: string | null) {
  const problem = slugProblem(slug, { onCustomDomain: Boolean(domainId) });
  if (problem) {
    throw new HttpError(
      400,
      "INVALID_SLUG",
      `${slug}: ${SLUG_PROBLEM_MESSAGES[problem]}`,
    );
  }
}

export interface SlugAvailability {
  status: "available" | "taken" | "invalid" | "plan";
  message: string;
}

/**
 * For the dialog's live check: can a code in the scope (on `domainId`, or the
 * default link) take this back-half? `codeId` = the code being edited.
 */
export async function checkSlugAvailability(
  scope: ActiveScope,
  input: { slug: string; domainId: string | null; codeId?: string },
): Promise<SlugAvailability> {
  const slug = input.slug.trim();
  const limits = getPlanLimits(await getPlanForScope(scope));
  if (!limits.customSlugs) {
    return { status: "plan", message: slugPlanRequired().message };
  }
  if (input.domainId) {
    try {
      await assertBindableDomains(scope, [input.domainId]);
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      return { status: "invalid", message: error.message };
    }
  }
  const problem = slugProblem(slug, {
    onCustomDomain: Boolean(input.domainId),
  });
  if (problem) {
    return { status: "invalid", message: SLUG_PROBLEM_MESSAGES[problem] };
  }
  const taken = await findTakenSlugs([slug], input.domainId, {
    exceptCodeId: input.codeId,
  });
  return taken.has(slug)
    ? {
        status: "taken",
        message: input.domainId
          ? "Another code on this domain uses it. Try another one."
          : "Another QRdx code uses it. Try another one.",
      }
    : { status: "available", message: "Available" };
}

// ─── Queries ─────────────────────────────────────────────────────────────────

/** "all" = every code outside the trash; "trash" = only trashed codes. */
export type CodeListStatus = "active" | "archived" | "all" | "trash";
export type CodeListSort = "newest" | "oldest" | "scans" | "recent" | "title";

export interface TagRef {
  id: string;
  name: string;
  color: string | null;
}

/** A row of the codes list: the code plus how it is organized. */
export interface QrCodeListItem extends QrCodeView {
  kind: QrCodeRow["kind"];
  folderId: QrCodeRow["folderId"];
  isFavorite: QrCodeRow["isFavorite"];
  notes: QrCodeRow["notes"];
  pausedAt: QrCodeRow["pausedAt"];
  deletedAt: QrCodeRow["deletedAt"];
  tags: TagRef[];
}

function listStatusWhere(status: CodeListStatus): SQL | undefined {
  switch (status) {
    case "trash":
      return isNotNull(qrCode.deletedAt);
    case "archived":
      return and(isNull(qrCode.deletedAt), isNotNull(qrCode.archivedAt));
    case "all":
      return isNull(qrCode.deletedAt);
    default:
      return and(isNull(qrCode.deletedAt), isNull(qrCode.archivedAt));
  }
}

// A pasted short link (".../q/spring-menu" or "https://go.brand.com/AbC1234") finds its code.
const SHORT_LINK_SLUG = new RegExp(
  `/(?:q/)?([A-Za-z0-9_-]{${CUSTOM_SLUG_MIN},${CUSTOM_SLUG_MAX}})(?:[/?#]|$)`,
);

/** Title, destination, notes, tag names (substring) or slug (exact). */
function searchWhere(term: string): SQL {
  const pattern = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
  return or(
    ilike(qrCode.title, pattern),
    ilike(qrCode.destinationUrl, pattern),
    ilike(qrCode.notes, pattern),
    eq(qrCode.slug, term.match(SHORT_LINK_SLUG)?.[1] ?? term),
    exists(
      db
        .select({ one: sql`1` })
        .from(qrCodeTag)
        .innerJoin(tag, eq(tag.id, qrCodeTag.tagId))
        .where(
          and(eq(qrCodeTag.qrCodeId, qrCode.id), ilike(tag.name, pattern)),
        ),
    ),
  ) as SQL;
}

/** Codes carrying every one of the tags. */
function allTagsWhere(tagIds: string[]): SQL {
  return inArray(
    qrCode.id,
    db
      .select({ id: qrCodeTag.qrCodeId })
      .from(qrCodeTag)
      .where(inArray(qrCodeTag.tagId, tagIds))
      .groupBy(qrCodeTag.qrCodeId)
      .having(sql`count(*) = ${tagIds.length}`),
  );
}

function listOrder(sort: CodeListSort, status: CodeListStatus): SQL[] {
  switch (sort) {
    case "oldest":
      return [asc(qrCode.createdAt), asc(qrCode.id)];
    case "scans":
      return [desc(qrCode.scanCount), desc(qrCode.createdAt), desc(qrCode.id)];
    case "recent":
      return [
        sql`${qrCode.lastScannedAt} desc nulls last`,
        desc(qrCode.createdAt),
        desc(qrCode.id),
      ];
    case "title":
      return [
        sql`lower(coalesce(nullif(${qrCode.title}, ''), ${qrCode.destinationUrl}))`,
        asc(qrCode.id),
      ];
    default:
      return status === "trash"
        ? [desc(qrCode.deletedAt), desc(qrCode.id)]
        : [desc(qrCode.createdAt), desc(qrCode.id)];
  }
}

/** Tags of each code, by code id (sorted by name). */
export async function getCodeTags(
  codeIds: string[],
): Promise<Map<string, TagRef[]>> {
  const byCode = new Map<string, TagRef[]>();
  if (codeIds.length === 0) return byCode;
  const rows = await db
    .select({
      codeId: qrCodeTag.qrCodeId,
      id: tag.id,
      name: tag.name,
      color: tag.color,
    })
    .from(qrCodeTag)
    .innerJoin(tag, eq(tag.id, qrCodeTag.tagId))
    .where(inArray(qrCodeTag.qrCodeId, codeIds))
    .orderBy(asc(tag.name));
  for (const { codeId, ...ref } of rows) {
    const list = byCode.get(codeId) ?? [];
    list.push(ref);
    byCode.set(codeId, list);
  }
  return byCode;
}

export async function listCodes(
  scope: ActiveScope,
  {
    status = "active",
    q,
    limit = 50,
    offset = 0,
    folderId,
    tagIds = [],
    favorites = false,
    kind,
    domainId,
    sort = "newest",
  }: {
    status?: CodeListStatus;
    q?: string;
    limit?: number;
    offset?: number;
    /** A folder's own codes; null = codes outside any folder; omit for all */
    folderId?: string | null;
    /** Codes carrying all of these tags */
    tagIds?: string[];
    favorites?: boolean;
    /** Website links (redirect) or hosted pages only; omit for both */
    kind?: QrCodeRow["kind"];
    /** A custom domain's codes; null = the default short link; omit for any */
    domainId?: string | null;
    sort?: CodeListSort;
  },
): Promise<{ codes: QrCodeListItem[]; total: number }> {
  const term = q?.trim().slice(0, 200);
  const where = and(
    scopeWhere(scope),
    listStatusWhere(status),
    term ? searchWhere(term) : undefined,
    folderId === undefined
      ? undefined
      : folderId === null
        ? isNull(qrCode.folderId)
        : eq(qrCode.folderId, folderId),
    tagIds.length > 0 ? allTagsWhere(tagIds) : undefined,
    favorites ? eq(qrCode.isFavorite, true) : undefined,
    kind ? eq(qrCode.kind, kind) : undefined,
    domainId === undefined
      ? undefined
      : domainId === null
        ? isNull(qrCode.domainId)
        : eq(qrCode.domainId, domainId),
  );

  const [rows, [totalRow]] = await Promise.all([
    db
      .select()
      .from(qrCode)
      .where(where)
      .orderBy(...listOrder(sort, status))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(qrCode).where(where),
  ]);

  const [views, tags] = await Promise.all([
    toCodeViews(rows),
    getCodeTags(rows.map((row) => row.id)),
  ]);
  const codes = views.map((view, index): QrCodeListItem => {
    const row = rows[index] as QrCodeRow;
    return {
      ...view,
      kind: row.kind,
      folderId: row.folderId,
      isFavorite: row.isFavorite,
      notes: row.notes,
      pausedAt: row.pausedAt,
      deletedAt: row.deletedAt,
      tags: tags.get(row.id) ?? [],
    };
  });
  return { codes, total: totalRow?.total ?? 0 };
}

async function findCodeRow(scope: ActiveScope, id: string): Promise<QrCodeRow> {
  const [row] = await db
    .select()
    .from(qrCode)
    .where(and(eq(qrCode.id, id), isNull(qrCode.deletedAt)))
    .limit(1);
  // Codes outside the scope (or in the trash) look exactly like missing ones.
  if (!(row && isInScope(scope, row))) throw notFound();
  return row;
}

export async function getCode(
  scope: ActiveScope,
  id: string,
): Promise<QrCodeView> {
  return toOneCodeView(await findCodeRow(scope, id));
}

// ─── Mutations ───────────────────────────────────────────────────────────────

type InsertRow = typeof qrCode.$inferInsert & { id: string; slug: string };

async function deleteRows(ids: string[]) {
  for (const part of chunkRows(ids, { maxRows: 500 })) {
    await db.delete(qrCode).where(inArray(qrCode.id, part));
  }
}

/** Rows among `ids` that exist already (an Idempotency-Key retry). */
async function findRowsById(ids: string[]): Promise<Map<string, QrCodeRow>> {
  const found = new Map<string, QrCodeRow>();
  for (const part of chunkRows(ids, { maxRows: 500 })) {
    const rows = await db.select().from(qrCode).where(inArray(qrCode.id, part));
    for (const row of rows) found.set(row.id, row);
  }
  return found;
}

/** A batch problem by request index; one problem reads as itself. */
function rowsError(
  status: number,
  code: string,
  problems: RowProblem[],
  total: number,
): HttpError {
  return new HttpError(
    status,
    code,
    batchMessage(problems, total),
    undefined,
    undefined,
    total > 1 ? { details: problems } : undefined,
  );
}

/** Which of `slugs` are taken where generated slugs live (and on `domainIds`). */
async function takenGeneratedSlugs(
  slugs: string[],
  domainIds: string[],
): Promise<Set<string>> {
  const sets = await Promise.all([
    findTakenSlugs(slugs, null),
    ...domainIds.map((domainId) => findTakenSlugs(slugs, domainId)),
  ]);
  return new Set(sets.flatMap((set) => [...set]));
}

/** Rough size of a row in an INSERT: the design (a logo) dominates. */
const rowBytes = (row: InsertRow) =>
  (row.style ? JSON.stringify(row.style).length : 4) +
  row.destinationUrl.length +
  (row.title?.length ?? 0) +
  300;

/**
 * Inserts rows in chunks (INSERT_CHUNK). A generated slug taken in the
 * meantime is rerolled; a chosen one (`chosen` ids) fails the whole request
 * with SLUG_TAKEN. A row that exists by the time it's inserted was made by a
 * concurrent retry under the same Idempotency-Key (`idempotent`) and counts
 * as made. No conflict target: every unique index counts (shared and
 * per-domain namespaces, and the id). On any failure the rows inserted so far
 * are deleted again, so a batch is all or nothing.
 */
async function insertBatch(
  rows: InsertRow[],
  {
    chosen,
    indexOf,
    total,
    idempotent,
  }: {
    chosen: ReadonlySet<string>;
    indexOf: (id: string) => number;
    total: number;
    idempotent: boolean;
  },
): Promise<{ inserted: QrCodeRow[]; raced: QrCodeRow[] }> {
  const inserted: QrCodeRow[] = [];
  const raced: QrCodeRow[] = [];
  const domainIds = [
    ...new Set(rows.flatMap((row) => (row.domainId ? [row.domainId] : []))),
  ];
  try {
    for (const part of chunkRows(rows, { ...INSERT_CHUNK, sizeOf: rowBytes })) {
      let pending = part;
      for (let attempt = 0; pending.length > 0; attempt++) {
        if (attempt === 5) {
          throw new HttpError(503, "SLUG_UNAVAILABLE", "Please try again.");
        }
        const result = await db
          .insert(qrCode)
          .values(pending)
          .onConflictDoNothing()
          .returning();
        inserted.push(...result);
        const done = new Set(result.map((row) => row.id));
        pending = pending.filter((row) => !done.has(row.id));
        if (pending.length === 0) break;

        if (idempotent) {
          const existing = await findRowsById(pending.map((row) => row.id));
          raced.push(...existing.values());
          pending = pending.filter((row) => !existing.has(row.id));
          if (pending.length === 0) break;
        }
        const taken = pending.filter((row) => chosen.has(row.id));
        if (taken.length > 0) {
          throw rowsError(
            409,
            "SLUG_TAKEN",
            taken.map((row) => ({
              index: indexOf(row.id),
              path: `${indexOf(row.id)}.slug`,
              message: slugTaken(row.slug).message,
            })),
            total,
          );
        }
        const fresh = await uniqueSlugs(pending.length, (candidates) =>
          takenGeneratedSlugs(candidates, domainIds),
        );
        pending = pending.map((row, index) => ({
          ...row,
          slug: fresh[index] as string,
        }));
      }
    }
  } catch (error) {
    if (inserted.length > 0) {
      await deleteRows(inserted.map((row) => row.id)).catch((cleanup) =>
        console.error(
          JSON.stringify({
            event: "codes.batch_cleanup_failed",
            rows: inserted.length,
            error: cleanup instanceof Error ? cleanup.message : String(cleanup),
          }),
        ),
      );
    }
    throw error;
  }
  return { inserted, raced };
}

export interface CreateCodesOptions {
  /**
   * The request's Idempotency-Key: rows get ids derived from it
   * (bulk.ts idempotentCodeId), so a retry returns what the first request
   * made, and finishes a request that was cut off part way.
   */
  idempotencyKey?: string | null;
  /**
   * Stop waiting for Web Risk lookups after this long (a large batch); the
   * rest get the offline checks only (lib/safety/destinations.ts).
   */
  screenBudgetMs?: number;
}

export interface CreatedCodes {
  /** Every requested code, in the request's order */
  codes: QrCodeView[];
  /** How many of them this call created (the rest a previous retry made) */
  created: number;
}

/**
 * Creates codes in the scope: one, or a batch of up to MAX_BULK_CREATE (plans
 * with bulkApi). A batch is all or nothing: problems with any row (a taken
 * or reserved back-half, an unsafe destination) fail the request and are
 * listed by index. The plan limit is checked before the insert and again
 * after it, so concurrent requests can never exceed it.
 */
export async function createCodes(
  scope: ActiveScope,
  // pageId: a hosted-page code (kind 'page'), created by actions/landing-pages
  inputs: (CreateCodeInput & { pageId?: string })[],
  options: CreateCodesOptions = {},
): Promise<QrCodeView[]> {
  return (await createCodesBatch(scope, inputs, options)).codes;
}

export async function createCodesBatch(
  scope: ActiveScope,
  inputs: (CreateCodeInput & { pageId?: string })[],
  { idempotencyKey = null, screenBudgetMs }: CreateCodesOptions = {},
): Promise<CreatedCodes> {
  assertCan(scope, "content.write");
  if (inputs.length === 0) return { codes: [], created: 0 };
  const total = inputs.length;

  const plan = await getPlanForScope(scope);
  const limits = getPlanLimits(plan);

  if (inputs.length > 1 && !limits.bulkApi) {
    const bulkPlan = cheapestPlanWith((each) => each.bulkApi);
    throw new HttpError(
      402,
      "PLAN_REQUIRED",
      bulkPlan
        ? `Creating codes in bulk is a ${PLAN_NAMES[bulkPlan]} feature.`
        : "Your plan can't create codes in bulk.",
    );
  }
  if (inputs.length > MAX_BULK_CREATE) {
    throw new HttpError(
      400,
      "TOO_MANY_CODES",
      `Create up to ${formatCount(MAX_BULK_CREATE)} codes per request.`,
    );
  }

  // Under an Idempotency-Key a row's id is derived from the request, so the
  // rows a previous try made are found by id (and never made twice).
  const workspace = scope.organizationId ?? `user:${scope.userId}`;
  const ids = inputs.map((input, index) =>
    idempotencyKey
      ? idempotentCodeId(
          workspace,
          idempotencyKey,
          index,
          JSON.stringify([
            input.destinationUrl,
            input.title ?? null,
            input.slug ?? null,
            input.domainId ?? null,
            input.pageId ?? null,
            input.style ?? null,
          ]),
        )
      : cuid(),
  );
  const indexById = new Map(ids.map((id, index) => [id, index]));
  const indexOf = (id: string) => indexById.get(id) ?? -1;
  const existing: Map<string, QrCodeRow> = idempotencyKey
    ? await findRowsById(ids)
    : new Map();
  for (const row of existing.values()) {
    // A derived id of another workspace: never expected (sha256).
    if (!isInScope(scope, row)) throw new Error("Code id collision");
  }
  const todo = inputs.flatMap((input, index) =>
    existing.has(ids[index] as string) ? [] : [{ input, index }],
  );

  let inserted: QrCodeRow[] = [];
  let raced: QrCodeRow[] = [];
  if (todo.length > 0) {
    const capped = Number.isFinite(limits.dynamicCodes);
    if (capped) {
      const used = await countUnarchived(scope);
      if (used + todo.length > limits.dynamicCodes) {
        throw todo.length > 1
          ? new HttpError(
              402,
              "LIMIT_REACHED",
              `Your plan includes ${limits.dynamicCodes} active dynamic QR codes and has room for ${Math.max(0, limits.dynamicCodes - used)} more, so these ${todo.length} weren't created. Archive codes or upgrade for unlimited codes.`,
            )
          : limitReached(limits.dynamicCodes);
      }
    }
    await assertBindableDomains(
      scope,
      todo.flatMap(({ input }) => (input.domainId ? [input.domainId] : [])),
    );

    // Chosen back-halves: Pro, allowed where the code lives, once per
    // namespace, and free. Every problem is listed, by index.
    const problems: RowProblem[] = [];
    const chosenKeys = new Set<string>();
    const chosenByDomain = new Map<
      string | null,
      { slug: string; index: number }[]
    >();
    for (const { input, index } of todo) {
      if (!input.slug) continue;
      if (!limits.customSlugs) throw slugPlanRequired();
      const domainId = input.domainId ?? null;
      const problem = slugProblem(input.slug, {
        onCustomDomain: Boolean(domainId),
      });
      const key = `${scopeForDomain(domainId)}/${input.slug}`;
      if (problem) {
        problems.push({
          index,
          path: `${index}.slug`,
          message: `${input.slug}: ${SLUG_PROBLEM_MESSAGES[problem]}`,
        });
      } else if (chosenKeys.has(key)) {
        problems.push({
          index,
          path: `${index}.slug`,
          message: `${input.slug} is in the request more than once.`,
        });
      } else {
        chosenKeys.add(key);
        const list = chosenByDomain.get(domainId) ?? [];
        list.push({ slug: input.slug, index });
        chosenByDomain.set(domainId, list);
      }
    }
    if (problems.length > 0) {
      throw rowsError(400, "INVALID_SLUG", problems, total);
    }
    for (const [domainId, wanted] of chosenByDomain) {
      const taken = await findTakenSlugs(
        wanted.map((item) => item.slug),
        domainId,
      );
      for (const item of wanted) {
        if (taken.has(item.slug)) {
          problems.push({
            index: item.index,
            path: `${item.index}.slug`,
            message: slugTaken(item.slug).message,
          });
        }
      }
    }
    if (problems.length > 0) {
      problems.sort((a, b) => a.index - b.index);
      throw rowsError(409, "SLUG_TAKEN", problems, total);
    }

    // Generated slugs: distinct within the batch and free where they live.
    const generatedCount = todo.filter(({ input }) => !input.slug).length;
    const domainIds = [
      ...new Set(
        todo.flatMap(({ input }) => (input.domainId ? [input.domainId] : [])),
      ),
    ];
    const generated =
      generatedCount > 0
        ? await uniqueSlugs(generatedCount, (candidates) =>
            takenGeneratedSlugs(candidates, domainIds),
          )
        : [];

    // Codes created without a design start from the scope's default theme.
    const defaultStyle = todo.some(({ input }) => !input.style)
      ? (styleSchema.safeParse(await getDefaultThemeStyle(scope)).data ?? null)
      : null;
    const now = new Date();
    const chosen = new Set<string>();
    let nextGenerated = 0;
    const rows: InsertRow[] = todo.map(({ input, index }) => {
      const id = ids[index] as string;
      if (input.slug) chosen.add(id);
      return {
        id,
        userId: scope.userId,
        organizationId: scope.organizationId,
        slug: input.slug || (generated[nextGenerated++] as string),
        // Generated slugs always live in the shared namespace.
        slugScope: input.slug
          ? scopeForDomain(input.domainId ?? null)
          : SHARED_SLUG_SCOPE,
        destinationUrl: input.destinationUrl,
        contentType: contentTypeForDestination(input.destinationUrl),
        title: input.title ?? null,
        style: input.style ?? defaultStyle,
        domainId: input.domainId ?? null,
        ...(input.pageId && { kind: "page" as const, pageId: input.pageId }),
        createdAt: now,
        updatedAt: now,
      };
    });
    const screened = await screenNewCodes(scope, rows, {
      budgetMs: screenBudgetMs,
      indexOf: (position) => todo[position]?.index ?? position,
      paid: plan !== "free",
    });
    ({ inserted, raced } = await insertBatch(screened as InsertRow[], {
      chosen,
      indexOf,
      total,
      idempotent: Boolean(idempotencyKey),
    }));

    if (capped && inserted.length > 0) {
      const used = await countUnarchived(scope);
      if (used > limits.dynamicCodes) {
        await deleteRows(inserted.map((row) => row.id));
        throw limitReached(limits.dynamicCodes);
      }
      // Owners hear about it at 90% and 100% (after the response).
      noteLimitUsage(scope, "dynamicCodes", {
        used,
        limit: limits.dynamicCodes,
      });
    }
  }

  // Keep the caller's order (returning() order is not guaranteed).
  const byId = new Map<string, QrCodeRow>(existing);
  for (const row of [...raced, ...inserted]) byId.set(row.id, row);
  const views = await toCodeViews(ids.map((id) => byId.get(id) as QrCodeRow));
  if (inserted.length > 0) {
    // Destinations Web Risk didn't answer for: looked up after the response
    // (lib/safety/recheck.ts), and switched off if flagged.
    recheckAfterResponse(
      inserted.flatMap((row) => (row.webRiskRecheckAt ? [row.id] : [])),
      RECHECK_BUDGET_MS,
    );
    const insertedIds = new Set(inserted.map((row) => row.id));
    const created = views.filter((view) => insertedIds.has(view.id));
    // code.created webhooks + alerts, after the response (never throws).
    (await import("@/lib/events/emit")).emitCodesCreated(scope, created);
    recordAuditEvent(scope, codeEvents("code.created", created));
  }
  return { codes: views, created: inserted.length };
}

type SlugValues = Pick<typeof qrCode.$inferInsert, "slug" | "slugScope">;

/**
 * The slug and namespace after a move or a new back-half, as a list of
 * candidates to try in order (the next one when the previous is taken):
 * - a chosen back-half lives where the code goes (Pro);
 * - a shared-namespace slug stays (its qrdx.dev/q/ link keeps working);
 * - a domain's own back-half moves with the code when it's allowed and free
 *   there, else (back on the default link) the code gets a generated slug.
 */
async function slugChange(
  scope: ActiveScope,
  current: QrCodeRow,
  patch: UpdateCodeInput,
  domainId: string | null,
): Promise<{ candidates: SlugValues[]; chosen: boolean } | null> {
  const nextScope = scopeForDomain(domainId);
  if (patch.slug !== undefined && patch.slug !== current.slug) {
    if (!getPlanLimits(await getPlanForScope(scope)).customSlugs) {
      throw slugPlanRequired();
    }
    assertSlugAllowed(patch.slug, domainId);
    return {
      candidates: [{ slug: patch.slug, slugScope: nextScope }],
      chosen: true,
    };
  }
  if (
    current.slugScope === SHARED_SLUG_SCOPE ||
    current.slugScope === nextScope
  ) {
    return null;
  }
  const keep = !slugProblem(current.slug, {
    onCustomDomain: Boolean(domainId),
  });
  const generated = Array.from({ length: 5 }, () => ({
    slug: generateSlug(),
    slugScope: SHARED_SLUG_SCOPE,
  }));
  if (domainId) {
    // Onto another custom domain: the back-half comes along or the move fails.
    if (!keep) assertSlugAllowed(current.slug, domainId);
    return {
      candidates: [{ slug: current.slug, slugScope: nextScope }],
      chosen: true,
    };
  }
  return {
    candidates: keep
      ? [{ slug: current.slug, slugScope: nextScope }, ...generated]
      : generated,
    chosen: false,
  };
}

/**
 * Destination, title and design stay editable on any plan ("codes never die").
 * Moving a code to a custom domain needs Pro; back to the default link never does.
 * Choosing a new back-half needs Pro and changes the link.
 */
export async function updateCode(
  scope: ActiveScope,
  id: string,
  patch: UpdateCodeInput,
): Promise<QrCodeView> {
  assertCan(scope, "content.write");
  const current = await findCodeRow(scope, id);

  const values: Partial<typeof qrCode.$inferInsert> = {};
  if (patch.destinationUrl !== undefined) {
    values.destinationUrl = patch.destinationUrl;
    const change = {
      previous: current.destinationUrl,
      next: patch.destinationUrl,
    };
    if (await screenUrlChange(scope, current, change)) values.isActive = false;
    // A website code pointed at a WhatsApp chat becomes a WhatsApp code, and
    // back; other content types keep theirs.
    const contentType = contentTypeForDestination(patch.destinationUrl);
    if (
      isDestinationContentType(current.contentType) &&
      contentType !== current.contentType
    ) {
      values.contentType = contentType;
    }
  }
  if (patch.title !== undefined) values.title = patch.title;
  if (patch.style !== undefined) values.style = patch.style;
  let domainId = current.domainId;
  if (patch.domainId !== undefined && patch.domainId !== current.domainId) {
    if (patch.domainId) await assertBindableDomains(scope, [patch.domainId]);
    values.domainId = patch.domainId;
    domainId = patch.domainId;
  }
  const slug = await slugChange(scope, current, patch, domainId);
  if (Object.keys(values).length === 0 && !slug) return toOneCodeView(current);

  const first = slug?.candidates[0];
  if (slug?.chosen && first) {
    // Checked up front so a taken back-half doesn't leave a version behind.
    const taken = await findTakenSlugs([first.slug as string], domainId, {
      exceptCodeId: id,
    });
    if (taken.has(first.slug as string)) throw slugTaken(first.slug as string);
  }

  await snapshotCodeVersion(id, scope.userId);
  const where = and(eq(qrCode.id, id), scopeWhere(scope));
  let row: QrCodeRow | undefined;
  let conflict = false;
  for (const candidate of slug?.candidates ?? [null]) {
    try {
      [row] = await db
        .update(qrCode)
        .set(candidate ? { ...values, ...candidate } : values)
        .where(where)
        .returning();
      if (candidate) Object.assign(values, candidate);
      conflict = false;
      break;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      conflict = true;
      if (!candidate) {
        // A shared slug moving onto a domain that already serves it.
        throw new HttpError(
          409,
          "SLUG_TAKEN",
          `Another code on that domain already uses ${current.slug}. Choose another back-half to move this one.`,
        );
      }
      if (slug?.chosen) throw slugTaken(candidate.slug as string);
    }
  }
  if (conflict) {
    throw new HttpError(503, "SLUG_UNAVAILABLE", "Please try again.");
  }
  if (!row) throw notFound();
  const view = await toOneCodeView(row);
  // code.updated webhooks + alerts, after the response (never throws).
  (await import("@/lib/events/emit")).emitCodeUpdated(
    scope,
    view,
    Object.keys(values).filter(
      (field) =>
        field !== "isActive" &&
        field !== "slugScope" &&
        field !== "contentType" &&
        !(field === "slug" && values.slug === current.slug),
    ),
  );
  recordAuditEvent(scope, () => codeUpdateEvents(current, view, values));
  return view;
}

/** Archived codes stop redirecting and free a slot; unarchiving needs a free slot. */
export async function setCodeArchived(
  scope: ActiveScope,
  id: string,
  archived: boolean,
): Promise<QrCodeView> {
  assertCan(scope, "content.write");
  const current = await findCodeRow(scope, id);
  if (Boolean(current.archivedAt) === archived) return toOneCodeView(current);

  const limits = getPlanLimits(await getPlanForScope(scope));
  const capped = !archived && Number.isFinite(limits.dynamicCodes);
  if (capped && (await countUnarchived(scope)) >= limits.dynamicCodes) {
    throw limitReached(limits.dynamicCodes);
  }

  const where = and(eq(qrCode.id, id), scopeWhere(scope));
  const [row] = await db
    .update(qrCode)
    .set({ archivedAt: archived ? new Date() : null })
    .where(where)
    .returning();
  if (!row) throw notFound();

  if (capped) {
    const used = await countUnarchived(scope);
    if (used > limits.dynamicCodes) {
      await db
        .update(qrCode)
        .set({ archivedAt: current.archivedAt })
        .where(where);
      throw limitReached(limits.dynamicCodes);
    }
    noteLimitUsage(scope, "dynamicCodes", {
      used,
      limit: limits.dynamicCodes,
    });
  }
  recordAuditEvent(
    scope,
    codeEvents(archived ? "code.archived" : "code.unarchived", [row]),
  );
  return toOneCodeView(row);
}

/** Team members may delete their own codes; owners and admins any team code. */
export async function deleteCode(
  scope: ActiveScope,
  id: string,
): Promise<{ id: string }> {
  assertCan(scope, "content.write");
  const current = await findCodeRow(scope, id);
  if (
    scope.organizationId &&
    !can(scope.role, "content.manageAll") &&
    current.userId !== scope.userId
  ) {
    throw new HttpError(
      403,
      "FORBIDDEN",
      "Only team owners and admins can delete codes created by others.",
    );
  }
  await db.delete(qrCode).where(and(eq(qrCode.id, id), scopeWhere(scope)));
  recordAuditEvent(scope, codeEvents("code.deleted", [current]));
  return { id };
}
