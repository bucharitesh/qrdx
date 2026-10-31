"use client";

import { Star } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/design-system/components/ui/sheet";
import { cn } from "@repo/design-system/lib/utils";
import {
  ArchiveBox as Archive,
  ArrowRight2 as ChevronRight,
  Folder2 as Folder,
  FolderOpen,
  FolderAdd as FolderPlus,
  Hierarchy as FolderTree,
  DirectInbox as Inbox,
  More as MoreHorizontal,
  Edit2 as Pencil,
  Add as Plus,
  ScanBarcode as QrCode,
  Trash as Trash2,
} from "iconsax-reactjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type DragEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { moveQrCodes, trashQrCodes } from "@/actions/bulk-codes";
import { moveCodeFolder } from "@/actions/folders";
import { tagQrCodes } from "@/actions/tags";
import type { TagRow } from "@/app/dashboard/codes/_lib/organize";
import {
  buildFolderTree,
  type CodesFilters,
  codesHref,
  type FolderNode,
  type FolderRow,
  folderPath,
  folderSubtreeIds,
  MAX_FOLDER_DEPTH,
} from "@/app/dashboard/codes/_lib/organize-shared";
import { DRAG_CODES, DRAG_FOLDER, draggedCodes, isDragOf } from "./drag";
import { DeleteFolderDialog, FolderNameDialog } from "./folder-dialogs";
import { formatNumber } from "./format";
import { TagDot } from "./tag-chip";
import { DeleteTagDialog, TagEditDialog } from "./tag-dialogs";
import { plural, useOrganizeAction } from "./use-organize-action";

interface SidebarProps {
  basePath: string;
  filters: CodesFilters;
  folders: FolderRow[];
  tags: TagRow[];
  /** Active codes in the scope */
  activeCount: number;
  trashCount: number;
  onNavigate?: () => void;
}

type DropTarget =
  | { kind: "folder"; folderId: string | null; name: string | null }
  | { kind: "tag"; tag: TagRow }
  | { kind: "trash" };

const itemClass = (active: boolean, over = false) =>
  cn(
    "group/item flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors",
    active
      ? "bg-accent text-accent-foreground font-medium"
      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
    over && "bg-primary/10 text-foreground ring-primary ring-1",
  );

function SectionHeader({
  title,
  action,
  dropProps,
  over,
}: {
  title: string;
  action?: ReactNode;
  dropProps?: Record<string, unknown>;
  over?: boolean;
}) {
  return (
    <div
      className={cn(
        "mt-4 mb-1 flex h-7 items-center justify-between rounded-md px-2",
        over && "bg-primary/10 ring-primary ring-1",
      )}
      {...dropProps}
    >
      <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {title}
      </span>
      {action}
    </div>
  );
}

export function CodesSidebar({
  basePath,
  filters,
  folders,
  tags,
  activeCount,
  trashCount,
  onNavigate,
}: SidebarProps) {
  const router = useRouter();
  const { run } = useOrganizeAction();
  const tree = useMemo(() => buildFolderTree(folders), [folders]);
  const [over, setOver] = useState<string | null>(null);
  const [nameDialog, setNameDialog] = useState<
    | { type: "create"; parent: FolderRow | null }
    | { type: "rename"; folder: FolderRow }
    | null
  >(null);
  const [deleting, setDeleting] = useState<FolderRow | null>(null);
  const [tagDialog, setTagDialog] = useState<TagRow | "new" | null>(null);
  const [deletingTag, setDeletingTag] = useState<TagRow | null>(null);

  // The open folder's ancestors start expanded.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!filters.folder || filters.folder === "none") return;
    const ancestors = folderPath(folders, filters.folder).map((row) => row.id);
    setExpanded((current) => new Set([...current, ...ancestors]));
  }, [filters.folder, folders]);

  const href = (patch: Partial<CodesFilters>) =>
    codesHref(basePath, filters, patch);
  const folderHref = (folderId: string) =>
    href({
      folder: folderId,
      favorites: false,
      status: filters.status === "archived" ? "archived" : "active",
    });
  const isAllView =
    filters.status === "active" && !filters.folder && !filters.favorites;

  const drop = async (target: DropTarget, event: DragEvent) => {
    event.preventDefault();
    setOver(null);
    if (isDragOf(event, DRAG_FOLDER)) {
      if (target.kind !== "folder") return;
      const id = event.dataTransfer.getData(DRAG_FOLDER);
      if (!id || id === target.folderId) return;
      if (
        target.folderId &&
        folderSubtreeIds(folders, id).has(target.folderId)
      ) {
        return;
      }
      await run(() => moveCodeFolder({ id, parentId: target.folderId }), {
        success: target.name
          ? `Moved into "${target.name}"`
          : "Moved to the top level",
      });
      return;
    }
    const ids = draggedCodes(event);
    if (!ids || ids.length === 0) return;
    if (target.kind === "folder") {
      await run(() => moveQrCodes({ ids, folderId: target.folderId }), {
        success: ({ updated }) =>
          `Moved ${plural(updated, "code")} to ${target.name ? `"${target.name}"` : "no folder"}`,
      });
    } else if (target.kind === "tag") {
      await run(() => tagQrCodes({ ids, add: [target.tag.id] }), {
        success: ({ updated }) =>
          `Tagged ${plural(updated, "code")} "${target.tag.name}"`,
      });
    } else {
      await run(() => trashQrCodes({ ids }), {
        success: ({ updated }) =>
          updated > 0 ? `Moved ${plural(updated, "code")} to trash` : null,
      });
    }
  };

  const dropProps = (key: string, target: DropTarget, accepts: string[]) => ({
    onDragOver: (event: DragEvent) => {
      if (!accepts.some((type) => isDragOf(event, type))) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (over !== key) setOver(key);
    },
    onDragLeave: (event: DragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        setOver((current) => (current === key ? null : current));
      }
    },
    onDrop: (event: DragEvent) => drop(target, event),
  });

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderFolder = (node: FolderNode): ReactNode => {
    const active = filters.folder === node.id;
    const open = expanded.has(node.id);
    const key = `folder:${node.id}`;
    return (
      <li key={node.id}>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: drag and drop is a mouse shortcut; the folder menu and "Move to folder" cover keyboard and touch */}
        <div
          className={cn(itemClass(active, over === key), "pr-1")}
          draggable
          onDragStart={(event) => {
            event.stopPropagation();
            event.dataTransfer.setData(DRAG_FOLDER, node.id);
            event.dataTransfer.effectAllowed = "move";
          }}
          style={{ paddingLeft: `${0.25 + node.depth * 0.75}rem` }}
          {...dropProps(
            key,
            { kind: "folder", folderId: node.id, name: node.name },
            [DRAG_CODES, DRAG_FOLDER],
          )}
        >
          <button
            aria-expanded={node.children.length > 0 ? open : undefined}
            aria-label={open ? `Collapse ${node.name}` : `Expand ${node.name}`}
            className={cn(
              "hover:bg-accent flex size-5 shrink-0 items-center justify-center rounded-sm",
              node.children.length === 0 && "invisible",
            )}
            onClick={() => toggle(node.id)}
            tabIndex={node.children.length === 0 ? -1 : 0}
            type="button"
          >
            <ChevronRight
              className={cn(
                "size-3.5 transition-transform",
                open && "rotate-90",
              )}
            />
          </button>
          <Link
            className="flex min-w-0 flex-1 items-center gap-2"
            draggable={false}
            href={folderHref(node.id)}
            onClick={onNavigate}
          >
            {active ? (
              <FolderOpen className="size-4 shrink-0" />
            ) : (
              <Folder className="size-4 shrink-0" />
            )}
            <span className="truncate">{node.name}</span>
          </Link>
          <span className="text-muted-foreground text-xs tabular-nums group-hover/item:hidden group-focus-within/item:hidden">
            {node.codeCount > 0 ? formatNumber(node.codeCount) : ""}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={`${node.name} folder actions`}
                className="hidden size-6 group-hover/item:flex group-focus-within/item:flex data-[state=open]:flex"
                size="icon-sm"
                variant="ghost"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem
                disabled={node.depth + 1 >= MAX_FOLDER_DEPTH}
                onSelect={() => setNameDialog({ type: "create", parent: node })}
              >
                <FolderPlus /> New subfolder
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setNameDialog({ type: "rename", folder: node })}
              >
                <Pencil /> Rename
              </DropdownMenuItem>
              {node.parentId && (
                <DropdownMenuItem
                  onSelect={() =>
                    run(() => moveCodeFolder({ id: node.id, parentId: null }), {
                      success: "Moved to the top level",
                    })
                  }
                >
                  <FolderTree /> Move to top level
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setDeleting(node)}
                variant="destructive"
              >
                <Trash2 /> Delete folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {open && node.children.length > 0 && (
          <ul>{node.children.map(renderFolder)}</ul>
        )}
      </li>
    );
  };

  const deletingParent = deleting?.parentId
    ? (folders.find((row) => row.id === deleting.parentId)?.name ?? null)
    : null;

  return (
    <nav aria-label="Folders and tags" className="text-sm">
      <ul className="space-y-0.5">
        <li>
          <Link
            className={itemClass(isAllView)}
            href={href({ status: "active", folder: null, favorites: false })}
            onClick={onNavigate}
          >
            <QrCode className="size-4 shrink-0" />
            <span className="flex-1 truncate">All codes</span>
            <span className="text-xs tabular-nums">
              {formatNumber(activeCount)}
            </span>
          </Link>
        </li>
        <li>
          <Link
            className={itemClass(filters.favorites)}
            href={href({
              favorites: !filters.favorites,
              status: filters.status === "trash" ? "active" : filters.status,
            })}
            onClick={onNavigate}
          >
            <Star className="size-4 shrink-0" />
            <span className="flex-1 truncate">Favorites</span>
          </Link>
        </li>
        <li
          {...dropProps(
            "folder:none",
            { kind: "folder", folderId: null, name: null },
            [DRAG_CODES],
          )}
        >
          <Link
            className={itemClass(
              filters.folder === "none",
              over === "folder:none",
            )}
            href={href({
              folder: "none",
              favorites: false,
              status: filters.status === "trash" ? "active" : filters.status,
            })}
            onClick={onNavigate}
          >
            <Inbox className="size-4 shrink-0" />
            <span className="flex-1 truncate">Not in a folder</span>
          </Link>
        </li>
      </ul>

      <SectionHeader
        action={
          <Button
            aria-label="New folder"
            className="size-6"
            onClick={() => setNameDialog({ type: "create", parent: null })}
            size="icon-sm"
            variant="ghost"
          >
            <Plus />
          </Button>
        }
        dropProps={dropProps(
          "folders:root",
          { kind: "folder", folderId: null, name: null },
          [DRAG_FOLDER],
        )}
        over={over === "folders:root"}
        title="Folders"
      />
      {tree.length === 0 ? (
        <p className="text-muted-foreground px-2 py-1 text-xs">
          Group codes by client, campaign or location. Drag codes onto a folder
          to move them.
        </p>
      ) : (
        <ul className="space-y-0.5">{tree.map(renderFolder)}</ul>
      )}

      <SectionHeader
        action={
          <Button
            aria-label="New tag"
            className="size-6"
            onClick={() => setTagDialog("new")}
            size="icon-sm"
            variant="ghost"
          >
            <Plus />
          </Button>
        }
        title="Tags"
      />
      {tags.length === 0 ? (
        <p className="text-muted-foreground px-2 py-1 text-xs">
          Label codes across folders, then filter by one or more tags.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {tags.map((tag) => {
            const active = filters.tags.includes(tag.id);
            const key = `tag:${tag.id}`;
            return (
              <li
                key={tag.id}
                {...dropProps(key, { kind: "tag", tag }, [DRAG_CODES])}
              >
                <div className={cn(itemClass(active, over === key), "pr-1")}>
                  <Link
                    aria-pressed={active}
                    className="flex min-w-0 flex-1 items-center gap-2"
                    href={href({
                      tags: active
                        ? filters.tags.filter((id) => id !== tag.id)
                        : [...filters.tags, tag.id],
                    })}
                    onClick={onNavigate}
                  >
                    <TagDot className="mx-1" color={tag.color} />
                    <span className="truncate">{tag.name}</span>
                  </Link>
                  <span className="text-muted-foreground text-xs tabular-nums group-hover/item:hidden group-focus-within/item:hidden">
                    {tag.codeCount > 0 ? formatNumber(tag.codeCount) : ""}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        aria-label={`${tag.name} tag actions`}
                        className="hidden size-6 group-hover/item:flex group-focus-within/item:flex data-[state=open]:flex"
                        size="icon-sm"
                        variant="ghost"
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-44">
                      <DropdownMenuItem onSelect={() => setTagDialog(tag)}>
                        <Pencil /> Edit tag
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setDeletingTag(tag)}
                        variant="destructive"
                      >
                        <Trash2 /> Delete tag
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ul className="mt-4 space-y-0.5 border-t pt-3">
        <li>
          <Link
            className={itemClass(filters.status === "archived")}
            href={href({ status: "archived", favorites: false })}
            onClick={onNavigate}
          >
            <Archive className="size-4 shrink-0" />
            <span className="flex-1 truncate">Archived</span>
          </Link>
        </li>
        <li {...dropProps("trash", { kind: "trash" }, [DRAG_CODES])}>
          <Link
            className={itemClass(filters.status === "trash", over === "trash")}
            href={href({
              status: "trash",
              folder: null,
              favorites: false,
              tags: [],
            })}
            onClick={onNavigate}
          >
            <Trash2 className="size-4 shrink-0" />
            <span className="flex-1 truncate">Trash</span>
            {trashCount > 0 && (
              <span className="text-xs tabular-nums">
                {formatNumber(trashCount)}
              </span>
            )}
          </Link>
        </li>
      </ul>

      <FolderNameDialog
        mode={nameDialog}
        onCreated={(folder) => {
          if (folder.parentId) {
            setExpanded(
              (current) => new Set([...current, folder.parentId as string]),
            );
          }
        }}
        onOpenChange={(open) => {
          if (!open) setNameDialog(null);
        }}
      />
      <DeleteFolderDialog
        folder={deleting}
        onDeleted={(parentId) => {
          if (deleting && filters.folder === deleting.id) {
            router.push(href({ folder: parentId }));
          }
        }}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        parentName={deletingParent}
      />
      <TagEditDialog
        onOpenChange={(open) => {
          if (!open) setTagDialog(null);
        }}
        open={tagDialog !== null}
        tag={tagDialog === "new" ? null : tagDialog}
      />
      <DeleteTagDialog
        onDeleted={() => {
          if (deletingTag && filters.tags.includes(deletingTag.id)) {
            router.push(
              href({
                tags: filters.tags.filter((id) => id !== deletingTag.id),
              }),
            );
          }
        }}
        onOpenChange={(open) => {
          if (!open) setDeletingTag(null);
        }}
        tag={deletingTag}
      />
    </nav>
  );
}

/** The sidebar in a sheet, for screens without room for it. */
export function CodesSidebarSheet(props: Omit<SidebarProps, "onNavigate">) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger asChild>
        <Button className="xl:hidden" size="sm" variant="outline">
          <FolderTree />
          Folders &amp; tags
        </Button>
      </SheetTrigger>
      <SheetContent className="w-80 overflow-y-auto p-4" side="left">
        <SheetHeader className="p-0">
          <SheetTitle>Folders &amp; tags</SheetTitle>
          <SheetDescription className="sr-only">
            Filter your codes by folder, tag or status.
          </SheetDescription>
        </SheetHeader>
        <CodesSidebar {...props} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
