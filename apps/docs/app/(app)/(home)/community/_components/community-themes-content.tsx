/** biome-ignore-all lint/suspicious/noArrayIndexKey: false positive */
"use client";

import { Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import { Skeleton } from "@repo/design-system/components/ui/skeleton";
import { Brush2 } from "iconsax-reactjs";
import Link from "next/link";
import {
  parseAsArrayOf,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
} from "nuqs";
import { useCallback, useEffect, useRef, useState } from "react";
import { BrowseLayout } from "@/components/community/browse-layout";
import {
  GALLERY_GRID,
  HowToPublish,
  SortMenu,
} from "@/components/community/browse-sidebar";
import { HairlineFigure } from "@/components/mockups/hairline";
import { useWorkspaceHref } from "@/components/workspace-provider";
import { useCommunityThemes } from "@/lib/hooks/themes/use-community-themes";
import { playgroundHref } from "@/lib/playground-links";
import type {
  CommunityFilterOption,
  CommunityTheme,
  CommunityTimeRange,
} from "@/types/community";
import { CommunitySidebarContent } from "./community-sidebar";
import { CommunityThemeCard } from "./community-theme-card";
import { CommunityThemePreviewDialog } from "./community-theme-preview-dialog";

const popularOptions: {
  timeRange: CommunityTimeRange;
  label: string;
}[] = [
  { timeRange: "all", label: "All time" },
  { timeRange: "monthly", label: "This month" },
  { timeRange: "weekly", label: "This week" },
];

const otherSortOptions: {
  sort: "newest" | "oldest";
  label: string;
}[] = [
  { sort: "newest", label: "Newest" },
  { sort: "oldest", label: "Oldest" },
];

export function CommunityThemesContent() {
  const inWorkspace = useWorkspaceHref();
  const [sort, setSort] = useQueryState(
    "sort",
    parseAsStringLiteral(["popular", "newest", "oldest"] as const).withDefault(
      "popular",
    ),
  );
  const [filter, setFilter] = useQueryState(
    "filter",
    parseAsStringLiteral(["all", "mine", "liked"] as const).withDefault("all"),
  );
  const [tags, setTags] = useQueryState(
    "tags",
    parseAsArrayOf(parseAsString, ",").withDefault([]),
  );
  const [timeRange, setTimeRange] = useQueryState(
    "t",
    parseAsStringLiteral(["weekly", "monthly", "all"] as const).withDefault(
      "all",
    ),
  );
  const [previewThemeId, setPreviewThemeId] = useState<string | null>(null);

  // A preview draws the theme in the dialog only; the visitor's saved design
  // changes when they choose "Open in Playground".
  const handlePreview = useCallback((theme: CommunityTheme) => {
    setPreviewThemeId(theme.id);
  }, []);

  const handleFilterChange = useCallback(
    (newFilter: CommunityFilterOption) => {
      setFilter(newFilter);
    },
    [setFilter],
  );

  const handleTagToggle = useCallback(
    (tag: string) => {
      setTags((prev) => (prev.includes(tag) ? [] : [tag]));
    },
    [setTags],
  );

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useCommunityThemes(
      sort,
      filter,
      tags,
      sort === "popular" ? timeRange : "all",
    );

  const themes = data?.pages.flatMap((page) => page.themes) ?? [];
  const previewTheme = previewThemeId
    ? (themes.find((t) => t.id === previewThemeId) ?? null)
    : null;

  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const sidebarProps = {
    filter,
    selectedTags: tags,
    onFilterChange: handleFilterChange,
    onTagToggle: handleTagToggle,
  };

  const sortLabel =
    sort === "popular"
      ? `Popular / ${popularOptions.find((o) => o.timeRange === timeRange)?.label ?? "All time"}`
      : sort === "newest"
        ? "Newest"
        : "Oldest";

  return (
    <BrowseLayout
      activeFilters={(filter !== "all" ? 1 : 0) + tags.length}
      aside={
        <HowToPublish
          footer={
            <>
              You can also manage all your saved themes from{" "}
              <Link
                className="text-foreground font-medium underline underline-offset-2"
                href={inWorkspace("/themes")}
              >
                Themes
              </Link>
              .
            </>
          }
          title="Publish your theme"
        >
          After saving a theme, click the{" "}
          <span className="text-foreground font-medium">Publish</span> button in
          the editor to share it.
        </HowToPublish>
      }
      sheetTitle="Community themes"
      sidebar={<CommunitySidebarContent {...sidebarProps} />}
      toolbar={
        <SortMenu
          groups={[
            {
              label: "Popular",
              options: popularOptions.map((option) => ({
                label: option.label,
                active: sort === "popular" && timeRange === option.timeRange,
                onSelect: () => {
                  setSort("popular");
                  setTimeRange(option.timeRange);
                },
              })),
            },
            {
              options: otherSortOptions.map((option) => ({
                label: option.label,
                active: sort === option.sort,
                onSelect: () => {
                  setSort(option.sort);
                },
              })),
            },
          ]}
          label={sortLabel}
        />
      }
    >
      {isLoading ? (
        <div className={GALLERY_GRID}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Card className="gap-0 overflow-hidden py-0 shadow-xs" key={i}>
              <Skeleton className="h-44 rounded-none" />
              <div className="flex items-center gap-2 px-4 py-3">
                <Skeleton className="size-5 rounded-full" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </Card>
          ))}
        </div>
      ) : themes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <HairlineFigure className="aspect-square w-40" figure="Palette" />
          <h3 className="text-lg font-semibold tracking-tight">
            {filter === "mine"
              ? "No published themes"
              : filter === "liked"
                ? "No liked themes"
                : "No themes yet"}
          </h3>
          <p className="max-w-sm text-sm text-pretty text-muted-foreground">
            {filter === "mine"
              ? "Save a theme in the editor, then publish it to share it here."
              : filter === "liked"
                ? "Tap the heart on any community theme to keep it here."
                : "Be the first: save a theme in the editor, then publish it."}
          </p>
          {filter === "liked" ? (
            <Button
              className="mt-2"
              onClick={() => handleFilterChange("all")}
              variant="outline"
            >
              Browse all themes
            </Button>
          ) : (
            <Button asChild className="mt-2" variant="outline">
              <Link href={playgroundHref({ tab: "design" })}>
                <Brush2 aria-hidden />
                Open the editor
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className={GALLERY_GRID}>
            {themes.map((theme) => (
              <CommunityThemeCard
                key={theme.id}
                theme={theme}
                onPreview={handlePreview}
              />
            ))}
          </div>

          <div ref={sentinelRef} className="flex justify-center pt-4">
            {isFetchingNextPage && (
              <Spinner className="size-6 text-muted-foreground" />
            )}
          </div>
        </>
      )}
      <CommunityThemePreviewDialog
        theme={previewTheme}
        themes={themes}
        open={!!previewThemeId}
        onOpenChange={(open) => {
          if (!open) setPreviewThemeId(null);
        }}
        onNavigate={handlePreview}
      />
    </BrowseLayout>
  );
}
