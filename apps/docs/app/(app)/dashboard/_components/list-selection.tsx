"use client";

// Selecting rows in a dashboard list (codes, pages) with the mouse and the
// keyboard: checkboxes with shift-click ranges, X, Shift+Space, Cmd/Ctrl+A,
// Esc, J/K and Down/Up, and the bulk keys the list offers. The rules live in
// _lib/list-selection.ts and _lib/list-keys.ts; this wires them to the page.
// Keys stay quiet while typing and while a dialog, menu or popover is open
// (OPEN_SURFACE_SELECTOR), like every other page shortcut.

import { Button } from "@repo/design-system/components/ui/button";
import { Kbd, KbdGroup } from "@repo/design-system/components/ui/kbd";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import { Keyboard } from "iconsax-reactjs";
import {
  type FocusEvent,
  type MouseEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type BulkAction,
  type ListFocus,
  resolveListKey,
} from "@/app/(app)/dashboard/_lib/list-keys";
import {
  EMPTY_SELECTION,
  extendRange,
  type ListSelection,
  pruneSelection,
  selectAll,
  selectedInOrder,
  selectRange,
  setRows,
  stepRow,
  toggleRow,
} from "@/app/(app)/dashboard/_lib/list-selection";
import {
  describeFocusTarget,
  hasOpenOverlay,
} from "@/components/app-shell/paste-to-create";
import { isSurfaceOpen } from "@/lib/hooks/use-keyboard-shortcuts";

const ROW_ATTR = "data-list-row";

/**
 * Classes for a row that J/K can focus: a calm outline, keyboard only.
 * `outline-solid` is needed: `outline-none` sets Tailwind's outline style to
 * none, which `outline-2` would otherwise keep.
 */
export const LIST_ROW_FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring";

/**
 * The same for a table row: inset from the table's edges and rounded, so it
 * reads as the row's own outline inside the rounded table (a `tr` takes the
 * radius for its outline).
 */
export const LIST_TABLE_ROW_FOCUS =
  "outline-none focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-4 focus-visible:outline-ring";

export interface ListSelectionApi {
  selected: ReadonlySet<string>;
  /** The selected ids in list order */
  selectedIds: string[];
  count: number;
  /** The row under the pointer or holding focus (row keys apply to it) */
  activeRow: string | null;
  isSelected: (id: string) => boolean;
  /** Sets several rows at once (a header checkbox) */
  setMany: (ids: readonly string[], on: boolean) => void;
  clear: () => void;
  /** Spread on each row's element */
  rowProps: (id: string) => {
    [ROW_ATTR]: string;
    tabIndex: number;
    onFocus: () => void;
    onBlur: (event: FocusEvent<HTMLElement>) => void;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
  };
  /** Spread on each row's Checkbox: a click toggles, a shift-click ranges */
  checkboxProps: (id: string) => {
    checked: boolean;
    onClick: (event: MouseEvent<HTMLButtonElement>) => void;
    onMouseDown: (event: MouseEvent<HTMLButtonElement>) => void;
  };
}

/** The row element holding focus inside `list`, if any. */
function focusedRow(list: HTMLElement | null): string | null {
  const active = document.activeElement;
  const row = active?.closest<HTMLElement>(`[${ROW_ATTR}]`);
  return row && list?.contains(row)
    ? (row.getAttribute(ROW_ATTR) ?? null)
    : null;
}

export function useListSelection({
  order,
  rows = order,
  listRef,
  keyboardShortcuts,
  actionsRef,
}: {
  /** Rows this person may select, in the list's order */
  order: readonly string[];
  /** Rows J/K move through, in order (default: `order`) */
  rows?: readonly string[];
  /** The element around the rows */
  listRef: RefObject<HTMLElement | null>;
  /** user.settings.keyboardShortcuts */
  keyboardShortcuts: boolean;
  /**
   * Bulk keys on offer, read when a key is pressed (so the list can set them
   * after it knows the selection); leave out what the role or view doesn't
   * allow, and everything while an action runs.
   */
  actionsRef: RefObject<Partial<Record<BulkAction, () => void>>>;
}): ListSelectionApi {
  const [state, setState] = useState<ListSelection>(EMPTY_SELECTION);
  // The row keys apply to: whichever of the pointer and focus moved last,
  // falling back to the other when one leaves.
  const [activeRow, setActiveRow] = useState<string | null>(null);
  const hovered = useRef<string | null>(null);

  // Rows that left the list (a refresh, a filter, another page) drop out.
  const orderKey = order.join("\n");
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the ids, not the array's identity
  useEffect(() => {
    setState((current) => pruneSelection(current, order));
  }, [orderKey]);

  const latest = useRef({ state, order, rows, activeRow });
  latest.current = { state, order, rows, activeRow };

  useEffect(() => {
    if (!keyboardShortcuts) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const list = listRef.current;
      if (!list) return;
      const { state, order, rows, activeRow } = latest.current;
      const actions = actionsRef.current;
      const target = event.target instanceof Element ? event.target : null;
      const where = describeFocusTarget(target);
      const row = target?.closest<HTMLElement>(`[${ROW_ATTR}]`);
      const inList = row && list.contains(row) ? row : null;
      const focus: ListFocus = !inList
        ? "outside"
        : target === inList
          ? "row"
          : target?.closest('[role="checkbox"]')
            ? "checkbox"
            : "inside";
      const offered = (Object.keys(actions) as BulkAction[]).filter((action) =>
        Boolean(actions[action]),
      );
      const command = resolveListKey(event, {
        enabled: true,
        typing: where.typing,
        surfaceOpen:
          where.inOverlay || isSurfaceOpen() || hasOpenOverlay(document),
        focus,
        activeRow: activeRow !== null,
        hasSelection: state.selected.size > 0,
        selectable: order.length > 0,
        actions: offered,
      });
      if (!command) return;
      const focused = inList?.getAttribute(ROW_ATTR) ?? null;
      const current = focused ?? activeRow;

      switch (command.type) {
        case "toggle": {
          if (!(current && order.includes(current))) return;
          setState((value) => toggleRow(value, current));
          break;
        }
        case "range": {
          if (!(focused && order.includes(focused))) return;
          setState((value) => selectRange(value, order, focused));
          break;
        }
        case "selectAll":
          setState(selectAll(order));
          break;
        case "clear":
          setState(EMPTY_SELECTION);
          break;
        case "step": {
          const next = stepRow(rows, current, command.delta);
          if (!next) return;
          const element = list.querySelector<HTMLElement>(
            `[${ROW_ATTR}="${CSS.escape(next)}"]`,
          );
          element?.focus({ preventScroll: true });
          element?.scrollIntoView({ block: "nearest" });
          if (
            command.extend &&
            current &&
            current !== next &&
            order.includes(current) &&
            order.includes(next)
          ) {
            setState((value) => extendRange(value, order, current, next));
          }
          break;
        }
        case "bulk":
          actions[command.action]?.();
          break;
      }
      event.preventDefault();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [keyboardShortcuts, listRef, actionsRef]);

  const clear = useCallback(() => setState(EMPTY_SELECTION), []);
  const setMany = useCallback(
    (ids: readonly string[], on: boolean) =>
      setState((value) => setRows(value, ids, on)),
    [],
  );

  const selectedIds = useMemo(
    () => selectedInOrder(state, order),
    [state, order],
  );

  return {
    selected: state.selected,
    selectedIds,
    count: selectedIds.length,
    activeRow,
    isSelected: (id) => state.selected.has(id),
    setMany,
    clear,
    rowProps: (id) => ({
      [ROW_ATTR]: id,
      tabIndex: -1,
      onFocus: () => setActiveRow(id),
      onBlur: (event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setActiveRow((row) => (row === id ? hovered.current : row));
        }
      },
      onMouseEnter: () => {
        hovered.current = id;
        setActiveRow(id);
      },
      onMouseLeave: () => {
        if (hovered.current === id) hovered.current = null;
        setActiveRow((row) => (row === id ? focusedRow(listRef.current) : row));
      },
    }),
    checkboxProps: (id) => ({
      checked: state.selected.has(id),
      onClick: (event) => {
        // Handled here, not by the checkbox, so a shift-click can range.
        event.preventDefault();
        const shift = event.shiftKey;
        const { order } = latest.current;
        setState((value) =>
          shift ? selectRange(value, order, id) : toggleRow(value, id),
        );
      },
      // Shift-clicking mustn't also select the text between the rows.
      onMouseDown: (event) => {
        if (event.shiftKey) event.preventDefault();
      },
    }),
  };
}

/**
 * Says the selected count to screen readers as it changes. Always rendered,
 * so the first change is announced too.
 */
export function SelectionStatus({
  count,
  noun,
}: {
  count: number;
  /** Singular and plural, e.g. ["code", "codes"] */
  noun: [string, string];
}) {
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (count > 0) setTouched(true);
  }, [count]);
  return (
    <p aria-live="polite" className="sr-only" role="status">
      {count > 0
        ? `${count} ${count === 1 ? noun[0] : noun[1]} selected`
        : touched
          ? "Selection cleared"
          : ""}
    </p>
  );
}

/** "⌘" on Apple devices, else "Ctrl" (after mount, so it hydrates cleanly). */
export function useModKey(): string {
  const [mod, setMod] = useState("Ctrl");
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.userAgent)) setMod("⌘");
  }, []);
  return mod;
}

export interface ShortcutRow {
  label: string;
  keys: string[];
}

/** The list's keys, from the bulk toolbar. */
export function ListShortcuts({ actions }: { actions: ShortcutRow[] }) {
  const mod = useModKey();
  const sections: { title: string; rows: ShortcutRow[] }[] = [
    {
      title: "Select",
      rows: [
        { label: "Select or unselect a row", keys: ["X"] },
        { label: "Select a range", keys: ["Shift", "Click"] },
        { label: "Range from the focused row", keys: ["Shift", "Space"] },
        { label: "Select all on this page", keys: [mod, "A"] },
        { label: "Clear the selection", keys: ["Esc"] },
      ],
    },
    {
      title: "Move",
      rows: [
        { label: "Next or previous row", keys: ["J", "K"] },
        { label: "Extend the selection", keys: ["Shift", "↓", "↑"] },
      ],
    },
    ...(actions.length > 0
      ? [{ title: "With a selection", rows: actions }]
      : []),
  ];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label="Keyboard shortcuts"
          className="max-sm:hidden"
          size="icon-sm"
          title="Keyboard shortcuts"
          variant="ghost"
        >
          <Keyboard />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <div className="space-y-3">
          {sections.map((section) => (
            <div className="space-y-1.5" key={section.title}>
              <p className="text-muted-foreground text-xs font-medium">
                {section.title}
              </p>
              <ul className="space-y-1">
                {section.rows.map((row) => (
                  <li
                    className="flex items-center justify-between gap-3 text-sm"
                    key={row.label}
                  >
                    <span>{row.label}</span>
                    <KbdGroup>
                      {row.keys.map((key) => (
                        <Kbd key={key}>{key}</Kbd>
                      ))}
                    </KbdGroup>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
