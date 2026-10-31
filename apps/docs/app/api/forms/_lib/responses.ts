import "server-only";

import {
  database as db,
  formResponse,
  landingEvent,
  landingPage,
  qrCode,
} from "@repo/database";
import cuid from "cuid";
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  type SQL,
  sql,
} from "drizzle-orm";
import { HttpError } from "@/lib/error-response";
import { parseLandingPageContent } from "@/lib/landing/blocks";
import { COUPON_REDEEM_EVENT } from "@/lib/landing/blocks/coupon-schema";
import {
  type FormField,
  type FormResponseData,
  formResponseDataSchema,
} from "@/lib/landing/blocks/form-fields";
import { getPlanForScope, getPlanLimits, type Plan } from "@/lib/plans";
import {
  checkPageLifecycle,
  type LifecycleCode,
} from "@/lib/redirect/lifecycle";
import { type ActiveScope, isInScope } from "@/lib/scope";

// Form responses (form_response): monthly plan limits, the public submit
// path and the dashboard inbox. Responses are never deleted by plan changes;
// over the limit, forms only stop accepting new ones.

export interface ResponseScope {
  userId: string;
  organizationId: string | null;
}

/** Limits count calendar months in UTC. */
export function monthStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function nextMonthStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

function pageScopeWhere(scope: ResponseScope): SQL {
  return scope.organizationId
    ? eq(landingPage.organizationId, scope.organizationId)
    : (and(
        eq(landingPage.userId, scope.userId),
        isNull(landingPage.organizationId),
      ) as SQL);
}

/** Responses received this month across every page of the scope. */
export async function countResponsesThisMonth(
  scope: ResponseScope,
  now: Date = new Date(),
): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(formResponse)
    .innerJoin(landingPage, eq(landingPage.id, formResponse.pageId))
    .where(
      and(pageScopeWhere(scope), gte(formResponse.createdAt, monthStart(now))),
    );
  return row?.total ?? 0;
}

export interface FormResponseUsage {
  plan: Plan;
  used: number;
  /** null = unlimited */
  limit: number | null;
  resetsAt: Date;
}

export async function getFormResponseUsage(
  scope: ResponseScope,
  now: Date = new Date(),
): Promise<FormResponseUsage> {
  const [plan, used] = await Promise.all([
    getPlanForScope(scope),
    countResponsesThisMonth(scope, now),
  ]);
  const limit = getPlanLimits(plan).formResponsesPerMonth;
  return {
    plan,
    used,
    limit: Number.isFinite(limit) ? limit : null,
    resetsAt: nextMonthStart(now),
  };
}

export async function isAcceptingResponses(
  scope: ResponseScope,
): Promise<boolean> {
  const usage = await getFormResponseUsage(scope);
  return usage.limit === null || usage.used < usage.limit;
}

// ─── Public submit ───────────────────────────────────────────────────────────

export interface LiveForm {
  pageId: string;
  pageTitle: string | null;
  userId: string;
  organizationId: string | null;
  fields: FormField[];
  /** The code the response is attributed to (null when unknown) */
  code: { id: string; slug: string } | null;
  /**
   * Codes whose lifecycle decides whether the form is open: the attributed
   * code, or every code that shows the page when it's unknown.
   */
  lifecycleCodes: LifecycleCode[];
}

/**
 * A visible form block on a page shown by at least one dynamic code that is
 * active and not archived or trashed (on a custom domain, a code of that
 * domain). Null otherwise. Lifecycle (password, schedule, pause) is checked
 * by the caller with `isFormOpen`.
 */
export async function loadLiveForm(
  pageId: string,
  blockId: string,
  {
    customDomainId,
    qrCodeId,
  }: { customDomainId: string | null; qrCodeId?: string | null },
): Promise<LiveForm | null> {
  const rows = await db
    .select({
      pageId: landingPage.id,
      title: landingPage.title,
      userId: landingPage.userId,
      organizationId: landingPage.organizationId,
      content: landingPage.content,
      domainId: qrCode.domainId,
      code: {
        id: qrCode.id,
        slug: qrCode.slug,
        passwordHash: qrCode.passwordHash,
        startsAt: qrCode.startsAt,
        expiresAt: qrCode.expiresAt,
        scanLimit: qrCode.scanLimit,
        scanCount: qrCode.scanCount,
        pausedAt: qrCode.pausedAt,
        fallbackUrl: qrCode.fallbackUrl,
      },
    })
    .from(landingPage)
    .innerJoin(
      qrCode,
      and(
        eq(qrCode.pageId, landingPage.id),
        eq(qrCode.kind, "page"),
        eq(qrCode.isActive, true),
        isNull(qrCode.archivedAt),
        isNull(qrCode.deletedAt),
      ),
    )
    .where(eq(landingPage.id, pageId))
    .limit(50);

  const codes = customDomainId
    ? rows.filter((row) => row.domainId === customDomainId)
    : rows;
  const [page] = codes;
  if (!page) return null;

  const parsed = parseLandingPageContent(page.content, { mode: "read" });
  if (!parsed.success) return null;
  const block = parsed.data.blocks.find(
    (candidate) =>
      candidate.id === blockId &&
      candidate.type === "form" &&
      !candidate.hidden,
  );
  if (!block) return null;

  const attributed =
    codes.find((row) => row.code.id === qrCodeId) ??
    (codes.length === 1 ? page : null);
  return {
    pageId: page.pageId,
    pageTitle: page.title,
    userId: page.userId,
    organizationId: page.organizationId,
    fields: (block.props as { fields: FormField[] }).fields,
    code: attributed
      ? { id: attributed.code.id, slug: attributed.code.slug }
      : null,
    lifecycleCodes: attributed
      ? [attributed.code]
      : codes.map((row) => row.code),
  };
}

/**
 * The page's lifecycle lets the visitor in (lib/redirect/lifecycle.ts):
 * not paused, scheduled, expired or over its scan limit, and unlocked when
 * password protected (the unlock cookie is sent with same-origin posts).
 */
export async function isFormOpen(form: LiveForm): Promise<boolean> {
  for (const code of form.lifecycleCodes) {
    if ((await checkPageLifecycle(code)).action === "allow") return true;
  }
  return false;
}

export async function insertFormResponse(values: {
  pageId: string;
  qrCodeId: string | null;
  data: FormResponseData;
  visitorHash: string | null;
  createdAt: Date;
}): Promise<string> {
  const id = cuid();
  await db.insert(formResponse).values({
    id,
    ...values,
    data: values.data as unknown as Record<string, unknown>,
  });
  return id;
}

// ─── Inbox ───────────────────────────────────────────────────────────────────

/** A page of the signed-in scope (404 for other scopes' pages). */
export async function findScopedPage(
  scope: ActiveScope,
  pageId: string,
): Promise<{ id: string; userId: string; organizationId: string | null }> {
  const [row] = await db
    .select({
      id: landingPage.id,
      userId: landingPage.userId,
      organizationId: landingPage.organizationId,
    })
    .from(landingPage)
    .where(eq(landingPage.id, pageId))
    .limit(1);
  if (!(row && isInScope(scope, row))) {
    throw new HttpError(404, "NOT_FOUND", "Page not found");
  }
  return row;
}

export interface InboxForm {
  id: string;
  title: string;
  hidden: boolean;
  fields: FormField[];
}

export interface InboxPage {
  id: string;
  userId: string;
  title: string | null;
  /** Form blocks in page order */
  forms: InboxForm[];
  /** Coupon blocks in page order */
  coupons: Array<{ id: string; headline: string; redeemable: boolean }>;
}

/** A page of the scope with its form and coupon blocks (404 otherwise). */
export async function getInboxPage(
  scope: ActiveScope,
  pageId: string,
): Promise<InboxPage> {
  const [row] = await db
    .select({
      id: landingPage.id,
      userId: landingPage.userId,
      organizationId: landingPage.organizationId,
      title: landingPage.title,
      content: landingPage.content,
    })
    .from(landingPage)
    .where(eq(landingPage.id, pageId))
    .limit(1);
  if (!(row && isInScope(scope, row))) {
    throw new HttpError(404, "NOT_FOUND", "Page not found");
  }
  const parsed = parseLandingPageContent(row.content, { mode: "read" });
  const blocks = parsed.success ? parsed.data.blocks : [];
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    forms: blocks
      .filter((block) => block.type === "form")
      .map((block, index) => {
        const props = block.props as { title?: string; fields: FormField[] };
        return {
          id: block.id,
          title: props.title || `Form ${index + 1}`,
          hidden: Boolean(block.hidden),
          fields: props.fields,
        };
      }),
    coupons: blocks
      .filter((block) => block.type === "coupon")
      .map((block) => {
        const props = block.props as { headline: string; redeemable: boolean };
        return {
          id: block.id,
          headline: props.headline,
          redeemable: props.redeemable,
        };
      }),
  };
}

/** Team members may manage responses of their own pages; owners and admins any. */
export function assertCanManageResponses(
  scope: ActiveScope,
  page: { userId: string },
): void {
  if (
    scope.organizationId &&
    scope.role === "member" &&
    page.userId !== scope.userId
  ) {
    throw new HttpError(
      403,
      "FORBIDDEN",
      "Only team owners and admins can delete responses on pages created by others.",
    );
  }
}

export interface FormResponseRow {
  id: string;
  createdAt: Date;
  qrCodeId: string | null;
  codeSlug: string | null;
  data: FormResponseData;
}

const blockFilter = (block?: string | null) =>
  block ? sql`${formResponse.data}->>'block' = ${block}` : undefined;

function toResponseData(id: string, value: unknown): FormResponseData {
  const parsed = formResponseDataSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  console.error(`Unreadable form response ${id}`);
  return { block: "", answers: [] };
}

/** Newest first. */
export async function listPageResponses(
  pageId: string,
  {
    block,
    limit,
    offset = 0,
  }: { block?: string | null; limit: number; offset?: number },
): Promise<FormResponseRow[]> {
  const rows = await db
    .select({
      id: formResponse.id,
      createdAt: formResponse.createdAt,
      qrCodeId: formResponse.qrCodeId,
      codeSlug: qrCode.slug,
      data: formResponse.data,
    })
    .from(formResponse)
    .leftJoin(qrCode, eq(qrCode.id, formResponse.qrCodeId))
    .where(and(eq(formResponse.pageId, pageId), blockFilter(block)))
    .orderBy(desc(formResponse.createdAt), desc(formResponse.id))
    .limit(limit)
    .offset(offset);
  return rows.map((row) => ({
    ...row,
    data: toResponseData(row.id, row.data),
  }));
}

export async function countPageResponses(
  pageId: string,
  block?: string | null,
): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(formResponse)
    .where(and(eq(formResponse.pageId, pageId), blockFilter(block)));
  return row?.total ?? 0;
}

/** Responses per form block id. */
export async function countResponsesByBlock(
  pageId: string,
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      block: sql<string | null>`${formResponse.data}->>'block'`,
      total: count(),
    })
    .from(formResponse)
    .where(eq(formResponse.pageId, pageId))
    .groupBy(sql`${formResponse.data}->>'block'`);
  return new Map(rows.map((row) => [row.block ?? "", row.total]));
}

export async function deletePageResponses(
  pageId: string,
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const deleted = await db
    .delete(formResponse)
    .where(and(eq(formResponse.pageId, pageId), inArray(formResponse.id, ids)))
    .returning({ id: formResponse.id });
  return deleted.length;
}

/** "Redeem" taps per coupon block id (landing_event). */
export async function countCouponRedemptions(
  pageId: string,
): Promise<Map<string, number>> {
  const rows = await db
    .select({ target: landingEvent.target, total: count() })
    .from(landingEvent)
    .where(
      and(
        eq(landingEvent.pageId, pageId),
        eq(landingEvent.type, COUPON_REDEEM_EVENT),
      ),
    )
    .groupBy(landingEvent.target);
  return new Map(rows.map((row) => [row.target ?? "", row.total]));
}
