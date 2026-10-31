"use client";

import {
  Spinner as Loader2,
  Close as X,
} from "@repo/design-system/components/icons";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import type { SourceItem } from "@repo/integrations";
import {
  ArrowDown2,
  SearchNormal1 as Search,
  UserSquare,
} from "iconsax-reactjs";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useId, useState } from "react";
import { emitSound } from "@/components/editor/sound";
import { NeedsSetupBadge } from "@/components/needs-setup";
import { IntegrationLogo } from "@/components/sections/integrations/integration-logo";
import {
  DataConnectionError,
  loadSourcePage,
  loadSources,
  type SourceStatusView,
} from "@/lib/data-connections/client";

const linkClass =
  "font-medium text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground";

const DESCRIPTIONS: Record<string, string> = {
  stripe: "Your active Payment Links. The QR code opens checkout.",
  calcom: "Your event types. The QR code opens the booking page.",
  calendly: "Your active event types. The QR code opens the scheduling page.",
  shopify: "Your active products. The QR code opens the product on your store.",
  youtube: "The latest uploads of a channel.",
  spotify: "The public playlists of a Spotify profile.",
};

const QUERY_LABELS: Record<string, { label: string; placeholder: string }> = {
  youtube: {
    label: "Your channel",
    placeholder: "@yourchannel or channel link",
  },
  spotify: {
    label: "Your Spotify profile",
    placeholder: "https://open.spotify.com/user/…",
  },
};

const listNames = (sources: SourceStatusView[]) => {
  const names = sources.map((source) => source.name);
  return names.length > 1
    ? `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`
    : (names[0] ?? "");
};

function useSources(contentType: string) {
  const [state, setState] = useState<{
    signedIn: boolean;
    sources: SourceStatusView[];
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadSources(contentType)
      .then((result) => !cancelled && setState(result))
      .catch(() => !cancelled && setState({ signedIn: false, sources: [] }));
    return () => {
      cancelled = true;
    };
  }, [contentType]);
  return state;
}

interface PickerDialogProps {
  source: SourceStatusView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (item: SourceItem) => void;
}

function SourcePickerDialog({
  source,
  open,
  onOpenChange,
  onPick,
}: PickerDialogProps) {
  const queryId = useId();
  const [items, setItems] = useState<SourceItem[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsQuery = source.needsQuery;
  const queryCopy = QUERY_LABELS[source.slug];

  const fetchPage = useCallback(
    async (
      options: { cursor?: string; search?: string; query?: string },
      append = false,
    ) => {
      setLoading(true);
      setError(null);
      try {
        const page = await loadSourcePage(source.slug, options);
        setItems((current) =>
          append ? [...current, ...page.items] : page.items,
        );
        setCursor(page.nextCursor);
      } catch (err) {
        setError(
          err instanceof DataConnectionError
            ? err.message
            : "Couldn't load. Try again.",
        );
        if (!append) setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [source.slug],
  );

  useEffect(() => {
    if (open && !needsQuery) fetchPage({});
  }, [open, needsQuery, fetchPage]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setActiveSearch(search.trim());
    fetchPage({
      search: search.trim() || undefined,
      query: activeQuery || undefined,
    });
  };

  const submitQuery = (event: FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    setActiveQuery(value);
    setActiveSearch("");
    setSearch("");
    fetchPage({ query: value });
  };

  const ready = !needsQuery || Boolean(activeQuery);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[85vh] gap-4 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <IntegrationLogo
              logo={{ type: "image", src: source.logo }}
              size="sm"
            />
            Pick from {source.name}
          </DialogTitle>
          <DialogDescription>{DESCRIPTIONS[source.slug]}</DialogDescription>
        </DialogHeader>

        {needsQuery && queryCopy && (
          <form className="space-y-2" onSubmit={submitQuery}>
            <Label htmlFor={queryId}>{queryCopy.label}</Label>
            <div className="flex gap-2">
              <Input
                autoComplete="off"
                id={queryId}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={queryCopy.placeholder}
                spellCheck={false}
                value={query}
              />
              <Button
                disabled={!query.trim() || loading}
                type="submit"
                variant="outline"
              >
                Show
              </Button>
            </div>
          </form>
        )}

        {ready && (
          <form className="relative" onSubmit={submitSearch}>
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label={`Search ${source.name}`}
              className="pr-9 pl-9"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search"
              type="search"
              value={search}
            />
            {search && (
              <button
                aria-label="Clear search"
                className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setSearch("");
                  setActiveSearch("");
                  fetchPage({ query: activeQuery || undefined });
                }}
                type="button"
              >
                <X className="size-4" />
              </button>
            )}
          </form>
        )}

        {error && (
          <p
            className="rounded-md bg-destructive/10 p-3 text-destructive text-sm"
            role="alert"
          >
            {error}
          </p>
        )}

        <div className="h-[340px] overflow-y-auto overscroll-contain rounded-md border">
          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : !ready ? (
            <p className="p-8 text-center text-muted-foreground text-sm text-pretty">
              {source.slug === "youtube"
                ? "Enter your channel to see its latest videos."
                : "Paste your profile link to see your public playlists."}
            </p>
          ) : items.length === 0 && !error ? (
            <p className="p-8 text-center text-muted-foreground text-sm text-pretty">
              {activeSearch
                ? `Nothing matches “${activeSearch}”.`
                : `Nothing to pick in ${source.name} yet.`}
            </p>
          ) : (
            <ul className="flex flex-col p-1.5">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    className="flex w-full min-w-0 items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    onClick={() => {
                      onPick(item);
                      emitSound("success");
                      onOpenChange(false);
                    }}
                    type="button"
                  >
                    {item.image && (
                      <img
                        alt=""
                        className="size-10 shrink-0 rounded-md bg-muted object-cover"
                        loading="lazy"
                        src={item.image}
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">
                        {item.title}
                      </span>
                      <span className="block truncate text-muted-foreground text-xs">
                        {[item.subtitle, item.url.replace(/^https?:\/\//, "")]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    {item.badge && (
                      <Badge className="shrink-0 font-normal" variant="outline">
                        {item.badge}
                      </Badge>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {cursor && items.length > 0 && (
            <div className="flex justify-center p-3">
              <Button
                disabled={loading}
                onClick={() =>
                  fetchPage(
                    {
                      cursor,
                      search: activeSearch || undefined,
                      query: activeQuery || undefined,
                    },
                    true,
                  )
                }
                size="sm"
                type="button"
                variant="outline"
              >
                {loading && <Loader2 className="size-3.5 animate-spin" />}
                Load more
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface AccountSourcePickerProps {
  /** Editor content type: url, calcom, youtube or spotify */
  contentType: string;
  /** Called with the picked item; item.url is the QR content */
  onPick: (item: SourceItem, provider: string) => void;
  /** Button text */
  label?: string;
}

/**
 * "From your account": pick a Stripe payment link, Calendly or Cal.com event
 * type, Shopify product, YouTube video or Spotify playlist and use its link.
 * Hidden when nothing could be picked for this content type.
 */
export function AccountSourcePicker({
  contentType,
  onPick,
  label = "From your account",
}: AccountSourcePickerProps) {
  const state = useSources(contentType);
  const [open, setOpen] = useState<SourceStatusView | null>(null);
  if (!state) return null;

  const configured = state.sources.filter((source) => source.configured);
  const ready = configured.filter(
    (source) =>
      source.connected && (source.needsQuery || source.status === "active"),
  );
  const accountSources = configured.filter((source) => !source.needsQuery);
  // Local dev only: sources whose credentials aren't set (production omits them).
  const needsSetup = state.sources.filter(
    (source) => !source.configured && source.needsSetup?.length,
  );
  const setupNote =
    needsSetup.length > 0 ? (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
        {needsSetup.map((source) => (
          <span key={source.slug} className="inline-flex items-center gap-1.5">
            {source.name}
            <NeedsSetupBadge names={source.needsSetup} />
          </span>
        ))}
      </div>
    ) : null;

  if (ready.length === 0) {
    if (accountSources.length === 0) return setupNote;
    return (
      <>
        <p className="text-muted-foreground text-xs text-pretty">
          Pick from {listNames(accountSources)}:{" "}
          <Link className={linkClass} href="/integrations?category=sources">
            connect an account
          </Link>
          .
        </p>
        {setupNote}
      </>
    );
  }

  const pick = (source: SourceStatusView) => (item: SourceItem) =>
    onPick(item, source.slug);

  return (
    <>
      {ready.length === 1 ? (
        <Button
          onClick={() => setOpen(ready[0] ?? null)}
          size="sm"
          type="button"
          variant="outline"
        >
          <UserSquare aria-hidden className="size-4" />
          {ready[0]?.needsQuery
            ? ready[0].slug === "youtube"
              ? "From your channel"
              : "From your playlists"
            : `${label}: ${ready[0]?.name}`}
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" type="button" variant="outline">
              <UserSquare aria-hidden className="size-4" />
              {label}
              <ArrowDown2 aria-hidden className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
              Your accounts
            </DropdownMenuLabel>
            {ready.map((source) => (
              <DropdownMenuItem
                key={source.slug}
                onSelect={() => setOpen(source)}
              >
                <IntegrationLogo
                  className="size-5 p-0.5"
                  logo={{ type: "image", src: source.logo }}
                  size="sm"
                />
                {source.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {open && (
        <SourcePickerDialog
          onOpenChange={(next) => !next && setOpen(null)}
          onPick={pick(open)}
          open
          source={open}
        />
      )}
      {setupNote}
    </>
  );
}
