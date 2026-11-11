import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { displayUrl } from "@/app/(app)/dashboard/codes/_components/format";
import {
  CUSTOM_DOMAIN_HEADER,
  isCustomDomainRequest,
  requestHostname,
} from "@/app/(app)/dashboard/domains/_lib/hostname";
import { brandIconUrl } from "@/lib/client-brand-icon";
import { loadPublicStats } from "@/lib/public-stats";
import {
  type PublicStats,
  type PublicStatsRange,
  parsePublicStatsRange,
  publicStatsPath,
} from "@/lib/public-stats-shared";
import { getClientIp } from "@/lib/request-guards";
import { PublicStatsShell, PublicStatsView } from "./public-stats-view";

// A code's public, read-only analytics (lib/public-stats.ts): aggregates
// only, never indexed, never tracked (customer-page-paths.ts), and the link
// is never sent on as a referrer.

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Plenty for people reading a shared page; it stops scraping by token.
const viewLimiter = createRateLimiter({ limiter: slidingWindow(60, "60 s") });

// On a customer's verified domain (proxy.ts tags those requests) only the
// shares assigned to that domain are served, and only on Business.
const load = cache(async (token: string, range: PublicStatsRange) => {
  const requestHeaders = await headers();
  const customDomainId = isCustomDomainRequest(requestHeaders)
    ? requestHeaders.get(CUSTOM_DOMAIN_HEADER)
    : null;
  return loadPublicStats(token, range, { customDomainId });
});

const NO_INDEX: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
  openGraph: null,
  twitter: null,
};

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const stats = await load(token, parsePublicStatsRange(query.range));
  if (!stats) return { title: "Not found", ...NO_INDEX };
  const name = stats.code.title?.trim() || displayUrl(stats.code.shortLink);
  if (!stats.brand) return { title: `${name}: scan analytics`, ...NO_INDEX };
  // The preview image on the host the page was opened on.
  const requestHeaders = await headers();
  const host = isCustomDomainRequest(requestHeaders)
    ? requestHostname(requestHeaders.get("host"))
    : null;
  const path = `${publicStatsPath(token)}/og`;
  return brandedMetadata(stats, name, host ? `https://${host}${path}` : path);
}

/**
 * A client-branded page (agency tools): the client's name in the title and
 * the link preview. Without QRdx marks (Business) the site name, icons and
 * the " | QRdx" title suffix give way to the client's.
 */
function brandedMetadata(
  stats: PublicStats,
  name: string,
  image: string,
): Metadata {
  const brand = stats.brand as NonNullable<PublicStats["brand"]>;
  const title = `${brand.name} · ${name} scan report`;
  const metadata: Metadata = {
    ...NO_INDEX,
    title: stats.hideQrdx ? { absolute: title } : title,
    description: `Scans of ${name}, prepared for ${brand.name}.`,
    openGraph: {
      title,
      description: `Scans of ${name}, prepared for ${brand.name}.`,
      images: [{ url: image, width: 1200, height: 630 }],
      ...(stats.hideQrdx ? { siteName: brand.name } : {}),
    },
    twitter: { card: "summary_large_image", title, images: [image] },
  };
  if (!stats.hideQrdx) return metadata;
  return {
    ...metadata,
    applicationName: brand.name,
    authors: null,
    creator: null,
    keywords: null,
    manifest: null,
    icons: { icon: brandIconUrl(brand) },
  };
}

export default async function PublicStatsPage({ params, searchParams }: Props) {
  const [{ token }, query] = await Promise.all([params, searchParams]);

  const limited = await viewLimiter
    .limit(`public-stats:view:${getClientIp({ headers: await headers() })}`)
    .then((result) => !result.success)
    .catch(() => false);
  if (limited) {
    return (
      <PublicStatsShell>
        <div className="py-24 text-center">
          <h1 className="text-lg font-semibold">Too many requests</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            This page was opened a lot in a short time. Try again in a minute.
          </p>
        </div>
      </PublicStatsShell>
    );
  }

  const stats = await load(token, parsePublicStatsRange(query.range));
  if (!stats) notFound();
  return <PublicStatsView stats={stats} token={token} />;
}
