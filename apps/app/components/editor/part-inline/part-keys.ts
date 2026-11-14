// Keys for the preview's parts. With a part's button hovered or focused,
// R gives it a random look; while a part's toolbar is open, R does the
// same for it; Delete or Backspace on the focused logo hides it. Enter and
// Space open a toolbar (the buttons' own behavior). The page's own R
// (Reset) and arrow shortcuts stay as they are elsewhere: these run only
// over a part or inside its editor. Pure.
import type { PartId } from "./part-targets";

export type PartKeyAction =
  | { type: "random"; part: PartId }
  | { type: "hide-logo" };

export interface PartKeyInput {
  key: string;
  /** Cmd, Ctrl or Alt held (Shift alone is fine: "R") */
  modifier: boolean;
  /** The key went to a text field (input, textarea, contenteditable) */
  typing: boolean;
  /** The part whose toolbar is open, if any */
  open: PartId | null;
  /** The part whose button is hovered or focused, if any */
  pointed: PartId | null;
  /** The logo itself has focus (its button, or the move handle) */
  logoFocused: boolean;
}

/** What a key does to the preview's parts, or null when it isn't theirs. */
export function partKeyAction(input: PartKeyInput): PartKeyAction | null {
  if (input.modifier || input.typing) return null;
  if (input.key === "r" || input.key === "R") {
    const part = input.open ?? input.pointed;
    return part ? { type: "random", part } : null;
  }
  if (
    (input.key === "Delete" || input.key === "Backspace") &&
    input.logoFocused
  ) {
    return { type: "hide-logo" };
  }
  return null;
}

/** Whether a keyboard event's target is a text field. */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return target.matches(
    "input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=range]), textarea, select",
  );
}
