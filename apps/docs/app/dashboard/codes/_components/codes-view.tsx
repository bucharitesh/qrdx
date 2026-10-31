import { Button } from "@repo/design-system/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import {
  ArrowRight2 as ChevronRight,
  DocumentUpload as FileUp,
} from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { PageHeader } from "@/app/dashboard/_components/page-header";
import {
  countTrash,
  listFolders,
  listTags,
} from "@/app/dashboard/codes/_lib/organize";
import {
  type CodesFilters,
  codesHref,
  folderPath,
  isUnfiltered,
  parseCodesFilters,
} from "@/app/dashboard/codes/_lib/organize-shared";
import {
  getCodeUsage,
  listCodes,
  requireDashboardScope,
} from "@/app/dashboard/codes/_lib/qr-codes";
import { HairlineFigure } from "@/components/mockups/hairline";
import { getScanSparklines } from "@/lib/scans";
import { CodesList } from "./codes-list";
import { CodesSidebar, CodesSidebarSheet } from "./codes-sidebar";
import { CodesToolbar } from "./codes-toolbar";
import { formatNumber } from "./format";
import { ImportDialog } from "./import-dialog";
import { NewCodeButton, UsageMeter } from "./usage";

export const codesMetadata: Metadata = {
  title: "Dynamic QR codes",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 25;

type SearchParams = Record<string, string | string[] | undefined>;

const STATUS_NOTES = {
  archived:
    'Archived codes show a "no longer active" page and don\'t count toward your plan. Unarchive one to make it redirect again.',
  trash:
    'Codes in the trash show a "no longer active" page and don\'t count toward your plan. Restore them, or delete them forever with their scan history.',
} as const;

/**
 * The codes list: folders and tags sidebar, search, filters, bulk actions.
 * Rendered by /dashboard and /dashboard/codes (`basePath` keeps links on the
 * page that rendered it).
 */
export async function CodesView({
  basePath,
  searchParams,
}: {
  basePath: string;
  searchParams: Promise<SearchParams>;
}) {
  const scope = await requireDashboardScope();
  const filters = parseCodesFilters(await searchParams);

  const [usage, folders, tags, trashCount] = await Promise.all([
    getCodeUsage(scope),
    listFolders(scope),
    listTags(scope),
    countTrash(scope),
  ]);

  // Ids from old links (deleted folder or tag) are dropped, not errors.
  const folder =
    filters.folder && filters.folder !== "none"
      ? folders.find((row) => row.id === filters.folder)
      : undefined;
  const effective: CodesFilters = {
    ...filters,
    folder: filters.folder === "none" ? "none" : (folder?.id ?? null),
    tags: filters.tags.filter((id) => tags.some((row) => row.id === id)),
  };

  const { codes, total } = await listCodes(scope, {
    status: effective.status,
    q: effective.q || undefined,
    folderId:
      effective.folder === "none" ? null : (effective.folder ?? undefined),
    tagIds: effective.tags,
    favorites: effective.favorites,
    sort: effective.sort,
    limit: PAGE_SIZE,
    offset: (effective.page - 1) * PAGE_SIZE,
  });
  const sparklines = Object.fromEntries(
    await getScanSparklines(codes.map((code) => code.id)),
  );

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(effective.page, pageCount);
  const isEmpty = total === 0 && isUnfiltered(effective);
  const href = (patch: Partial<CodesFilters>) =>
    codesHref(basePath, effective, patch);

  const sidebarProps = {
    activeCount: usage.used,
    basePath,
    filters: effective,
    folders,
    tags,
    trashCount,
  };

  const crumbs = folder ? folderPath(folders, folder.id) : [];
  const heading =
    effective.status === "trash"
      ? "Trash"
      : effective.folder === "none"
        ? "Not in a folder"
        : folder
          ? folder.name
          : effective.favorites
            ? "Favorites"
            : effective.status === "archived"
              ? "Archived"
              : "All codes";

  return (
    <div className="space-y-6">
      <PageHeader
        description="Print once, then change where your codes point and see every scan."
        title="Dynamic QR codes"
      >
        <Button asChild variant="outline">
          <Link href="/dashboard/codes/import">
            <FileUp />
            Import CSV
          </Link>
        </Button>
        <ImportDialog />
        <NewCodeButton usage={usage} />
      </PageHeader>

      <UsageMeter usage={usage} />

      {isEmpty && folders.length === 0 && trashCount === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <HairlineFigure className="mx-auto mb-2 h-28 w-40" figure="Relay" />
            <EmptyTitle>No dynamic QR codes yet</EmptyTitle>
            <EmptyDescription>
              A dynamic code encodes a short link. Print it once and change the
              destination whenever you like, with scan analytics included.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex flex-wrap justify-center gap-2">
              <NewCodeButton usage={usage}>
                Create your first dynamic QR code
              </NewCodeButton>
              <Button asChild variant="outline">
                <Link href="/dashboard/codes/import">
                  <FileUp />
                  Import from CSV
                </Link>
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Or turn on "Make it dynamic" for a URL code in the{" "}
              <Link className="underline" href="/playground">
                playground
              </Link>
              .
            </p>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[13rem_minmax(0,1fr)]">
          <aside className="hidden xl:block">
            <div className="sticky top-8">
              <CodesSidebar {...sidebarProps} />
            </div>
          </aside>

          <div className="min-w-0 space-y-4">
            <CodesToolbar
              basePath={basePath}
              filters={effective}
              tags={tags}
              trashCount={trashCount}
            >
              <CodesSidebarSheet {...sidebarProps} />
            </CodesToolbar>

            <div className="space-y-1">
              <h2 className="flex min-w-0 flex-wrap items-center gap-1 text-base font-semibold">
                {crumbs.length > 1 ? (
                  crumbs.map((crumb, index) => (
                    <Fragment key={crumb.id}>
                      {index > 0 && (
                        <ChevronRight className="text-muted-foreground size-4" />
                      )}
                      {index < crumbs.length - 1 ? (
                        <Link
                          className="text-muted-foreground hover:text-foreground truncate"
                          href={href({ folder: crumb.id })}
                        >
                          {crumb.name}
                        </Link>
                      ) : (
                        <span className="truncate">{crumb.name}</span>
                      )}
                    </Fragment>
                  ))
                ) : (
                  <span className="truncate">{heading}</span>
                )}
                <span className="text-muted-foreground ml-1 text-sm font-normal tabular-nums">
                  {formatNumber(total)} {total === 1 ? "code" : "codes"}
                </span>
              </h2>
              {(effective.status === "archived" ||
                effective.status === "trash") && (
                <p className="text-muted-foreground text-xs">
                  {STATUS_NOTES[effective.status]}
                </p>
              )}
            </div>

            {codes.length === 0 ? (
              <div className="text-muted-foreground space-y-2 rounded-lg border py-10 text-center text-sm">
                <p>
                  {effective.status === "trash"
                    ? "The trash is empty."
                    : effective.q
                      ? `No codes match "${effective.q}".`
                      : folder
                        ? "This folder is empty. Drag codes onto it in the sidebar, or use Move to folder."
                        : effective.status === "archived"
                          ? "No archived codes."
                          : isUnfiltered(effective)
                            ? "No active codes. Create one, or restore codes from Archived or the trash."
                            : "No codes match these filters."}
                </p>
                {!isUnfiltered(effective) && effective.status !== "trash" && (
                  <Link className="underline" href={basePath}>
                    Show all codes
                  </Link>
                )}
              </div>
            ) : (
              <CodesList
                codes={codes}
                folders={folders}
                showFolder={!folder && effective.folder !== "none"}
                sparklines={sparklines}
                status={effective.status}
                tags={tags}
              />
            )}

            {pageCount > 1 && (
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">
                  Page {page} of {pageCount} · {formatNumber(total)} codes
                </span>
                <div className="flex gap-2">
                  <Button
                    asChild={page > 1}
                    disabled={page <= 1}
                    size="sm"
                    variant="outline"
                  >
                    {page > 1 ? (
                      <Link href={href({ page: page - 1 })}>Previous</Link>
                    ) : (
                      "Previous"
                    )}
                  </Button>
                  <Button
                    asChild={page < pageCount}
                    disabled={page >= pageCount}
                    size="sm"
                    variant="outline"
                  >
                    {page < pageCount ? (
                      <Link href={href({ page: page + 1 })}>Next</Link>
                    ) : (
                      "Next"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
