"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@repo/design-system/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import {
  Add,
  Brush2,
  DocumentText1,
  DocumentUpload,
  type Icon,
  Link21,
  SearchNormal1,
  TaskSquare,
  UserAdd,
} from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { useAvailability } from "@/components/availability-provider";
import { type CreateKind, useCreate } from "./create-actions";
import { HELP_LINKS } from "./help-links";
import { MAIN_NAV, SETTINGS_NAV } from "./nav-config";
import { paletteFilter } from "./palette-filter";
import { type SearchHit, searchWorkspace } from "./search-actions";

const SEARCH_DELAY_MS = 250;
const DOCS_RESULTS = 5;

interface DocHit {
  id: string;
  url: string;
  title: string;
}

/** Page and heading hits from the docs search route (fumadocs). */
function toDocHits(value: unknown): DocHit[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const hits: DocHit[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const { id, url, type, content } = row as Record<string, unknown>;
    if (typeof url !== "string" || typeof content !== "string") continue;
    // Whole pages only: a heading alone ("Errors") says too little.
    if (type !== "page") continue;
    if (!url.startsWith("/") || seen.has(url)) continue;
    seen.add(url);
    hits.push({ id: String(id ?? url), url, title: content });
    if (hits.length === DOCS_RESULTS) break;
  }
  return hits;
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

interface Action {
  id: string;
  label: string;
  icon: Icon;
  keywords: string[];
  run: () => void;
}

function Row({
  icon: RowIcon,
  children,
  detail,
}: {
  /** Destinations and actions; search hits have none (the group says what they are). */
  icon?: Icon;
  children: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <>
      {RowIcon && <RowIcon aria-hidden className="text-muted-foreground" />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {detail && (
        <span className="text-muted-foreground max-w-[45%] truncate text-xs">
          {detail}
        </span>
      )}
    </>
  );
}

function HitItems({
  hits,
  onOpen,
}: {
  hits: SearchHit[];
  onOpen: (href: string) => void;
}) {
  return hits.map((hit) => (
    <CommandItem
      // Matched on the server (destination, notes, tags…), so the
      // palette's own filter must not hide them.
      forceMount
      key={hit.id}
      onSelect={() => onOpen(hit.href)}
      value={`hit ${hit.href}`}
    >
      <Row detail={hit.archived ? `Archived · ${hit.detail}` : hit.detail}>
        {hit.title}
      </Row>
    </CommandItem>
  ));
}

/**
 * ⌘K: jump to any app page, start something new, or find a code, landing
 * page or docs article. Workspace results come from the active workspace.
 */
export function CommandMenu() {
  const router = useRouter();
  const create = useCreate();
  const { showsPath } = useAvailability();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const term = useDebounced(query.trim(), SEARCH_DELAY_MS);
  const [hits, setHits] = useState<{
    term: string;
    codes: SearchHit[];
    pages: SearchHit[];
    docs: DocHit[];
    error: string | null;
  } | null>(null);
  const [shortcut, setShortcut] = useState("Ctrl K");

  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.userAgent)) setShortcut("⌘K");
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() === "k" &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open || term.length < 2) return;
    let cancelled = false;
    const docs = fetch(`/api/search?query=${encodeURIComponent(term)}`)
      .then((res) => (res.ok ? res.json() : []))
      .then(toDocHits)
      .catch(() => []);
    void Promise.all([searchWorkspace(term), docs]).then(
      ([workspace, docHits]) => {
        if (cancelled) return;
        setHits({
          term,
          codes: workspace.ok ? workspace.codes : [],
          pages: workspace.ok ? workspace.pages : [],
          docs: docHits,
          error: workspace.ok ? null : workspace.error,
        });
      },
      () => {
        if (cancelled) return;
        setHits({
          term,
          codes: [],
          pages: [],
          docs: [],
          error: "Search isn't working right now.",
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, term]);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery("");
      setHits(null);
    }
  };

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const startCreate = (kind: CreateKind) => () => {
    onOpenChange(false);
    create(kind);
  };
  const actions: Action[] = [
    {
      id: "new-code",
      label: "New dynamic QR code",
      icon: Add,
      keywords: ["create", "short link"],
      run: startCreate("code"),
    },
    {
      id: "new-page",
      label: "New landing page",
      icon: DocumentText1,
      keywords: ["create", "page", "menu", "vcard", "links"],
      run: startCreate("page"),
    },
    {
      id: "new-form",
      label: "New form",
      icon: TaskSquare,
      keywords: ["create", "survey", "feedback", "responses"],
      run: startCreate("form"),
    },
    {
      id: "import",
      label: "Import codes from a CSV file",
      icon: DocumentUpload,
      keywords: ["bulk", "upload", "spreadsheet"],
      run: () => go("/dashboard/codes/import"),
    },
    {
      id: "invite",
      label: "Invite a teammate",
      icon: UserAdd,
      keywords: ["team", "members", "workspace"],
      run: () => go("/dashboard/team"),
    },
    {
      id: "domain",
      label: "Connect a domain",
      icon: Link21,
      keywords: ["custom domain", "dns", "branded"],
      run: () => go("/dashboard/domains"),
    },
    {
      id: "editor",
      label: "Open the editor",
      icon: Brush2,
      keywords: ["playground", "design", "static", "download"],
      run: () => go("/playground"),
    },
  ].filter(
    // "Connect a domain" only where domains can be added here.
    (action) => action.id !== "domain" || showsPath("/dashboard/domains"),
  );

  const showHits = hits !== null && hits.term === term && term.length >= 2;

  return (
    <>
      {/* Compact field from lg; an icon button below. Both open the palette. */}
      <button
        aria-keyshortcuts="Meta+K Control+K"
        aria-label="Search or jump to"
        className="text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] focus-visible:ring-ring/50 hidden h-8 w-60 items-center gap-2 rounded-md border px-2.5 text-[13px] outline-none transition-colors focus-visible:ring-[3px] lg:flex"
        onClick={() => setOpen(true)}
        type="button"
      >
        <SearchNormal1 aria-hidden className="size-3.5 shrink-0" />
        <span className="flex-1 truncate text-left">Search or jump to…</span>
        <kbd className="text-muted-foreground/70 font-sans text-[11px]">
          {shortcut}
        </kbd>
      </button>
      <Button
        aria-keyshortcuts="Meta+K Control+K"
        aria-label="Search or jump to"
        className="size-8 lg:hidden"
        onClick={() => setOpen(true)}
        size="icon"
        variant="ghost"
      >
        <SearchNormal1 aria-hidden className="size-4" />
      </Button>

      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogHeader className="sr-only">
          <DialogTitle>Search or jump to</DialogTitle>
          <DialogDescription>
            Find a page, a code or a docs article, or start something new.
          </DialogDescription>
        </DialogHeader>
        <DialogContent
          className="top-[20%] translate-y-0 overflow-hidden p-0 sm:max-w-xl"
          showCloseButton={false}
        >
          <Command
            filter={paletteFilter}
            className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2.5 **:data-[slot=command-input-wrapper]:h-12"
          >
            <CommandInput
              onValueChange={setQuery}
              placeholder="Search codes, pages, settings and docs…"
              value={query}
            />
            <CommandList className="max-h-[min(60vh,420px)]">
              <CommandEmpty>
                {term.length >= 2 && !showHits ? "Searching…" : "No results."}
              </CommandEmpty>

              {showHits && hits.error && (
                <p
                  className="text-muted-foreground px-4 py-3 text-sm"
                  role="status"
                >
                  {hits.error}
                </p>
              )}
              {showHits && hits.codes.length > 0 && (
                <CommandGroup forceMount heading="Codes">
                  <HitItems hits={hits.codes} onOpen={go} />
                </CommandGroup>
              )}
              {showHits && hits.pages.length > 0 && (
                <CommandGroup forceMount heading="Landing pages">
                  <HitItems hits={hits.pages} onOpen={go} />
                </CommandGroup>
              )}

              <CommandGroup heading="Create">
                {actions.map((action) => (
                  <CommandItem
                    key={action.id}
                    keywords={action.keywords}
                    onSelect={action.run}
                    value={action.label}
                  >
                    <Row icon={action.icon}>{action.label}</Row>
                  </CommandItem>
                ))}
              </CommandGroup>

              {[...MAIN_NAV, ...SETTINGS_NAV].map((group) => {
                const items = group.items.filter((item) =>
                  showsPath(item.href),
                );
                if (items.length === 0) return null;
                return (
                  <CommandGroup
                    heading={group.label ? `Go to · ${group.label}` : "Go to"}
                    key={group.id}
                  >
                    {items.map((item) => (
                      <CommandItem
                        key={item.href}
                        keywords={item.keywords}
                        onSelect={() => go(item.href)}
                        value={item.label}
                      >
                        <Row icon={item.icon}>{item.label}</Row>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })}

              {showHits && hits.docs.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup forceMount heading="Docs">
                    {hits.docs.map((doc) => (
                      <CommandItem
                        forceMount
                        key={doc.id}
                        onSelect={() => go(doc.url)}
                        value={`doc ${doc.url}`}
                      >
                        <Row>{doc.title}</Row>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}

              <CommandGroup heading="Help">
                {HELP_LINKS.map((link) => (
                  <CommandItem
                    key={link.id}
                    keywords={link.keywords}
                    onSelect={() => go(link.href)}
                    value={link.label}
                  >
                    <Row icon={link.icon}>{link.label}</Row>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
