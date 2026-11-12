import { Button } from "@repo/design-system/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import { DocumentUpload as FileUp } from "iconsax-reactjs";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { getUserSettings } from "@/actions/user-settings";
import { codeOptionPlansFor } from "@/app/(app)/dashboard/codes/_lib/code-option-plans";
import {
  DISPLAY_COOKIES,
  parseDisplay,
} from "@/app/(app)/dashboard/codes/_lib/display";
import {
  countTrash,
  listFolders,
  listTags,
} from "@/app/(app)/dashboard/codes/_lib/organize";
import {
  type CodesFilters,
  codesHref,
  isUnfiltered,
  parseCodesFilters,
} from "@/app/(app)/dashboard/codes/_lib/organize-shared";
import {
  getCodeUsage,
  listCodes,
  requireDashboardScope,
} from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { getDomainOptions } from "@/app/(app)/dashboard/domains/_lib/domains";
import { HairlineFigure } from "@/components/mockups/hairline";
import { getAppTranslations } from "@/lib/i18n/app-locale";
import { can } from "@/lib/permissions";
import { playgroundHref } from "@/lib/playground-links";
import { getScanSparklines } from "@/lib/scans";
import { CodeOptionPlansProvider } from "./code-options";
import { CodesHeader } from "./codes-header";
import { CodesList } from "./codes-list";
import { CodesToolbar } from "./codes-toolbar";
import { formatNumber } from "./format";
import { ListDisplayProvider } from "./list-display";
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
 * The codes list: a folder switcher as the
 * title, a Filter and Display toolbar with live search, then cards or rows,
 * and bulk actions. No second sidebar: the area sidebar has the rest.
 * Rendered by /dashboard/<workspace>/codes (`basePath` is where its links
 * point).
 */
export async function CodesView({
  basePath,
  searchParams,
}: {
  basePath: string;
  searchParams: Promise<SearchParams>;
}) {
  const t = await getAppTranslations("app.dashboard.codes.codesView");
  const scope = await requireDashboardScope();
  const filters = parseCodesFilters(await searchParams);

  const [usage, folders, tags, trashCount, settings] = await Promise.all([
    getCodeUsage(scope),
    listFolders(scope),
    listTags(scope),
    countTrash(scope),
    // Row keys follow the shortcuts switch; unread, they stay on (the default).
    getUserSettings().catch(() => null),
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

  const [domainOptions, cookieStore] = await Promise.all([
    getDomainOptions(scope).catch(() => null),
    cookies(),
  ]);
  const display = parseDisplay(cookieStore.get(DISPLAY_COOKIES.codes)?.value);
  const domains = {
    defaultHost: domainOptions?.defaultHost ?? "",
    domains: domainOptions?.domains ?? [],
  };
  // The full empty state only when there's nothing to organise either:
  // leftover folders, tags or trash keep the toolbar to manage them.
  const brandNew =
    isEmpty && folders.length === 0 && tags.length === 0 && trashCount === 0;
  // Viewers and billing members see the list without create or import
  // buttons (lib/permissions.ts; the server refuses them too).
  const canWrite = can(scope.role, "content.write");

  return (
    // The create and edit dialogs read the option plans from here.
    <CodeOptionPlansProvider plans={codeOptionPlansFor(usage.plan)}>
      <ListDisplayProvider initial={display} list="codes">
        <div className="space-y-5">
          <CodesHeader
            basePath={basePath}
            filters={effective}
            folders={folders}
            total={total}
            usage={usage}
          />
          <UsageMeter usage={usage} />

          {brandNew ? (
            <Empty className="border">
              <EmptyHeader>
                <HairlineFigure
                  className="mx-auto mb-2 h-28 w-40"
                  figure="CodeCard"
                />
                <EmptyTitle>{t("noDynamicQrCodesYet")}</EmptyTitle>
                <EmptyDescription>
                  {canWrite
                    ? t("aDynamicCodeEncodesA")
                    : t("whenSomeoneInThisWorkspace")}
                </EmptyDescription>
              </EmptyHeader>
              {canWrite && (
                <EmptyContent>
                  <div className="flex flex-wrap justify-center gap-2">
                    <NewCodeButton usage={usage}>
                      {t("createYourFirstDynamicQr")}
                    </NewCodeButton>
                    <Button asChild variant="outline">
                      <Link href={`${basePath}/import`}>
                        <FileUp />
                        {t("importFromCsv")}
                      </Link>
                    </Button>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {t.rich("orPickDynamicForA", {
                      link: (chunks) => (
                        <Link
                          className="underline"
                          href={playgroundHref({ type: "url" })}
                        >
                          {chunks}
                        </Link>
                      ),
                    })}
                  </p>
                </EmptyContent>
              )}
            </Empty>
          ) : (
            <div className="space-y-4">
              <CodesToolbar
                basePath={basePath}
                domains={domains}
                filters={effective}
                tags={tags}
                trashCount={trashCount}
              />
              {(effective.status === "archived" ||
                effective.status === "trash") && (
                <p className="text-muted-foreground text-xs">
                  {STATUS_NOTES[effective.status]}
                </p>
              )}

              {codes.length === 0 ? (
                <div className="text-muted-foreground space-y-2 rounded-xl border py-10 text-center text-sm">
                  <p>
                    {effective.status === "trash"
                      ? t("theTrashIsEmpty")
                      : effective.q
                        ? t("noCodesMatchQ", { q: effective.q })
                        : folder
                          ? t("thisFolderIsEmptyUse")
                          : effective.status === "archived"
                            ? t("noArchivedCodes")
                            : isUnfiltered(effective)
                              ? canWrite
                                ? t("noActiveCodesCreateOne")
                                : t("noActiveCodes")
                              : t("noCodesMatchTheseFilters")}
                  </p>
                  {!isUnfiltered(effective) && (
                    <Link className="underline" href={basePath}>
                      {t("showAllCodes")}
                    </Link>
                  )}
                </div>
              ) : (
                <CodesList
                  codes={codes}
                  folders={folders}
                  keyboardShortcuts={settings?.keyboardShortcuts ?? true}
                  showFolder={!folder && effective.folder !== "none"}
                  sparklines={sparklines}
                  status={effective.status}
                  tags={tags}
                />
              )}

              {pageCount > 1 && (
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">
                    {t("pagePageOfPagecountTotal", {
                      page,
                      pageCount,
                      total: formatNumber(total),
                    })}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      asChild={page > 1}
                      disabled={page <= 1}
                      size="sm"
                      variant="outline"
                    >
                      {page > 1 ? (
                        <Link href={href({ page: page - 1 })}>
                          {t("previous")}
                        </Link>
                      ) : (
                        t("previous")
                      )}
                    </Button>
                    <Button
                      asChild={page < pageCount}
                      disabled={page >= pageCount}
                      size="sm"
                      variant="outline"
                    >
                      {page < pageCount ? (
                        <Link href={href({ page: page + 1 })}>{t("next")}</Link>
                      ) : (
                        t("next")
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </ListDisplayProvider>
    </CodeOptionPlansProvider>
  );
}
