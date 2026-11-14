/** biome-ignore-all lint/suspicious/noArrayIndexKey: skeleton tiles have no ids */
"use client";

import { track } from "@repo/analytics";
import { authClient } from "@repo/auth/client";
import { toast } from "@repo/design-system";
import { Tick } from "@repo/design-system/components/icons";
import { ModuleOrbit } from "@repo/design-system/components/loaders";
import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { Input } from "@repo/design-system/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@repo/design-system/components/ui/sheet";
import { Skeleton } from "@repo/design-system/components/ui/skeleton";
import { useIsMobile } from "@repo/design-system/hooks/use-mobile";
import { cn } from "@repo/design-system/lib/utils";
import {
  type InfiniteData,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowDown2,
  Heart,
  People,
  SearchNormal1,
  Verify,
} from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type CommunityResult, toggleCommunityLike } from "@/actions/community";
import { getCommunityThemes } from "@/actions/community-themes";
import { DesignQr } from "@/components/community/design-qr";
import { PublishThemeDialog } from "@/components/community/publish-theme-dialog";
import { QRSaveDialog } from "@/components/editor/qr-save-dialog";
import { defaultThemeState } from "@/config/qr";
import {
  communityKeys,
  useCommunityTagCounts,
} from "@/lib/hooks/themes/use-community-themes";
import { useCreateTheme } from "@/lib/hooks/themes/use-theme-mutations";
import { useThemesData } from "@/lib/hooks/themes/use-themes-data";
import { usePostLoginAction } from "@/lib/hooks/use-post-login-action";
import { soundEvent } from "@/lib/sound/emit";
import { isDeepEqual } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import { useQREditorStore } from "@/store/editor-store";
import {
  type StoredPreset,
  useThemePresetStore,
} from "@/store/theme-preset-store";
import type {
  CommunitySortOption,
  CommunityTheme,
  CommunityThemesResponse,
} from "@/types/community";
import type { ThemeEditorState } from "@/types/editor";
import type { ThemeStyles } from "@/types/theme";
import { useCommunitySheetStore } from "./community-sheet-store";

// The community sheet: community themes over the preview, so you never leave
// the editor. Mounted once by components/editor.tsx; it reads
// useCommunitySheetStore (theme picker, More menu, ?open=community).
//
// Data: the gallery's own server actions. getCommunityThemes and
// getCommunityTagCounts read the community_item model (themeItemsFeed in
// lib/community/queries.ts) once the backfill has run, as /community/themes
// does; actions/community.ts has no listing. Likes go through the v1
// reaction (toggleCommunityLike), so only item themes (with a slug) can be
// liked.

// ─── Logic (exported for tests) ─────────────────────────────────────────────

/** A community theme's look on the editor's defaults, as "Use in editor" does. */
export const lookStyles = (styles: ThemeStyles): ThemeStyles => ({
  ...defaultThemeState.styles,
  ...styles,
});

/**
 * The editor state with a community theme's look. Like a built-in preset it
 * replaces the whole look, logo included (the theme's quick icon, or none);
 * content isn't part of the look and stays. The preset id goes, since the
 * look no longer comes from it.
 */
export function communityLook(
  state: ThemeEditorState,
  styles: ThemeStyles,
): ThemeEditorState {
  const { preset: _preset, presetStyles: _presetStyles, ...rest } = state;
  return { ...rest, styles: lookStyles(styles) };
}

/**
 * Applies a theme's look as one undo step. The returned `undo` takes it back
 * only while the look is still the one applied here (the toast's Undo).
 */
export function applyCommunityTheme(styles: ThemeStyles): {
  changed: boolean;
  undo: () => void;
} {
  const editor = useQREditorStore.getState();
  const next = communityLook(editor.themeState, styles);
  if (isDeepEqual(next.styles, editor.themeState.styles)) {
    return { changed: false, undo: () => {} };
  }
  editor.replaceThemeState(next);
  const applied = useQREditorStore.getState().themeState;
  return {
    changed: true,
    undo: () => {
      const current = useQREditorStore.getState();
      if (current.themeState === applied) current.undo();
    },
  };
}

/** Lowercase words of a search. */
export const searchTokens = (query: string): string[] =>
  query.trim().toLowerCase().split(/\s+/).filter(Boolean);

/** Every word appears in the name, creator, handle or tags. */
export function matchesSearch(
  theme: Pick<CommunityTheme, "name" | "author" | "handle" | "tags">,
  tokens: string[],
): boolean {
  if (tokens.length === 0) return true;
  const text = [
    theme.name,
    theme.author.name,
    theme.handle ?? "",
    ...theme.tags,
  ]
    .join(" ")
    .toLowerCase();
  return tokens.every((token) => text.includes(token));
}

/** The loaded pages' themes, each once (popular pages can overlap as likes move). */
export function uniqueThemes(
  pages: CommunityThemesResponse[] | undefined,
): CommunityTheme[] {
  const seen = new Set<string>();
  const themes: CommunityTheme[] = [];
  for (const page of pages ?? []) {
    for (const theme of page.themes) {
      if (seen.has(theme.id)) continue;
      seen.add(theme.id);
      themes.push(theme);
    }
  }
  return themes;
}

/** Only community items can be liked (v1 likes); legacy gallery rows can't. */
export const isLikeable = (theme: Pick<CommunityTheme, "slug">) =>
  Boolean(theme.slug);

/** The cached pages with one theme's like state set. */
export function withLike(
  data: InfiniteData<CommunityThemesResponse> | undefined,
  id: string,
  liked: boolean,
  likeCount: number,
): InfiniteData<CommunityThemesResponse> | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      themes: page.themes.map((theme) =>
        theme.id === id ? { ...theme, isLikedByMe: liked, likeCount } : theme,
      ),
    })),
  };
}

type LikeResult = CommunityResult<{ liked: boolean; likeCount: number }>;

/**
 * Likes or unlikes a theme: shows the change at once, then the server's
 * count; puts it back when the server refuses. A lapsed session goes
 * through sign-in.
 */
export async function runLike(
  theme: Pick<CommunityTheme, "id" | "isLikedByMe" | "likeCount">,
  deps: {
    toggle: (id: string) => Promise<LikeResult>;
    show: (id: string, liked: boolean, likeCount: number) => void;
    signIn: () => void;
    fail: (message: string) => void;
  },
): Promise<void> {
  const liked = !theme.isLikedByMe;
  deps.show(theme.id, liked, Math.max(0, theme.likeCount + (liked ? 1 : -1)));
  let result: LikeResult;
  try {
    result = await deps.toggle(theme.id);
  } catch {
    result = {
      ok: false,
      code: "UNKNOWN",
      message: "Couldn't update the like. Try again.",
    };
  }
  if (result.ok) {
    deps.show(theme.id, result.data.liked, result.data.likeCount);
    return;
  }
  deps.show(theme.id, theme.isLikedByMe, theme.likeCount);
  if (result.code === "UNAUTHORIZED") deps.signIn();
  else deps.fail(result.message);
}

/**
 * The like a signed-out click asked for, after signing in. Likes toggle, so
 * when the account had liked it already (the toggle just took it back) it
 * toggles once more: the theme ends up liked either way.
 */
export async function ensureLiked(
  id: string,
  toggle: (id: string) => Promise<LikeResult>,
): Promise<LikeResult> {
  const first = await toggle(id);
  if (!first.ok || first.data.liked) return first;
  return toggle(id);
}

/** Data of the LIKE_THEME post-login action (shared with /community). */
export interface LikeThemeIntent {
  communityThemeId: string;
  name?: string;
}

export interface PublishTarget {
  themeId: string;
  name: string;
  style: ThemeStyles;
}

export type PublishStep =
  | { kind: "sign-in" }
  | { kind: "publish"; target: PublishTarget }
  | { kind: "published"; name: string }
  | { kind: "save-first" };

/**
 * What "Publish this style" does now. Publishing shares a saved theme
 * (PublishThemeDialog takes its id): an unchanged saved theme opens the
 * dialog, anything else is saved first.
 */
export function publishStep(input: {
  signedIn: boolean;
  presetId: string | undefined;
  preset: Pick<StoredPreset, "source" | "label" | "styles"> | undefined;
  unsaved: boolean;
  saved:
    | { name: string; style: ThemeStyles; isPublished?: boolean }
    | undefined;
}): PublishStep {
  if (!input.signedIn) return { kind: "sign-in" };
  const { presetId, preset, saved } = input;
  if (!presetId || preset?.source !== "SAVED" || input.unsaved) {
    return { kind: "save-first" };
  }
  const name = saved?.name ?? preset.label ?? "This theme";
  if (saved?.isPublished) return { kind: "published", name };
  return {
    kind: "publish",
    target: { themeId: presetId, name, style: saved?.style ?? preset.styles },
  };
}

// ─── The sheet ──────────────────────────────────────────────────────────────

const COUNT = new Intl.NumberFormat("en", { notation: "compact" });
/** While searching, the sheet loads up to this many pages (20 themes each). */
const SEARCH_PAGE_LIMIT = 10;
// Names in messages/en.json: editor.communitySheet.sorts.
const SORTS = [
  { value: "popular" },
  { value: "newest" },
] as const satisfies readonly { value: CommunitySortOption }[];
const sheetKey = [...communityKeys.all, "sheet"] as const;

export function CommunitySheet() {
  const t = useTranslations("editor.communitySheet");
  const open = useCommunitySheetStore((state) => state.open);
  const setOpen = useCommunitySheetStore((state) => state.setOpen);
  const publishRequested = useCommunitySheetStore(
    (state) => state.publishRequested,
  );
  const clearPublishRequest = useCommunitySheetStore(
    (state) => state.clearPublishRequest,
  );
  const isMobile = useIsMobile();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const signedIn = Boolean(session?.user);
  const openAuthDialog = useAuthStore((state) => state.openAuthDialog);
  const queryClient = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);
  const publish = usePublishFlow(signedIn);

  // The More menu's "Publish to community…": once the session is known.
  const startPublish = publish.start;
  useEffect(() => {
    if (!publishRequested || sessionPending) return;
    clearPublishRequest();
    startPublish();
  }, [publishRequested, sessionPending, clearPublishRequest, startPublish]);

  // Back from signing in: carry on where the click left off.
  usePostLoginAction("SAVE_THEME_FOR_PUBLISH", () => {
    setOpen(true);
    startPublish(true);
  });
  usePostLoginAction("LIKE_THEME", async (data?: LikeThemeIntent) => {
    if (!data?.communityThemeId) return;
    setOpen(true);
    const result = await ensureLiked(data.communityThemeId, (id) =>
      toggleCommunityLike(id),
    );
    if (result.ok) {
      toast.success(
        data.name ? t("likedName", { name: data.name }) : t("liked"),
      );
    } else {
      toast.error(result.message);
    }
    queryClient.invalidateQueries({ queryKey: sheetKey });
  });

  return (
    <>
      <Sheet modal={false} onOpenChange={setOpen} open={open}>
        <SheetContent
          className={cn(
            "gap-0 p-0",
            isMobile
              ? // Leaves the preview (the top third on phones) in view.
                "h-[56svh] rounded-t-2xl"
              : "w-full sm:max-w-[25rem] md:shadow-xl",
          )}
          // Docked: editing the design or pressing a toast's Undo leaves it
          // open; the close button and Escape close it.
          onInteractOutside={(event) => event.preventDefault()}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            // A touch keyboard would cover the list: focus the panel there.
            if (window.matchMedia("(pointer: fine)").matches) {
              searchRef.current?.focus({ preventScroll: true });
            } else {
              (event.currentTarget as HTMLElement | null)?.focus({
                preventScroll: true,
              });
            }
          }}
          side={isMobile ? "bottom" : "right"}
          tabIndex={-1}
        >
          <CommunitySheetBody
            onPublish={() => startPublish()}
            onSignInToLike={(theme) =>
              openAuthDialog("signin", "LIKE_THEME", {
                communityThemeId: theme.id,
                name: theme.name,
              } satisfies LikeThemeIntent)
            }
            published={publish.published}
            searchRef={searchRef}
            signedIn={signedIn}
          />
        </SheetContent>
      </Sheet>
      {publish.dialogs}
    </>
  );
}

/** "Publish this style": sign in, save if needed, then the publish dialog. */
function usePublishFlow(signedIn: boolean) {
  const t = useTranslations("editor.communitySheet");
  const themeState = useQREditorStore((state) => state.themeState);
  const applyThemePreset = useQREditorStore((state) => state.applyThemePreset);
  const presets = useThemePresetStore((state) => state.presets);
  const { data: savedThemes } = useThemesData();
  const createTheme = useCreateTheme();
  const openAuthDialog = useAuthStore((state) => state.openAuthDialog);
  const [saveOpen, setSaveOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [target, setTarget] = useState<PublishTarget | null>(null);

  const stepFor = useCallback(
    (asSignedIn: boolean) => {
      const editor = useQREditorStore.getState();
      const presetId = editor.themeState.preset;
      return publishStep({
        signedIn: asSignedIn,
        presetId,
        preset: presetId
          ? useThemePresetStore.getState().getPreset(presetId)
          : undefined,
        unsaved: editor.hasUnsavedChanges(),
        saved: presetId
          ? savedThemes?.find((theme) => theme.id === presetId)
          : undefined,
      });
    },
    [savedThemes],
  );

  const start = useCallback(
    (asSignedIn = signedIn) => {
      const step = stepFor(asSignedIn);
      if (step.kind === "sign-in") {
        openAuthDialog("signin", "SAVE_THEME_FOR_PUBLISH");
      } else if (step.kind === "published") {
        toast(`"${step.name}" is already in the community.`);
      } else if (step.kind === "publish") {
        setTarget(step.target);
        setPublishOpen(true);
      } else {
        setSaveOpen(true);
      }
    },
    [signedIn, stepFor, openAuthDialog],
  );

  // For the header button: re-read as the look and saved themes change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: themeState and presets change what stepFor reads
  const published = useMemo(
    () => stepFor(signedIn).kind === "published",
    [stepFor, signedIn, themeState, presets],
  );

  const saveThenPublish = async (name: string) => {
    const styles = useQREditorStore.getState().themeState.styles;
    try {
      const theme = await createTheme.mutateAsync({ name, style: styles });
      track("theme_saved");
      applyThemePreset(theme.id);
      soundEvent("success");
      setSaveOpen(false);
      setTarget({ themeId: theme.id, name: theme.name, style: theme.style });
      setPublishOpen(true);
    } catch {
      // useCreateTheme has shown why (limit reached, signed out, …).
    }
  };

  const dialogs = (
    <>
      <QRSaveDialog
        ctaLabel={t("saveAndContinue")}
        description={t("publishingSharesASavedTheme")}
        isSaving={createTheme.isPending}
        onOpenChange={setSaveOpen}
        onSave={saveThenPublish}
        open={saveOpen}
        title={t("saveToPublish")}
      />
      {target && (
        <PublishThemeDialog
          onOpenChange={setPublishOpen}
          open={publishOpen}
          themeId={target.themeId}
          themeName={target.name}
          themeStyle={target.style}
        />
      )}
    </>
  );

  return { start, published, dialogs };
}

function CommunitySheetBody({
  signedIn,
  published,
  onPublish,
  onSignInToLike,
  searchRef,
}: {
  signedIn: boolean;
  published: boolean;
  onPublish: () => void;
  onSignInToLike: (theme: CommunityTheme) => void;
  searchRef: RefObject<HTMLInputElement | null>;
}) {
  const t = useTranslations("editor.communitySheet");
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id ?? null;
  const [sort, setSort] = useState<CommunitySortOption>("popular");
  const [tag, setTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const currentStyles = useQREditorStore((state) => state.themeState.styles);
  const { data: tagCounts = [] } = useCommunityTagCounts();
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const list = useInfiniteQuery({
    // The viewer is part of the key: isLikedByMe is theirs.
    queryKey: [...sheetKey, { sort, tag, userId }],
    queryFn: ({ pageParam }) =>
      getCommunityThemes(sort, pageParam, undefined, "all", tag ? [tag] : []),
    initialPageParam: undefined as string | number | undefined,
    getNextPageParam: (last: CommunityThemesResponse) =>
      last.nextCursor ?? undefined,
    staleTime: 60_000,
  });
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;

  const tokens = useMemo(() => searchTokens(query), [query]);
  const searching = tokens.length > 0;
  const themes = useMemo(() => uniqueThemes(list.data?.pages), [list.data]);
  const shown = useMemo(
    () => themes.filter((theme) => matchesSearch(theme, tokens)),
    [themes, tokens],
  );
  const pageCount = list.data?.pages.length ?? 0;
  const searchCapped =
    searching && hasNextPage && pageCount >= SEARCH_PAGE_LIMIT;

  // Search runs over loaded themes (the gallery has no text search), so it
  // loads further pages, up to SEARCH_PAGE_LIMIT, while there is a query.
  useEffect(() => {
    if (!searching || !hasNextPage || isFetchingNextPage) return;
    if (pageCount >= SEARCH_PAGE_LIMIT) return;
    fetchNextPage();
  }, [searching, hasNextPage, isFetchingNextPage, pageCount, fetchNextPage]);

  // Otherwise the next page loads as the list scrolls near its end. The
  // sentinel is rendered again after a sort or tag change (isPending).
  // biome-ignore lint/correctness/useExhaustiveDependencies: isPending re-attaches to the new sentinel
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || searching) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { root: scrollRef.current, rootMargin: "240px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    searching,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    list.isPending,
  ]);

  const apply = (theme: CommunityTheme) => {
    const { changed, undo } = applyCommunityTheme(theme.styles);
    if (!changed) return;
    soundEvent("apply");
    // One toast, replaced as you try themes: only the latest can be undone.
    toast(`Applied "${theme.name}"`, {
      id: "community-theme-applied",
      action: { label: t("undo"), onClick: undo },
    });
  };

  const like = async (theme: CommunityTheme) => {
    if (!signedIn) {
      onSignInToLike(theme);
      return;
    }
    setBusyId(theme.id);
    await runLike(theme, {
      toggle: (id) => toggleCommunityLike(id),
      show: (id, liked, likeCount) =>
        queryClient.setQueriesData<InfiniteData<CommunityThemesResponse>>(
          { queryKey: sheetKey },
          (data) => withLike(data, id, liked, likeCount),
        ),
      signIn: () => onSignInToLike(theme),
      fail: (message) => toast.error(message),
    });
    setBusyId(null);
  };

  return (
    <>
      <div className="flex shrink-0 flex-col gap-2.5 border-b px-4 pt-3 pb-3">
        <div className="flex items-center justify-between gap-2 pr-8">
          <SheetTitle className="truncate text-base leading-7">
            {t("communityThemes")}
          </SheetTitle>
          <Button
            className="h-7 shrink-0 gap-1.5 px-2.5 text-xs"
            disabled={published}
            onClick={onPublish}
            size="sm"
            type="button"
            variant="outline"
          >
            {published ? (
              <Tick aria-hidden className="size-3.5" />
            ) : (
              <People aria-hidden className="size-3.5" />
            )}
            {published ? t("published") : t("publishThisStyle")}
          </Button>
        </div>
        <SheetDescription className="-mt-2 text-xs">
          {t("freeToUseUnderCc0")}
        </SheetDescription>

        <div className="relative">
          <SearchNormal1
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            aria-label={t("searchCommunityThemes")}
            className="pl-9"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchThemes")}
            ref={searchRef}
            type="search"
            value={query}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <fieldset className="bg-muted/60 m-0 flex min-w-0 rounded-full border-0 p-0.5">
            <legend className="sr-only">{t("sort")}</legend>
            {SORTS.map((option) => (
              <button
                aria-pressed={sort === option.value}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  sort === option.value
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
                key={option.value}
                onClick={() => setSort(option.value)}
                type="button"
              >
                {t(`sorts.${option.value}`)}
              </button>
            ))}
          </fieldset>
          {tagCounts.length > 0 && (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  className={cn(
                    "h-7 gap-1 px-2.5 text-xs",
                    tag && "font-medium",
                  )}
                  size="sm"
                  type="button"
                  variant={tag ? "secondary" : "ghost"}
                >
                  {tag ?? t("tags")}
                  <ArrowDown2 aria-hidden className="size-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="max-h-72 w-48 overflow-y-auto"
              >
                <DropdownMenuItem
                  className="justify-between"
                  onSelect={() => setTag(null)}
                >
                  {t("allTags")}
                  {tag === null && <Tick className="size-3.5" />}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {tagCounts.map((entry) => (
                  <DropdownMenuItem
                    className="justify-between"
                    key={entry.tag}
                    onSelect={() => setTag(entry.tag)}
                  >
                    <span className="truncate">{entry.tag}</span>
                    {tag === entry.tag ? (
                      <Tick className="size-3.5" />
                    ) : (
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {entry.count}
                      </span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3"
        ref={scrollRef}
      >
        {list.isPending ? (
          <ul
            aria-label={t("loadingThemes")}
            className="grid grid-cols-3 gap-1"
          >
            {Array.from({ length: 9 }).map((_, index) => (
              <li className="space-y-1.5 p-1.5" key={index}>
                <Skeleton className="aspect-square rounded-lg" />
                <Skeleton className="h-3 w-2/3" />
              </li>
            ))}
          </ul>
        ) : list.isError ? (
          <EmptyState
            action={
              <Button
                onClick={() => list.refetch()}
                size="sm"
                type="button"
                variant="outline"
              >
                {t("tryAgain")}
              </Button>
            }
            title={t("couldntLoadCommunityThemes")}
          />
        ) : shown.length === 0 ? (
          isFetchingNextPage ? (
            <div className="flex justify-center py-10">
              <ModuleOrbit
                aria-hidden
                className="text-muted-foreground size-5"
              />
            </div>
          ) : (
            <EmptyState
              action={
                searching ? (
                  <Button
                    onClick={() => setQuery("")}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {t("clearSearch")}
                  </Button>
                ) : tag ? (
                  <Button
                    onClick={() => setTag(null)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {t("showAllTags")}
                  </Button>
                ) : null
              }
              title={
                searching
                  ? t("noThemesMatchQuery", { query: query.trim() })
                  : tag
                    ? t("noThemesTaggedTagYet", { tag })
                    : t("noCommunityThemesYet")
              }
            />
          )
        ) : (
          <>
            <ul className="grid grid-cols-3 gap-1">
              {shown.map((theme) => (
                <ThemeCard
                  busy={busyId === theme.id}
                  current={isDeepEqual(currentStyles, lookStyles(theme.styles))}
                  key={theme.id}
                  onApply={() => apply(theme)}
                  onLike={() => like(theme)}
                  rootRef={scrollRef}
                  theme={theme}
                />
              ))}
            </ul>
            <div className="flex min-h-8 justify-center pt-2" ref={sentinelRef}>
              {isFetchingNextPage && (
                <ModuleOrbit
                  aria-hidden
                  className="text-muted-foreground size-5"
                />
              )}
            </div>
            {searchCapped && (
              <p className="text-muted-foreground pb-2 text-center text-xs">
                {t("searchCoversTheFirstLength", { length: themes.length })}
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}

function EmptyState({ title, action }: { title: string; action: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
      <p className="text-sm font-medium text-pretty">{title}</p>
      {action}
    </div>
  );
}

function ThemeCard({
  theme,
  current,
  busy,
  onApply,
  onLike,
  rootRef,
}: {
  theme: CommunityTheme;
  current: boolean;
  busy: boolean;
  onApply: () => void;
  onLike: () => void;
  rootRef: RefObject<HTMLDivElement | null>;
}) {
  const t = useTranslations("editor.communitySheet");
  const liked = theme.isLikedByMe;
  return (
    <li className="min-w-0">
      <button
        aria-label={t("applyName", { name: theme.name })}
        aria-pressed={current}
        className={cn(
          "group flex w-full min-w-0 flex-col gap-1.5 rounded-xl p-1.5 text-left transition-colors outline-none",
          "hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:ring-ring/40 focus-visible:ring-[3px]",
          current && "bg-accent/60",
        )}
        onClick={onApply}
        type="button"
      >
        <span
          className={cn(
            "relative block aspect-square overflow-hidden rounded-lg bg-white p-1.5 ring-1 ring-black/5 transition-transform group-active:scale-[0.97] dark:ring-white/10",
            current && "ring-foreground/60 ring-2",
          )}
        >
          <LazyDesign rootRef={rootRef} style={theme.styles} />
          {current && (
            <span className="bg-foreground text-background absolute top-1 right-1 grid size-4 place-items-center rounded-full shadow-sm">
              <Tick className="size-2.5" />
            </span>
          )}
        </span>
        <span className="block truncate text-xs leading-4 font-medium">
          {theme.name}
        </span>
      </button>
      <div className="flex min-w-0 items-center justify-between gap-1 px-1.5 pb-1">
        <span className="text-muted-foreground flex min-w-0 items-center gap-1 text-[11px] leading-4">
          {theme.official && (
            <Verify
              aria-label={t("official")}
              className="size-3 shrink-0"
              variant="Bold"
            />
          )}
          <span className="truncate">{theme.author.name}</span>
        </span>
        {isLikeable(theme) ? (
          <button
            aria-label={
              liked
                ? t("unlikeName", { name: theme.name })
                : t("likeName", { name: theme.name })
            }
            aria-pressed={liked}
            className={cn(
              "-mr-1 flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] tabular-nums transition-colors",
              liked
                ? "text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
            disabled={busy}
            onClick={onLike}
            type="button"
          >
            <Heart className="size-3.5" variant={liked ? "Bold" : "Linear"} />
            {theme.likeCount > 0 && COUNT.format(theme.likeCount)}
          </button>
        ) : (
          theme.likeCount > 0 && (
            <span className="text-muted-foreground flex shrink-0 items-center gap-0.5 text-[11px] tabular-nums">
              <Heart aria-label={t("likes")} className="size-3" />
              {COUNT.format(theme.likeCount)}
            </span>
          )
        )}
      </div>
    </li>
  );
}

/** Draws the design once its tile scrolls near the sheet's viewport. */
function LazyDesign({
  style,
  rootRef,
}: {
  style: ThemeStyles;
  rootRef: RefObject<HTMLDivElement | null>;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || visible) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { root: rootRef.current, rootMargin: "240px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible, rootRef]);

  return (
    <span className="block size-full" ref={ref}>
      {visible && <DesignQr className="size-full" style={style} />}
    </span>
  );
}
