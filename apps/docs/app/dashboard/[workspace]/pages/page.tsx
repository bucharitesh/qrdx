import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import { Chart, MessageText, Element2 as PanelsTopLeft } from "iconsax-reactjs";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import {
  formatDate,
  formatNumber,
} from "@/app/dashboard/codes/_components/format";
import { ListDisplayProvider } from "@/app/dashboard/codes/_components/list-display";
import {
  DISPLAY_COOKIES,
  parseDisplay,
} from "@/app/dashboard/codes/_lib/display";
import { requireDashboardScope } from "@/app/dashboard/codes/_lib/qr-codes";
import {
  NewPageButton,
  PageActions,
  PageUsageMeter,
} from "@/app/dashboard/pages/_components/page-list-controls";
import { PagesToolbar } from "@/app/dashboard/pages/_components/pages-toolbar";
import {
  getPageUsage,
  listPages,
} from "@/app/dashboard/pages/_lib/landing-pages";
import { CopyButton } from "@/components/copy-button";
import { HairlineFigure } from "@/components/mockups/hairline";
import { getTemplate } from "@/lib/landing/templates";
import { can } from "@/lib/permissions";
import { requestWorkspaceSlug } from "@/lib/scope";
import { workspaceLink } from "@/lib/workspace-paths";

/**
 * The page type that collects responses (lib/landing/templates/feedback;
 * FORM_PAGE_TYPE in the client-only create-actions.tsx). A server component
 * can't read a constant from a "use client" module, so it's named here.
 */
const FORM_TYPE = "feedback";

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
    q?: string | string[];
    type?: string | string[];
  }>;
}) {
  const [scope, slug, cookieStore] = await Promise.all([
    requireDashboardScope(),
    requestWorkspaceSlug(),
    cookies(),
  ]);
  const {
    new: requested,
    template: requestedTemplate,
    q: rawQuery,
    type: rawType,
  } = await searchParams;
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
  const [usage, allPages] = await Promise.all([
    getPageUsage(scope),
    listPages(scope),
  ]);
  const canWrite = can(scope.role, "content.write");
  const canDeleteAny =
    canWrite && (!scope.organizationId || can(scope.role, "content.manageAll"));
  const display = parseDisplay(cookieStore.get(DISPLAY_COOKIES.pages)?.value);

  // The types in use, for the Filter menu; then the filters from the URL.
  const types = [...new Set(allPages.map((page) => page.type))].map((type) => ({
    type,
    label: getTemplate(type)?.label ?? type,
  }));
  const filters = {
    q: (typeof rawQuery === "string" ? rawQuery : "").trim().slice(0, 200),
    type:
      typeof rawType === "string" && types.some((item) => item.type === rawType)
        ? rawType
        : null,
  };
  const term = filters.q.toLowerCase();
  const pages = allPages.filter(
    (page) =>
      (!filters.type || page.type === filters.type) &&
      (!term ||
        (page.title ?? "").toLowerCase().includes(term) ||
        (getTemplate(page.type)?.label ?? "").toLowerCase().includes(term) ||
        page.codes.some((code) => code.pageUrl.toLowerCase().includes(term))),
  );

  const rows = pages.map((page) => {
    const template = getTemplate(page.type);
    const codes = page.codes.filter((code) => !code.inTrash);
    const [code] = codes;
    return {
      page,
      template,
      Icon: template?.icon ?? PanelsTopLeft,
      title:
        page.title || `Untitled ${template?.label.toLowerCase() ?? "page"}`,
      code,
      scans: codes.reduce((sum, item) => sum + item.scanCount, 0),
      href: workspaceLink(slug, `/pages/${encodeURIComponent(page.id)}`),
      isForm: page.type === FORM_TYPE,
      canDelete: canDeleteAny || (canWrite && page.createdBy === scope.userId),
    };
  });
  const scansLabel = (scans: number) =>
    `${formatNumber(scans)} ${scans === 1 ? "scan" : "scans"}`;

  return (
    <ListDisplayProvider initial={display} list="pages" refresh>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              All pages
            </h1>
            <span className="text-muted-foreground hidden shrink-0 text-sm tabular-nums sm:inline">
              {formatNumber(allPages.length)}{" "}
              {allPages.length === 1 ? "page" : "pages"}
            </span>
          </div>
          {canWrite && (
            <NewPageButton
              autoOpenType={newType}
              autoOpenVariant={newVariant}
              usage={usage}
            />
          )}
        </div>

        <PageUsageMeter usage={usage} />

        {allPages.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <HairlineFigure
                className="mx-auto mb-2 aspect-square w-32"
                figure="PageForm"
              />
              <EmptyTitle>No pages yet</EmptyTitle>
              <EmptyDescription>
                {canWrite
                  ? "Build a mobile page from blocks, with no website needed. Each page gets a dynamic QR code, so you can keep editing it after printing."
                  : "When someone in this workspace builds one, it shows up here."}
              </EmptyDescription>
            </EmptyHeader>
            {canWrite && (
              <EmptyContent>
                <NewPageButton usage={usage}>
                  Create your first page
                </NewPageButton>
              </EmptyContent>
            )}
          </Empty>
        ) : (
          <div className="space-y-4">
            <PagesToolbar filters={filters} types={types} />
            {rows.length === 0 ? (
              <p className="text-muted-foreground rounded-xl border py-10 text-center text-sm">
                No pages match these filters.
              </p>
            ) : display.view === "cards" ? (
              <ul aria-label="Pages" className="space-y-2">
                {rows.map((row) => (
                  <li
                    className="bg-card hover:border-foreground/20 flex items-center gap-3 rounded-xl border px-3 py-3 transition-colors sm:px-4"
                    key={row.page.id}
                  >
                    <span className="bg-muted/50 text-muted-foreground grid size-8 shrink-0 place-items-center rounded-full border">
                      <row.Icon aria-hidden className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <Link
                          className="truncate text-sm font-medium hover:underline"
                          href={row.href}
                        >
                          {row.title}
                        </Link>
                        {row.code && row.code.status !== "active" && (
                          <Badge variant="outline">
                            {row.code.status === "archived"
                              ? "Archived"
                              : "Disabled"}
                          </Badge>
                        )}
                      </div>
                      <div className="text-muted-foreground mt-0.5 flex min-w-0 items-center gap-1.5 text-xs">
                        {row.code ? (
                          <span className="flex min-w-0 items-center gap-0.5">
                            <span className="text-foreground/80 truncate font-mono">
                              {row.code.pageUrl.replace(/^https?:\/\//, "")}
                            </span>
                            <CopyButton
                              className="size-6"
                              successMessage={{ title: "Page link copied" }}
                              textToCopy={row.code.pageUrl}
                            />
                          </span>
                        ) : (
                          <span>No QR code links here yet</span>
                        )}
                        <span className="shrink-0 max-sm:hidden">
                          · {row.template?.label ?? row.page.type}
                        </span>
                      </div>
                    </div>
                    <span className="text-muted-foreground hidden shrink-0 text-xs whitespace-nowrap md:inline">
                      Updated {formatDate(row.page.updatedAt)}
                    </span>
                    {row.isForm && (
                      <Button
                        asChild
                        className="hidden h-7 rounded-full px-2.5 text-xs sm:inline-flex"
                        size="sm"
                        variant="outline"
                      >
                        <Link href={`${row.href}/responses`}>
                          <MessageText aria-hidden />
                          Responses
                        </Link>
                      </Button>
                    )}
                    <span
                      className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium tabular-nums"
                      title="All-time scans of this page's QR codes"
                    >
                      <Chart
                        aria-hidden
                        className="text-muted-foreground size-3.5"
                      />
                      <span className="max-sm:hidden">
                        {scansLabel(row.scans)}
                      </span>
                      <span className="sm:hidden">
                        {formatNumber(row.scans)}
                      </span>
                    </span>
                    <PageActions canDelete={row.canDelete} page={row.page} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Page</TableHead>
                      <TableHead className="hidden sm:table-cell">
                        Link
                      </TableHead>
                      <TableHead className="hidden md:table-cell">
                        Type
                      </TableHead>
                      <TableHead className="text-right">Scans</TableHead>
                      <TableHead className="hidden sm:table-cell">
                        Updated
                      </TableHead>
                      <TableHead>
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.page.id}>
                        <TableCell className="max-w-[240px] max-sm:max-w-[190px]">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className="bg-muted/50 text-muted-foreground grid size-7 shrink-0 place-items-center rounded-full border">
                              <row.Icon aria-hidden className="size-3.5" />
                            </span>
                            <Link
                              className="truncate font-medium hover:underline"
                              href={row.href}
                            >
                              {row.title}
                            </Link>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <span className="text-muted-foreground block max-w-[200px] truncate font-mono text-xs">
                            {row.code
                              ? row.code.pageUrl.replace(/^https?:\/\//, "")
                              : "No QR code yet"}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden md:table-cell">
                          {row.template?.label ?? row.page.type}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(row.scans)}
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden whitespace-nowrap sm:table-cell">
                          {formatDate(row.page.updatedAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <PageActions
                            canDelete={row.canDelete}
                            page={row.page}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </div>
    </ListDisplayProvider>
  );
}
