"use client";

import {
  Spinner as Loader2,
  Close as X,
} from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Input } from "@repo/design-system/components/ui/input";
import { ScrollArea } from "@repo/design-system/components/ui/scroll-area";
import {
  ArrowLeft2,
  ArrowRight2,
  Document,
  DocumentText,
  Folder2,
  Gallery,
  Note,
  SearchNormal1 as Search,
  VideoSquare,
} from "iconsax-reactjs";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { PickerItem, PickerPage } from "../capabilities/file-picker";

export interface CloudFilePickerLoadOptions {
  folderId?: string;
  search?: string;
  cursor?: string;
}

export interface CloudFilePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerName: string;
  /** Logo shown next to the title (a local image path). */
  logoSrc?: string;
  description?: string;
  searchPlaceholder?: string;
  /** Shown when the list is empty and nothing is searched. */
  emptyHint?: string;
  load: (options: CloudFilePickerLoadOptions) => Promise<PickerPage>;
  /** Resolves when the pick is done (the dialog then closes); throw to show an error. */
  onPick: (item: PickerItem) => Promise<void>;
  /** Folders get a "Use folder" button next to opening them. */
  allowFolderPick?: boolean;
}

const IMAGE = /\.(png|jpe?g|gif|webp|svg|heic|avif)$/i;
const VIDEO = /\.(mp4|mov|m4v|webm)$/i;
const TEXT = /\.(pdf|docx?|txt|rtf|pages|md)$/i;

function ItemIcon({ item }: { item: PickerItem }) {
  if (item.emoji) {
    return (
      <span aria-hidden className="grid size-5 shrink-0 place-items-center">
        {item.emoji}
      </span>
    );
  }
  const Icon =
    item.kind === "folder"
      ? Folder2
      : item.kind === "page"
        ? Note
        : item.mimeType?.startsWith("image/") || IMAGE.test(item.name)
          ? Gallery
          : item.mimeType?.startsWith("video/") || VIDEO.test(item.name)
            ? VideoSquare
            : TEXT.test(item.name) || item.mimeType === "application/pdf"
              ? DocumentText
              : Document;
  return (
    <Icon
      aria-hidden
      className="size-5 shrink-0 text-muted-foreground"
      variant={item.kind === "folder" ? "Bulk" : "Linear"}
    />
  );
}

function formatSize(bytes?: number): string | null {
  if (bytes === undefined) return null;
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

function formatDate(iso?: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

interface Crumb {
  id?: string;
  name: string;
}

/**
 * Browse-and-pick dialog shared by Dropbox, OneDrive, Box and Notion.
 * Arrow keys move through the list, Enter opens a folder or picks a file,
 * Backspace (outside the search box) goes up a folder.
 */
export function CloudFilePicker({
  open,
  onOpenChange,
  providerName,
  logoSrc,
  description,
  searchPlaceholder = "Search",
  emptyHint,
  load,
  onPick,
  allowFolderPick = false,
}: CloudFilePickerProps) {
  const [items, setItems] = useState<PickerItem[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [trail, setTrail] = useState<Crumb[]>([{ name: providerName }]);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const requestId = useRef(0);

  const folder = trail.at(-1);

  const fetchPage = useCallback(
    async (options: CloudFilePickerLoadOptions, append: boolean) => {
      const id = ++requestId.current;
      setLoading(true);
      setError(null);
      try {
        const page = await load(options);
        if (id !== requestId.current) return;
        setItems((current) =>
          append ? [...current, ...page.items] : page.items
        );
        setCursor(page.nextCursor);
      } catch (err) {
        if (id !== requestId.current) return;
        setError(
          err instanceof Error ? err.message : `Couldn't load ${providerName}`
        );
        if (!append) setItems([]);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [load, providerName]
  );

  // Fresh state every time the dialog opens
  useEffect(() => {
    if (!open) return;
    setTrail([{ name: providerName }]);
    setSearchTerm("");
    setActiveSearch("");
    setPickingId(null);
    fetchPage({}, false);
  }, [open, providerName, fetchPage]);

  const openFolder = (item: PickerItem) => {
    setActiveSearch("");
    setSearchTerm("");
    setTrail((current) => [...current, { id: item.id, name: item.name }]);
    fetchPage({ folderId: item.id }, false);
  };

  const goTo = (index: number) => {
    const next = trail.slice(0, index + 1);
    setTrail(next);
    setActiveSearch("");
    fetchPage({ folderId: next.at(-1)?.id }, false);
  };

  const runSearch = (term: string) => {
    const trimmed = term.trim();
    setActiveSearch(trimmed);
    fetchPage(trimmed ? { search: trimmed } : { folderId: folder?.id }, false);
  };

  const pick = async (item: PickerItem) => {
    setPickingId(item.id);
    setError(null);
    try {
      await onPick(item);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't use that item");
    } finally {
      setPickingId(null);
    }
  };

  const activate = (item: PickerItem) => {
    if (pickingId) return;
    if (item.kind === "folder") openFolder(item);
    else pick(item);
  };

  const rows = () =>
    Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>(
        "[data-picker-row]"
      ) ?? []
    );

  const onRowKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const all = rows();
    const index = all.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      all[Math.min(all.length - 1, Math.max(0, index + delta))]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      all[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      all.at(-1)?.focus();
    } else if (event.key === "Backspace" && !activeSearch && trail.length > 1) {
      event.preventDefault();
      goTo(trail.length - 2);
    }
  };

  const searching = Boolean(activeSearch);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[85vh] gap-4 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            {logoSrc && (
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white p-1 ring-1 ring-black/5 dark:ring-white/10">
                <img
                  alt=""
                  className="size-full object-contain"
                  src={logoSrc}
                />
              </span>
            )}
            Pick from {providerName}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            runSearch(searchTerm);
          }}
        >
          <div className="relative flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label={`Search ${providerName}`}
              className="pr-9 pl-9"
              onChange={(event) => setSearchTerm(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  rows()[0]?.focus();
                }
              }}
              placeholder={searchPlaceholder}
              value={searchTerm}
            />
            {searchTerm && (
              <button
                aria-label="Clear search"
                className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setSearchTerm("");
                  if (activeSearch) runSearch("");
                }}
                type="button"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <Button disabled={loading} type="submit" variant="outline">
            Search
          </Button>
        </form>

        <nav
          aria-label="Folder"
          className="flex min-h-6 flex-wrap items-center gap-1 text-muted-foreground text-xs"
        >
          {searching ? (
            <span>
              Results for{" "}
              <span className="font-medium text-foreground">
                “{activeSearch}”
              </span>
            </span>
          ) : (
            trail.map((crumb, index) => (
              <span
                className="flex items-center gap-1"
                key={crumb.id ?? "root"}
              >
                {index > 0 && <ArrowRight2 aria-hidden className="size-3" />}
                {index === trail.length - 1 ? (
                  <span
                    aria-current="page"
                    className="font-medium text-foreground"
                  >
                    {crumb.name}
                  </span>
                ) : (
                  <button
                    className="rounded-sm hover:text-foreground hover:underline"
                    onClick={() => goTo(index)}
                    type="button"
                  >
                    {crumb.name}
                  </button>
                )}
              </span>
            ))
          )}
        </nav>

        {error && (
          <div
            className="rounded-md bg-destructive/10 p-3 text-destructive text-sm"
            role="alert"
          >
            {error}
          </div>
        )}

        <ScrollArea className="h-[360px] rounded-md border">
          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1 p-8 text-center">
              <Folder2
                aria-hidden
                className="mb-3 size-10 text-muted-foreground"
                variant="Bulk"
              />
              <p className="font-medium text-sm">
                {searching ? "Nothing matches" : "Nothing here yet"}
              </p>
              <p className="max-w-sm text-pretty text-muted-foreground text-xs">
                {searching
                  ? "Try a different search term."
                  : (emptyHint ?? `This ${providerName} folder is empty.`)}
              </p>
            </div>
          ) : (
            <ul
              aria-label={`${providerName} items`}
              className="flex flex-col p-1.5"
              ref={listRef}
            >
              {!searching && trail.length > 1 && (
                <li>
                  <button
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-muted-foreground text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    data-picker-row
                    onClick={() => goTo(trail.length - 2)}
                    onKeyDown={onRowKeyDown}
                    type="button"
                  >
                    <ArrowLeft2 aria-hidden className="size-5 shrink-0" />
                    Back to {trail.at(-2)?.name}
                  </button>
                </li>
              )}
              {items.map((item) => {
                const meta = [
                  searching ? item.path : null,
                  item.kind === "file" ? formatSize(item.size) : null,
                  formatDate(item.modifiedAt),
                ].filter(Boolean);
                const busy = pickingId === item.id;
                return (
                  <li
                    className="group flex items-center gap-1 rounded-md focus-within:bg-accent hover:bg-accent"
                    key={item.id}
                  >
                    <button
                      aria-label={
                        item.kind === "folder"
                          ? `Open folder ${item.name}`
                          : `Use ${item.name}`
                      }
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-3 py-2 text-left focus-visible:outline-none disabled:opacity-60"
                      data-picker-row
                      disabled={Boolean(pickingId) && !busy}
                      onClick={() => activate(item)}
                      onKeyDown={onRowKeyDown}
                      type="button"
                    >
                      <ItemIcon item={item} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">
                          {item.name}
                        </span>
                        {meta.length > 0 && (
                          <span className="block truncate text-muted-foreground text-xs">
                            {meta.join(" · ")}
                          </span>
                        )}
                      </span>
                      {busy ? (
                        <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                      ) : item.kind === "folder" ? (
                        <ArrowRight2
                          aria-hidden
                          className="size-4 shrink-0 text-muted-foreground"
                        />
                      ) : null}
                    </button>
                    {allowFolderPick && item.kind === "folder" && (
                      <Button
                        className="mr-1.5 shrink-0"
                        disabled={Boolean(pickingId)}
                        onClick={() => pick(item)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Use folder
                      </Button>
                    )}
                  </li>
                );
              })}
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
                      folderId: activeSearch ? undefined : folder?.id,
                    },
                    true
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
        </ScrollArea>

        <p className="text-muted-foreground text-xs">
          Use ↑ ↓ to move, Enter to open or pick
          {trail.length > 1 && !searching ? ", Backspace to go back" : ""}.
        </p>
      </DialogContent>
    </Dialog>
  );
}
