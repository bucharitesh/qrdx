import "server-only";

import { database as db, qrCode } from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import cuid from "cuid";
import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  type SQL,
} from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  assertBindableDomains,
  type DomainRef,
  getDomainRefs,
} from "@/app/dashboard/domains/_lib/domains";
import { HttpError } from "@/lib/error-response";
import { baseUrl } from "@/lib/metadata";
import { getPlanForScope, getPlanLimits, type Plan } from "@/lib/plans";
import { enforceRateLimits } from "@/lib/request-guards";
import { type ActiveScope, getActiveScope, isInScope } from "@/lib/scope";
import { generateSlug, SHORT_LINK_BASE, shortLinkUrl } from "@/lib/short-links";
import { UnauthorizedError } from "@/types/errors";
import { type ThemeStyles, themeStylePropsSchema } from "@/types/theme";

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
  });

const titleSchema = z
  .string()
  .trim()
  .max(MAX_TITLE_LENGTH, `Titles can be up to ${MAX_TITLE_LENGTH} characters`)
  .nullish()
  .transform((value) => value || null);

const styleSchema = themeStylePropsSchema
  .refine((style) => JSON.stringify(style).length <= MAX_STYLE_LENGTH, {
    message: "The QR design is too large to save (try a smaller logo)",
  })
  .nullish();

/** A verified custom domain of the scope (Pro); null = the default short link. */
const domainIdSchema = z.string().trim().min(1).max(64);

export const createCodeSchema = z.object({
  destinationUrl: destinationUrlSchema,
  title: titleSchema,
  style: styleSchema,
  domainId: domainIdSchema.nullish(),
});

/** Editable fields, all optional (extend this, not the refined schema). */
export const updateCodeFields = z.object({
  destinationUrl: destinationUrlSchema.optional(),
  title: titleSchema.optional(),
  style: styleSchema.optional(),
  domainId: domainIdSchema.nullable().optional(),
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
  /** `${SHORT_LINK_BASE}/q/<slug>`, which always works */
  defaultShortLink: string;
  domain: DomainRef | null;
  destinationUrl: string;
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
  const defaultShortLink = shortLinkUrl(row.slug);
  return {
    id: row.id,
    slug: row.slug,
    shortLink: domain?.verified
      ? shortLinkUrl(row.slug, domain.hostname)
      : defaultShortLink,
    defaultShortLink,
    domain,
    destinationUrl: row.destinationUrl,
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

/** For dashboard pages: the active scope, or back to the sign-in entry point. */
export async function requireDashboardScope(): Promise<ActiveScope> {
  try {
    return await getActiveScope();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/playground");
    throw error;
  }
}

function scopeWhere(scope: ActiveScope): SQL {
  return scope.organizationId
    ? eq(qrCode.organizationId, scope.organizationId)
    : (and(
        eq(qrCode.userId, scope.userId),
        isNull(qrCode.organizationId),
      ) as SQL);
}

async function countUnarchived(scope: ActiveScope): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(qrCode)
    .where(and(scopeWhere(scope), isNull(qrCode.archivedAt)));
  return row?.total ?? 0;
}

export interface CodeUsage {
  plan: Plan;
  /** null = unlimited */
  limit: number | null;
  used: number;
  retentionDays: number;
  bulkApi: boolean;
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
    used,
    retentionDays: limits.analyticsRetentionDays,
    bulkApi: limits.bulkApi,
  };
}

function limitReached(limit: number): HttpError {
  return new HttpError(
    402,
    "LIMIT_REACHED",
    `Your plan includes ${limit} active dynamic QR codes. Archive one or upgrade to Pro for unlimited codes.`,
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

// ─── Queries ─────────────────────────────────────────────────────────────────

export type CodeListStatus = "active" | "archived" | "all";

export async function listCodes(
  scope: ActiveScope,
  {
    status = "active",
    q,
    limit = 50,
    offset = 0,
  }: { status?: CodeListStatus; q?: string; limit?: number; offset?: number },
): Promise<{ codes: QrCodeView[]; total: number }> {
  const term = q?.trim().slice(0, 200);
  const pattern = term ? `%${term.replace(/[\\%_]/g, "\\$&")}%` : null;
  const where = and(
    scopeWhere(scope),
    status === "active" ? isNull(qrCode.archivedAt) : undefined,
    status === "archived" ? isNotNull(qrCode.archivedAt) : undefined,
    pattern
      ? or(
          ilike(qrCode.title, pattern),
          ilike(qrCode.destinationUrl, pattern),
          eq(qrCode.slug, term as string),
        )
      : undefined,
  );

  const [rows, [totalRow]] = await Promise.all([
    db
      .select()
      .from(qrCode)
      .where(where)
      .orderBy(desc(qrCode.createdAt), desc(qrCode.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(qrCode).where(where),
  ]);

  return { codes: await toCodeViews(rows), total: totalRow?.total ?? 0 };
}

async function findCodeRow(scope: ActiveScope, id: string): Promise<QrCodeRow> {
  const [row] = await db
    .select()
    .from(qrCode)
    .where(eq(qrCode.id, id))
    .limit(1);
  // Codes outside the scope look exactly like missing ones.
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

async function insertWithUniqueSlugs(
  rows: (typeof qrCode.$inferInsert)[],
): Promise<QrCodeRow[]> {
  const inserted: QrCodeRow[] = [];
  let pending = rows;

  for (let attempt = 0; attempt < 5 && pending.length > 0; attempt++) {
    const result = await db
      .insert(qrCode)
      .values(pending)
      .onConflictDoNothing({ target: qrCode.slug })
      .returning();
    inserted.push(...result);
    const done = new Set(result.map((row) => row.id));
    // A slug collision (≈1 in 3.5e12 per pair) only re-rolls that row.
    pending = pending
      .filter((row) => !done.has(row.id as string))
      .map((row) => ({ ...row, slug: generateSlug() }));
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
  inputs: CreateCodeInput[],
): Promise<QrCodeView[]> {
  if (inputs.length === 0) return [];

  const plan = await getPlanForScope(scope);
  const limits = getPlanLimits(plan);

  if (inputs.length > 1 && !limits.bulkApi) {
    throw new HttpError(
      402,
      "PLAN_REQUIRED",
      "Creating codes in bulk is a Pro feature.",
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

  const now = new Date();
  const rows = inputs.map((input) => ({
    id: cuid(),
    userId: scope.userId,
    organizationId: scope.organizationId,
    slug: generateSlug(),
    destinationUrl: input.destinationUrl,
    title: input.title ?? null,
    style: input.style ?? null,
    domainId: input.domainId ?? null,
    createdAt: now,
    updatedAt: now,
  }));
  const inserted = await insertWithUniqueSlugs(rows);

  if (capped && (await countUnarchived(scope)) > limits.dynamicCodes) {
    await deleteRows(inserted.map((row) => row.id));
    throw limitReached(limits.dynamicCodes);
  }

  // Keep the caller's order (returning() order is not guaranteed).
  const byId = new Map(inserted.map((row) => [row.id, row]));
  return toCodeViews(rows.map((row) => byId.get(row.id) as QrCodeRow));
}

/**
 * Destination, title and design stay editable on any plan ("codes never die").
 * Moving a code to a custom domain needs Pro; back to the default link never does.
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
  }
  if (patch.title !== undefined) values.title = patch.title;
  if (patch.style !== undefined) values.style = patch.style;
  if (patch.domainId !== undefined && patch.domainId !== current.domainId) {
    if (patch.domainId) await assertBindableDomains(scope, [patch.domainId]);
    values.domainId = patch.domainId;
  }
  if (Object.keys(values).length === 0) return toOneCodeView(current);

  const [row] = await db
    .update(qrCode)
    .set(values)
    .where(and(eq(qrCode.id, id), scopeWhere(scope)))
    .returning();
  if (!row) throw notFound();
  return toOneCodeView(row);
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
