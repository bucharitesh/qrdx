import "server-only";

import {
  customDomain,
  database as db,
  landingPage,
  landingPageVersion,
  qrCode,
} from "@repo/database";
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
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import {
  codeStatus,
  createCodeSchema,
  createCodes,
  type QrCodeStatus,
  scopeWhere,
} from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { getDomainRefs } from "@/app/(app)/dashboard/domains/_lib/domains";
import { linkSearchTerm } from "@/app/(app)/dashboard/pages/_lib/filters";
import {
  getPageSettings,
  PAGE_SETTINGS_TYPE,
} from "@/components/landing/page-settings-block";
import { changedFields } from "@/ee/audit-log/metadata";
import { recordAuditEvent } from "@/ee/audit-log/record";
import { HttpError } from "@/lib/error-response";
import { PRODUCT_BLOCK_TYPE, pageGtin } from "@/lib/gs1/digital-link";
import { parseLandingPageContent } from "@/lib/landing/blocks";
import {
  buildTemplateContent,
  getTemplate,
  listTemplates,
} from "@/lib/landing/templates";
import { noteLimitUsage } from "@/lib/limit-notices";
import { can } from "@/lib/permissions";
import { assertCan } from "@/lib/permissions-server";
import { getPlanForScope, getPlanLimits, type Plan } from "@/lib/plans";
import { type ActiveScope, isInScope } from "@/lib/scope";
import { codeLinks, SHORT_LINK_BASE } from "@/lib/short-links";
import type { LandingPageContent } from "@/types/landing";

/** Versions kept per page; older ones are pruned on publish. */
export const MAX_PAGE_VERSIONS = 50;
/** Stored page content cap (JSON characters). */
export const MAX_PAGE_CONTENT_LENGTH = 400_000;

export const pageIdSchema = z.string().trim().min(1).max(64);

export const pageTitleSchema = z
  .string()
  .trim()
  .max(100, "Titles can be up to 100 characters")
  .nullish()
  .transform((value) => value || null);

const slugPart = z.string().regex(/^[a-z][a-z0-9-]{0,47}$/);

export const createPageSchema = z.object({
  type: slugPart,
  variantId: slugPart.nullish(),
  title: pageTitleSchema,
  /**
   * The page code's QR design, checked like a code's (the playground passes
   * its current design); omitted = the workspace's default theme.
   */
  style: createCodeSchema.shape.style,
});

export const publishPageSchema = z.object({
  id: pageIdSchema,
  title: pageTitleSchema,
  content: z.unknown(),
  /** The version the editor started from (optimistic concurrency) */
  baseVersion: z.number().int().min(1),
});

export type CreatePageInput = z.infer<typeof createPageSchema>;
export type PublishPageInput = z.infer<typeof publishPageSchema>;

// ─── Views ───────────────────────────────────────────────────────────────────

export interface PageCodeRef {
  id: string;
  slug: string;
  /** What the printed QR encodes (custom domain once verified) */
  shortLink: string;
  /** The hosted page itself */
  pageUrl: string;
  /** Verified custom domain the code is served on, null on the shared host */
  customDomain: string | null;
  scanCount: number;
  status: QrCodeStatus;
  inTrash: boolean;
}

export interface LandingPageListItem {
  id: string;
  type: string;
  title: string | null;
  version: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  codes: PageCodeRef[];
  /** Block types on the page (e.g. to link form responses) */
  blockTypes: string[];
}

export interface LandingPageEditView extends LandingPageListItem {
  content: LandingPageContent;
}

export interface PageUsage {
  plan: Plan;
  /** null = unlimited */
  limit: number | null;
  used: number;
}

function pageScopeWhere(scope: ActiveScope): SQL {
  return scope.organizationId
    ? eq(landingPage.organizationId, scope.organizationId)
    : (and(
        eq(landingPage.userId, scope.userId),
        isNull(landingPage.organizationId),
      ) as SQL);
}

const notFound = () => new HttpError(404, "NOT_FOUND", "Page not found");

async function countPages(scope: ActiveScope): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(landingPage)
    .where(pageScopeWhere(scope));
  return row?.total ?? 0;
}

export async function getPageUsage(scope: ActiveScope): Promise<PageUsage> {
  const [plan, used] = await Promise.all([
    getPlanForScope(scope),
    countPages(scope),
  ]);
  const limit = getPlanLimits(plan).landingPages;
  return { plan, limit: Number.isFinite(limit) ? limit : null, used };
}

function pageLimitReached(limit: number): HttpError {
  return new HttpError(
    402,
    "LIMIT_REACHED",
    `Your plan includes ${limit} hosted pages. Delete one or upgrade to Pro for unlimited pages. Existing pages keep working.`,
  );
}

type CodeRow = Pick<
  typeof qrCode.$inferSelect,
  | "id"
  | "slug"
  | "slugScope"
  | "pageId"
  | "domainId"
  | "scanCount"
  | "isActive"
  | "archivedAt"
  | "deletedAt"
>;

async function codesByPage(
  pageIds: string[],
): Promise<Map<string, PageCodeRef[]>> {
  const byPage = new Map<string, PageCodeRef[]>();
  if (pageIds.length === 0) return byPage;
  const rows: CodeRow[] = await db
    .select({
      id: qrCode.id,
      slug: qrCode.slug,
      slugScope: qrCode.slugScope,
      pageId: qrCode.pageId,
      domainId: qrCode.domainId,
      scanCount: qrCode.scanCount,
      isActive: qrCode.isActive,
      archivedAt: qrCode.archivedAt,
      deletedAt: qrCode.deletedAt,
    })
    .from(qrCode)
    .where(and(inArray(qrCode.pageId, pageIds), eq(qrCode.kind, "page")))
    .orderBy(qrCode.createdAt);
  const domains = await getDomainRefs(rows.map((row) => row.domainId));
  for (const row of rows) {
    if (!row.pageId) continue;
    const domain = row.domainId ? domains.get(row.domainId) : undefined;
    const { link } = codeLinks(row, domain ?? null);
    // On the domain when the link is (a back-half chosen there, or verified).
    const host =
      domain && link.startsWith(`https://${domain.hostname}/`)
        ? domain.hostname
        : null;
    const path = `/p/${encodeURIComponent(row.slug)}`;
    const ref: PageCodeRef = {
      id: row.id,
      slug: row.slug,
      shortLink: link,
      pageUrl: host ? `https://${host}${path}` : `${SHORT_LINK_BASE}${path}`,
      customDomain: host,
      scanCount: row.scanCount,
      status: codeStatus(row),
      inTrash: Boolean(row.deletedAt),
    };
    byPage.set(row.pageId, [...(byPage.get(row.pageId) ?? []), ref]);
  }
  return byPage;
}

type PageRow = typeof landingPage.$inferSelect;

function blockTypesOf(content: unknown): string[] {
  const blocks = (content as { blocks?: unknown } | null)?.blocks;
  if (!Array.isArray(blocks)) return [];
  return [
    ...new Set(
      blocks.flatMap((block) =>
        block && typeof block === "object" && typeof block.type === "string"
          ? [block.type as string]
          : [],
      ),
    ),
  ];
}

const toListItem = (
  row: PageRow,
  codes: PageCodeRef[],
): LandingPageListItem => ({
  id: row.id,
  type: row.type,
  title: row.title,
  version: row.version,
  createdBy: row.userId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  codes,
  blockTypes: blockTypesOf(row.content),
});

// ─── Queries ─────────────────────────────────────────────────────────────────

/** `%`, `_` and `\` match themselves in a search. */
const likePattern = (term: string) =>
  `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

/**
 * A search over the list: the title, the page type's name, or a link to the
 * page (its back-half, or the custom domain it's on).
 */
function pageSearchWhere(term: string): SQL {
  const lower = term.toLowerCase();
  const types = listTemplates()
    .filter((template) => template.label.toLowerCase().includes(lower))
    .map((template) => template.type);
  const slug = likePattern(linkSearchTerm(term));
  const host = likePattern(term);
  return or(
    ilike(landingPage.title, likePattern(term)),
    types.length > 0 ? inArray(landingPage.type, types) : undefined,
    exists(
      db
        .select({ one: sql`1` })
        .from(qrCode)
        .leftJoin(customDomain, eq(customDomain.id, qrCode.domainId))
        .where(
          and(
            eq(qrCode.pageId, landingPage.id),
            eq(qrCode.kind, "page"),
            or(ilike(qrCode.slug, slug), ilike(customDomain.hostname, host)),
          ),
        ),
    ),
  ) as SQL;
}

/** The page types the workspace's pages use, for the list's Type filter. */
export async function listPageTypes(scope: ActiveScope): Promise<string[]> {
  const rows = await db
    .selectDistinct({ type: landingPage.type })
    .from(landingPage)
    .where(pageScopeWhere(scope))
    .orderBy(asc(landingPage.type));
  return rows.map((row) => row.type);
}

/**
 * One page of the workspace's pages, most recently updated first (the id
 * breaks ties, so paging never skips or repeats a page), with how many match.
 */
export async function listPages(
  scope: ActiveScope,
  {
    q,
    type,
    limit,
    offset = 0,
  }: { q?: string; type?: string | null; limit: number; offset?: number },
): Promise<{ pages: LandingPageListItem[]; total: number }> {
  const term = q?.trim().slice(0, 200);
  const where = and(
    pageScopeWhere(scope),
    type ? eq(landingPage.type, type) : undefined,
    term ? pageSearchWhere(term) : undefined,
  );
  const [rows, [totals]] = await Promise.all([
    db
      .select()
      .from(landingPage)
      .where(where)
      .orderBy(desc(landingPage.updatedAt), desc(landingPage.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(landingPage).where(where),
  ]);
  const codes = await codesByPage(rows.map((row) => row.id));
  return {
    pages: rows.map((row) => toListItem(row, codes.get(row.id) ?? [])),
    total: totals?.total ?? 0,
  };
}

async function findPageRow(scope: ActiveScope, id: string): Promise<PageRow> {
  const [row] = await db
    .select()
    .from(landingPage)
    .where(eq(landingPage.id, id))
    .limit(1);
  // Pages outside the scope look exactly like missing ones.
  if (!(row && isInScope(scope, row))) throw notFound();
  return row;
}

export async function getPageForEdit(
  scope: ActiveScope,
  id: string,
): Promise<LandingPageEditView> {
  const row = await findPageRow(scope, id);
  const parsed = parseLandingPageContent(row.content, { mode: "read" });
  if (!parsed.success) {
    throw new HttpError(
      500,
      "INVALID_CONTENT",
      "This page's content could not be read.",
    );
  }
  const codes = await codesByPage([row.id]);
  return { ...toListItem(row, codes.get(row.id) ?? []), content: parsed.data };
}

// ─── Mutations ───────────────────────────────────────────────────────────────

async function insertVersion(
  pageId: string,
  content: LandingPageContent,
  actorUserId: string,
): Promise<void> {
  await db.insert(landingPageVersion).values({
    id: cuid(),
    pageId,
    content,
    createdBy: actorUserId,
    createdAt: new Date(),
  });
  const stale = await db
    .select({ id: landingPageVersion.id })
    .from(landingPageVersion)
    .where(eq(landingPageVersion.pageId, pageId))
    .orderBy(desc(landingPageVersion.createdAt), desc(landingPageVersion.id))
    .offset(MAX_PAGE_VERSIONS);
  if (stale.length > 0) {
    await db.delete(landingPageVersion).where(
      and(
        eq(landingPageVersion.pageId, pageId),
        inArray(
          landingPageVersion.id,
          stale.map((version) => version.id),
        ),
      ),
    );
  }
}

/** Plan-gated content: custom CSS needs Business. */
async function assertContentAllowed(
  scope: ActiveScope,
  content: LandingPageContent,
) {
  const css = getPageSettings(content).customCss.trim();
  if (!css) return;
  const limits = getPlanLimits(await getPlanForScope(scope));
  if (!limits.customCss) {
    throw new HttpError(
      402,
      "PLAN_REQUIRED",
      "Custom CSS is a Business feature. Remove it from Settings to publish.",
    );
  }
}

function validateContent(input: unknown): LandingPageContent {
  if (JSON.stringify(input ?? null).length > MAX_PAGE_CONTENT_LENGTH) {
    throw new HttpError(
      413,
      "PAYLOAD_TOO_LARGE",
      "This page is too large to save. Remove some blocks or shorten long text.",
    );
  }
  const parsed = parseLandingPageContent(input, { mode: "write" });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      issue
        ? `${issue.message}${issue.path.length ? ` (${issue.path.join(".")})` : ""}`
        : "This page has invalid content.",
    );
  }
  if (
    parsed.data.blocks.filter((block) => block.type === PAGE_SETTINGS_TYPE)
      .length > 1
  ) {
    throw new HttpError(400, "VALIDATION_ERROR", "Duplicate page settings.");
  }
  return parsed.data;
}

const pagePlaceholderUrl = () => `${SHORT_LINK_BASE}/p`;

/**
 * Creates a page from a template plus the dynamic code (kind 'page') that
 * opens it. Page and code limits are both checked; the page limit again after
 * the insert so concurrent requests can't exceed it.
 */
export async function createPage(
  scope: ActiveScope,
  input: CreatePageInput,
): Promise<{ pageId: string; codeId: string }> {
  const template = getTemplate(input.type);
  if (!template) {
    throw new HttpError(400, "VALIDATION_ERROR", "Unknown page type.");
  }
  if (
    input.variantId &&
    !template.variants.some((variant) => variant.id === input.variantId)
  ) {
    throw new HttpError(400, "VALIDATION_ERROR", "Unknown template.");
  }

  const limit = getPlanLimits(await getPlanForScope(scope)).landingPages;
  const capped = Number.isFinite(limit);
  if (capped && (await countPages(scope)) >= limit) {
    throw pageLimitReached(limit);
  }

  const content = buildTemplateContent(input.type, input.variantId);
  const pageId = cuid();
  const now = new Date();
  await db.insert(landingPage).values({
    id: pageId,
    userId: scope.userId,
    organizationId: scope.organizationId,
    type: template.type,
    title: input.title,
    content,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });

  const removePage = () =>
    db.delete(landingPage).where(eq(landingPage.id, pageId));

  if (capped) {
    const used = await countPages(scope);
    if (used > limit) {
      await removePage();
      throw pageLimitReached(limit);
    }
    // Owners hear about it at 90% and 100% (after the response).
    noteLimitUsage(scope, "landingPages", { used, limit });
  }

  let codeId: string;
  try {
    const [code] = await createCodes(
      scope,
      [
        {
          destinationUrl: pagePlaceholderUrl(),
          title: input.title ?? template.label,
          style: input.style ?? null,
          domainId: null,
          pageId,
        },
      ],
      { via: "page" },
    );
    if (!code) throw new Error("Code creation returned nothing");
    codeId = code.id;
    // Show the page's own address as the code's destination.
    await db
      .update(qrCode)
      .set({
        destinationUrl: `${SHORT_LINK_BASE}/p/${encodeURIComponent(code.slug)}`,
      })
      .where(eq(qrCode.id, code.id));
  } catch (error) {
    await removePage();
    throw error;
  }

  await insertVersion(pageId, content, scope.userId);
  recordAuditEvent(scope, {
    action: "page.created",
    target: { type: "page", id: pageId, label: input.title ?? template.label },
  });
  return { pageId, codeId };
}

const hasProductBlock = (content: LandingPageContent) =>
  content.blocks.some((block) => block.type === PRODUCT_BLOCK_TYPE);

/**
 * A GTIN opens one product page per custom domain
 * (https://<domain>/01/<GTIN>): refuses a publish when another page with
 * this GTIN has a code on one of the domains this page's codes use. Pages
 * whose codes are all on QRdx's shared host never clash (GTINs don't
 * resolve there).
 */
async function assertGtinFree(pageId: string, gtin: string): Promise<void> {
  const domains = await db
    .select({ domainId: qrCode.domainId })
    .from(qrCode)
    .where(
      and(
        eq(qrCode.pageId, pageId),
        eq(qrCode.kind, "page"),
        isNotNull(qrCode.domainId),
        isNull(qrCode.deletedAt),
      ),
    );
  const domainIds = [
    ...new Set(domains.flatMap((row) => (row.domainId ? [row.domainId] : []))),
  ];
  if (domainIds.length === 0) return;
  const [clash] = await db
    .select({ title: landingPage.title, hostname: customDomain.hostname })
    .from(qrCode)
    .innerJoin(landingPage, eq(landingPage.id, qrCode.pageId))
    .innerJoin(customDomain, eq(customDomain.id, qrCode.domainId))
    .where(
      and(
        inArray(qrCode.domainId, domainIds),
        eq(qrCode.kind, "page"),
        isNull(qrCode.deletedAt),
        eq(landingPage.gtin, gtin),
        ne(landingPage.id, pageId),
      ),
    )
    .limit(1);
  if (clash) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      `${clash.title ? `"${clash.title}"` : "Another product page"} already uses GTIN ${gtin} on ${clash.hostname}. A GTIN can open one page per domain: change it here or on that page.`,
    );
  }
}

/**
 * Publishes the editor's content: validates every block, checks plan-gated
 * features, bumps the version (rejecting stale editors) and snapshots it to
 * landing_page_version. The live page shows the new content immediately.
 */
export async function publishPage(
  scope: ActiveScope,
  input: PublishPageInput,
): Promise<{ version: number; updatedAt: Date }> {
  const page = await findPageRow(scope, input.id);
  const content = validateContent(input.content);
  await assertContentAllowed(scope, content);
  const gtin = pageGtin(content);
  if (gtin) await assertGtinFree(input.id, gtin);

  const [row] = await db
    .update(landingPage)
    .set({
      content,
      title: input.title,
      version: input.baseVersion + 1,
      updatedAt: new Date(),
      // Product pages (GS1 Digital Link); other pages never touch the column.
      ...((gtin || page.gtin || hasProductBlock(content)) && { gtin }),
    })
    .where(
      and(
        eq(landingPage.id, input.id),
        eq(landingPage.version, input.baseVersion),
        pageScopeWhere(scope),
      ),
    )
    .returning({
      version: landingPage.version,
      updatedAt: landingPage.updatedAt,
    });
  if (!row) {
    throw new HttpError(
      409,
      "CONFLICT",
      "Someone else published this page in the meantime. Reload to see their changes (copy anything you want to keep first).",
    );
  }
  await insertVersion(input.id, content, scope.userId);
  recordAuditEvent(scope, {
    action: "page.published",
    target: { type: "page", id: input.id, label: input.title || page.title },
    metadata: {
      version: row.version,
      ...changedFields({ title: page.title }, { title: input.title }),
    },
  });
  return row;
}

function assertCanDelete(scope: ActiveScope, row: PageRow) {
  assertCan(scope, "content.write");
  if (
    scope.organizationId &&
    !can(scope.role, "content.manageAll") &&
    row.userId !== scope.userId
  ) {
    throw new HttpError(
      403,
      "FORBIDDEN",
      "Only team owners and admins can delete pages created by others.",
    );
  }
}

/**
 * Deletes a page and the QR codes that open it (printed copies stop working;
 * the UI confirms this first). Scans of those codes are deleted with them.
 */
export async function deletePage(
  scope: ActiveScope,
  id: string,
): Promise<{ id: string; deletedCodes: number }> {
  const row = await findPageRow(scope, id);
  assertCanDelete(scope, row);
  const codes = await db
    .delete(qrCode)
    .where(
      and(eq(qrCode.pageId, id), eq(qrCode.kind, "page"), scopeWhere(scope)),
    )
    .returning({ id: qrCode.id });
  await db
    .delete(landingPage)
    .where(and(eq(landingPage.id, id), pageScopeWhere(scope)));
  recordAuditEvent(scope, {
    action: "page.deleted",
    target: { type: "page", id, label: row.title },
    metadata: { codes: codes.length },
  });
  return { id, deletedCodes: codes.length };
}

/** A new QR code for an existing page (e.g. after its code was deleted). */
export async function createCodeForPage(
  scope: ActiveScope,
  id: string,
): Promise<{ codeId: string }> {
  const row = await findPageRow(scope, id);
  const [code] = await createCodes(
    scope,
    [
      {
        destinationUrl: pagePlaceholderUrl(),
        title: row.title,
        style: null,
        domainId: null,
        pageId: row.id,
      },
    ],
    { via: "page" },
  );
  if (!code) throw new Error("Code creation returned nothing");
  await db
    .update(qrCode)
    .set({
      destinationUrl: `${SHORT_LINK_BASE}/p/${encodeURIComponent(code.slug)}`,
    })
    .where(eq(qrCode.id, code.id));
  return { codeId: code.id };
}

// ─── Pages for an existing code (codes/_lib/code-kind.ts) ───────────────────
// Changing a printed code's type makes the page here and attaches it to the
// code there, so the code keeps its short link and scans.

export const pageForCodeSchema = z.object({
  type: slugPart.describe(
    "A hosted page type, such as `links` or `business` (the dashboard's page types)",
  ),
  variantId: slugPart
    .nullish()
    .describe("A template of that type; omitted = its first template"),
  title: pageTitleSchema.describe("The page's name, up to 100 characters"),
  /** Content as the page editor publishes it; omitted = the template's */
  content: z
    .unknown()
    .optional()
    .describe(
      "The page content (`{ version, theme, blocks }`), validated like a publish from the page editor; omitted = the template's",
    ),
});

export type PageForCodeInput = z.infer<typeof pageForCodeSchema>;

/**
 * A new page from a template (or with `content`, checked like a publish)
 * that an existing code will open. The page limit is checked before and
 * after the insert, as createPage does; no code is made. The caller attaches
 * the page, and removes it with removeUnattachedPage if that fails.
 */
export async function createPageForCode(
  scope: ActiveScope,
  input: PageForCodeInput,
): Promise<{ pageId: string; title: string | null; type: string }> {
  assertCan(scope, "content.write");
  const template = getTemplate(input.type);
  if (!template) {
    throw new HttpError(400, "VALIDATION_ERROR", "Unknown page type.");
  }
  if (
    input.variantId &&
    !template.variants.some((variant) => variant.id === input.variantId)
  ) {
    throw new HttpError(400, "VALIDATION_ERROR", "Unknown template.");
  }
  const content =
    input.content === undefined
      ? buildTemplateContent(input.type, input.variantId)
      : validateContent(input.content);
  await assertContentAllowed(scope, content);

  const limit = getPlanLimits(await getPlanForScope(scope)).landingPages;
  const capped = Number.isFinite(limit);
  if (capped && (await countPages(scope)) >= limit) {
    throw pageLimitReached(limit);
  }

  const pageId = cuid();
  const now = new Date();
  await db.insert(landingPage).values({
    id: pageId,
    userId: scope.userId,
    organizationId: scope.organizationId,
    type: template.type,
    title: input.title,
    content,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  if (capped) {
    const used = await countPages(scope);
    if (used > limit) {
      await db.delete(landingPage).where(eq(landingPage.id, pageId));
      throw pageLimitReached(limit);
    }
    noteLimitUsage(scope, "landingPages", { used, limit });
  }
  await insertVersion(pageId, content, scope.userId);
  return { pageId, title: input.title, type: template.type };
}

/** Deletes a page createPageForCode made, while no code opens it yet. */
export async function removeUnattachedPage(
  scope: ActiveScope,
  id: string,
): Promise<void> {
  const [attached] = await db
    .select({ id: qrCode.id })
    .from(qrCode)
    .where(eq(qrCode.pageId, id))
    .limit(1);
  if (attached) return;
  await db
    .delete(landingPage)
    .where(and(eq(landingPage.id, id), pageScopeWhere(scope)));
}

export interface ScopedPageRef {
  id: string;
  type: string;
  title: string | null;
  updatedAt: Date;
}

/** Pages of the scope among `ids` (others, and deleted ones, are left out). */
export async function findScopedPages(
  scope: ActiveScope,
  ids: string[],
): Promise<ScopedPageRef[]> {
  if (ids.length === 0) return [];
  return db
    .select({
      id: landingPage.id,
      type: landingPage.type,
      title: landingPage.title,
      updatedAt: landingPage.updatedAt,
    })
    .from(landingPage)
    .where(and(inArray(landingPage.id, ids), pageScopeWhere(scope)));
}

/** A page's content for the switch editor (blocks carried to a new type). */
export async function getScopedPageContent(
  scope: ActiveScope,
  id: string,
): Promise<{
  title: string | null;
  type: string;
  content: LandingPageContent;
} | null> {
  try {
    const page = await getPageForEdit(scope, id);
    return { title: page.title, type: page.type, content: page.content };
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  }
}
