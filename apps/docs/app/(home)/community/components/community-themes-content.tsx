/** biome-ignore-all lint/suspicious/noArrayIndexKey: false positive */
"use client";

import { Info, Spinner, Tick } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import { Separator } from "@repo/design-system/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/design-system/components/ui/sheet";
import { Skeleton } from "@repo/design-system/components/ui/skeleton";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowDown2, Brush2, Filter } from "iconsax-reactjs";
import Link from "next/link";
import {
  parseAsArrayOf,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
} from "nuqs";
import { useCallback, useEffect, useRef, useState } from "react";
import { HairlineFigure } from "@/components/mockups/hairline";
import { useCommunityThemes } from "@/lib/hooks/themes/use-community-themes";
import { useQREditorStore } from "@/store/editor-store";
import type {
  CommunityFilterOption,
  CommunityTheme,
  CommunityTimeRange,
} from "@/types/community";
import { CommunitySidebarContent } from "./community-sidebar";
import { CommunityThemeCard } from "./community-theme-card";
import { CommunityThemePreviewDialog } from "./community-theme-preview-dialog";

const GRID = "grid gap-5 sm:grid-cols-2 xl:grid-cols-3";

const popularOptions: {
  timeRange: CommunityTimeRange;
  label: string;
}[] = [
  { timeRange: "all", label: "All Time" },
  { timeRange: "monthly", label: "This Month" },
  { timeRange: "weekly", label: "This Week" },
];

const otherSortOptions: {
  sort: "newest" | "oldest";
  label: string;
}[] = [
  { sort: "newest", label: "Newest" },
  { sort: "oldest", label: "Oldest" },
];

export function CommunityThemesContent() {
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
  const [sheetOpen, setSheetOpen] = useState(false);
  const [previewThemeId, setPreviewThemeId] = useState<string | null>(null);
  const { themeState, setThemeState } = useQREditorStore();

  const handlePreview = useCallback(
    (theme: CommunityTheme) => {
      setThemeState({ ...themeState, styles: theme.styles });
      setPreviewThemeId(theme.id);
    },
    [themeState, setThemeState],
  );

  const handleFilterChange = useCallback(
    (newFilter: CommunityFilterOption) => {
      setFilter(newFilter);
      setSheetOpen(false);
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

  const hasActiveFilters = filter !== "all" || tags.length > 0;

  const sidebarProps = {
    filter,
    selectedTags: tags,
    onFilterChange: handleFilterChange,
    onTagToggle: handleTagToggle,
  };

  return (
    <div className="flex min-h-[60vh] flex-1 px-6">
      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 border-r lg:block">
        <div className="p-3">
          <CommunitySidebarContent {...sidebarProps} />
        </div>
      </aside>

      {/* Main content */}
      <div className="min-w-0 flex-1">
        <div className="space-y-6 p-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {/* Mobile filter button */}
              <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "gap-1.5 lg:hidden",
                      hasActiveFilters && "border-foreground/30",
                    )}
                  >
                    <Filter className="size-3.5" />
                    Filters
                    {hasActiveFilters && (
                      <span className="flex size-4 items-center justify-center rounded-full bg-foreground text-[10px] font-semibold text-background tabular-nums">
                        {(filter !== "all" ? 1 : 0) + tags.length}
                      </span>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-0">
                  <SheetHeader className="border-b px-6 py-4">
                    <SheetTitle>Community Themes</SheetTitle>
                  </SheetHeader>
                  <div className="p-4">
                    <CommunitySidebarContent {...sidebarProps} />
                  </div>
                </SheetContent>
              </Sheet>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    {sort === "popular"
                      ? `Popular / ${popularOptions.find((o) => o.timeRange === timeRange)?.label ?? "All Time"}`
                      : sort === "newest"
                        ? "Newest"
                        : "Oldest"}
                    <ArrowDown2 className="size-3.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  <DropdownMenuLabel>Popular</DropdownMenuLabel>
                  {popularOptions.map((option) => {
                    const isActive =
                      sort === "popular" && timeRange === option.timeRange;
                    return (
                      <DropdownMenuItem
                        key={option.timeRange}
                        onClick={() => {
                          setSort("popular");
                          setTimeRange(option.timeRange);
                        }}
                        className="cursor-pointer justify-between"
                      >
                        {option.label}
                        {isActive && <Tick className="size-3.5" />}
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuSeparator />
                  {otherSortOptions.map((option) => {
                    const isActive = sort === option.sort;
                    return (
                      <DropdownMenuItem
                        key={option.sort}
                        onClick={() => {
                          setSort(option.sort);
                        }}
                        className="cursor-pointer justify-between"
                      >
                        {option.label}
                        {isActive && <Tick className="size-3.5" />}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground gap-1.5 text-xs"
                >
                  <Info className="size-3.5" />
                  <span className="hidden sm:inline">How to publish</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-0">
                <div className="p-4">
                  <p className="text-sm font-medium">Publish your theme</p>
                  <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
                    After saving a theme, click the{" "}
                    <span className="text-foreground font-medium">Publish</span>{" "}
                    button in the editor to share it.
                  </p>
                </div>
                <Separator />
                <div className="p-4">
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    You can also manage all your saved themes from{" "}
                    <Link
                      href="/dashboard/themes"
                      className="text-foreground font-medium underline underline-offset-2"
                    >
                      Themes
                    </Link>
                    .
                  </p>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {isLoading ? (
            <div className={GRID}>
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
              <HairlineFigure className="aspect-square w-40" figure="Stack" />
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
                  <Link href="/playground?tab=customisations">
                    <Brush2 aria-hidden />
                    Open the editor
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className={GRID}>
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
        </div>
      </div>
      <CommunityThemePreviewDialog
        theme={previewTheme}
        themes={themes}
        open={!!previewThemeId}
        onOpenChange={(open) => {
          if (!open) setPreviewThemeId(null);
        }}
        onNavigate={handlePreview}
      />
    </div>
  );
}
