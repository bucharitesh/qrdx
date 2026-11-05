// The dashboard lists' keyboard: selecting rows and acting on the selection.
// Bulk keys follow Dub's links toolbar (dub.co/help/article/bulk-link-actions:
// T tags, M folder, A archive, with Esc to clear), and selecting follows
// Gmail: X toggles the row under the pointer or holding focus, J/K move. Dub
// deletes with X, which here selects, so delete is Backspace or Delete.
// Pure, so the rules are tested without a browser.

export type BulkAction = "tags" | "move" | "archive" | "trash" | "restore";

/** One key per bulk action; the toolbar and its menus show them. */
export const BULK_KEYS: Record<BulkAction, string> = {
  tags: "t",
  move: "m",
  archive: "a",
  trash: "Backspace",
  restore: "r",
};

/** How a key reads in a hint: letters in capitals, Backspace as ⌫. */
export function keyLabel(key: string): string {
  if (key === "Backspace") return "⌫";
  return key.length === 1 ? key.toUpperCase() : key;
}

const BY_KEY = new Map<string, BulkAction>([
  ...Object.entries(BULK_KEYS).map(
    ([action, key]) => [key.toLowerCase(), action as BulkAction] as const,
  ),
  ["delete", "trash"],
]);

export type ListCommand =
  | { type: "toggle" }
  | { type: "range" }
  | { type: "selectAll" }
  | { type: "clear" }
  | { type: "step"; delta: 1 | -1; extend: boolean }
  | { type: "bulk"; action: BulkAction };

export interface ListKeyEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  isComposing?: boolean;
  repeat?: boolean;
}

/** Where focus is, relative to the list's rows. */
export type ListFocus = "row" | "checkbox" | "inside" | "outside";

export interface ListKeyContext {
  /** user.settings.keyboardShortcuts */
  enabled: boolean;
  /** Focus is in a text field */
  typing: boolean;
  /** A dialog, sheet, popover or menu is open (OPEN_SURFACE_SELECTOR) */
  surfaceOpen: boolean;
  focus: ListFocus;
  /** A row is under the pointer or holds focus */
  activeRow: boolean;
  /** Something is selected */
  hasSelection: boolean;
  /** This person can select rows here (some lists offer them no action) */
  selectable: boolean;
  /** Bulk actions on offer now: the role, the view and a running action decide */
  actions: readonly BulkAction[];
}

/** What a key press on a list asks for, or null to leave it alone. */
export function resolveListKey(
  event: ListKeyEvent,
  context: ListKeyContext,
): ListCommand | null {
  if (
    !context.enabled ||
    context.typing ||
    context.surfaceOpen ||
    event.isComposing
  ) {
    return null;
  }
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const mod = event.metaKey || event.ctrlKey;

  if (mod) {
    return key === "a" && !event.altKey && !event.shiftKey && !event.repeat
      ? context.selectable
        ? { type: "selectAll" }
        : null
      : null;
  }
  if (event.altKey) return null;

  // Moving between rows repeats while held; Shift extends the selection.
  // Arrows only once focus is in the list, so they still scroll the page.
  const delta =
    key === "j" || (key === "ArrowDown" && context.focus !== "outside")
      ? 1
      : key === "k" || (key === "ArrowUp" && context.focus !== "outside")
        ? -1
        : 0;
  if (delta !== 0) {
    return {
      type: "step",
      delta,
      extend: event.shiftKey && context.selectable,
    };
  }

  if (event.repeat) return null;

  if (key === " ") {
    if (!context.selectable) return null;
    if (event.shiftKey) {
      return context.focus === "row" || context.focus === "checkbox"
        ? { type: "range" }
        : null;
    }
    // A focused checkbox toggles itself; the row toggles here.
    return context.focus === "row" ? { type: "toggle" } : null;
  }
  if (event.shiftKey) return null;

  if (key === "Escape") return context.hasSelection ? { type: "clear" } : null;
  if (key === "x") {
    return context.selectable && context.activeRow ? { type: "toggle" } : null;
  }

  const action = BY_KEY.get(key.toLowerCase());
  if (action && context.hasSelection && context.actions.includes(action)) {
    return { type: "bulk", action };
  }
  return null;
}

/**
 * The bulk keys a list offers. None without content.write (viewers and
 * billing members: lib/permissions.ts, and the server refuses them anyway),
 * none while an action runs, and only what the view's toolbar has.
 */
export function offeredBulkActions(
  list: "codes" | "pages",
  {
    canWrite,
    busy = false,
    status = "active",
  }: {
    canWrite: boolean;
    busy?: boolean;
    /** The codes list's view */
    status?: "active" | "archived" | "trash";
  },
): BulkAction[] {
  if (!canWrite || busy) return [];
  if (list === "pages") return ["trash"];
  return status === "trash"
    ? ["restore", "trash"]
    : ["tags", "move", "archive", "trash"];
}
