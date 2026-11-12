"use client";
import { useTranslations } from "next-intl";

// The Barcodes grid: a card per saved barcode with its picture, a menu
// (edit, download in every format, duplicate, copy the image URL, move to a
// folder, trash), and selection with a bulk toolbar, using the same keys as
// the codes and pages lists (_components/list-selection.tsx).

import { toast } from "@repo/design-system";
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
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { cn } from "@repo/design-system/lib/utils";
import {
  Copy,
  DocumentDownload,
  Edit2,
  Folder2,
  FolderMinus,
  FolderOpen,
  Link21,
  More,
  RotateLeft,
  Trash,
} from "iconsax-reactjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  type BarcodeActionResult,
  duplicateSavedBarcode,
  emptySavedBarcodeTrash,
  moveSavedBarcodes,
  purgeSavedBarcodes,
  restoreSavedBarcodes,
  trashSavedBarcodes,
} from "@/actions/barcodes";
import {
  LIST_ROW_FOCUS,
  type ListSelectionApi,
  ListShortcuts,
  SelectionStatus,
  useListSelection,
} from "@/app/(app)/dashboard/_components/list-selection";
import {
  BULK_KEYS,
  type BulkAction,
  keyLabel,
} from "@/app/(app)/dashboard/_lib/list-keys";
import { formatDate } from "@/app/(app)/dashboard/codes/_components/format";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { useCan } from "@/components/workspace-provider";
import { track } from "@/lib/analytics";
import { BARCODE_FILE_TYPES, BARCODE_FILES } from "@/lib/barcode/files";
import type { BarcodeStatus } from "@/lib/barcodes/schema";
import { soundEvent } from "@/lib/sound/emit";
import type { BarcodeCard, FolderOption } from "../_lib/filters";

const plural = (count: number) =>
  `${count} ${count === 1 ? "barcode" : "barcodes"}`;

interface ListContextValue {
  selection: ListSelectionApi;
  selectable: ReadonlySet<string>;
}

const ListContext = createContext<ListContextValue | null>(null);
const useList = () => {
  const value = useContext(ListContext);
  if (!value) throw new Error("Use inside BarcodesList");
  return value;
};

/** Runs an action, toasts its result and refreshes the list. */
function useRunner() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = <T,>(
    action: () => Promise<BarcodeActionResult<T>>,
    done: (data: T) => string | null,
  ) =>
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        soundEvent("error");
        toast.error(result.error.message);
        return;
      }
      const message = done(result.data);
      if (message) toast.success(message);
      router.refresh();
    });
  return { run, pending };
}

function FolderItems({
  folders,
  current,
  onPick,
}: {
  folders: FolderOption[];
  current?: string | null;
  onPick: (folderId: string | null) => void;
}) {
  const t = useTranslations("app.dashboard.barcodes.barcodesList");
  return (
    <>
      <DropdownMenuItem
        disabled={current === null}
        onSelect={() => onPick(null)}
      >
        <FolderMinus aria-hidden />
        {t("noFolder")}
      </DropdownMenuItem>
      {folders.length > 0 && <DropdownMenuSeparator />}
      {folders.map((folder) => (
        <DropdownMenuItem
          disabled={current === folder.id}
          key={folder.id}
          onSelect={() => onPick(folder.id)}
          style={{ paddingLeft: `${0.5 + folder.depth * 0.75}rem` }}
        >
          <Folder2 aria-hidden />
          <span className="truncate">{folder.name}</span>
        </DropdownMenuItem>
      ))}
      {folders.length === 0 && (
        <DropdownMenuLabel className="text-muted-foreground max-w-56 text-xs font-normal">
          {t("makeFoldersUnderCodesBarcodes")}
        </DropdownMenuLabel>
      )}
    </>
  );
}

export function BarcodesList({
  basePath,
  cards,
  folders,
  status,
  keyboardShortcuts,
}: {
  basePath: string;
  cards: BarcodeCard[];
  folders: FolderOption[];
  status: BarcodeStatus;
  keyboardShortcuts: boolean;
}) {
  const t = useTranslations("app.dashboard.barcodes.barcodesList");
  const canWrite = useCan("content.write");
  const listRef = useRef<HTMLDivElement>(null);
  const [confirm, setConfirm] = useState<"purge" | "empty" | null>(null);
  const { run, pending } = useRunner();
  const inTrash = status === "trash";

  const rows = useMemo(() => cards.map((card) => card.id), [cards]);
  const order = useMemo(
    () =>
      canWrite
        ? cards
            .filter((card) => (inTrash ? card.canDelete : true))
            .map((card) => card.id)
        : [],
    [cards, canWrite, inTrash],
  );
  const selectable = useMemo(() => new Set(order), [order]);
  const keyActions = useRef<Partial<Record<BulkAction, () => void>>>({});
  const selection = useListSelection({
    order,
    rows,
    listRef,
    keyboardShortcuts,
    actionsRef: keyActions,
  });
  const { count, selectedIds, clear } = selection;

  const trash = (ids: string[]) =>
    run(
      () => trashSavedBarcodes({ ids }),
      ({ updated, skipped }) => {
        clear();
        return skipped > 0
          ? `Moved ${plural(updated)} to the trash. ${skipped} made by others stayed: only owners and admins can delete them.`
          : `Moved ${plural(updated)} to the trash`;
      },
    );
  const restore = (ids: string[]) =>
    run(
      () => restoreSavedBarcodes({ ids }),
      ({ updated }) => {
        clear();
        return `Restored ${plural(updated)}`;
      },
    );
  const move = (ids: string[], folderId: string | null) =>
    run(
      () => moveSavedBarcodes({ ids, folderId }),
      ({ updated }) => {
        clear();
        const name = folders.find((row) => row.id === folderId)?.name;
        return name
          ? `Moved ${plural(updated)} to ${name}`
          : `Took ${plural(updated)} out of folders`;
      },
    );
  const purge = (ids: string[]) =>
    run(
      () => purgeSavedBarcodes({ ids }),
      ({ updated }) => {
        clear();
        setConfirm(null);
        return `Deleted ${plural(updated)} for good`;
      },
    );
  const emptyTrash = () =>
    run(
      () => emptySavedBarcodeTrash(),
      ({ updated }) => {
        clear();
        setConfirm(null);
        return `Deleted ${plural(updated)} for good`;
      },
    );

  keyActions.current =
    !canWrite || pending
      ? {}
      : inTrash
        ? {
            restore: () => restore(selectedIds),
            trash: () => setConfirm("purge"),
          }
        : {
            trash: () => trash(selectedIds),
          };

  return (
    <ListContext.Provider value={{ selection, selectable }}>
      <div className="space-y-3" ref={listRef}>
        <SelectionStatus count={count} noun={["barcode", "barcodes"]} />
        {inTrash && canWrite && count === 0 && (
          <div className="flex justify-end">
            <Button
              disabled={pending}
              onClick={() => setConfirm("empty")}
              size="sm"
              variant="outline"
            >
              <Trash aria-hidden />
              {t("emptyTrash")}
            </Button>
          </div>
        )}
        {count > 0 && (
          <div
            aria-label={t("bulkActions")}
            className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-2 z-10 flex flex-wrap items-center gap-1 rounded-lg border p-1.5 shadow-sm backdrop-blur"
            role="toolbar"
          >
            <span className="px-2 text-sm font-medium tabular-nums">
              {t("countSelected", { count })}
            </span>
            <TooltipWrapper kbd="Esc" label={t("clearSelection")}>
              <Button
                aria-label={t("clearSelection")}
                onClick={clear}
                size="icon-sm"
                variant="ghost"
              >
                <X />
              </Button>
            </TooltipWrapper>
            <div className="bg-border mx-1 h-5 w-px" />
            {inTrash ? (
              <>
                <TooltipWrapper
                  kbd={keyLabel(BULK_KEYS.restore)}
                  label={t("restore")}
                >
                  <Button
                    disabled={pending}
                    onClick={() => restore(selectedIds)}
                    size="sm"
                    variant="ghost"
                  >
                    <RotateLeft aria-hidden />
                    {t("restore")}
                  </Button>
                </TooltipWrapper>
                <TooltipWrapper
                  kbd={keyLabel(BULK_KEYS.trash)}
                  label={t("deleteForGood")}
                >
                  <Button
                    disabled={pending}
                    onClick={() => setConfirm("purge")}
                    size="sm"
                    variant="ghost"
                  >
                    <Trash aria-hidden />
                    {t("deleteForGood")}
                  </Button>
                </TooltipWrapper>
              </>
            ) : (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button disabled={pending} size="sm" variant="ghost">
                      <FolderOpen aria-hidden />
                      {t("moveToFolder")}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-60">
                    <FolderItems
                      folders={folders}
                      onPick={(folderId) => move(selectedIds, folderId)}
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
                <TooltipWrapper
                  kbd={keyLabel(BULK_KEYS.trash)}
                  label={t("delete")}
                >
                  <Button
                    disabled={pending}
                    onClick={() => trash(selectedIds)}
                    size="sm"
                    variant="ghost"
                  >
                    <Trash aria-hidden />
                    {t("delete")}
                  </Button>
                </TooltipWrapper>
              </>
            )}
            {keyboardShortcuts && (
              <div className="ml-auto">
                <ListShortcuts
                  actions={
                    inTrash
                      ? [
                          {
                            label: t("restore"),
                            keys: [keyLabel(BULK_KEYS.restore)],
                          },
                          {
                            label: t("deleteForGood"),
                            keys: [keyLabel(BULK_KEYS.trash)],
                          },
                        ]
                      : [
                          {
                            label: t("delete"),
                            keys: [keyLabel(BULK_KEYS.trash)],
                          },
                        ]
                  }
                />
              </div>
            )}
          </div>
        )}

        <ul
          aria-label={t("barcodes")}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
        >
          {cards.map((card) => (
            <BarcodeCardItem
              basePath={basePath}
              card={card}
              folders={folders}
              key={card.id}
              onMove={(folderId) => move([card.id], folderId)}
              onPurge={() => {
                selection.clear();
                selection.setMany([card.id], true);
                setConfirm("purge");
              }}
              onRestore={() => restore([card.id])}
              onTrash={() => trash([card.id])}
              pending={pending}
            />
          ))}
        </ul>
      </div>

      <AlertDialog
        onOpenChange={(open) => !open && setConfirm(null)}
        open={confirm !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "empty"
                ? t("emptyTheTrash")
                : t("deleteValueForGood", { value: plural(count) })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("printedCopiesKeepWorkingBarcodes")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              {t("cancel")}
            </AlertDialogCancel>
            <Button
              disabled={pending}
              onClick={() =>
                confirm === "empty" ? emptyTrash() : purge(selectedIds)
              }
              variant="destructive"
            >
              {pending
                ? t("deleting")
                : confirm === "empty"
                  ? t("emptyTrash")
                  : t("deleteForGood")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ListContext.Provider>
  );
}

function BarcodeCardItem({
  basePath,
  card,
  folders,
  pending,
  onTrash,
  onRestore,
  onPurge,
  onMove,
}: {
  basePath: string;
  card: BarcodeCard;
  folders: FolderOption[];
  pending: boolean;
  onTrash: () => void;
  onRestore: () => void;
  onPurge: () => void;
  onMove: (folderId: string | null) => void;
}) {
  const t = useTranslations("app.dashboard.barcodes.barcodesList");
  const { selection, selectable } = useList();
  const canWrite = useCan("content.write");
  const router = useRouter();
  const { run } = useRunner();
  const selected = selection.isSelected(card.id);
  const href = `${basePath}/${encodeURIComponent(card.id)}`;

  const duplicate = () =>
    run(
      () => duplicateSavedBarcode({ id: card.id }),
      (saved) => {
        router.push(`${basePath}/${encodeURIComponent(saved.id)}`);
        return "Barcode duplicated";
      },
    );

  return (
    <li
      className={cn(
        LIST_ROW_FOCUS,
        "bg-card group relative flex flex-col overflow-hidden rounded-xl border transition-colors",
        selected
          ? "border-foreground/30 bg-muted/40"
          : "hover:border-foreground/20",
      )}
      {...selection.rowProps(card.id)}
    >
      <div className="bg-muted/30 relative flex h-36 items-center justify-center border-b p-4">
        {card.preview ? (
          // A data URL in an <img>: the SVG never becomes page markup.
          <img
            alt={t("formatlabelBarcodeForValue", {
              formatLabel: card.formatLabel,
              value: card.value,
            })}
            className="max-h-full max-w-full object-contain"
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(card.preview)}`}
          />
        ) : (
          <span className="text-muted-foreground text-xs">
            {t("cantDrawThisBarcode")}
          </span>
        )}
        {selectable.has(card.id) && (
          <Checkbox
            aria-label={t("selectLabel", { label: card.label })}
            className={cn(
              "bg-background absolute top-3 left-3 z-10 transition-opacity",
              selected || selection.count > 0
                ? "opacity-100"
                : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100",
            )}
            {...selection.checkboxProps(card.id)}
          />
        )}
        {!card.inTrash && (
          <Link
            aria-hidden
            className="absolute inset-0"
            href={href}
            tabIndex={-1}
          />
        )}
      </div>
      <div className="flex items-start gap-2 p-3">
        <div className="min-w-0 flex-1">
          {card.inTrash ? (
            <p className="truncate text-sm font-medium">{card.label}</p>
          ) : (
            <Link
              className="block truncate text-sm font-medium hover:underline"
              href={href}
            >
              {card.label}
            </Link>
          )}
          <p className="text-muted-foreground mt-0.5 truncate text-xs">
            {card.formatLabel}
            {card.titled && (
              <>
                {" · "}
                <span className="font-mono">{card.value}</span>
              </>
            )}
          </p>
          <p className="text-muted-foreground mt-1 flex min-w-0 items-center gap-1 text-xs">
            {card.folderName && (
              <>
                <Folder2 aria-hidden className="size-3.5 shrink-0" />
                <span className="truncate">{card.folderName}</span>
                <span aria-hidden>·</span>
              </>
            )}
            <span className="shrink-0">
              {t("updatedUpdatedat", { updatedAt: formatDate(card.updatedAt) })}
            </span>
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t("actionsForLabel", { label: card.label })}
              className="-mr-1 shrink-0"
              size="icon-sm"
              variant="ghost"
            >
              <More aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {card.inTrash ? (
              card.canDelete && (
                <>
                  <DropdownMenuItem disabled={pending} onSelect={onRestore}>
                    <RotateLeft aria-hidden />
                    {t("restore")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    disabled={pending}
                    onSelect={onPurge}
                  >
                    <Trash aria-hidden />
                    {t("deleteForGood")}
                  </DropdownMenuItem>
                </>
              )
            ) : (
              <>
                <DropdownMenuItem asChild>
                  <Link href={href}>
                    <Edit2 aria-hidden />
                    {canWrite ? t("edit") : t("open")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <DocumentDownload aria-hidden />
                    {t("download")}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-56">
                    {BARCODE_FILE_TYPES.map((type) => (
                      <DropdownMenuItem asChild key={type}>
                        <a
                          download
                          href={`${href}/download?type=${type}`}
                          onClick={() => {
                            soundEvent("download");
                            track("barcode_downloaded", {
                              format: type,
                              symbology: card.format,
                              source: "dashboard",
                            });
                          }}
                        >
                          <span className="w-10 font-medium">
                            {BARCODE_FILES[type].label}
                          </span>
                          <span className="text-muted-foreground truncate text-xs">
                            {BARCODE_FILES[type].hint}
                          </span>
                        </a>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem
                  onSelect={() => {
                    navigator.clipboard
                      .writeText(card.imageUrl)
                      .then(() => {
                        soundEvent("copy");
                        toast.success(t("imageUrlCopied"), {
                          description: t("anyoneWithItCanLoad"),
                        });
                      })
                      .catch(() => toast.error(t("couldntCopyTheLink")));
                  }}
                >
                  <Link21 aria-hidden />
                  {t("copyImageUrl")}
                </DropdownMenuItem>
                {canWrite && (
                  <>
                    <DropdownMenuItem disabled={pending} onSelect={duplicate}>
                      <Copy aria-hidden />
                      {t("duplicate")}
                    </DropdownMenuItem>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <FolderOpen aria-hidden />
                        {t("moveToFolder")}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="max-h-80 w-60 overflow-y-auto">
                        <FolderItems
                          current={card.folderId}
                          folders={folders}
                          onPick={onMove}
                        />
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </>
                )}
                {card.canDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      disabled={pending}
                      onSelect={onTrash}
                    >
                      <Trash aria-hidden />
                      {t("moveToTrash")}
                    </DropdownMenuItem>
                  </>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}
