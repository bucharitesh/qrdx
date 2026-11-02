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
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  assertBindableDomains,
  type DomainRef,
  getDomainRefs,
} from "@/app/dashboard/domains/_lib/domains";
import { getDefaultThemeStyle } from "@/app/dashboard/themes/_lib/queries";
import { snapshotCodeVersion } from "@/lib/code-versions";
import { HttpError } from "@/lib/error-response";
import { baseUrl } from "@/lib/metadata";
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
import { type ActiveScope, getActiveScope, isInScope } from "@/lib/scope";
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
import { formatPlanList } from "./code-options";

export const MAX_DESTINATION_LENGTH = 2048;
export const MAX_TITLE_LENGTH = 100;
export const MAX_BULK_CREATE = 100;
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
 * For dashboard pages: the active scope, or sign in and come back to `next`
 * (proxy.ts sends signed-out visitors there first; this covers a session that
 * ended in between).
 */
export async function requireDashboardScope(
  next = "/dashboard",
): Promise<ActiveScope> {
  try {
    return await getActiveScope();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect(signInPath(next));
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

/**
 * Inserts rows; a generated slug that collides (≈1 in 3.5e12 per pair) is
 * re-rolled, a chosen one (`chosen` ids) fails the whole request with
 * SLUG_TAKEN. No conflict target: every unique index counts (shared and
 * per-domain namespaces).
 */
async function insertWithUniqueSlugs(
  rows: (typeof qrCode.$inferInsert)[],
  chosen: ReadonlySet<string> = new Set(),
): Promise<QrCodeRow[]> {
  const inserted: QrCodeRow[] = [];
  let pending = rows;

  for (let attempt = 0; attempt < 5 && pending.length > 0; attempt++) {
    const result = await db
      .insert(qrCode)
      .values(pending)
      .onConflictDoNothing()
      .returning();
    inserted.push(...result);
    const done = new Set(result.map((row) => row.id));
    pending = pending.filter((row) => !done.has(row.id as string));
    const taken = pending.find((row) => chosen.has(row.id as string));
    if (taken) {
      if (inserted.length > 0) await deleteRows(inserted.map((row) => row.id));
      throw slugTaken(taken.slug);
    }
    pending = pending.map((row) => ({ ...row, slug: generateSlug() }));
  }

  if (pending.length > 0) {
    if (inserted.length > 0) {
      await deleteRows(inserted.map((row) => row.id));
    }
    throw new HttpError(503, "SLUG_UNAVAILABLE", "Please try again.");
  }
  return inserted;
}

async function deleteRows(ids: string[]) {
  await db.delete(qrCode).where(inArray(qrCode.id, ids));
}

/**
 * Creates codes in the scope. The plan limit is checked before the insert and
 * again after it, so concurrent requests can never exceed it.
 */
export async function createCodes(
  scope: ActiveScope,
  // pageId: a hosted-page code (kind 'page'), created by actions/landing-pages
  inputs: (CreateCodeInput & { pageId?: string })[],
): Promise<QrCodeView[]> {
  if (inputs.length === 0) return [];

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
      `Create up to ${MAX_BULK_CREATE} codes per request.`,
    );
  }

  const capped = Number.isFinite(limits.dynamicCodes);
  if (
    capped &&
    (await countUnarchived(scope)) + inputs.length > limits.dynamicCodes
  ) {
    throw limitReached(limits.dynamicCodes);
  }
  await assertBindableDomains(
    scope,
    inputs.flatMap((input) => (input.domainId ? [input.domainId] : [])),
  );

  // Chosen back-halves: Pro, allowed where the code lives, once per namespace.
  const chosenKeys = new Set<string>();
  for (const input of inputs) {
    if (!input.slug) continue;
    if (!limits.customSlugs) throw slugPlanRequired();
    assertSlugAllowed(input.slug, input.domainId ?? null);
    const key = `${scopeForDomain(input.domainId ?? null)}/${input.slug}`;
    if (chosenKeys.has(key)) {
      throw new HttpError(
        400,
        "INVALID_SLUG",
        `${input.slug} is in the request more than once.`,
      );
    }
    chosenKeys.add(key);
  }

  // Codes created without a design start from the scope's default theme.
  const defaultStyle = inputs.some((input) => !input.style)
    ? (styleSchema.safeParse(await getDefaultThemeStyle(scope)).data ?? null)
    : null;
  const now = new Date();
  const chosen = new Set<string>();
  const rows = inputs.map((input) => {
    const id = cuid();
    if (input.slug) chosen.add(id);
    return {
      id,
      userId: scope.userId,
      organizationId: scope.organizationId,
      slug: input.slug || generateSlug(),
      // Generated slugs always live in the shared namespace.
      slugScope: input.slug
        ? scopeForDomain(input.domainId ?? null)
        : SHARED_SLUG_SCOPE,
      destinationUrl: input.destinationUrl,
      title: input.title ?? null,
      style: input.style ?? defaultStyle,
      domainId: input.domainId ?? null,
      ...(input.pageId && { kind: "page" as const, pageId: input.pageId }),
      createdAt: now,
      updatedAt: now,
    };
  });
  const inserted = await insertWithUniqueSlugs(
    await screenNewCodes(scope, rows),
    chosen,
  );

  if (capped && (await countUnarchived(scope)) > limits.dynamicCodes) {
    await deleteRows(inserted.map((row) => row.id));
    throw limitReached(limits.dynamicCodes);
  }

  // Keep the caller's order (returning() order is not guaranteed).
  const byId = new Map(inserted.map((row) => [row.id, row]));
  const views = await toCodeViews(
    rows.map((row) => byId.get(row.id) as QrCodeRow),
  );
  // code.created webhooks + alerts, after the response (never throws).
  (await import("@/lib/events/emit")).emitCodesCreated(scope, views);
  return views;
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
  const current = await findCodeRow(scope, id);

  const values: Partial<typeof qrCode.$inferInsert> = {};
  if (patch.destinationUrl !== undefined) {
    values.destinationUrl = patch.destinationUrl;
    const change = {
      previous: current.destinationUrl,
      next: patch.destinationUrl,
    };
    if (await screenUrlChange(scope, current, change)) values.isActive = false;
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
        !(field === "slug" && values.slug === current.slug),
    ),
  );
  return view;
}

/** Archived codes stop redirecting and free a slot; unarchiving needs a free slot. */
export async function setCodeArchived(
  scope: ActiveScope,
  id: string,
  archived: boolean,
): Promise<QrCodeView> {
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

  if (capped && (await countUnarchived(scope)) > limits.dynamicCodes) {
    await db
      .update(qrCode)
      .set({ archivedAt: current.archivedAt })
      .where(where);
    throw limitReached(limits.dynamicCodes);
  }
  return toOneCodeView(row);
}

/** Team members may delete their own codes; owners and admins any team code. */
export async function deleteCode(
  scope: ActiveScope,
  id: string,
): Promise<{ id: string }> {
  const current = await findCodeRow(scope, id);
  if (
    scope.organizationId &&
    scope.role === "member" &&
    current.userId !== scope.userId
  ) {
    throw new HttpError(
      403,
      "FORBIDDEN",
      "Only team owners and admins can delete codes created by others.",
    );
  }
  await db.delete(qrCode).where(and(eq(qrCode.id, id), scopeWhere(scope)));
  return { id };
}
