import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { displayUrl } from "@/app/(app)/dashboard/codes/_components/format";
import { loadPublicStats } from "@/lib/public-stats";
import {
  type PublicStatsRange,
  parsePublicStatsRange,
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

const load = cache(async (token: string, range: PublicStatsRange) =>
  loadPublicStats(token, range),
);

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
  return { title: `${name}: scan analytics`, ...NO_INDEX };
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
