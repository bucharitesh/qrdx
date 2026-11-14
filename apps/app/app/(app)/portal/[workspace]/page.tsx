import { Badge } from "@repo/design-system/components/ui/badge";
import { Card } from "@repo/design-system/components/ui/card";
import { ArrowRight2, Folder2 } from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  displayUrl,
  formatDate,
  formatNumber,
} from "@/app/(app)/dashboard/codes/_components/format";
import { PortalShell } from "@/components/agency/portal-shell";
import {
  findPortal,
  listPortalFolders,
  portalViewer,
} from "@/lib/portal/access";
import { portalCodePath } from "@/lib/portal/paths";
import { PortalGate, portalMetadata } from "./_components/portal-gate";

// A client portal's home (agency tools, Business): the folders shared with
// the signed-in client and their codes. Read-only; lib/portal/access.ts
// binds every query to this workspace and the client's folders.

type Props = { params: Promise<{ workspace: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { workspace } = await params;
  return portalMetadata(await findPortal(workspace), "Reports");
}

export default async function PortalHomePage({ params }: Props) {
  const { workspace } = await params;
  const portal = await findPortal(workspace);
  if (!portal) notFound();
  const viewer = await portalViewer(portal);
  if (viewer.kind !== "client") {
    return <PortalGate portal={portal} viewer={viewer} />;
  }
  const folders = await listPortalFolders(portal, viewer);
  const total = folders.reduce((sum, folder) => sum + folder.codes.length, 0);

  return (
    <PortalShell email={viewer.email} portal={portal}>
      <section className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {viewer.name ? `Reports for ${viewer.name}` : "Your reports"}
        </h1>
        <p className="text-muted-foreground text-sm">
          {total === 1 ? "1 QR code" : `${formatNumber(total)} QR codes`} in{" "}
          {folders.length === 1 ? "1 folder" : `${folders.length} folders`}.
          Open one for its scans over time, places and devices.
        </p>
      </section>

      {folders.length === 0 ? (
        <Card className="text-muted-foreground items-center px-6 py-12 text-center text-sm">
          Nothing is shared with you yet. {portal.brand.name} can add folders
          any time.
        </Card>
      ) : (
        folders.map((folder) => (
          <section className="space-y-2" key={folder.id}>
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <Folder2 aria-hidden className="text-muted-foreground size-4" />
              {folder.name}
              <span className="text-muted-foreground font-normal">
                {folder.codes.length}
              </span>
            </h2>
            {folder.codes.length === 0 ? (
              <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">
                No codes in this folder yet.
              </p>
            ) : (
              <Card className="gap-0 divide-y py-0">
                {folder.codes.map((code) => (
                  <Link
                    className="hover:bg-muted/40 focus-visible:bg-muted/40 flex items-center gap-3 px-4 py-3 transition-colors focus-visible:outline-none"
                    href={portalCodePath(portal.slug, code.id)}
                    key={code.id}
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">
                          {code.title?.trim() ||
                            code.destinationHost ||
                            "Untitled code"}
                        </span>
                        {code.kind === "page" && (
                          <Badge className="max-sm:hidden" variant="outline">
                            Hosted page
                          </Badge>
                        )}
                        {code.archived && (
                          <Badge variant="secondary">Archived</Badge>
                        )}
                      </div>
                      {(code.shortLink ||
                        code.destinationHost ||
                        code.kind === "page") && (
                        <p className="text-muted-foreground truncate text-xs">
                          <span className="font-mono">
                            {[
                              code.shortLink && displayUrl(code.shortLink),
                              code.destinationHost,
                            ]
                              .filter(Boolean)
                              .join(" → ")}
                          </span>
                          {/* Phones: the badge above makes way for the title. */}
                          {code.kind === "page" && (
                            <span className="sm:hidden">
                              {code.shortLink ? " · " : ""}Hosted page
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-medium tabular-nums">
                        {formatNumber(code.scanCount)}
                        <span className="text-muted-foreground font-normal">
                          {" "}
                          {code.scanCount === 1 ? "scan" : "scans"}
                        </span>
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {code.lastScannedAt
                          ? `Last ${formatDate(code.lastScannedAt)}`
                          : "No scans yet"}
                      </p>
                    </div>
                    <ArrowRight2
                      aria-hidden
                      className="text-muted-foreground size-4 shrink-0"
                    />
                  </Link>
                ))}
              </Card>
            )}
          </section>
        ))
      )}
    </PortalShell>
  );
}
