"use client";

import { Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { ScrollArea } from "@repo/design-system/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { Skeleton } from "@repo/design-system/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/design-system/components/ui/tabs";
import type { ShortLink, ShortLinkDomain } from "@repo/integrations";
import {
  isShortLinkProvider,
  SLUG_SUPPORT,
} from "@repo/integrations/src/capabilities/providers";
import { SearchNormal1 } from "iconsax-reactjs";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import {
  createShortLink,
  listShortLinks,
  loadShortLinkDomains,
} from "@/lib/connected-accounts/client";
import type { PickerProvider } from "./cloud-picker-dialog";

interface ShortLinkDialogProps {
  provider: PickerProvider;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefills the destination (the URL already in the form). */
  initialUrl?: string;
  onDone: (link: ShortLink, how: "created" | "selected") => void;
}

function toHttpUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(
      /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`,
    );
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** Create a short link in the user's own account, or pick an existing one. */
export function ShortLinkDialog({
  provider,
  open,
  onOpenChange,
  initialUrl = "",
  onDone,
}: ShortLinkDialogProps) {
  const ids = useId();
  const slugSupported =
    isShortLinkProvider(provider.slug) && SLUG_SUPPORT[provider.slug];

  const [tab, setTab] = useState<"create" | "existing">("create");
  const [destination, setDestination] = useState(initialUrl);
  const [domains, setDomains] = useState<ShortLinkDomain[] | null>(null);
  const [domainId, setDomainId] = useState<string>("");
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [links, setLinks] = useState<ShortLink[] | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [listing, setListing] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab("create");
    setDestination(initialUrl);
    setSlug("");
    setTitle("");
    setError(null);
    setDomains(null);
    setLinks(null);
    setSearch("");
    listedOnce.current = false;
    loadShortLinkDomains(provider.slug)
      .then((result) => {
        setDomains(result.domains);
        setDomainId(result.defaultDomainId ?? result.domains[0]?.id ?? "");
      })
      .catch((err: unknown) => {
        setDomains([]);
        setError(err instanceof Error ? err.message : "Couldn't load domains");
      });
  }, [open, initialUrl, provider.slug]);

  // Existing links: load at once on first view, then debounce searches
  const listedOnce = useRef(false);
  useEffect(() => {
    if (!open || tab !== "existing") return;
    let cancelled = false;
    const timer = setTimeout(
      () => {
        listedOnce.current = true;
        setListing(true);
        listShortLinks(provider.slug, { search: search.trim() || undefined })
          .then((page) => {
            if (cancelled) return;
            setLinks(page.links);
            setCursor(page.nextCursor);
            setError(null);
          })
          .catch((err: unknown) => {
            if (cancelled) return;
            setLinks([]);
            setError(
              err instanceof Error ? err.message : "Couldn't load links",
            );
          })
          .finally(() => !cancelled && setListing(false));
      },
      listedOnce.current ? 300 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, tab, search, provider.slug]);

  const loadMore = async () => {
    if (!cursor) return;
    setListing(true);
    try {
      const page = await listShortLinks(provider.slug, {
        search: search.trim() || undefined,
        cursor,
      });
      setLinks((current) => [...(current ?? []), ...page.links]);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load links");
    } finally {
      setListing(false);
    }
  };

  const destinationUrl = toHttpUrl(destination);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!destinationUrl) {
      setError("Enter the web address the short link should open.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const link = await createShortLink(provider.slug, {
        longUrl: destinationUrl,
        domainId: domainId || undefined,
        slug: slugSupported && slug.trim() ? slug.trim() : undefined,
        title: title.trim() || undefined,
      });
      onDone(link, "created");
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the link");
    } finally {
      setCreating(false);
    }
  };

  const hostname = domains?.find((domain) => domain.id === domainId)?.hostname;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="gap-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <span className="grid size-7 shrink-0 grid-cols-1 grid-rows-1 place-items-center rounded-full bg-white p-1 ring-1 ring-black/5 dark:ring-white/10">
              <img
                alt=""
                className="size-full object-contain"
                src={provider.logo}
              />
            </span>
            Short link with {provider.name}
          </DialogTitle>
          <DialogDescription>
            The QR code encodes the short link. Change where it points later in{" "}
            {provider.name}.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          onValueChange={(value) => setTab(value as typeof tab)}
          value={tab}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="create">Create new</TabsTrigger>
            <TabsTrigger value="existing">Use existing</TabsTrigger>
          </TabsList>

          <TabsContent className="pt-2" value="create">
            <form className="space-y-4" onSubmit={create}>
              <div className="space-y-2">
                <Label htmlFor={`${ids}-dest`}>Destination</Label>
                <Input
                  autoCapitalize="none"
                  id={`${ids}-dest`}
                  inputMode="url"
                  onChange={(event) => setDestination(event.target.value)}
                  placeholder="example.com/spring-menu"
                  spellCheck={false}
                  value={destination}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`${ids}-domain`}>Domain</Label>
                  {domains === null ? (
                    <Skeleton className="h-9 w-full rounded-full" />
                  ) : (
                    <Select
                      disabled={domains.length === 0}
                      onValueChange={setDomainId}
                      value={domainId}
                    >
                      <SelectTrigger className="w-full" id={`${ids}-domain`}>
                        <SelectValue placeholder="Default domain" />
                      </SelectTrigger>
                      <SelectContent>
                        {domains.map((domain) => (
                          <SelectItem key={domain.id} value={domain.id}>
                            {domain.hostname}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${ids}-slug`}>Back-half</Label>
                  <Input
                    disabled={!slugSupported}
                    id={`${ids}-slug`}
                    onChange={(event) => setSlug(event.target.value)}
                    placeholder={
                      slugSupported ? "spring-menu" : "Picked by Bitly"
                    }
                    spellCheck={false}
                    value={slug}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`${ids}-title`}>Title</Label>
                <Input
                  id={`${ids}-title`}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Optional, shown in your dashboard"
                  value={title}
                />
              </div>

              {hostname && (
                <p className="text-muted-foreground text-xs">
                  Your link will look like{" "}
                  <span className="font-mono text-foreground">
                    {hostname}/
                    {slugSupported && slug.trim() ? slug.trim() : "…"}
                  </span>
                </p>
              )}

              {error && (
                <p className="text-destructive text-sm" role="alert">
                  {error}
                </p>
              )}

              <div className="flex justify-end">
                <Button disabled={creating || !destinationUrl} type="submit">
                  {creating && <Spinner className="size-4 animate-spin" />}
                  Create link
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent className="space-y-3 pt-2" value="existing">
            <div className="relative">
              <SearchNormal1
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label={`Search ${provider.name} links`}
                className="pl-9"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search links"
                value={search}
              />
            </div>
            {error && (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            )}
            <ScrollArea className="h-72 rounded-md border">
              {links === null ? (
                <div className="space-y-2 p-3">
                  <Skeleton className="h-11 w-full" />
                  <Skeleton className="h-11 w-full" />
                  <Skeleton className="h-11 w-full" />
                </div>
              ) : links.length === 0 ? (
                <p className="p-6 text-center text-muted-foreground text-sm">
                  {search.trim() ? "No links match." : "No links yet."}
                </p>
              ) : (
                <ul className="flex flex-col p-1.5">
                  {links.map((link) => (
                    <li key={link.id}>
                      <button
                        className="flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                        onClick={() => {
                          onDone(link, "selected");
                          onOpenChange(false);
                        }}
                        type="button"
                      >
                        <span className="font-mono text-sm">
                          {link.shortUrl.replace(/^https?:\/\//, "")}
                        </span>
                        <span className="w-full truncate text-muted-foreground text-xs">
                          {link.title ? `${link.title} · ` : ""}
                          {link.longUrl}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {cursor && links && links.length > 0 && (
                <div className="flex justify-center p-3">
                  <Button
                    disabled={listing}
                    onClick={loadMore}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {listing && <Spinner className="size-3.5 animate-spin" />}
                    Load more
                  </Button>
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
