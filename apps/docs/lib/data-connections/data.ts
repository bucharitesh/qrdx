import "server-only";

import {
  database as db,
  formResponse,
  landingPage,
  member,
  qrCode,
  qrScan,
} from "@repo/database";
import type {
  SinkFormResponse,
  SinkScan,
  SyncCursor,
} from "@repo/integrations";
import { and, asc, desc, eq, gt, inArray, isNull, or, type SQL } from "drizzle-orm";
import { parseLandingPageContent } from "@/lib/landing/blocks";
import {
  type FormField,
  formatAnswerValue,
  formResponseDataSchema,
} from "@/lib/landing/blocks/form-fields";

// What data-out syncs and exports read: a workspace's scans and form
// responses, oldest first after a cursor. Nothing that identifies a visitor
// (visitor hash, IP) is ever selected.

export interface SyncScope {
  userId: string;
  organizationId: string | null;
}

/** Still a member of the team the stream was set up for? */
export async function isScopeMember(scope: SyncScope): Promise<boolean> {
  if (!scope.organizationId) return true;
  const [row] = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.organizationId, scope.organizationId),
        eq(member.userId, scope.userId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

function codeScopeWhere(scope: SyncScope): SQL {
  return scope.organizationId
    ? eq(qrCode.organizationId, scope.organizationId)
    : (and(eq(qrCode.userId, scope.userId), isNull(qrCode.organizationId)) as SQL);
}

function pageScopeWhere(scope: SyncScope): SQL {
  return scope.organizationId
    ? eq(landingPage.organizationId, scope.organizationId)
    : (and(
        eq(landingPage.userId, scope.userId),
        isNull(landingPage.organizationId),
      ) as SQL);
}

/** (time, id) > cursor */
function after(column: typeof qrScan.scannedAt | typeof formResponse.createdAt, idColumn: typeof qrScan.id | typeof formResponse.id, cursor: SyncCursor | null) {
  if (!cursor) return undefined;
  const at = new Date(cursor.at);
  return or(gt(column, at), and(eq(column, at), gt(idColumn, cursor.id)));
}

/** One code of the scope (for "export this code"), or null. */
export async function findScopedCode(scope: SyncScope, codeId: string) {
  const [row] = await db
    .select({ id: qrCode.id, slug: qrCode.slug, title: qrCode.title })
    .from(qrCode)
    .where(and(eq(qrCode.id, codeId), codeScopeWhere(scope)))
    .limit(1);
  return row ?? null;
}

/** Scans oldest first after `cursor`, for one code or the whole scope. */
export async function loadScans(
  scope: SyncScope,
  options: { codeId: string | null; cursor: SyncCursor | null; limit: number },
): Promise<SinkScan[]> {
  const rows = await db
    .select({
      id: qrScan.id,
      scannedAt: qrScan.scannedAt,
      country: qrScan.country,
      city: qrScan.city,
      deviceType: qrScan.deviceType,
      os: qrScan.os,
      browser: qrScan.browser,
      referer: qrScan.referer,
      language: qrScan.language,
      codeId: qrCode.id,
      slug: qrCode.slug,
      title: qrCode.title,
    })
    .from(qrScan)
    .innerJoin(qrCode, eq(qrCode.id, qrScan.qrCodeId))
    .where(
      and(
        codeScopeWhere(scope),
        options.codeId ? eq(qrCode.id, options.codeId) : undefined,
        after(qrScan.scannedAt, qrScan.id, options.cursor),
      ),
    )
    .orderBy(asc(qrScan.scannedAt), asc(qrScan.id))
    .limit(options.limit);
  return rows.map((row) => ({
    id: row.id,
    scannedAt: row.scannedAt.toISOString(),
    code: { id: row.codeId, slug: row.slug, title: row.title },
    country: row.country,
    city: row.city,
    deviceType: row.deviceType,
    os: row.os,
    browser: row.browser,
    referer: row.referer,
    language: row.language,
  }));
}

export interface ScopedFormPage {
  id: string;
  title: string | null;
  forms: Array<{
    id: string;
    title: string;
    fields: Array<{ id: string; label: string; type: string }>;
  }>;
}

const MAX_PAGES = 200;

/** The scope's pages that have at least one form block (newest first). */
export async function listFormPages(scope: SyncScope): Promise<ScopedFormPage[]> {
  const rows = await db
    .select({
      id: landingPage.id,
      title: landingPage.title,
      content: landingPage.content,
    })
    .from(landingPage)
    .where(pageScopeWhere(scope))
    .orderBy(desc(landingPage.updatedAt))
    .limit(MAX_PAGES);
  return rows.flatMap((row) => {
    const parsed = parseLandingPageContent(row.content, { mode: "read" });
    if (!parsed.success) return [];
    const forms = parsed.data.blocks
      .filter((block) => block.type === "form")
      .map((block, index) => {
        const props = block.props as { title?: string; fields: FormField[] };
        return {
          id: block.id,
          title: props.title || `Form ${index + 1}`,
          fields: props.fields.map((field) => ({
            id: field.id,
            label: field.label,
            type: field.type,
          })),
        };
      });
    return forms.length > 0 ? [{ id: row.id, title: row.title, forms }] : [];
  });
}

/** Page ids of `ids` that belong to the scope. */
export async function scopedPageIds(
  scope: SyncScope,
  ids: string[],
): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: landingPage.id })
    .from(landingPage)
    .where(and(pageScopeWhere(scope), inArray(landingPage.id, ids)));
  return rows.map((row) => row.id);
}

/** Form responses oldest first after `cursor` (optionally some pages only). */
export async function loadResponses(
  scope: SyncScope,
  options: {
    pageIds: string[] | null;
    cursor: SyncCursor | null;
    limit: number;
  },
): Promise<SinkFormResponse[]> {
  if (options.pageIds && options.pageIds.length === 0) return [];
  const rows = await db
    .select({
      id: formResponse.id,
      createdAt: formResponse.createdAt,
      data: formResponse.data,
      pageId: landingPage.id,
      pageTitle: landingPage.title,
      codeSlug: qrCode.slug,
    })
    .from(formResponse)
    .innerJoin(landingPage, eq(landingPage.id, formResponse.pageId))
    .leftJoin(qrCode, eq(qrCode.id, formResponse.qrCodeId))
    .where(
      and(
        pageScopeWhere(scope),
        options.pageIds ? inArray(landingPage.id, options.pageIds) : undefined,
        after(formResponse.createdAt, formResponse.id, options.cursor),
      ),
    )
    .orderBy(asc(formResponse.createdAt), asc(formResponse.id))
    .limit(options.limit);
  return rows.map((row) => toSinkResponse(row));
}

export function toSinkResponse(row: {
  id: string;
  createdAt: Date;
  data: unknown;
  pageId: string;
  pageTitle: string | null;
  codeSlug: string | null;
}): SinkFormResponse {
  const parsed = formResponseDataSchema.safeParse(row.data);
  const data = parsed.success ? parsed.data : { block: "", answers: [] };
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    pageId: row.pageId,
    pageTitle: row.pageTitle,
    formId: data.block,
    codeSlug: row.codeSlug,
    answers: data.answers.map((answer) => ({
      id: answer.id,
      label: answer.label,
      type: answer.type,
      value: answer.value,
      text: formatAnswerValue(answer),
    })),
  };
}
