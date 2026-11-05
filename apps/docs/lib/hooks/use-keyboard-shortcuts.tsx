"use client";

import {
  createContext,
  type Dispatch,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useId,
  useState,
} from "react";
import { stableSort } from "@/utils/stable-sort";

type KeyboardShortcutListener = {
  id: string;
  key: string | string[];
  enabled?: boolean;
  priority?: number;
  modal?: boolean;
  sheet?: boolean;
};

export const KeyboardShortcutContext = createContext<{
  listeners: KeyboardShortcutListener[];
  setListeners: Dispatch<SetStateAction<KeyboardShortcutListener[]>>;
}>({
  listeners: [] as KeyboardShortcutListener[],
  setListeners: () => {},
});

export function KeyboardShortcutProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [listeners, setListeners] = useState<KeyboardShortcutListener[]>([]);

  return (
    <KeyboardShortcutContext.Provider value={{ listeners, setListeners }}>
      {children}
    </KeyboardShortcutContext.Provider>
  );
}

/**
 * Open surfaces that own the keyboard while they're up: dialogs, alert
 * dialogs, sheets and drawers (Radix and vaul render role="dialog" with
 * data-state="open"), popovers (Radix Popover is a role="dialog" too), menus
 * and listboxes. `#modal-backdrop` is the design system Dialog's overlay.
 * The playground's inline frame text editor counts too (`data-inline-editor`
 * with data-state="open"), so typing a label or using its menu never fires a
 * page shortcut. Tooltips (role="tooltip") don't count: hovering a
 * button mustn't turn its shortcut off.
 */
export const OPEN_SURFACE_SELECTOR = [
  "#modal-backdrop",
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
  '[role="menu"][data-state="open"]',
  '[role="listbox"][data-state="open"]',
  '[data-inline-editor][data-state="open"]',
].join(", ");

/** A modal dialog, sheet, popover or menu is open (OPEN_SURFACE_SELECTOR). */
export function isSurfaceOpen(
  root: Pick<ParentNode, "querySelector"> = document,
): boolean {
  return root.querySelector(OPEN_SURFACE_SELECTOR) !== null;
}

export interface SurfaceState {
  /** A dialog, sheet, popover or menu is open */
  surface: boolean;
  /** A `[data-sheet-overlay]` sheet is open */
  sheet: boolean;
}

/**
 * Whether a listener may run now. Page shortcuts stay quiet while a surface
 * is open, so a key pressed in a dialog never changes the page behind it. A
 * listener registered with `modal` is meant for the open dialog (its Escape,
 * say) and runs only while one is open; `sheet` works the same way.
 */
export function listenerMayRun(
  listener: Pick<KeyboardShortcutListener, "enabled" | "modal" | "sheet">,
  state: SurfaceState,
): boolean {
  return (
    listener.enabled !== false &&
    state.surface === Boolean(listener.modal) &&
    state.sheet === Boolean(listener.sheet)
  );
}

export function useKeyboardShortcut(
  key: KeyboardShortcutListener["key"],
  callback: (e: KeyboardEvent) => void,
  options: Pick<
    KeyboardShortcutListener,
    "enabled" | "priority" | "modal" | "sheet"
  > = {},
) {
  const id = useId();

  const { listeners, setListeners } = useContext(KeyboardShortcutContext);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (options.enabled === false) return;

      const target = e.target as HTMLElement;
      const state: SurfaceState = {
        surface: isSurfaceOpen(),
        sheet: document.querySelector("[data-sheet-overlay]") !== null,
      };

      // Ignore shortcuts while typing, and page shortcuts while a dialog,
      // sheet, popover or menu is open (listenerMayRun).
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable ||
        !listenerMayRun(
          {
            enabled: options.enabled,
            modal: options.modal,
            sheet: options.sheet,
          },
          state,
        )
      )
        return;

      const pressedKey = [
        ...(e.metaKey ? ["meta"] : []),
        ...(e.ctrlKey ? ["ctrl"] : []),
        ...(e.altKey ? ["alt"] : []),
        e.key,
      ].join("+");

      // Ignore shortcut if it doesn't match this listener
      if (Array.isArray(key) ? !key.includes(pressedKey) : pressedKey !== key)
        return;

      // Find enabled listeners that match the key
      const matchingListeners = listeners.filter(
        (l) =>
          listenerMayRun(l, state) &&
          (Array.isArray(l.key)
            ? l.key.includes(pressedKey)
            : l.key === pressedKey),
      );

      if (!matchingListeners.length) return;

      // Sort the listeners by priority
      const topListener = stableSort(
        matchingListeners,
        (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
      )[0];

      // Check if this is the top listener
      if (topListener.id !== id) return;

      e.preventDefault();
      callback(e);
    },
    [
      key,
      listeners,
      id,
      callback,
      options.enabled,
      options.modal,
      options.sheet,
    ],
  );

  useEffect(() => {
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  // Register/unregister the listener
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the individual option fields so a new options object each render does not re-register
  useEffect(() => {
    setListeners((prev) => [
      ...prev.filter((listener) => listener.id !== id),
      { id, key, ...options },
    ]);

    return () =>
      setListeners((prev) => prev.filter((listener) => listener.id !== id));
  }, [
    id,
    key,
    setListeners,
    options.enabled,
    options.priority,
    options.modal,
    options.sheet,
  ]);
}
