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
import * as React from "react";
import { toast } from "sonner";
import { Icons } from "@/components/icons";
import { apiFetch } from "@/lib/api-fetch";

interface DubLink {
  id: string;
  domain: string;
  key: string;
  url: string;
  title?: string;
  description?: string;
  archived: boolean;
  clicks?: number;
  createdAt: string;
}

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

function getShortUrl(link: DubLink) {
  return `https://${link.domain}/${link.key}`;
}

function getAnalyticsLabel(item: Record<string, string | number | null>) {
  return String(
    item.start ||
      item.country ||
      item.device ||
      item.browser ||
      item.os ||
      item.name ||
      "Unknown",
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
  const workspaceName = getWorkspaceName(metadata);
  const [links, setLinks] = React.useState<DubLink[]>([]);
  const [search, setSearch] = React.useState("");
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

  const fetchLinks = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ pageSize: "25" });
      if (search.trim()) {
        params.set("search", search.trim());
      }

      const response = await apiFetch(`/api/integrations/dub/links?${params}`);
      if (!response.ok) {
        throw new Error("Failed to load Dub links");
      }

      const data = await response.json();
      setLinks(data.links || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Dub links");
    } finally {
      setIsLoading(false);
    }
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
            : "Dub analytics are unavailable for this link",
        );
      } finally {
        setIsAnalyticsLoading(false);
      }
    },
    [groupBy],
  );

  React.useEffect(() => {
    void fetchLinks();
  }, [fetchLinks]);

  const handleCopy = async (link: DubLink) => {
    await navigator.clipboard.writeText(getShortUrl(link));
    toast.success("Short link copied");
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
      toast.error("Failed to archive Dub link");
      return;
    }

    toast.success("Dub link archived");
    await fetchLinks();
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
      toast.error("Failed to update Dub link");
      return;
    }

    toast.success("Dub link updated");
    setEditingLinkId(null);
    setEditUrl("");
    await fetchLinks();
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
          <h2 className="text-base font-semibold">Dub links</h2>
          <p className="text-muted-foreground text-sm">
            {workspaceName
              ? `Workspace: ${workspaceName}`
              : "Search, manage, and inspect analytics for connected Dub links."}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={fetchLinks}>
          <Icons.RefreshCw className="mr-1.5 size-3.5" />
          Refresh
        </Button>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Search Dub links..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button type="button" variant="outline" onClick={fetchLinks}>
          Search
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <Icons.AlertCircle />
          <AlertTitle>Dub unavailable</AlertTitle>
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
            <p className="text-sm font-medium">No Dub links found</p>
            <p className="text-muted-foreground text-xs">
              Create a Dub-backed QR from the editor to see it here.
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
                    <Badge variant="secondary">{link.clicks} clicks</Badge>
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
                      Save
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingLinkId(null)}
                    >
                      Cancel
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
                      <Icons.Copy className="mr-1.5 size-3.5" />
                      Copy
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(getShortUrl(link), "_blank")}
                    >
                      <Icons.ExternalLink className="mr-1.5 size-3.5" />
                      Open
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
                      <Icons.Edit className="mr-1.5 size-3.5" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fetchAnalytics(link)}
                    >
                      <Icons.ChartNoAxesCombined className="mr-1.5 size-3.5" />
                      Analytics
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleArchive(link)}
                    >
                      <Icons.Trash className="mr-1.5 size-3.5" />
                      Archive
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {selectedLink && (
        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">
                Analytics for {selectedLink.domain}/{selectedLink.key}
              </p>
              <p className="text-muted-foreground text-xs">
                Last 30 days from Dub. Some views require a paid Dub plan.
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
                const label = getAnalyticsLabel(item);
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
              Total clicks: <span className="font-medium">{analytics}</span>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Choose an analytics view to load Dub data.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
