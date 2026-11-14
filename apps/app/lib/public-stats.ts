import "server-only";

import { randomBytes } from "node:crypto";
import {
  brandKit,
  codePublicStats,
  customDomain,
  database as db,
  qrCode,
} from "@repo/database";
import cuid from "cuid";
import { and, eq, isNull } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import {
  ClientBrandsUnavailableError,
  findClientBrand,
  listClientBrands,
} from "@/lib/client-brands";
import { normalizeAccent } from "@/lib/client-brands-shared";
import { isMissingSchemaError } from "@/lib/community/tables";
import { HttpError } from "@/lib/error-response";
import { baseUrl } from "@/lib/metadata";
import { cheapestPlanWith, getPlanForScope, getPlanLimits } from "@/lib/plans";
import { PLAN_NAMES } from "@/lib/pricing";
import {
  PUBLIC_STATS_RANGES,
  type PublicStats,
  type PublicStatsRange,
  type PublicStatsShare,
  publicStatsPath,
  publicStatsUrlOn,
  type StatsBranding,
} from "@/lib/public-stats-shared";
import { getScanAnalytics } from "@/lib/scans";
import { type ActiveScope, isInScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { codeLinks } from "@/lib/short-links";

// Public analytics pages: an owner or editor turns one on for a
// code and gets /stats/<token>, a read-only page with scans over time, top
// countries, devices and referrer hosts. No row = off; a new token = a reset
// link. The table comes from manual-sql/0016; until it's applied, sharing
// says it isn't available and every /stats link is a 404.

export type {
  PublicStats,
  PublicStatsRange,
  PublicStatsShare,
  StatsBranding,
} from "@/lib/public-stats-shared";

import { can } from "@/lib/permissions";
import { assertCan } from "@/lib/permissions-server";

/** 24 random bytes as 32 URL-safe characters. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const newToken = () => randomBytes(24).toString("base64url");

/** The code_public_stats table isn't there yet (manual-sql/0016). */
export class PublicStatsUnavailableError extends HttpError {
  constructor() {
    super(
      503,
      "UNAVAILABLE",
      "Sharing analytics isn't available on this server yet.",
    );
    this.name = "PublicStatsUnavailableError";
  }
}

let missingLogged = false;

async function guarded<T>(query: () => Promise<T>): Promise<T> {
  try {
    return await query();
  } catch (error) {
    if (isMissingSchemaError(error)) {
      if (!missingLogged) {
        missingLogged = true;
        logError(error as Error, {
          action: "public-stats",
          hint: "Apply packages/database/manual-sql/0016_public_stats.sql",
        });
      }
      throw new PublicStatsUnavailableError();
    }
    throw error;
  }
}

// Everyone who can change a code (lib/permissions.ts "content.write"):
// viewers and billing members can't share a code's analytics.
export const canSharePublicStats = (scope: Pick<ActiveScope, "role">) =>
  can(scope.role, "content.write");

export const publicStatsUrl = (token: string) =>
  new URL(publicStatsPath(token), baseUrl.origin).toString();

const notFound = () => new HttpError(404, "NOT_FOUND", "QR code not found");

/** A code of the scope that isn't in the trash (others look missing). */
async function findCode(scope: ActiveScope, codeId: string) {
  const [row] = await db
    .select({
      id: qrCode.id,
      userId: qrCode.userId,
      organizationId: qrCode.organizationId,
    })
    .from(qrCode)
    .where(and(eq(qrCode.id, codeId), isNull(qrCode.deletedAt)))
    .limit(1);
  if (!(row && isInScope(scope, row))) throw notFound();
  return row;
}

// The columns from manual-sql/0016 only: sharing keeps working before the
// agency columns (brand_kit_id, domain_id) exist.
const shareColumns = {
  id: codePublicStats.id,
  qrCodeId: codePublicStats.qrCodeId,
  token: codePublicStats.token,
  createdBy: codePublicStats.createdBy,
  createdAt: codePublicStats.createdAt,
};

async function findShare(codeId: string) {
  const [row] = await guarded(() =>
    db
      .select(shareColumns)
      .from(codePublicStats)
      .where(eq(codePublicStats.qrCodeId, codeId))
      .limit(1),
  );
  return row ?? null;
}

// ─── Client branding (agency tools, manual-sql/2026-11-11-agency.sql) ───────

interface ShareExtras {
  brandKitId: string | null;
  domainId: string | null;
}

/**
 * A share's brand and domain, looked up on their own so that a database
 * without the agency columns yet still shares plain pages: null then.
 */
async function findShareExtras(
  where: { codeId: string } | { token: string },
): Promise<ShareExtras | null> {
  try {
    const [row] = await db
      .select({
        brandKitId: codePublicStats.brandKitId,
        domainId: codePublicStats.domainId,
      })
      .from(codePublicStats)
      .where(
        "codeId" in where
          ? eq(codePublicStats.qrCodeId, where.codeId)
          : eq(codePublicStats.token, where.token),
      )
      .limit(1);
    return row
      ? { brandKitId: row.brandKitId ?? null, domainId: row.domainId ?? null }
      : null;
  } catch (error) {
    if (isMissingSchemaError(error)) return null;
    throw error;
  }
}

/** The workspace's verified custom domains. */
async function verifiedDomains(organizationId: string) {
  return db
    .select({ id: customDomain.id, hostname: customDomain.hostname })
    .from(customDomain)
    .where(
      and(
        eq(customDomain.organizationId, organizationId),
        eq(customDomain.verified, true),
      ),
    )
    .orderBy(customDomain.hostname)
    .limit(100);
}

/**
 * The host a share's link is on: its custom domain while that's verified,
 * in the code's workspace, and the plan serves branded pages there
 * (Business); otherwise QRdx's own (null).
 */
async function shareHost(
  scope: Pick<ActiveScope, "userId" | "organizationId">,
  codeId: string,
): Promise<string | null> {
  const extras = await findShareExtras({ codeId });
  if (!extras?.domainId) return null;
  const limits = getPlanLimits(await getPlanForScope(scope));
  if (!limits.clientReportsWhiteLabel) return null;
  const domain = (await verifiedDomains(scope.organizationId)).find(
    (row) => row.id === extras.domainId,
  );
  return domain?.hostname ?? null;
}

async function toShare(
  scope: ActiveScope,
  row: { token: string; createdAt: Date; qrCodeId?: string } | null,
): Promise<PublicStatsShare> {
  const host = row?.qrCodeId ? await shareHost(scope, row.qrCodeId) : null;
  return {
    available: true,
    canManage: canSharePublicStats(scope),
    url: row
      ? host
        ? publicStatsUrlOn(host, row.token)
        : publicStatsUrl(row.token)
      : null,
    since: row ? row.createdAt.toISOString() : null,
  };
}

function assertCanShare(scope: ActiveScope) {
  assertCan(scope, "content.write");
}

/** Whether the code's analytics are shared, and the link when they are. */
export async function getPublicStatsShare(
  scope: ActiveScope,
  codeId: string,
): Promise<PublicStatsShare> {
  await findCode(scope, codeId);
  try {
    return await toShare(scope, await findShare(codeId));
  } catch (error) {
    if (error instanceof PublicStatsUnavailableError) {
      return {
        available: false,
        canManage: false,
        url: null,
        since: null,
      };
    }
    throw error;
  }
}

/** Turns the page on (the existing link stays when it's already on). */
export async function enablePublicStats(
  scope: ActiveScope,
  codeId: string,
): Promise<PublicStatsShare> {
  assertCanShare(scope);
  await findCode(scope, codeId);
  await guarded(() =>
    db
      .insert(codePublicStats)
      .values({
        id: cuid(),
        qrCodeId: codeId,
        token: newToken(),
        createdBy: scope.userId,
        createdAt: new Date(),
      })
      .onConflictDoNothing(),
  );
  return toShare(scope, await findShare(codeId));
}

/** A new link; the old one stops working at once. */
export async function resetPublicStats(
  scope: ActiveScope,
  codeId: string,
): Promise<PublicStatsShare> {
  assertCanShare(scope);
  await findCode(scope, codeId);
  const [row] = await guarded(() =>
    db
      .update(codePublicStats)
      .set({
        token: newToken(),
        createdBy: scope.userId,
        createdAt: new Date(),
      })
      .where(eq(codePublicStats.qrCodeId, codeId))
      .returning(shareColumns),
  );
  if (!row) return enablePublicStats(scope, codeId);
  return toShare(scope, row);
}

/** Turns the page off; its link becomes a 404 at once. */
export async function disablePublicStats(
  scope: ActiveScope,
  codeId: string,
): Promise<PublicStatsShare> {
  assertCanShare(scope);
  await findCode(scope, codeId);
  await guarded(() =>
    db.delete(codePublicStats).where(eq(codePublicStats.qrCodeId, codeId)),
  );
  return toShare(scope, null);
}

// ─── Client branding of a share (agency tools) ──────────────────────────────

const planName = (allows: Parameters<typeof cheapestPlanWith>[0]) => {
  const plan = cheapestPlanWith(allows);
  return plan ? PLAN_NAMES[plan] : null;
};

const UNAVAILABLE_BRANDING: StatsBranding = {
  available: false,
  canManage: false,
  allowed: false,
  whiteLabel: false,
  brandingPlan: null,
  whiteLabelPlan: null,
  brandId: null,
  brands: [],
  domainId: null,
  domains: [],
};

/** The code's page branding and the choices the share dialog offers. */
export async function getStatsBranding(
  scope: ActiveScope,
  codeId: string,
): Promise<StatsBranding> {
  await findCode(scope, codeId);
  const limits = getPlanLimits(await getPlanForScope(scope));
  let extras: ShareExtras | null;
  let brands: Awaited<ReturnType<typeof listClientBrands>>;
  try {
    [extras, brands] = await Promise.all([
      findShareExtras({ codeId }),
      limits.clientReports
        ? listClientBrands(scope.organizationId)
        : Promise.resolve([]),
    ]);
  } catch (error) {
    if (error instanceof ClientBrandsUnavailableError) {
      return UNAVAILABLE_BRANDING;
    }
    throw error;
  }
  if (extras === null && (await findShare(codeId).catch(() => null))) {
    // Shared, but the agency columns aren't there yet.
    return UNAVAILABLE_BRANDING;
  }
  return {
    available: true,
    canManage: canSharePublicStats(scope),
    allowed: limits.clientReports,
    whiteLabel: limits.clientReportsWhiteLabel,
    brandingPlan: planName((l) => l.clientReports),
    whiteLabelPlan: planName((l) => l.clientReportsWhiteLabel),
    brandId: extras?.brandKitId ?? null,
    brands,
    domainId: extras?.domainId ?? null,
    domains: limits.clientReportsWhiteLabel
      ? await verifiedDomains(scope.organizationId)
      : [],
  };
}

/**
 * Sets the brand (null: plain) and the custom domain (null: QRdx's host) of
 * a shared page. A brand needs Pro or Business, a domain needs Business;
 * both must belong to the code's workspace. Sharing must be on.
 */
export async function setStatsBranding(
  scope: ActiveScope,
  codeId: string,
  input: { brandId: string | null; domainId: string | null },
): Promise<{ share: PublicStatsShare; branding: StatsBranding }> {
  assertCanShare(scope);
  await findCode(scope, codeId);
  const limits = getPlanLimits(await getPlanForScope(scope));
  if (input.brandId) {
    if (!limits.clientReports) {
      throw new HttpError(
        402,
        "PLAN_REQUIRED",
        `Client branding is part of ${planName((l) => l.clientReports) ?? "a paid plan"}.`,
      );
    }
    if (!(await findClientBrand(scope.organizationId, input.brandId))) {
      throw new HttpError(404, "NOT_FOUND", "Client brand not found.");
    }
  }
  if (input.domainId) {
    if (!limits.clientReportsWhiteLabel) {
      throw new HttpError(
        402,
        "PLAN_REQUIRED",
        `Stats links on your own domain are part of ${planName((l) => l.clientReportsWhiteLabel) ?? "a paid plan"}.`,
      );
    }
    const domains = await verifiedDomains(scope.organizationId);
    if (!domains.some((domain) => domain.id === input.domainId)) {
      throw new HttpError(
        404,
        "NOT_FOUND",
        "That domain isn't a verified domain of this workspace.",
      );
    }
  }
  if (!(await findShare(codeId))) {
    throw new HttpError(
      409,
      "CONFLICT",
      "Turn the analytics page on first, then brand it.",
    );
  }
  try {
    await db
      .update(codePublicStats)
      .set({ brandKitId: input.brandId, domainId: input.domainId })
      .where(eq(codePublicStats.qrCodeId, codeId));
  } catch (error) {
    if (isMissingSchemaError(error)) throw new ClientBrandsUnavailableError();
    throw error;
  }
  const [share, branding] = await Promise.all([
    getPublicStatsShare(scope, codeId),
    getStatsBranding(scope, codeId),
  ]);
  return { share, branding };
}

// ─── The public page ─────────────────────────────────────────────────────────

/**
 * Aggregates only (counts per day, country, device type and referrer
 * host), cached for a few minutes per code and range. The token is looked
 * up on every request, so turning sharing off or resetting the link
 * applies at once even while the numbers are cached.
 */
const cachedAnalytics = unstable_cache(
  async (codeId: string, days: number) => {
    const analytics = await getScanAnalytics(codeId, days);
    return {
      days: analytics.days,
      total: analytics.total,
      unique: analytics.unique,
      series: analytics.series,
      countries: analytics.countries,
      devices: analytics.devices,
      referrers: analytics.referrers,
      // NFC taps (feat/nfc): QR scans and NFC taps
      sources: analytics.sources,
    };
  },
  // v2: entries cached before `sources` existed are never read.
  ["public-stats-analytics-v2"],
  { revalidate: 300 },
);

/** The page for a token, or null (unknown token, code gone or switched off). */
export async function loadPublicStats(
  token: string,
  range: PublicStatsRange,
  options: {
    /**
     * The verified custom domain the request came through (proxy.ts), or
     * null on QRdx's own host. A custom domain only serves the shares
     * assigned to it, on a plan with white-label pages (Business).
     */
    customDomainId?: string | null;
  } = {},
): Promise<PublicStats | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  let row:
    | {
        codeId: string;
        title: string | null;
        slug: string;
        slugScope: string;
        destinationUrl: string;
        isActive: boolean;
        createdAt: Date;
        userId: string;
        organizationId: string | null;
        hostname: string | null;
        verified: boolean | null;
      }
    | undefined;
  try {
    [row] = await guarded(() =>
      db
        .select({
          codeId: qrCode.id,
          title: qrCode.title,
          slug: qrCode.slug,
          slugScope: qrCode.slugScope,
          destinationUrl: qrCode.destinationUrl,
          isActive: qrCode.isActive,
          createdAt: qrCode.createdAt,
          userId: qrCode.userId,
          organizationId: qrCode.organizationId,
          hostname: customDomain.hostname,
          verified: customDomain.verified,
        })
        .from(codePublicStats)
        .innerJoin(qrCode, eq(qrCode.id, codePublicStats.qrCodeId))
        .leftJoin(customDomain, eq(customDomain.id, qrCode.domainId))
        .where(and(eq(codePublicStats.token, token), isNull(qrCode.deletedAt)))
        .limit(1),
    );
  } catch (error) {
    if (error instanceof PublicStatsUnavailableError) return null;
    throw error;
  }
  // A code an admin switched off (abuse review) isn't shown either.
  if (!row?.isActive) return null;

  const limits = getPlanLimits(
    await getPlanForScope({
      userId: row.userId,
      organizationId: row.organizationId,
    }),
  );
  // Client branding (agency tools): looked up only where it can show.
  const extras =
    limits.clientReports || options.customDomainId
      ? await findShareExtras({ token })
      : null;
  if (
    options.customDomainId &&
    !(
      limits.clientReportsWhiteLabel &&
      extras?.domainId === options.customDomainId
    )
  ) {
    return null;
  }
  const brand =
    limits.clientReports && extras?.brandKitId && row.organizationId
      ? await loadBrand(row.organizationId, extras.brandKitId)
      : null;
  const hideQrdx = Boolean(brand && limits.clientReportsWhiteLabel);

  // Never further back than the workspace's plan keeps scans.
  const retention = limits.analyticsRetentionDays;
  const ranges = PUBLIC_STATS_RANGES.filter(
    (key) => RANGE_DAYS[key] <= retention,
  );
  const chosen = ranges.includes(range) ? range : (ranges.at(-1) ?? "7d");
  const analytics = await cachedAnalytics(row.codeId, RANGE_DAYS[chosen]);

  let destinationHost: string | null = null;
  try {
    destinationHost = new URL(row.destinationUrl).hostname.replace(
      /^www\./,
      "",
    );
  } catch {
    destinationHost = null;
  }
  const { link } = codeLinks(
    { slug: row.slug, slugScope: row.slugScope },
    row.hostname
      ? { hostname: row.hostname, verified: Boolean(row.verified) }
      : null,
  );

  return {
    code: {
      title: row.title,
      shortLink: link,
      destinationHost,
      createdAt: row.createdAt.toISOString(),
    },
    range: chosen,
    ranges,
    analytics,
    brand,
    hideQrdx,
    // On a page without QRdx marks, a qrdx.dev short link would be one.
    hideShortLink: hideQrdx && !(row.hostname && row.verified),
  };
}

/** A client brand of the workspace for a public page; null if gone. */
async function loadBrand(
  organizationId: string,
  brandKitId: string,
): Promise<PublicStats["brand"]> {
  try {
    const [row] = await db
      .select({
        name: brandKit.name,
        logo: brandKit.logo,
        colors: brandKit.colors,
      })
      .from(brandKit)
      .where(
        and(
          eq(brandKit.id, brandKitId),
          eq(brandKit.organizationId, organizationId),
          eq(brandKit.purpose, "client"),
        ),
      )
      .limit(1);
    if (!row) return null;
    const colors = (row.colors ?? {}) as { accent?: unknown };
    return {
      name: row.name,
      logo: row.logo,
      accent: normalizeAccent(colors.accent),
    };
  } catch (error) {
    if (isMissingSchemaError(error)) return null;
    throw error;
  }
}

const RANGE_DAYS: Record<PublicStatsRange, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};
