// Single keys for the codes row under the pointer (or holding focus): never
// while typing, never with a modifier, never behind a dialog or menu, and off
// with the person's keyboard shortcuts switch. X selects the row
// (app/dashboard/_lib/list-keys.ts), so trash is Backspace or Delete. Pure,
// so the rules are tested without a browser.

export type RowAction =
  | "edit"
  | "copy"
  | "duplicate"
  | "move"
  | "tags"
  | "archive"
  | "trash";

/** One key per action; none repeats. Shown in the row's menu. */
export const ROW_KEYS: Record<RowAction, string> = {
  edit: "e",
  copy: "l",
  duplicate: "d",
  move: "m",
  tags: "t",
  archive: "a",
  trash: "Backspace",
};

/** Row actions the selection's own keys take over while rows are selected. */
export const BULK_OWNED: readonly RowAction[] = [
  "move",
  "tags",
  "archive",
  "trash",
];

const BY_KEY = new Map<string, RowAction>([
  ...Object.entries(ROW_KEYS).map(
    ([action, key]) => [key.toLowerCase(), action as RowAction] as const,
  ),
  ["delete", "trash"],
]);

export interface RowKeyEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  isComposing?: boolean;
  repeat?: boolean;
}

export interface RowKeyContext {
  /** user.settings.keyboardShortcuts */
  enabled: boolean;
  /** The focused element is a text field or inside one */
  typing: boolean;
  /** A dialog, sheet, popover or menu is open */
  overlayOpen: boolean;
  /** The actions this row offers (a trashed code has none of these) */
  available: readonly RowAction[];
}

/** The action a key press on the active row asks for, or null. */
export function resolveRowShortcut(
  event: RowKeyEvent,
  context: RowKeyContext,
): RowAction | null {
  if (
    !context.enabled ||
    context.typing ||
    context.overlayOpen ||
    event.isComposing ||
    event.repeat ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.shiftKey
  ) {
    return null;
  }
  const action = BY_KEY.get(event.key.toLowerCase());
  return action && context.available.includes(action) ? action : null;
}
