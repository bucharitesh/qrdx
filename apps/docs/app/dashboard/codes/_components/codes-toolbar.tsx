"use client";

// The codes list's toolbar, in the shape of Dub's links page (github.com/
// dubinc/dub, AGPL-3.0: apps/web/ui/links/use-link-filters.tsx and
// link-display.tsx): Filter and Display on the left, a live search on the
// right, and the filters in use as removable chips below. Every filter lives
// in the URL (codesHref), so a filtered list can be linked and reloaded.

import { Tick, Close as X } from "@repo/design-system/components/icons";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/design-system/components/ui/alert-dialog";
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
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import {
  ArchiveBox,
  Category,
  Edit2,
  Filter,
  Global,
  Star1,
  Tag2,
  Trash as Trash2,
} from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { emptyQrCodeTrash } from "@/actions/bulk-codes";
import type { TagRow } from "@/app/dashboard/codes/_lib/organize";
import {
  CODE_SORT_LABELS,
  CODE_SORTS,
  type CodeSort,
  type CodesFilters,
  type CodesStatus,
  type CodeTypeFilter,
  codesHref,
  DEFAULT_DOMAIN_FILTER,
} from "@/app/dashboard/codes/_lib/organize-shared";
import { DisplayMenu, ListSearch } from "./display-menu";
import { TagDot } from "./tag-chip";
import { DeleteTagDialog, TagEditDialog } from "./tag-dialogs";
import { plural, useOrganizeAction } from "./use-organize-action";

const STATUS_LABELS: Record<CodesStatus, string> = {
  active: "Active",
  archived: "Archived",
  trash: "Trash",
};

const TYPE_LABELS: Record<CodeTypeFilter, string> = {
  link: "Website links",
  page: "Hosted pages",
};

export interface DomainFilterOptions {
  /** Host of the default short link, e.g. qrdx.dev */
  defaultHost: string;
  /** The workspace's verified custom domains */
  domains: { id: string; hostname: string }[];
}

/** Tag names and colors, each with Edit and Delete. */
function ManageTagsDialog({
  open,
  onOpenChange,
  tags,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tags: TagRow[];
}) {
  const [editing, setEditing] = useState<TagRow | null>(null);
  const [deleting, setDeleting] = useState<TagRow | null>(null);
  const router = useRouter();
  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tags</DialogTitle>
            <DialogDescription>
              Rename, recolor or delete tags. Deleting a tag keeps its codes.
            </DialogDescription>
          </DialogHeader>
          {tags.length === 0 ? (
            <p className="text-muted-foreground text-sm">No tags yet.</p>
          ) : (
            <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border">
              {tags.map((tag) => (
                <li className="flex items-center gap-2 px-3 py-2" key={tag.id}>
                  <TagDot color={tag.color} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {tag.name}
                  </span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {plural(tag.codeCount, "code")}
                  </span>
                  <Button
                    aria-label={`Edit ${tag.name}`}
                    className="size-7"
                    onClick={() => setEditing(tag)}
                    size="icon"
                    variant="ghost"
                  >
                    <Edit2 aria-hidden />
                  </Button>
                  <Button
                    aria-label={`Delete ${tag.name}`}
                    className="size-7"
                    onClick={() => setDeleting(tag)}
                    size="icon"
                    variant="ghost"
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
      <TagEditDialog
        onOpenChange={(next) => !next && setEditing(null)}
        onSaved={() => router.refresh()}
        open={editing !== null}
        tag={editing}
      />
      <DeleteTagDialog
        onDeleted={() => router.refresh()}
        onOpenChange={(next) => !next && setDeleting(null)}
        tag={deleting}
      />
    </>
  );
}

export function CodesToolbar({
  basePath,
  filters,
  tags,
  domains,
  trashCount,
}: {
  basePath: string;
  filters: CodesFilters;
  tags: TagRow[];
  domains: DomainFilterOptions;
  trashCount: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { run, isPending } = useOrganizeAction();
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [newTag, setNewTag] = useState(false);
  const [manageTags, setManageTags] = useState(false);
  const go = (patch: Partial<CodesFilters>, replace = false) =>
    startTransition(() => {
      const href = codesHref(basePath, filters, patch);
      if (replace) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    });

  const selectedTags = tags.filter((tag) => filters.tags.includes(tag.id));
  const domainName = (id: string) =>
    id === DEFAULT_DOMAIN_FILTER
      ? domains.defaultHost
      : (domains.domains.find((domain) => domain.id === id)?.hostname ?? id);
  const activeCount =
    (filters.status !== "active" ? 1 : 0) +
    (filters.favorites ? 1 : 0) +
    filters.tags.length +
    (filters.type ? 1 : 0) +
    (filters.domain ? 1 : 0);

  const emptyTrash = async () => {
    await run(() => emptyQrCodeTrash(), {
      success: ({ updated }) => `Deleted ${plural(updated, "code")} forever`,
    });
    setConfirmEmpty(false);
  };

  const chip = (
    key: string,
    label: React.ReactNode,
    clear: Partial<CodesFilters>,
  ) => (
    <Button
      className="h-7 rounded-full"
      key={key}
      onClick={() => go(clear)}
      size="sm"
      variant="secondary"
    >
      {label}
      <X aria-hidden />
      <span className="sr-only">Remove filter</span>
    </Button>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Filter aria-hidden />
                Filter
                {activeCount > 0 && (
                  <span className="bg-foreground text-background rounded-full px-1.5 text-[11px] leading-4 font-medium tabular-nums">
                    {activeCount}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <ArchiveBox aria-hidden />
                  Status
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    onValueChange={(value) =>
                      go({ status: value as CodesStatus })
                    }
                    value={filters.status}
                  >
                    {(Object.keys(STATUS_LABELS) as CodesStatus[]).map(
                      (status) => (
                        <DropdownMenuRadioItem key={status} value={status}>
                          {STATUS_LABELS[status]}
                          {status === "trash" && trashCount > 0 && (
                            <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                              {trashCount}
                            </span>
                          )}
                        </DropdownMenuRadioItem>
                      ),
                    )}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Tag2 aria-hidden />
                  Tags
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-80 w-56 overflow-y-auto">
                  {tags.length === 0 && (
                    <p className="text-muted-foreground px-2 py-1.5 text-xs">
                      No tags yet.
                    </p>
                  )}
                  {tags.map((tag) => (
                    <DropdownMenuCheckboxItem
                      checked={filters.tags.includes(tag.id)}
                      key={tag.id}
                      onCheckedChange={(on) =>
                        go({
                          tags: on
                            ? [...filters.tags, tag.id]
                            : filters.tags.filter((id) => id !== tag.id),
                        })
                      }
                      onSelect={(event) => event.preventDefault()}
                    >
                      <TagDot color={tag.color} />
                      <span className="truncate">{tag.name}</span>
                    </DropdownMenuCheckboxItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setNewTag(true)}>
                    New tag…
                  </DropdownMenuItem>
                  {tags.length > 0 && (
                    <DropdownMenuItem onSelect={() => setManageTags(true)}>
                      Edit tags…
                    </DropdownMenuItem>
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Category aria-hidden />
                  Type
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    onValueChange={(value) =>
                      go({
                        type:
                          value === "any" ? null : (value as CodeTypeFilter),
                      })
                    }
                    value={filters.type ?? "any"}
                  >
                    <DropdownMenuRadioItem value="any">
                      Any type
                    </DropdownMenuRadioItem>
                    {(Object.keys(TYPE_LABELS) as CodeTypeFilter[]).map(
                      (type) => (
                        <DropdownMenuRadioItem key={type} value={type}>
                          {TYPE_LABELS[type]}
                        </DropdownMenuRadioItem>
                      ),
                    )}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              {domains.domains.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Global aria-hidden />
                    Domain
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuRadioGroup
                      onValueChange={(value) =>
                        go({ domain: value === "any" ? null : value })
                      }
                      value={filters.domain ?? "any"}
                    >
                      <DropdownMenuRadioItem value="any">
                        Any domain
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value={DEFAULT_DOMAIN_FILTER}>
                        {domains.defaultHost}
                      </DropdownMenuRadioItem>
                      {domains.domains.map((domain) => (
                        <DropdownMenuRadioItem
                          key={domain.id}
                          value={domain.id}
                        >
                          {domain.hostname}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => go({ favorites: !filters.favorites })}
              >
                <Star1
                  aria-hidden
                  variant={filters.favorites ? "Bold" : "Linear"}
                />
                Favorites only
                {filters.favorites && (
                  <Tick aria-label="(on)" className="ml-auto size-4" />
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DisplayMenu
            sort={{
              value: filters.sort,
              options: CODE_SORTS.map((sort) => ({
                value: sort,
                label: CODE_SORT_LABELS[sort],
              })),
              onChange: (value) => go({ sort: value as CodeSort }),
            }}
          />
          {filters.status === "trash" && trashCount > 0 && (
            <Button
              disabled={isPending}
              onClick={() => setConfirmEmpty(true)}
              variant="outline"
            >
              <Trash2 aria-hidden />
              Empty trash
            </Button>
          )}
        </div>
        <ListSearch
          className="flex-1 sm:ml-auto sm:max-w-sm"
          label="Search codes"
          onSearch={(q) => go({ q }, true)}
          placeholder="Search title, link, notes or tags"
          value={filters.q}
        />
      </div>

      {activeCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          {filters.status !== "active" &&
            chip("status", STATUS_LABELS[filters.status], { status: "active" })}
          {filters.favorites && chip("fav", "Favorites", { favorites: false })}
          {selectedTags.map((tag) =>
            chip(
              tag.id,
              <>
                <TagDot color={tag.color} />
                {tag.name}
              </>,
              { tags: filters.tags.filter((id) => id !== tag.id) },
            ),
          )}
          {filters.type &&
            chip("type", TYPE_LABELS[filters.type], { type: null })}
          {filters.domain &&
            chip("domain", domainName(filters.domain), { domain: null })}
          {activeCount > 1 && (
            <Button
              className="text-muted-foreground h-7"
              onClick={() =>
                go({
                  status: "active",
                  favorites: false,
                  tags: [],
                  type: null,
                  domain: null,
                })
              }
              size="sm"
              variant="ghost"
            >
              Clear all
            </Button>
          )}
          {selectedTags.length > 1 && (
            <span className="text-muted-foreground text-xs">
              Codes with all of these tags
            </span>
          )}
        </div>
      )}

      <TagEditDialog
        onOpenChange={setNewTag}
        onSaved={() => router.refresh()}
        open={newTag}
      />
      <ManageTagsDialog
        onOpenChange={setManageTags}
        open={manageTags}
        tags={tags}
      />
      <AlertDialog onOpenChange={setConfirmEmpty} open={confirmEmpty}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Empty the trash?</AlertDialogTitle>
            <AlertDialogDescription>
              {plural(trashCount, "code")} and their scan history are deleted
              forever. Printed copies show a "QR code not found" page. This
              can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <Button
              disabled={isPending}
              onClick={emptyTrash}
              variant="destructive"
            >
              Empty trash
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
