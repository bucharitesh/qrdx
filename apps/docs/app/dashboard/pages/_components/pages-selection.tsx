"use client";

// Selecting pages in the Pages list, and deleting them together. The rows
// stay server-rendered (page.tsx); these wrap them with the checkbox, the
// row's focus and keys, and the bulk toolbar. Only pages this person may
// delete get a checkbox: viewers and billing members see none, and their
// keys select nothing (lib/permissions.ts; deleteLandingPages refuses them).

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
  TableCell,
  TableHead,
  TableRow,
} from "@repo/design-system/components/ui/table";
import { cn } from "@repo/design-system/lib/utils";
import { Trash as Trash2 } from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { deleteLandingPages } from "@/actions/landing-pages";
import {
  LIST_ROW_FOCUS,
  type ListSelectionApi,
  ListShortcuts,
  SelectionStatus,
  useListSelection,
  useModKey,
} from "@/app/dashboard/_components/list-selection";
import {
  BULK_KEYS,
  type BulkAction,
  keyLabel,
  offeredBulkActions,
} from "@/app/dashboard/_lib/list-keys";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { useCan } from "@/components/workspace-provider";

const pagesLabel = (count: number) =>
  `${count} ${count === 1 ? "page" : "pages"}`;
const OTHERS_SKIPPED =
  "created by other team members were skipped: only owners and admins can delete them.";

interface PagesSelectionValue {
  selection: ListSelectionApi;
  /** Pages this person may select (and delete) */
  deletable: ReadonlySet<string>;
}

const PagesSelectionContext = createContext<PagesSelectionValue | null>(null);

function usePagesSelection(): PagesSelectionValue {
  const value = useContext(PagesSelectionContext);
  if (!value) throw new Error("Use inside PagesSelection");
  return value;
}

export interface PageSummary {
  id: string;
  /** May this person delete it (their own, or any as an owner or admin) */
  canDelete: boolean;
  /** QR codes deleted with it */
  codes: number;
}

/** The Pages list's selection, bulk toolbar and delete confirmation. */
export function PagesSelection({
  pages,
  keyboardShortcuts,
  children,
}: {
  /** Every page shown, in the list's order */
  pages: PageSummary[];
  /** user.settings.keyboardShortcuts */
  keyboardShortcuts: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const canWrite = useCan("content.write");
  const listRef = useRef<HTMLDivElement>(null);
  const [confirm, setConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();

  const rows = useMemo(() => pages.map((page) => page.id), [pages]);
  const order = useMemo(
    () =>
      canWrite ? pages.filter((page) => page.canDelete).map((p) => p.id) : [],
    [pages, canWrite],
  );
  const deletable = useMemo(() => new Set(order), [order]);

  const keyActions = useRef<Partial<Record<BulkAction, () => void>>>({});
  const selection = useListSelection({
    order,
    rows,
    listRef,
    keyboardShortcuts,
    actionsRef: keyActions,
  });
  const { count, selectedIds, clear } = selection;
  const codes = pages
    .filter((page) => selection.isSelected(page.id))
    .reduce((sum, page) => sum + page.codes, 0);

  // Delete opens the confirmation, like the button; nothing while it runs.
  keyActions.current = Object.fromEntries(
    offeredBulkActions("pages", { canWrite, busy: isPending }).map((action) => [
      action,
      () => setConfirm(true),
    ]),
  );

  const remove = () =>
    startTransition(async () => {
      const result = await deleteLandingPages({ ids: selectedIds });
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      const { deleted, skipped } = result.data;
      setConfirm(false);
      if (deleted === 0) {
        toast.error(`All selected pages ${OTHERS_SKIPPED}`);
      } else {
        toast.success(
          `Deleted ${pagesLabel(deleted)}`,
          skipped > 0
            ? { description: `${skipped} ${OTHERS_SKIPPED}` }
            : undefined,
        );
        clear();
      }
      router.refresh();
    });

  const deleteHint = keyLabel(BULK_KEYS.trash);

  return (
    <PagesSelectionContext.Provider value={{ selection, deletable }}>
      <div className="space-y-2" ref={listRef}>
        <SelectionStatus count={count} noun={["page", "pages"]} />
        {count > 0 && (
          <div
            aria-label="Bulk actions"
            className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-2 z-10 flex flex-wrap items-center gap-1 rounded-lg border p-1.5 shadow-sm backdrop-blur"
            role="toolbar"
          >
            <span className="px-2 text-sm font-medium tabular-nums">
              {count} selected
            </span>
            <TooltipWrapper kbd="Esc" label="Clear selection">
              <Button
                aria-label="Clear selection"
                onClick={clear}
                size="icon-sm"
                variant="ghost"
              >
                <X />
              </Button>
            </TooltipWrapper>
            <div className="bg-border mx-1 h-5 w-px" />
            <TooltipWrapper kbd={deleteHint} label="Delete">
              <Button
                disabled={isPending}
                onClick={() => setConfirm(true)}
                size="sm"
                variant="ghost"
              >
                <Trash2 />
                Delete
              </Button>
            </TooltipWrapper>
            {keyboardShortcuts && (
              <div className="ml-auto">
                <ListShortcuts
                  actions={[{ label: "Delete", keys: [deleteHint] }]}
                />
              </div>
            )}
          </div>
        )}
        {children}
      </div>

      <AlertDialog onOpenChange={setConfirm} open={confirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pagesLabel(count)}?</AlertDialogTitle>
            <AlertDialogDescription>
              {codes > 0
                ? `Their ${codes === 1 ? "QR code is" : `${codes} QR codes are`} deleted too, with their scan history. Printed copies will stop working. This can't be undone.`
                : "This can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <Button disabled={isPending} onClick={remove} variant="destructive">
              {isPending ? "Deleting..." : `Delete ${pagesLabel(count)}`}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PagesSelectionContext.Provider>
  );
}

/** A page's card (`li`) or table row (`tr`), with its focus and keys. */
export function PageRow({
  id,
  as,
  className,
  children,
}: {
  id: string;
  as: "li" | "tr";
  className?: string;
  children: ReactNode;
}) {
  const { selection } = usePagesSelection();
  const selected = selection.isSelected(id);
  if (as === "tr") {
    return (
      <TableRow
        className={cn(LIST_ROW_FOCUS, className)}
        data-state={selected ? "selected" : undefined}
        {...selection.rowProps(id)}
      >
        {children}
      </TableRow>
    );
  }
  return (
    <li
      className={cn(
        LIST_ROW_FOCUS,
        className,
        selected
          ? "border-foreground/30 bg-muted/40"
          : "hover:border-foreground/20",
      )}
      {...selection.rowProps(id)}
    >
      {children}
    </li>
  );
}

/** The row's checkbox; a spacer on a page this person can't delete. */
export function PageCheckbox({
  id,
  title,
  className,
}: {
  id: string;
  title: string;
  className?: string;
}) {
  const { selection, deletable } = usePagesSelection();
  if (deletable.size === 0) return null;
  if (!deletable.has(id)) {
    return <span aria-hidden className={cn("size-4 shrink-0", className)} />;
  }
  return (
    <Checkbox
      aria-label={`Select ${title}`}
      className={className}
      {...selection.checkboxProps(id)}
    />
  );
}

/** Whether the list shows checkboxes at all (a column for the table). */
export function usePagesSelectable(): boolean {
  return usePagesSelection().deletable.size > 0;
}

/** The table header's checkbox: every page on screen this person may delete. */
export function PagesSelectAll() {
  const { selection, deletable } = usePagesSelection();
  const modKey = useModKey();
  if (deletable.size === 0) return null;
  const ids = [...deletable];
  const all = ids.every((id) => selection.isSelected(id));
  const some = !all && ids.some((id) => selection.isSelected(id));
  return (
    <TooltipWrapper kbd={[modKey, "A"]} label="Select all on this page">
      <Checkbox
        aria-label="Select all pages"
        checked={all ? true : some ? "indeterminate" : false}
        onCheckedChange={(checked) => selection.setMany(ids, checked === true)}
      />
    </TooltipWrapper>
  );
}

/** A table cell that's only there when the list shows checkboxes. */
export function PageCheckboxCell({
  header = false,
  children,
}: {
  header?: boolean;
  children: ReactNode;
}) {
  const selectable = usePagesSelectable();
  if (!selectable) return null;
  return header ? (
    <TableHead className="w-8 pr-0">{children}</TableHead>
  ) : (
    <TableCell className="w-8 pr-0">{children}</TableCell>
  );
}
