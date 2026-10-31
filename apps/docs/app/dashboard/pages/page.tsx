import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import { Element2 as PanelsTopLeft, Edit2 as Pencil } from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/app/dashboard/_components/page-header";
import {
  formatDate,
  formatNumber,
} from "@/app/dashboard/codes/_components/format";
import { requireDashboardScope } from "@/app/dashboard/codes/_lib/qr-codes";
import { HairlineFigure } from "@/components/mockups/hairline";
import { getTemplate } from "@/lib/landing/templates";
import {
  NewPageButton,
  PageActions,
  PageUsageMeter,
} from "./_components/page-list-controls";
import { getPageUsage, listPages } from "./_lib/landing-pages";

export const metadata: Metadata = {
  title: "Pages",
  robots: { index: false, follow: false },
};

export default async function PagesPage({
  searchParams,
}: {
  searchParams: Promise<{
    new?: string | string[];
    template?: string | string[];
  }>;
}) {
  const scope = await requireDashboardScope();
  const { new: requested, template: requestedTemplate } = await searchParams;
  // `?new=<type>` comes from the editor's type picker; unknown types are ignored.
  const newType =
    typeof requested === "string" && getTemplate(requested)
      ? requested
      : undefined;
  // `&template=<id>` comes from a template demo (/templates/<type>/<id>).
  const newVariant =
    newType &&
    typeof requestedTemplate === "string" &&
    getTemplate(newType)?.variants.some((item) => item.id === requestedTemplate)
      ? requestedTemplate
      : undefined;
  const [usage, pages] = await Promise.all([
    getPageUsage(scope),
    listPages(scope),
  ]);
  const canDeleteAny = !(scope.organizationId && scope.role === "member");

  return (
    <div className="space-y-6">
      <PageHeader
        description="Mobile pages your QR codes open: link lists, business pages, digital business cards and more."
        title="Pages"
      >
        <NewPageButton
          autoOpenType={newType}
          autoOpenVariant={newVariant}
          usage={usage}
        />
      </PageHeader>

      <PageUsageMeter usage={usage} />

      {pages.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <HairlineFigure
              className="mx-auto mb-2 aspect-square w-32"
              figure="Stack"
            />
            <EmptyTitle>No pages yet</EmptyTitle>
            <EmptyDescription>
              Build a mobile page from blocks, with no website needed. Each page
              gets a dynamic QR code, so you can keep editing it after printing.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <NewPageButton usage={usage}>Create your first page</NewPageButton>
          </EmptyContent>
        </Empty>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {pages.map((page) => {
            const template = getTemplate(page.type);
            const Icon = template?.icon ?? PanelsTopLeft;
            const codes = page.codes.filter((code) => !code.inTrash);
            const scans = codes.reduce((sum, code) => sum + code.scanCount, 0);
            const [code] = codes;
            const href = `/dashboard/pages/${encodeURIComponent(page.id)}`;
            return (
              <li
                className="bg-card flex flex-col gap-3 rounded-lg border p-4"
                key={page.id}
              >
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-foreground/80">
                    <Icon className="size-4.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      className="block truncate font-medium hover:underline"
                      href={href}
                    >
                      {page.title ||
                        `Untitled ${template?.label.toLowerCase() ?? "page"}`}
                    </Link>
                    <p className="text-muted-foreground truncate text-xs">
                      {code
                        ? code.pageUrl.replace(/^https?:\/\//, "")
                        : "No QR code links here yet"}
                    </p>
                  </div>
                  <PageActions
                    canDelete={canDeleteAny || page.createdBy === scope.userId}
                    page={page}
                  />
                </div>
                <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <Badge variant="secondary">
                    {template?.label ?? page.type}
                  </Badge>
                  <span>
                    {formatNumber(scans)} {scans === 1 ? "scan" : "scans"}
                  </span>
                  <span>Updated {formatDate(page.updatedAt)}</span>
                  {code && code.status !== "active" && (
                    <Badge variant="outline">
                      {code.status === "archived" ? "Archived" : "Disabled"}
                    </Badge>
                  )}
                </div>
                <Button
                  asChild
                  className="mt-auto w-full"
                  size="sm"
                  variant="outline"
                >
                  <Link href={href}>
                    <Pencil />
                    Edit page
                  </Link>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
