"use client";

import { Close as X } from "@repo/design-system/components/icons";
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
import { Input } from "@repo/design-system/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { SearchNormal1 as Search, Trash as Trash2 } from "iconsax-reactjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { emptyQrCodeTrash } from "@/actions/bulk-codes";
import type { TagRow } from "@/app/dashboard/codes/_lib/organize";
import {
  CODE_SORT_LABELS,
  CODE_SORTS,
  type CodeSort,
  type CodesFilters,
  codesHref,
} from "@/app/dashboard/codes/_lib/organize-shared";
import { TagDot } from "./tag-chip";
import { plural, useOrganizeAction } from "./use-organize-action";

export function CodesToolbar({
  basePath,
  filters,
  tags,
  trashCount,
  children,
}: {
  basePath: string;
  filters: CodesFilters;
  tags: TagRow[];
  trashCount: number;
  /** Extra controls on the left (the mobile folders button) */
  children?: ReactNode;
}) {
  const router = useRouter();
  const { run, isPending } = useOrganizeAction();
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const selectedTags = tags.filter((tag) => filters.tags.includes(tag.id));

  const emptyTrash = async () => {
    await run(() => emptyQrCodeTrash(), {
      success: ({ updated }) => `Deleted ${plural(updated, "code")} forever`,
    });
    setConfirmEmpty(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex gap-2">{children}</div>
        <form
          action={basePath}
          className="flex min-w-0 flex-1 gap-2"
          method="get"
        >
          {filters.status !== "active" && (
            <input name="status" type="hidden" value={filters.status} />
          )}
          {filters.folder && (
            <input name="folder" type="hidden" value={filters.folder} />
          )}
          {filters.tags.length > 0 && (
            <input name="tags" type="hidden" value={filters.tags.join(",")} />
          )}
          {filters.favorites && <input name="fav" type="hidden" value="1" />}
          {filters.sort !== "newest" && (
            <input name="sort" type="hidden" value={filters.sort} />
          )}
          <div className="relative min-w-0 flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              aria-label="Search codes"
              className="pl-8"
              defaultValue={filters.q}
              key={filters.q}
              name="q"
              placeholder="Search title, URL, slug, notes or tags"
              type="search"
            />
          </div>
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <div className="flex gap-2">
          <Select
            onValueChange={(value) =>
              router.push(
                codesHref(basePath, filters, { sort: value as CodeSort }),
              )
            }
            value={filters.sort}
          >
            <SelectTrigger aria-label="Sort codes" className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {CODE_SORTS.map((sort) => (
                <SelectItem key={sort} value={sort}>
                  {CODE_SORT_LABELS[sort]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filters.status === "trash" && trashCount > 0 && (
            <Button
              disabled={isPending}
              onClick={() => setConfirmEmpty(true)}
              variant="outline"
            >
              <Trash2 />
              Empty trash
            </Button>
          )}
        </div>
      </div>

      {(selectedTags.length > 0 || filters.q) && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          {filters.q && (
            <Button
              asChild
              className="h-7 rounded-full"
              size="sm"
              variant="secondary"
            >
              <Link href={codesHref(basePath, filters, { q: "" })}>
                "{filters.q}"
                <X />
                <span className="sr-only">Clear search</span>
              </Link>
            </Button>
          )}
          {selectedTags.map((tag) => (
            <Button
              asChild
              className="h-7 rounded-full"
              key={tag.id}
              size="sm"
              variant="secondary"
            >
              <Link
                href={codesHref(basePath, filters, {
                  tags: filters.tags.filter((id) => id !== tag.id),
                })}
              >
                <TagDot color={tag.color} />
                {tag.name}
                <X />
                <span className="sr-only">Remove tag filter</span>
              </Link>
            </Button>
          ))}
          {selectedTags.length > 1 && (
            <span className="text-muted-foreground text-xs">
              Showing codes with all of these tags
            </span>
          )}
        </div>
      )}

      <AlertDialog onOpenChange={setConfirmEmpty} open={confirmEmpty}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Empty the trash?</AlertDialogTitle>
            <AlertDialogDescription>
              {plural(trashCount, "code")} and their scan history are deleted
              forever. Printed copies keep showing a "no longer active" page.
              This can't be undone.
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
