"use client";

import { Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import {
  ArrowLeft,
  ArrowRight,
  ExportSquare,
  InfoCircle,
  Key,
  SearchNormal1,
  Warning2,
} from "iconsax-reactjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MigrateApiError, type MigrateClient } from "@/lib/migrate/client";
import { displayLink } from "@/lib/migrate/normalize";
import { API_PROVIDERS, type ApiProviderId } from "@/lib/migrate/providers";
import {
  MAX_JOB_LINKS,
  type ProviderStatus,
  type SourceLink,
} from "@/lib/migrate/types";
import {
  formatCount,
  formatDay,
  Note,
  ProviderLogo,
  plural,
  StepLayout,
} from "./import-shared";

const ALL = "__all";

// ─── Connect ─────────────────────────────────────────────────────────────────

/** What the OAuth callback's `connect_error` means to the person connecting. */
function connectErrorMessage(code: string | null, name: string) {
  if (!code) return null;
  return code === "access_denied"
    ? `The ${name} sign-in was cancelled.`
    : `Couldn't connect ${name}. Try again.`;
}

function ConnectPanel({
  client,
  provider,
  status,
  returnTo,
  connectError,
  onConnected,
}: {
  client: MigrateClient;
  provider: ApiProviderId;
  status: ProviderStatus | undefined;
  returnTo: string;
  connectError: string | null;
  onConnected: () => void;
}) {
  const { name } = API_PROVIDERS[provider];
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<"oauth" | "key" | null>(null);
  const [error, setError] = useState<string | null>(() =>
    connectErrorMessage(connectError, name),
  );

  if (status && !status.available) {
    return (
      <Note icon={<InfoCircle />}>
        <p>Importing from {name} isn't available yet.</p>
      </Note>
    );
  }

  const signIn = async () => {
    setBusy("oauth");
    setError(null);
    try {
      const url = await client.connectOAuth(provider, returnTo);
      if (client.mock) {
        onConnected();
        setBusy(null);
        return;
      }
      window.location.href = url;
    } catch (failure) {
      setError(
        failure instanceof MigrateApiError
          ? failure.message
          : `Couldn't start the ${name} sign-in.`,
      );
      setBusy(null);
    }
  };

  const saveKey = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy("key");
    setError(null);
    const result = await client.connectKey(provider, key).catch(() => ({
      ok: false as const,
      error: "Couldn't connect. Try again.",
    }));
    setBusy(null);
    if (result.ok) {
      setKey("");
      onConnected();
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-5 py-4">
      <div className="flex items-center gap-3">
        <ProviderLogo provider={provider} />
        <div>
          <h3 className="font-semibold">
            {status?.connection === "error" ? "Reconnect" : "Connect"} {name}
          </h3>
          <p className="text-muted-foreground text-sm">
            QRdx reads your links to import them. The token is stored encrypted;
            disconnect any time in Settings.
          </p>
        </div>
      </div>

      {status?.oauth && (
        <div className="space-y-1.5">
          <Button className="w-full" disabled={busy !== null} onClick={signIn}>
            {busy === "oauth" ? <Spinner className="animate-spin" /> : null}
            Sign in with {name}
          </Button>
          <p className="text-muted-foreground text-xs">
            After signing in you come straight back here to pick your links.
          </p>
        </div>
      )}

      {status?.apiKey && (
        <form className="space-y-2" onSubmit={saveKey}>
          {status.oauth && (
            <div className="text-muted-foreground flex items-center gap-3 text-xs">
              <span className="h-px flex-1 bg-border" />
              or paste a key
              <span className="h-px flex-1 bg-border" />
            </div>
          )}
          <Label htmlFor="migrate-key">{status.apiKey.label}</Label>
          <div className="flex gap-2">
            <Input
              autoComplete="off"
              id="migrate-key"
              onChange={(event) => setKey(event.target.value)}
              placeholder={status.apiKey.placeholder}
              spellCheck={false}
              type="password"
              value={key}
            />
            <Button
              disabled={busy !== null || key.trim().length === 0}
              type="submit"
              variant={status.oauth ? "outline" : "default"}
            >
              {busy === "key" ? <Spinner className="animate-spin" /> : <Key />}
              Connect
            </Button>
          </div>
          {status.apiKey.helpText && (
            <p className="text-muted-foreground text-xs">
              {status.apiKey.helpText}{" "}
              {status.apiKey.helpUrl && (
                <a
                  className="inline-flex items-center gap-0.5 font-medium text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
                  href={status.apiKey.helpUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Open {name}
                  <ExportSquare aria-hidden className="size-3" />
                </a>
              )}
            </p>
          )}
        </form>
      )}

      {!(status?.oauth || status?.apiKey) && status && (
        <Note icon={<InfoCircle />}>
          <p>
            Connecting {name} isn't available right now. Export your links as
            CSV from {name} and use "Another provider (CSV)" instead.
          </p>
        </Note>
      )}

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Pick links ──────────────────────────────────────────────────────────────

interface PageState {
  links: SourceLink[];
  next: string | null;
}

export function LinksStep({
  client,
  provider,
  status,
  returnTo,
  connectError,
  onConnected,
  onBack,
  onContinue,
}: {
  client: MigrateClient;
  provider: ApiProviderId;
  status: ProviderStatus | undefined;
  /** Same-site path the OAuth sign-in returns to (reopens this step) */
  returnTo: string;
  /** `connect_error` from a sign-in that came back without connecting */
  connectError: string | null;
  onConnected: () => void;
  onBack: () => void;
  onContinue: (links: SourceLink[]) => void;
}) {
  const { name, capabilities } = API_PROVIDERS[provider];
  const connected = status?.connection === "active";
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState<string>(ALL);
  const [tag, setTag] = useState<string>(ALL);
  const [domains, setDomains] = useState<string[]>([]);
  const [pages, setPages] = useState<PageState[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [imported, setImported] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Map<string, SourceLink>>(new Map());
  const [loading, setLoading] = useState(false);
  const [loadingAll, setLoadingAll] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo(
    () => ({
      search: query || undefined,
      domain: domain === ALL ? undefined : domain,
      tag: tag === ALL ? undefined : tag,
    }),
    [query, domain, tag],
  );

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const loadPage = useCallback(
    async (index: number, cursor: string | null, withDomains = false) => {
      setLoading(true);
      setError(null);
      try {
        const page = await client.links(provider, cursor, {
          ...filters,
          withDomains,
        });
        if (page.domains) setDomains(page.domains);
        setImported((current) => ({ ...current, ...page.imported }));
        setPages((current) => {
          const next = current.slice(0, index);
          next[index] = { links: page.links, next: page.nextCursor };
          return next;
        });
        setPageIndex(index);
      } catch (failure) {
        setError(
          failure instanceof MigrateApiError
            ? failure.message
            : `Couldn't load your ${name} links.`,
        );
      } finally {
        setLoading(false);
      }
    },
    [client, provider, filters, name],
  );

  // First page whenever the filters change (domains on the very first load).
  // (loadPage changes with the filters.)
  const loadedOnce = useRef(false);
  useEffect(() => {
    if (!connected) return;
    setPages([]);
    void loadPage(0, null, !loadedOnce.current);
    loadedOnce.current = true;
  }, [connected, loadPage]);

  const page = pages[pageIndex];
  const loadedLinks = useMemo(
    () => pages.flatMap((entry) => entry?.links ?? []),
    [pages],
  );
  const domainOptions = useMemo(() => {
    const seen = new Set(domains);
    for (const link of loadedLinks) if (link.domain) seen.add(link.domain);
    return [...seen].sort();
  }, [domains, loadedLinks]);
  const tagOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const link of loadedLinks) {
      for (const name of link.tags) seen.set(name.toLowerCase(), name);
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [loadedLinks]);
  const showClicks = loadedLinks.some((link) => link.clicks !== null);

  if (!connected) {
    return (
      <StepLayout
        footer={
          <Button onClick={onBack} size="sm" variant="ghost">
            <ArrowLeft />
            All providers
          </Button>
        }
      >
        <ConnectPanel
          client={client}
          connectError={connectError}
          onConnected={onConnected}
          provider={provider}
          returnTo={returnTo}
          status={status}
        />
      </StepLayout>
    );
  }

  const selectable = (page?.links ?? []).filter((link) => !imported[link.id]);
  const allOnPage =
    selectable.length > 0 && selectable.every((link) => selected.has(link.id));
  const toggle = (link: SourceLink, on: boolean) =>
    setSelected((current) => {
      const next = new Map(current);
      if (on && next.size < MAX_JOB_LINKS) next.set(link.id, link);
      else next.delete(link.id);
      return next;
    });
  const togglePage = (on: boolean) =>
    setSelected((current) => {
      const next = new Map(current);
      for (const link of selectable) {
        if (on && next.size < MAX_JOB_LINKS) next.set(link.id, link);
        else if (!on) next.delete(link.id);
      }
      return next;
    });

  /** Loads every remaining page (up to the job cap) and selects all of it. */
  const selectAll = async () => {
    setLoadingAll(0);
    setError(null);
    const all = new Map<string, SourceLink>();
    const add = (links: SourceLink[], skip: Record<string, string>) => {
      for (const link of links) {
        if (!skip[link.id] && all.size < MAX_JOB_LINKS) all.set(link.id, link);
      }
    };
    add(loadedLinks, imported);
    let cursor = pages.at(-1)?.next ?? null;
    try {
      while (cursor && all.size < MAX_JOB_LINKS) {
        const next = await client.links(provider, cursor, filters);
        setImported((current) => ({ ...current, ...next.imported }));
        add(next.links, next.imported);
        setLoadingAll(all.size);
        cursor = next.nextCursor;
      }
    } catch (failure) {
      setError(
        failure instanceof MigrateApiError
          ? failure.message
          : "Couldn't load every page. The links loaded so far are selected.",
      );
    }
    setSelected(all);
    setLoadingAll(null);
  };

  return (
    <StepLayout
      footer={
        <>
          <Button onClick={onBack} size="sm" variant="ghost">
            <ArrowLeft />
            All providers
          </Button>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground text-sm tabular-nums">
              {plural(selected.size, "link")} selected
            </span>
            <Button
              disabled={selected.size === 0 || loadingAll !== null}
              onClick={() => onContinue([...selected.values()])}
            >
              Preview import
              <ArrowRight />
            </Button>
          </div>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <SearchNormal1
              aria-hidden
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <Input
              aria-label={`Search ${name} links`}
              className="pl-9"
              onChange={(event) => setSearch(event.target.value)}
              placeholder={
                capabilities.search
                  ? "Search title, link or destination"
                  : "Filter loaded links"
              }
              value={search}
            />
          </div>
          <Select onValueChange={setDomain} value={domain}>
            <SelectTrigger aria-label="Domain" className="sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All domains</SelectItem>
              {domainOptions.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {tagOptions.length > 0 && (
            <Select onValueChange={setTag} value={tag}>
              <SelectTrigger aria-label="Tag" className="sm:w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All tags</SelectItem>
                {tagOptions.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {error && (
          <Note icon={<Warning2 />} tone="warning">
            <p>{error}</p>
          </Note>
        )}

        <div className="overflow-hidden rounded-xl border">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Select this page"
                    checked={allOnPage}
                    disabled={selectable.length === 0}
                    onCheckedChange={(value) => togglePage(value === true)}
                  />
                </TableHead>
                <TableHead>Link</TableHead>
                <TableHead className="hidden md:table-cell">
                  Destination
                </TableHead>
                {showClicks && (
                  <TableHead className="hidden w-20 text-right sm:table-cell">
                    Clicks
                  </TableHead>
                )}
                <TableHead className="hidden w-28 sm:table-cell">
                  Created
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && !page ? (
                Array.from({ length: 6 }, (_, index) => (
                  <TableRow key={index}>
                    <TableCell colSpan={5}>
                      <div className="h-8 animate-pulse rounded-md bg-muted/60" />
                    </TableCell>
                  </TableRow>
                ))
              ) : (page?.links.length ?? 0) === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    className="text-muted-foreground py-10 text-center"
                    colSpan={5}
                  >
                    {filters.search || filters.domain || filters.tag
                      ? "No links match these filters."
                      : `No links in this ${name} account.`}
                  </TableCell>
                </TableRow>
              ) : (
                page?.links.map((link) => {
                  const done = imported[link.id];
                  return (
                    <TableRow
                      data-state={
                        selected.has(link.id) ? "selected" : undefined
                      }
                      key={link.id}
                    >
                      <TableCell>
                        <Checkbox
                          aria-label={`Select ${link.title ?? link.shortLink ?? link.id}`}
                          checked={selected.has(link.id)}
                          disabled={Boolean(done)}
                          onCheckedChange={(value) =>
                            toggle(link, value === true)
                          }
                        />
                      </TableCell>
                      <TableCell className="min-w-0">
                        <div className="truncate font-medium">
                          {link.title ?? displayLink(link.shortLink ?? link.id)}
                        </div>
                        <div className="text-muted-foreground flex items-center gap-1.5 truncate text-xs">
                          <span className="truncate">
                            {displayLink(link.shortLink ?? link.id)}
                          </span>
                          {done && (
                            <span className="shrink-0 rounded-full border px-1.5 py-px text-[10px]">
                              Imported
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden truncate md:table-cell">
                        {displayLink(link.destinationUrl)}
                      </TableCell>
                      {showClicks && (
                        <TableCell className="text-muted-foreground hidden text-right tabular-nums sm:table-cell">
                          {link.clicks === null
                            ? "—"
                            : formatCount(link.clicks)}
                        </TableCell>
                      )}
                      <TableCell className="text-muted-foreground hidden text-xs sm:table-cell">
                        {formatDay(link.createdAt)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <div className="text-muted-foreground flex items-center gap-2">
            {loadingAll !== null ? (
              <>
                <Spinner className="size-4 animate-spin" />
                Loading links… {formatCount(loadingAll)}
              </>
            ) : (
              <Button
                className="h-auto px-0 text-foreground underline decoration-foreground/30 underline-offset-4 hover:bg-transparent hover:decoration-foreground"
                disabled={loading}
                onClick={selectAll}
                size="sm"
                variant="link"
              >
                Select all matching links
              </Button>
            )}
            {selected.size > 0 && loadingAll === null && (
              <Button
                className="h-auto px-0 text-muted-foreground hover:bg-transparent"
                onClick={() => setSelected(new Map())}
                size="sm"
                variant="link"
              >
                Clear
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {loading && page && (
              <Spinner className="text-muted-foreground size-4 animate-spin" />
            )}
            <Button
              disabled={loading || pageIndex === 0}
              onClick={() => setPageIndex((index) => Math.max(0, index - 1))}
              size="sm"
              variant="outline"
            >
              Previous
            </Button>
            <Button
              disabled={loading || !(pages[pageIndex + 1] || page?.next)}
              onClick={() =>
                pages[pageIndex + 1]
                  ? setPageIndex(pageIndex + 1)
                  : void loadPage(pageIndex + 1, page?.next ?? null)
              }
              size="sm"
              variant="outline"
            >
              Next
            </Button>
          </div>
        </div>
        {selected.size >= MAX_JOB_LINKS && (
          <p className="text-muted-foreground text-xs">
            One import takes up to {formatCount(MAX_JOB_LINKS)} links. Import
            these, then run Import again for the rest (imported links are
            skipped).
          </p>
        )}
      </div>
    </StepLayout>
  );
}
