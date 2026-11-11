import "server-only";

import { auth } from "@repo/auth/server";
import {
  customDomain,
  database as db,
  folder,
  organization,
  portalClient,
  portalClientFolder,
  qrCode,
} from "@repo/database";
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { headers } from "next/headers";
import { cache } from "react";
import { findPortalBrand } from "@/lib/client-brands";
import type { ClientBrand } from "@/lib/client-brands-shared";
import { isMissingSchemaError } from "@/lib/community/tables";
import { getOwnerPlanForOrganization, getPlanLimits } from "@/lib/plans";
import {
  PUBLIC_STATS_RANGES,
  type PublicStats,
  type PublicStatsRange,
} from "@/lib/public-stats-shared";
import { getScanAnalytics } from "@/lib/scans";
import { logError } from "@/lib/shared";
import { codeLinks, SHORT_LINK_BASE } from "@/lib/short-links";

// The client portal (agency tools, Business): /portal/<workspace-slug>, a
// read-only view of the folders a workspace shared with one client.
//
// Clients are never workspace members (portal_client, not member), so
// nothing in the dashboard, the server actions or the API knows them: a
// workspace slug they aren't a member of is a 404 there, and API keys only
// ever act in their own workspace. Everything a client can see is read
// here, and every query is bound to the portal's workspace AND the
// client's folders. There are no writes besides claiming the invitation.

export interface PortalWorkspace {
  id: string;
  slug: string;
  /** The portal's branding: its own, else the workspace's name and logo */
  brand: Omit<ClientBrand, "id">;
  /** The plan keeps analytics this many days */
  retentionDays: number;
}

export type PortalViewer =
  | { kind: "signed-out" }
  /** Signed in, but not invited here (or invited with another address) */
  | { kind: "no-access"; email: string }
  | {
      kind: "client";
      clientId: string;
      email: string;
      name: string | null;
      /** The folders shared with them that still exist in this workspace */
      folderIds: string[];
    };

const missing = (error: unknown, action: string) => {
  if (!isMissingSchemaError(error)) return false;
  logError(error as Error, {
    action,
    hint: "Apply packages/database/manual-sql/2026-11-11-agency.sql",
  });
  return true;
};

/**
 * The portal for a workspace slug: null when there's no such workspace, its
 * plan has no client portal (Business), or the tables aren't there yet.
 * Nothing about the workspace is shown unless its portal is on.
 */
export const findPortal = cache(
  async (slug: string): Promise<PortalWorkspace | null> => {
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/i.test(slug)) return null;
    const [row] = await db
      .select({
        id: organization.id,
        slug: organization.slug,
        name: organization.name,
        logo: organization.logo,
      })
      .from(organization)
      .where(eq(organization.slug, slug))
      .limit(1);
    if (!row) return null;
    const limits = getPlanLimits(await getOwnerPlanForOrganization(row.id));
    if (!limits.clientPortal) return null;
    let brand: ClientBrand | null = null;
    try {
      // Also proves the agency tables exist: the brand_kit.purpose column
      // comes with them.
      brand = await findPortalBrand(row.id);
      await db
        .select({ id: portalClient.id })
        .from(portalClient)
        .where(eq(portalClient.organizationId, row.id))
        .limit(1);
    } catch (error) {
      if (missing(error, "portal.find")) return null;
      if ((error as { code?: string }).code === "UNAVAILABLE") return null;
      throw error;
    }
    return {
      id: row.id,
      slug: row.slug,
      brand: {
        name: brand?.name?.trim() || row.name,
        logo: brand ? (brand.logo ?? row.logo) : row.logo,
        accent: brand?.accent ?? null,
      },
      retentionDays: limits.analyticsRetentionDays,
    };
  },
);

/**
 * Who is looking at a portal. A signed-in person is a client when an
 * invitation of this workspace is theirs: already claimed by their account,
 * or sent to their verified email and not claimed by anyone (then it's
 * claimed now, so changing their email later keeps access).
 */
export async function portalViewer(
  portal: Pick<PortalWorkspace, "id">,
  requestHeaders?: Headers,
): Promise<PortalViewer> {
  const session = await auth.api.getSession({
    headers: requestHeaders ?? (await headers()),
  });
  const user = session?.user as
    | { id?: string; email?: string; emailVerified?: boolean }
    | undefined;
  if (!(user?.id && user.email)) return { kind: "signed-out" };
  const email = user.email.trim().toLowerCase();

  const rows = await db
    .select({
      id: portalClient.id,
      email: portalClient.email,
      name: portalClient.name,
      userId: portalClient.userId,
    })
    .from(portalClient)
    .where(
      and(
        eq(portalClient.organizationId, portal.id),
        or(eq(portalClient.userId, user.id), eq(portalClient.email, email)),
      ),
    )
    .limit(5);

  let client = rows.find((row) => row.userId === user.id);
  if (!client && user.emailVerified === true) {
    const unclaimed = rows.find(
      (row) => row.userId === null && row.email === email,
    );
    if (unclaimed) {
      const now = new Date();
      const [claimed] = await db
        .update(portalClient)
        .set({ userId: user.id, acceptedAt: now, lastSeenAt: now })
        .where(
          and(
            eq(portalClient.id, unclaimed.id),
            eq(portalClient.organizationId, portal.id),
            isNull(portalClient.userId),
          ),
        )
        .returning({ id: portalClient.id });
      if (claimed) client = { ...unclaimed, userId: user.id };
    }
  }
  if (!client) return { kind: "no-access", email };

  const folders = await db
    .select({ id: folder.id })
    .from(portalClientFolder)
    .innerJoin(folder, eq(folder.id, portalClientFolder.folderId))
    .where(
      and(
        eq(portalClientFolder.clientId, client.id),
        eq(folder.organizationId, portal.id),
      ),
    );
  return {
    kind: "client",
    clientId: client.id,
    email: client.email,
    name: client.name,
    folderIds: folders.map((row) => row.id),
  };
}

// ─── What a client sees ──────────────────────────────────────────────────────

export interface PortalCode {
  id: string;
  title: string | null;
  /**
   * The printed short link when it's on one of the workspace's verified
   * domains; null on QRdx's own host, which a portal without QRdx marks
   * doesn't show
   */
  shortLink: string | null;
  /** "redirect" opens a website; "page" a hosted page */
  kind: string;
  /** The hosted page's address (kind "page") */
  pageUrl: string | null;
  /** The destination's host only (kind "redirect") */
  destinationHost: string | null;
  scanCount: number;
  lastScannedAt: string | null;
  archived: boolean;
  createdAt: string;
}

export interface PortalFolder {
  id: string;
  name: string;
  codes: PortalCode[];
}

const codeColumns = {
  id: qrCode.id,
  title: qrCode.title,
  slug: qrCode.slug,
  slugScope: qrCode.slugScope,
  kind: qrCode.kind,
  destinationUrl: qrCode.destinationUrl,
  scanCount: qrCode.scanCount,
  lastScannedAt: qrCode.lastScannedAt,
  archivedAt: qrCode.archivedAt,
  createdAt: qrCode.createdAt,
  folderId: qrCode.folderId,
  isActive: qrCode.isActive,
  hostname: customDomain.hostname,
  verified: customDomain.verified,
};

type CodeRow = {
  id: string;
  title: string | null;
  slug: string;
  slugScope: string;
  kind: string;
  destinationUrl: string;
  scanCount: number;
  lastScannedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  folderId: string | null;
  isActive: boolean;
  hostname: string | null;
  verified: boolean | null;
};

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function toPortalCode(row: CodeRow): PortalCode {
  const domain = row.hostname
    ? { hostname: row.hostname, verified: Boolean(row.verified) }
    : null;
  const { link } = codeLinks(
    { slug: row.slug, slugScope: row.slugScope },
    domain,
  );
  const page = row.kind === "page";
  return {
    id: row.id,
    title: row.title,
    shortLink: domain?.verified ? link : null,
    kind: row.kind,
    pageUrl: page
      ? domain?.verified
        ? `https://${domain.hostname}/p/${encodeURIComponent(row.slug)}`
        : `${SHORT_LINK_BASE}/p/${encodeURIComponent(row.slug)}`
      : null,
    // Only the host: never a destination's path or query string.
    destinationHost: page ? null : hostOf(row.destinationUrl),
    scanCount: row.scanCount,
    lastScannedAt: row.lastScannedAt?.toISOString() ?? null,
    archived: row.archivedAt !== null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Codes in the portal's workspace AND the client's folders, not trashed. */
const visibleCodes = (portalId: string, folderIds: string[]) =>
  and(
    eq(qrCode.organizationId, portalId),
    inArray(qrCode.folderId, folderIds),
    isNull(qrCode.deletedAt),
    // Codes an admin switched off (abuse review) aren't shown either.
    eq(qrCode.isActive, true),
  );

const MAX_CODES = 1000;

/** The client's folders and their codes, newest code first. */
export async function listPortalFolders(
  portal: Pick<PortalWorkspace, "id">,
  viewer: Extract<PortalViewer, { kind: "client" }>,
): Promise<PortalFolder[]> {
  if (viewer.folderIds.length === 0) return [];
  const [folders, codes] = await Promise.all([
    db
      .select({ id: folder.id, name: folder.name })
      .from(folder)
      .where(
        and(
          eq(folder.organizationId, portal.id),
          inArray(folder.id, viewer.folderIds),
        ),
      )
      .orderBy(asc(folder.name)),
    db
      .select(codeColumns)
      .from(qrCode)
      .leftJoin(customDomain, eq(customDomain.id, qrCode.domainId))
      .where(visibleCodes(portal.id, viewer.folderIds))
      .orderBy(desc(qrCode.createdAt))
      .limit(MAX_CODES),
  ]);
  return folders.map((row) => ({
    id: row.id,
    name: row.name,
    codes: (codes as CodeRow[])
      .filter((code) => code.folderId === row.id)
      .map(toPortalCode),
  }));
}

/** One code the client may see, or null (missing, trashed or elsewhere). */
export async function findPortalCode(
  portal: Pick<PortalWorkspace, "id">,
  viewer: Extract<PortalViewer, { kind: "client" }>,
  codeId: string,
): Promise<(PortalCode & { folderName: string }) | null> {
  if (viewer.folderIds.length === 0) return null;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(codeId)) return null;
  const [row] = await db
    .select({ ...codeColumns, folderName: folder.name })
    .from(qrCode)
    .innerJoin(folder, eq(folder.id, qrCode.folderId))
    .leftJoin(customDomain, eq(customDomain.id, qrCode.domainId))
    .where(
      and(eq(qrCode.id, codeId), visibleCodes(portal.id, viewer.folderIds)),
    )
    .limit(1);
  if (!row) return null;
  return { ...toPortalCode(row as CodeRow), folderName: row.folderName };
}

const RANGE_DAYS: Record<PublicStatsRange, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/** A code's aggregates for the portal: the same as a shared stats page. */
export async function portalCodeAnalytics(
  portal: Pick<PortalWorkspace, "retentionDays">,
  codeId: string,
  range: PublicStatsRange,
): Promise<{
  range: PublicStatsRange;
  ranges: PublicStatsRange[];
  analytics: PublicStats["analytics"];
}> {
  const ranges = PUBLIC_STATS_RANGES.filter(
    (key) => RANGE_DAYS[key] <= portal.retentionDays,
  );
  const chosen = ranges.includes(range) ? range : (ranges.at(-1) ?? "7d");
  const analytics = await getScanAnalytics(codeId, RANGE_DAYS[chosen]);
  return {
    range: chosen,
    ranges,
    analytics: {
      days: analytics.days,
      total: analytics.total,
      unique: analytics.unique,
      series: analytics.series,
      countries: analytics.countries,
      devices: analytics.devices,
      referrers: analytics.referrers,
      sources: analytics.sources,
    },
  };
}
