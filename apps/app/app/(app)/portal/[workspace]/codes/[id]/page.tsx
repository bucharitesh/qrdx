import { Button } from "@repo/design-system/components/ui/button";
import { ArrowLeft2, ExportSquare } from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  displayUrl,
  formatDate,
} from "@/app/(app)/dashboard/codes/_components/format";
import {
  RangeNav,
  StatsReportBody,
} from "@/app/(app)/stats/[token]/public-stats-view";
import { PortalShell } from "@/components/agency/portal-shell";
import {
  findPortal,
  findPortalCode,
  portalCodeAnalytics,
  portalViewer,
} from "@/lib/portal/access";
import { portalCodePath, portalPath } from "@/lib/portal/paths";
import { parsePublicStatsRange } from "@/lib/public-stats-shared";
import { PortalGate, portalMetadata } from "../../_components/portal-gate";

// One code in a client portal (agency tools): the same aggregates as a
// shared stats page. A code outside the client's folders, in the trash or
// in another workspace is a 404, whatever the URL says.

type Props = {
  params: Promise<{ workspace: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { workspace } = await params;
  return portalMetadata(await findPortal(workspace), "Code report");
}

export default async function PortalCodePage({ params, searchParams }: Props) {
  const [{ workspace, id }, query] = await Promise.all([params, searchParams]);
  const portal = await findPortal(workspace);
  if (!portal) notFound();
  const viewer = await portalViewer(portal);
  if (viewer.kind !== "client") {
    return <PortalGate portal={portal} viewer={viewer} />;
  }
  const code = await findPortalCode(portal, viewer, id);
  if (!code) notFound();
  const { range, ranges, analytics } = await portalCodeAnalytics(
    portal,
    code.id,
    parsePublicStatsRange(query.range),
  );
  const name = code.title?.trim() || code.destinationHost || "Untitled code";

  return (
    <PortalShell email={viewer.email} portal={portal}>
      <Link
        className="text-muted-foreground hover:text-foreground -mb-2 flex w-fit items-center gap-1 text-sm transition-colors"
        href={portalPath(portal.slug)}
      >
        <ArrowLeft2 aria-hidden className="size-4" />
        {code.folderName}
      </Link>
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {name}
          </h1>
          <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-sm">
            {code.shortLink && (
              <span className="font-mono">{displayUrl(code.shortLink)}</span>
            )}
            {code.shortLink && code.destinationHost && (
              <span aria-hidden>→</span>
            )}
            {code.destinationHost && <span>{code.destinationHost}</span>}
          </p>
        </div>
        <RangeNav
          hrefFor={(key) =>
            `${portalCodePath(portal.slug, code.id)}?range=${key}`
          }
          range={range}
          ranges={ranges}
        />
      </section>

      {code.pageUrl && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
          <p className="text-sm">
            This code opens a hosted page.
            <span className="text-muted-foreground">
              {" "}
              Opening it here doesn't count as a scan.
            </span>
          </p>
          <Button asChild size="sm" variant="outline">
            <a href={code.pageUrl} rel="noopener noreferrer" target="_blank">
              <ExportSquare aria-hidden />
              Open the page
            </a>
          </Button>
        </div>
      )}

      <StatsReportBody
        accent={Boolean(portal.brand.accent)}
        analytics={analytics}
      />

      <p className="text-muted-foreground text-xs">
        Code created {formatDate(code.createdAt)}. Each visitor counts once per
        day.
      </p>
    </PortalShell>
  );
}
