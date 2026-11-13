"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/ui/alert";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Skeleton } from "@repo/design-system/components/ui/skeleton";
import {
  Chart,
  Copy,
  Edit2,
  ExportSquare,
  InfoCircle,
  Refresh2,
  Trash,
} from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";
import { LoadMore } from "@/components/load-more";
import { apiFetch } from "@/lib/api-fetch";
import { useCursorList } from "@/lib/hooks/use-cursor-list";
import type { Translator } from "@/lib/i18n/translator";
import type { CursorPage } from "@/lib/keyset-cursor";
import { soundEvent } from "@/lib/sound/emit";
import { fetchLinksPage, LINKS_PAGE_SIZE, type ShortLink } from "./link-pages";

type DubLink = ShortLink;

type AnalyticsGroupBy =
  | "timeseries"
  | "countries"
  | "devices"
  | "browsers"
  | "os";
type AnalyticsResult = number | Array<Record<string, string | number | null>>;

const ANALYTICS_GROUPS: AnalyticsGroupBy[] = [
  "timeseries",
  "countries",
  "devices",
  "browsers",
  "os",
];

/** Wait this long after the last keystroke before searching. */
const SEARCH_DELAY_MS = 300;
const NO_LINKS: CursorPage<DubLink> = { items: [], nextCursor: null };

function getShortUrl(link: DubLink) {
  return `https://${link.domain}/${link.key}`;
}

function getAnalyticsLabel(
  item: Record<string, string | number | null>,
  t: Translator<"app.settings.integrations.dubManagement">,
) {
  return String(
    item.start ||
      item.country ||
      item.device ||
      item.browser ||
      item.os ||
      item.name ||
      t("unknown"),
  );
}

function getAnalyticsValue(item: Record<string, string | number | null>) {
  return Number(item.clicks || item.count || item.events || 0);
}

function getWorkspaceName(metadata?: Record<string, unknown>) {
  const workspace = metadata?.workspace;
  if (!workspace || typeof workspace !== "object" || !("name" in workspace)) {
    return null;
  }

  return String(workspace.name);
}

interface DubManagementProps {
  metadata?: Record<string, unknown>;
}

export function DubManagement({ metadata }: DubManagementProps) {
  const t = useTranslations("app.settings.integrations.dubManagement");
  const workspaceName = getWorkspaceName(metadata);
  const [search, setSearch] = React.useState("");
  /** The search the list shows: `search` once typing pauses */
  const [query, setQuery] = React.useState("");
  const [selectedLink, setSelectedLink] = React.useState<DubLink | null>(null);
  const [analytics, setAnalytics] = React.useState<AnalyticsResult | null>(
    null,
  );
  const [groupBy, setGroupBy] = React.useState<AnalyticsGroupBy>("timeseries");
  const [isLoading, setIsLoading] = React.useState(true);
  const [isAnalyticsLoading, setIsAnalyticsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [editingLinkId, setEditingLinkId] = React.useState<string | null>(null);
  const [editUrl, setEditUrl] = React.useState("");

  // The first page comes from fetchLinks; later ones load as the list
  // nears the bottom.
  const list = useCursorList({
    first: NO_LINKS,
    keyOf: (link) => link.id,
    errorMessage: t("couldntLoadMoreLinks"),
    load: (cursor) =>
      fetchLinksPage(query, Number(cursor), t("couldntLoadMoreLinks")),
  });
  const links = list.items;
  /** The latest first-page request: answers to older ones are dropped. */
  const latestFetch = React.useRef(0);
  // A string, so fetchLinks (and the effect that runs it) stays the same
  // between renders.
  const loadError = t("couldntLoadLinks");

  const fetchLinks = React.useCallback(async () => {
    const request = ++latestFetch.current;
    setIsLoading(true);
    setError(null);
    list.replace(NO_LINKS);

    try {
      const page = await fetchLinksPage(query, 1, loadError);
      if (request === latestFetch.current) list.replace(page);
    } catch (err) {
      if (request === latestFetch.current) {
        setError(err instanceof Error ? err.message : loadError);
      }
    } finally {
      if (request === latestFetch.current) setIsLoading(false);
    }
  }, [query, list.replace, loadError]);

  // Search once typing pauses, not on every keystroke.
  React.useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchAnalytics = React.useCallback(
    async (link: DubLink, nextGroupBy = groupBy) => {
      setSelectedLink(link);
      setIsAnalyticsLoading(true);
      setAnalytics(null);

      try {
        const params = new URLSearchParams({
          groupBy: nextGroupBy,
          interval: "30d",
          event: "clicks",
        });
        const response = await apiFetch(
          `/api/integrations/dub/links/${encodeURIComponent(link.id)}/analytics?${params}`,
        );

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.error || "Failed to load Dub analytics");
        }

        const data = await response.json();
        setAnalytics(data.analytics);
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : t("dubAnalyticsAreUnavailableFor"),
        );
      } finally {
        setIsAnalyticsLoading(false);
      }
    },
    [groupBy, t],
  );

  React.useEffect(() => {
    void fetchLinks();
  }, [fetchLinks]);

  const handleCopy = async (link: DubLink) => {
    await navigator.clipboard.writeText(getShortUrl(link));
    toast.success(t("shortLinkCopied"));
    soundEvent("copy");
  };

  const handleArchive = async (link: DubLink) => {
    if (!confirm(`Archive ${link.domain}/${link.key}?`)) {
      return;
    }

    const response = await apiFetch(
      `/api/integrations/dub/links?linkId=${encodeURIComponent(link.id)}`,
      { method: "DELETE" },
    );

    if (!response.ok) {
      toast.error(t("failedToArchiveDubLink"));
      return;
    }

    toast.success(t("dubLinkArchived"));
    // Archived links leave the list; the rest stay where they are.
    list.update((items) => items.filter((item) => item.id !== link.id));
  };

  const handleUpdate = async (link: DubLink) => {
    const response = await apiFetch("/api/integrations/dub/links", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ linkId: link.id, url: editUrl }),
    });

    if (!response.ok) {
      toast.error(t("failedToUpdateDubLink"));
      return;
    }

    const data = (await response.json().catch(() => null)) as {
      link?: Partial<DubLink>;
    } | null;
    toast.success(t("dubLinkUpdated"));
    setEditingLinkId(null);
    setEditUrl("");
    // The edited link in place, so the list keeps its length and position.
    list.update((items) =>
      items.map((item) =>
        item.id === link.id
          ? { ...item, url: editUrl, ...(data?.link ?? {}) }
          : item,
      ),
    );
  };

  const handleGroupChange = async (nextGroupBy: AnalyticsGroupBy) => {
    setGroupBy(nextGroupBy);
    if (selectedLink) {
      await fetchAnalytics(selectedLink, nextGroupBy);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">{t("dubLinks")}</h2>
          <p className="text-muted-foreground text-sm">
            {workspaceName
              ? t("workspaceWorkspacename", { workspaceName })
              : t("searchManageAndInspectAnalytics")}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={fetchLinks}>
          <Refresh2 className="mr-1.5 size-3.5" />
          {t("refresh")}
        </Button>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const next = search.trim();
          // Same search again (the button after a pause): load it afresh.
          if (next === query) void fetchLinks();
          else setQuery(next);
        }}
      >
        <Input
          maxLength={200}
          placeholder={t("searchDubLinks")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button type="submit" variant="outline">
          {t("search")}
        </Button>
      </form>

      {error && (
        <Alert variant="destructive">
          <InfoCircle />
          <AlertTitle>{t("dubUnavailable")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        {isLoading ? (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        ) : links.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm font-medium">{t("noDubLinksFound")}</p>
            <p className="text-muted-foreground text-xs">
              {t("createADubBackedQr")}
            </p>
          </div>
        ) : (
          links.map((link) => (
            <div
              key={link.id}
              className="rounded-lg border p-3 space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-3"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm">
                    {link.domain}/{link.key}
                  </span>
                  {link.clicks !== undefined && (
                    <Badge variant="secondary">
                      {t("clicksClicks", { clicks: link.clicks })}
                    </Badge>
                  )}
                </div>
                {editingLinkId === link.id ? (
                  <Input
                    type="url"
                    value={editUrl}
                    onChange={(event) => setEditUrl(event.target.value)}
                  />
                ) : (
                  <p className="truncate text-muted-foreground text-xs">
                    {link.url}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {editingLinkId === link.id ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleUpdate(link)}
                      disabled={!editUrl.trim()}
                    >
                      {t("save")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingLinkId(null)}
                    >
                      {t("cancel")}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopy(link)}
                    >
                      <Copy className="mr-1.5 size-3.5" />
                      {t("copy")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(getShortUrl(link), "_blank")}
                    >
                      <ExportSquare className="mr-1.5 size-3.5" />
                      {t("open")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingLinkId(link.id);
                        setEditUrl(link.url);
                      }}
                    >
                      <Edit2 className="mr-1.5 size-3.5" />
                      {t("edit")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fetchAnalytics(link)}
                    >
                      <Chart className="mr-1.5 size-3.5" />
                      {t("analytics")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleArchive(link)}
                    >
                      <Trash className="mr-1.5 size-3.5" />
                      {t("archive")}
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
        {!(isLoading || error) && links.length > 0 && (
          <LoadMore
            count={links.length}
            error={list.error}
            hasMore={list.hasMore}
            labels={{
              loadMore: t("loadMoreLinks"),
              loading: t("loadingLinks"),
              retry: t("tryAgain"),
              end:
                links.length > LINKS_PAGE_SIZE
                  ? t("thatsEveryLink")
                  : undefined,
            }}
            loading={list.loading}
            onLoadMore={list.loadMore}
          />
        )}
      </div>

      {selectedLink && (
        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">
                {t("analyticsForDomainKey", {
                  domain: selectedLink.domain,
                  key: selectedLink.key,
                })}
              </p>
              <p className="text-muted-foreground text-xs">
                {t("last30DaysFromDub")}
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              {ANALYTICS_GROUPS.map((group) => (
                <Button
                  key={group}
                  type="button"
                  variant={groupBy === group ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleGroupChange(group)}
                >
                  {group}
                </Button>
              ))}
            </div>
          </div>

          {isAnalyticsLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : Array.isArray(analytics) && analytics.length > 0 ? (
            <div className="space-y-2">
              {analytics.slice(0, 8).map((item) => {
                const label = getAnalyticsLabel(item, t);
                const value = getAnalyticsValue(item);

                return (
                  <div
                    key={`${label}-${value}`}
                    className="flex items-center justify-between rounded-md bg-background px-3 py-2 text-sm"
                  >
                    <span className="truncate text-muted-foreground">
                      {label}
                    </span>
                    <span className="font-medium">{value}</span>
                  </div>
                );
              })}
            </div>
          ) : typeof analytics === "number" ? (
            <div className="rounded-md bg-background px-3 py-2 text-sm">
              {t("totalClicks")}{" "}
              <span className="font-medium">{analytics}</span>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              {t("chooseAnAnalyticsViewTo")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
