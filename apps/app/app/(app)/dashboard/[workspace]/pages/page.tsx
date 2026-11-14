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
import { getUserSettings } from "@/actions/user-settings";
import { ListPagination } from "@/app/(app)/dashboard/_components/list-pagination";
import {
  pageSizeMenu,
  TABLE_PAGE_SIZES,
} from "@/app/(app)/dashboard/_lib/list-paging";
import {
  formatDate,
  formatNumber,
} from "@/app/(app)/dashboard/codes/_components/format";
import { ListDisplayProvider } from "@/app/(app)/dashboard/codes/_components/list-display";
import {
  DISPLAY_COOKIES,
  parseDisplay,
} from "@/app/(app)/dashboard/codes/_lib/display";
import { requireDashboardScope } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import {
  NewPageButton,
  PageActions,
  PageUsageMeter,
} from "@/app/(app)/dashboard/pages/_components/page-list-controls";
import {
  PageCheckbox,
  PageCheckboxCell,
  PageRow,
  PagesSelectAll,
  PagesSelection,
} from "@/app/(app)/dashboard/pages/_components/pages-selection";
import { PagesToolbar } from "@/app/(app)/dashboard/pages/_components/pages-toolbar";
import {
  type PagesFilters,
  pagesHref,
  parsePagesFilters,
} from "@/app/(app)/dashboard/pages/_lib/filters";
import {
  getPageUsage,
  listPages,
  listPageTypes,
} from "@/app/(app)/dashboard/pages/_lib/landing-pages";
import { CopyButton } from "@/components/copy-button";
import { HairlineFigure } from "@/components/mockups/hairline";
import { getAppTranslations } from "@/lib/i18n/app-locale";
import { getTemplate } from "@/lib/landing/templates";
import { loadPage } from "@/lib/paging";
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
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getAppTranslations("app.dashboard.pages.page");
  const tp = await getAppTranslations("app.dashboard.paging");
  const [scope, slug, cookieStore] = await Promise.all([
    requireDashboardScope(),
    requestWorkspaceSlug(),
    cookies(),
  ]);
  const query = await searchParams;
  const { new: requested, template: requestedTemplate } = query;
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
  const [usage, typesInUse, settings] = await Promise.all([
    getPageUsage(scope),
    listPageTypes(scope),
    // List keys follow the shortcuts switch; unread, they stay on (the default).
    getUserSettings().catch(() => null),
  ]);
  const canWrite = can(scope.role, "content.write");
  const canDeleteAny =
    canWrite && (!scope.organizationId || can(scope.role, "content.manageAll"));
  const display = parseDisplay(cookieStore.get(DISPLAY_COOKIES.pages)?.value);

  // The types in use, for the Filter menu; then the filters from the URL
  // (a type no page uses any more is dropped, not an error).
  const types = typesInUse.map((type) => ({
    type,
    label: getTemplate(type)?.label ?? type,
  }));
  const parsed = parsePagesFilters(query);
  const filters: PagesFilters = {
    ...parsed,
    type: parsed.type && typesInUse.includes(parsed.type) ? parsed.type : null,
  };
  // Past the last page (an old link, pages deleted since): the last page.
  const { pages, total, page } = await loadPage(
    filters.page,
    (page) =>
      listPages(scope, {
        q: filters.q || undefined,
        type: filters.type,
        limit: filters.size,
        offset: (page - 1) * filters.size,
      }),
    filters.size,
  );
  const pageCount = Math.max(1, Math.ceil(total / filters.size));
  const basePath = workspaceLink(slug, "/pages");
  const href = (patch: Partial<PagesFilters>) =>
    pagesHref(basePath, { ...filters, page }, patch);

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
              {t("allPages")}
            </h1>
            <span className="text-muted-foreground hidden shrink-0 text-sm tabular-nums sm:inline">
              {formatNumber(usage.used)}{" "}
              {usage.used === 1 ? t("page2") : t("pages2")}
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

        {usage.used === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <HairlineFigure
                className="mx-auto mb-2 aspect-square w-32"
                figure="PageForm"
              />
              <EmptyTitle>{t("noPagesYet")}</EmptyTitle>
              <EmptyDescription>
                {canWrite
                  ? t("buildAMobilePageFrom")
                  : t("whenSomeoneInThisWorkspace")}
              </EmptyDescription>
            </EmptyHeader>
            {canWrite && (
              <EmptyContent>
                <NewPageButton usage={usage}>
                  {t("createYourFirstPage")}
                </NewPageButton>
              </EmptyContent>
            )}
          </Empty>
        ) : (
          <div className="space-y-4">
            <PagesToolbar filters={filters} types={types} />
            {rows.length === 0 ? (
              <p className="text-muted-foreground rounded-xl border py-10 text-center text-sm">
                {t("noPagesMatchTheseFilters")}
              </p>
            ) : (
              <PagesSelection
                keyboardShortcuts={settings?.keyboardShortcuts ?? true}
                pages={rows.map((row) => ({
                  id: row.page.id,
                  canDelete: row.canDelete,
                  codes: row.page.codes.length,
                }))}
              >
                {display.view === "cards" ? (
                  <ul aria-label={t("pages")} className="space-y-2">
                    {rows.map((row) => (
                      <PageRow
                        as="li"
                        className="bg-card flex items-center gap-3 rounded-xl border px-3 py-3 transition-colors sm:px-4"
                        id={row.page.id}
                        key={row.page.id}
                      >
                        <PageCheckbox
                          className="max-sm:hidden"
                          id={row.page.id}
                          title={row.title}
                        />
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
                                  ? t("archived")
                                  : t("disabled")}
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
                                  successMessage={{
                                    title: t("pageLinkCopied"),
                                  }}
                                  textToCopy={row.code.pageUrl}
                                />
                              </span>
                            ) : (
                              <span>{t("noQrCodeLinksHere")}</span>
                            )}
                            <span className="shrink-0 max-sm:hidden">
                              · {row.template?.label ?? row.page.type}
                            </span>
                          </div>
                        </div>
                        <span className="text-muted-foreground hidden shrink-0 text-xs whitespace-nowrap md:inline">
                          {t("updatedUpdatedat", {
                            updatedAt: formatDate(row.page.updatedAt),
                          })}
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
                              {t("responses")}
                            </Link>
                          </Button>
                        )}
                        <span
                          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium tabular-nums"
                          title={t("allTimeScansOfThis")}
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
                        <PageActions
                          canDelete={row.canDelete}
                          page={row.page}
                        />
                      </PageRow>
                    ))}
                  </ul>
                ) : (
                  <div className="overflow-hidden rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <PageCheckboxCell header>
                            <PagesSelectAll />
                          </PageCheckboxCell>
                          <TableHead>{t("page")}</TableHead>
                          <TableHead className="hidden sm:table-cell">
                            {t("link")}
                          </TableHead>
                          <TableHead className="hidden md:table-cell">
                            {t("type")}
                          </TableHead>
                          <TableHead className="text-right">
                            {t("scans")}
                          </TableHead>
                          <TableHead className="hidden sm:table-cell">
                            {t("updated")}
                          </TableHead>
                          <TableHead>
                            <span className="sr-only">{t("actions")}</span>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((row) => (
                          <PageRow as="tr" id={row.page.id} key={row.page.id}>
                            <PageCheckboxCell>
                              <PageCheckbox
                                id={row.page.id}
                                title={row.title}
                              />
                            </PageCheckboxCell>
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
                                  : t("noQrCodeYet")}
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
                          </PageRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </PagesSelection>
            )}
            <ListPagination
              labels={{
                navigation: tp("navigation"),
                previous: tp("previous"),
                next: tp("next"),
                pageSize: tp("rowsPerPage"),
              }}
              nextHref={page < pageCount ? href({ page: page + 1 }) : null}
              previousHref={page > 1 ? href({ page: page - 1 }) : null}
              sizes={pageSizeMenu({
                options: TABLE_PAGE_SIZES,
                value: filters.size,
                total,
                label: (count) => tp("perPage", { count }),
                href: (size) => href({ size }),
              })}
              summary={t("pagePageOfPagecountTotal", {
                page,
                pageCount,
                total: formatNumber(total),
              })}
            />
          </div>
        )}
      </div>
    </ListDisplayProvider>
  );
}
