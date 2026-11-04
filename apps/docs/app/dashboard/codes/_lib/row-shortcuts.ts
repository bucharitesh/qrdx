// Single keys for the codes row under the pointer (or holding focus), in the
// pattern of Dub's link rows (github.com/dubinc/dub, AGPL-3.0:
// apps/web/ui/links/link-controls.tsx): never while typing, never with a
// modifier, never behind a dialog or menu, and off with the person's
// keyboard shortcuts switch. Pure, so the rules are tested without a browser.

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
  trash: "x",
};

const BY_KEY = new Map(
  Object.entries(ROW_KEYS).map(([action, key]) => [key, action as RowAction]),
);

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
