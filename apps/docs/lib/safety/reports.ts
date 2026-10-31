import "server-only";

import {
  abuseReport,
  customDomain,
  database as db,
  qrCode,
} from "@repo/database";
import cuid from "cuid";
import { and, eq, gte } from "drizzle-orm";
import { after } from "next/server";
import { isPlatformHostname } from "@/app/dashboard/domains/_lib/hostname";
import { baseUrl } from "@/lib/metadata";
import { isValidSlug, SHORT_LINK_BASE } from "@/lib/short-links";
import type { PublicAbuseReason } from "./abuse-reasons";
import { checkUrlSafety, describeSafety } from "./check";

/** What a report points at: a QRdx code when the link is one of ours. */
export interface ReportTarget {
  /** The reported link, normalized when it parses as a URL */
  url: string;
  slug: string | null;
  /** Set when the link is on a customer's domain */
  customHost: string | null;
}

const OWN_PATH = /^\/(?:q|p)\/([0-9A-Za-z]{7})\/?$/;
const CUSTOM_PATH = /^\/(?:p\/)?([0-9A-Za-z]{7})\/?$/;
const OWN_HOSTS = new Set([
  new URL(SHORT_LINK_BASE).hostname,
  baseUrl.hostname,
]);

/** Accepts a short link, a hosted page link, a custom-domain link or a bare slug. */
export function parseReportTarget(input: string): ReportTarget {
  const value = input.trim();
  if (isValidSlug(value)) {
    return {
      url: `${SHORT_LINK_BASE}/q/${value}`,
      slug: value,
      customHost: null,
    };
  }

  let url: URL;
  try {
    url = new URL(
      /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`,
    );
  } catch {
    return { url: value, slug: null, customHost: null };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { url: value, slug: null, customHost: null };
  }

  const host = url.hostname.toLowerCase();
  if (OWN_HOSTS.has(host) || isPlatformHostname(host)) {
    const slug = OWN_PATH.exec(url.pathname)?.[1] ?? null;
    return {
      url: url.href,
      slug: slug && isValidSlug(slug) ? slug : null,
      customHost: null,
    };
  }
  const slug = CUSTOM_PATH.exec(url.pathname)?.[1] ?? null;
  return {
    url: url.href,
    slug: slug && isValidSlug(slug) ? slug : null,
    customHost: slug ? host : null,
  };
}

interface ReportedCode {
  id: string;
  pageId: string | null;
  kind: string;
  destinationUrl: string;
  isActive: boolean;
}

/** The code a target points at; on a custom domain only that domain's codes. */
export async function findReportedCode(
  target: ReportTarget,
): Promise<ReportedCode | null> {
  if (!target.slug) return null;
  const [row] = await db
    .select({
      id: qrCode.id,
      pageId: qrCode.pageId,
      kind: qrCode.kind,
      destinationUrl: qrCode.destinationUrl,
      isActive: qrCode.isActive,
      hostname: customDomain.hostname,
      verified: customDomain.verified,
    })
    .from(qrCode)
    .leftJoin(customDomain, eq(customDomain.id, qrCode.domainId))
    .where(eq(qrCode.slug, target.slug))
    .limit(1);
  if (!row) return null;
  if (
    target.customHost &&
    !(row.verified && row.hostname === target.customHost)
  ) {
    return null;
  }
  return {
    id: row.id,
    pageId: row.pageId,
    kind: row.kind,
    destinationUrl: row.destinationUrl,
    isActive: row.isActive,
  };
}

const DEDUPE_MS = 24 * 60 * 60_000;

/**
 * Stores a public report. Repeats from the same visitor about the same code
 * within a day are dropped (still reported as success). When Google Web Risk
 * flags the code's destination, the code is switched off right away and an
 * "auto-threat" report is queued for an admin to confirm.
 */
export async function fileAbuseReport({
  target,
  reason,
  details,
  reporterEmail,
  visitorHash,
}: {
  target: ReportTarget;
  reason: PublicAbuseReason;
  details: string | null;
  reporterEmail: string | null;
  visitorHash: string;
}): Promise<void> {
  const code = await findReportedCode(target);

  if (code) {
    const [duplicate] = await db
      .select({ id: abuseReport.id })
      .from(abuseReport)
      .where(
        and(
          eq(abuseReport.qrCodeId, code.id),
          eq(abuseReport.visitorHash, visitorHash),
          gte(abuseReport.createdAt, new Date(Date.now() - DEDUPE_MS)),
        ),
      )
      .limit(1);
    if (duplicate) return;
  }

  await db.insert(abuseReport).values({
    id: cuid(),
    qrCodeId: code?.id ?? null,
    pageId: code?.kind === "page" ? code.pageId : null,
    url: target.url.slice(0, 2048),
    reason,
    details,
    reporterEmail,
    status: "open",
    visitorHash,
    createdAt: new Date(),
  });

  if (code?.isActive && code.kind === "redirect") {
    after(() => disableIfThreat(code));
  }
}

async function disableIfThreat(code: ReportedCode): Promise<void> {
  try {
    const safety = await checkUrlSafety(code.destinationUrl);
    if (safety.threats.length === 0) return;
    await db.batch([
      db.update(qrCode).set({ isActive: false }).where(eq(qrCode.id, code.id)),
      db.insert(abuseReport).values({
        id: cuid(),
        qrCodeId: code.id,
        url: code.destinationUrl.slice(0, 2048),
        reason: "auto-threat",
        details: `Switched off automatically after a report: ${describeSafety(safety).join("; ")}`,
        status: "open",
        createdAt: new Date(),
      }),
    ]);
  } catch (error) {
    console.error("[safety] Web Risk check of a reported code failed:", error);
  }
}
