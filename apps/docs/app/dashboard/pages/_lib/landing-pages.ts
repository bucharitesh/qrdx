import "server-only";

import {
  database as db,
  landingPage,
  landingPageVersion,
  qrCode,
} from "@repo/database";
import cuid from "cuid";
import { and, count, desc, eq, inArray, isNull, type SQL } from "drizzle-orm";
import { z } from "zod";
import {
  codeStatus,
  createCodes,
  type QrCodeStatus,
  scopeWhere,
} from "@/app/dashboard/codes/_lib/qr-codes";
import { getDomainRefs } from "@/app/dashboard/domains/_lib/domains";
import {
  getPageSettings,
  PAGE_SETTINGS_TYPE,
} from "@/components/landing/page-settings-block";
import { HttpError } from "@/lib/error-response";
import { parseLandingPageContent } from "@/lib/landing/blocks";
import { buildTemplateContent, getTemplate } from "@/lib/landing/templates";
import { getPlanForScope, getPlanLimits, type Plan } from "@/lib/plans";
import { type ActiveScope, isInScope } from "@/lib/scope";
import { SHORT_LINK_BASE, shortLinkUrl } from "@/lib/short-links";
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
    const host = domain?.verified ? domain.hostname : null;
    const path = `/p/${encodeURIComponent(row.slug)}`;
    const ref: PageCodeRef = {
      id: row.id,
      slug: row.slug,
      shortLink: shortLinkUrl(row.slug, host),
      pageUrl: host ? `https://${host}${path}` : `${SHORT_LINK_BASE}${path}`,
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

export async function listPages(
  scope: ActiveScope,
): Promise<LandingPageListItem[]> {
  const rows = await db
    .select()
    .from(landingPage)
    .where(pageScopeWhere(scope))
    .orderBy(desc(landingPage.updatedAt), desc(landingPage.id))
    .limit(500);
  const codes = await codesByPage(rows.map((row) => row.id));
  return rows.map((row) => toListItem(row, codes.get(row.id) ?? []));
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

  if (capped && (await countPages(scope)) > limit) {
    await removePage();
    throw pageLimitReached(limit);
  }

  let codeId: string;
  try {
    const [code] = await createCodes(scope, [
      {
        destinationUrl: pagePlaceholderUrl(),
        title: input.title ?? template.label,
        style: null,
        domainId: null,
        pageId,
      },
    ]);
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
  return { pageId, codeId };
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
  await findPageRow(scope, input.id);
  const content = validateContent(input.content);
  await assertContentAllowed(scope, content);

  const [row] = await db
    .update(landingPage)
    .set({
      content,
      title: input.title,
      version: input.baseVersion + 1,
      updatedAt: new Date(),
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
  return row;
}

function assertCanDelete(scope: ActiveScope, row: PageRow) {
  if (
    scope.organizationId &&
    scope.role === "member" &&
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
  return { id, deletedCodes: codes.length };
}

/** A new QR code for an existing page (e.g. after its code was deleted). */
export async function createCodeForPage(
  scope: ActiveScope,
  id: string,
): Promise<{ codeId: string }> {
  const row = await findPageRow(scope, id);
  const [code] = await createCodes(scope, [
    {
      destinationUrl: pagePlaceholderUrl(),
      title: row.title,
      style: null,
      domainId: null,
      pageId: row.id,
    },
  ]);
  if (!code) throw new Error("Code creation returned nothing");
  await db
    .update(qrCode)
    .set({
      destinationUrl: `${SHORT_LINK_BASE}/p/${encodeURIComponent(code.slug)}`,
    })
    .where(eq(qrCode.id, code.id));
  return { codeId: code.id };
}
