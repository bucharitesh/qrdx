// The builder's keys. Pattern adapted from Dub (github.com/dubinc/dub,
// AGPL-3.0): apps/web/ui/links/link-builder/link-feature-buttons.tsx,
// constants.ts and use-link-builder-keyboard-shortcut.ts, where single keys
// open an option only outside text fields and only in the open builder.
// Pure, so the rules are tested without a browser.

import type { CodeOptionId } from "@/app/dashboard/codes/_lib/code-options";

/** One key per option; none repeats, and none clashes with ⌘↵ or Esc. */
export const OPTION_KEYS: Record<CodeOptionId, string> = {
  utm: "u",
  routing: "r",
  ab: "b",
  password: "p",
  schedule: "s",
  pixels: "x",
  conversions: "k",
};

export type BuilderShortcut =
  | { type: "submit" }
  | { type: "option"; option: CodeOptionId };

export interface ShortcutEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  isComposing?: boolean;
  /** The focused element (null when the dialog itself has focus) */
  target: {
    tagName?: string;
    isContentEditable?: boolean;
    role?: string | null;
  } | null;
}

export interface ShortcutContext {
  /** user.settings.keyboardShortcuts: single-letter keys on */
  singleKeys: boolean;
  /** The options this code offers (codeOptionsFor) */
  options: readonly CodeOptionId[];
  /** Saving or done: nothing to submit */
  busy: boolean;
  /** An option panel or the success state replaces the form */
  formShown: boolean;
}

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const TYPING_ROLES = new Set(["textbox", "combobox", "listbox", "option"]);

function isTyping(target: ShortcutEvent["target"]): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  if (target.tagName && TYPING_TAGS.has(target.tagName.toUpperCase())) {
    return true;
  }
  return Boolean(target.role && TYPING_ROLES.has(target.role));
}

/**
 * The action a key press asks for, or null. ⌘↵ (Ctrl+↵) submits from any
 * field, like Enter in a one-line form; single keys open an option, never
 * while typing, with modifiers, or when shortcuts are switched off.
 */
export function resolveBuilderShortcut(
  event: ShortcutEvent,
  context: ShortcutContext,
): BuilderShortcut | null {
  if (event.isComposing) return null;
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    return context.busy || !context.formShown ? null : { type: "submit" };
  }
  if (
    !context.singleKeys ||
    !context.formShown ||
    context.busy ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.shiftKey ||
    isTyping(event.target)
  ) {
    return null;
  }
  const key = event.key.toLowerCase();
  const option = context.options.find((id) => OPTION_KEYS[id] === key);
  return option ? { type: "option", option } : null;
}

/** What Esc does: a panel closes first, then the builder (asking if unsaved). */
export function escapeAction(state: {
  panelOpen: boolean;
  dirty: boolean;
  busy: boolean;
}): "close-panel" | "confirm-close" | "close" | "ignore" {
  if (state.busy) return "ignore";
  if (state.panelOpen) return "close-panel";
  return state.dirty ? "confirm-close" : "close";
}

/** "⌘↵" on Apple devices, "Ctrl ↵" elsewhere. */
export function submitKeyLabel(platform: string): string {
  return /Mac|iPhone|iPad|iPod/i.test(platform) ? "⌘↵" : "Ctrl ↵";
}
