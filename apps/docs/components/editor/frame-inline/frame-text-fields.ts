// What a frame label in the playground preview edits. The engine marks each
// label it draws with a field (data-qrdx-frame-label): "text" and
// "secondaryText" on built-in frames, a spec label's id on custom ones. This
// maps that marker to the frame option an edit writes, and applies edits
// (text, size, colors, icon) the way the Design → Frame controls do. Pure:
// nothing here renders or touches the store.
import {
  type AnyQRFrame,
  DEFAULT_FRAME_TEXT,
  FRAME_FONT_SCALE_MAX,
  FRAME_FONT_SCALE_MIN,
  FRAME_TEXT_MAX_LENGTH,
  type FrameSpecIcon,
  GRADIENT_FRAME_DEFAULTS,
  type QRCustomFrame,
  sanitizeFrameText,
} from "qrdx";
import {
  customFrameColors,
  specIcons,
  specTokens,
  swapSpecIcon,
} from "../control-sections/frame-specs";

/**
 * Where an edit goes: `frame.text`, `frame.secondaryText`, or (for a spec
 * label in the "fixed" slot) that label's own text in the spec.
 */
export type FrameTextField = "text" | "secondaryText" | "label";

export interface FrameTextTarget {
  /** The label's marker in the preview */
  marker: string;
  field: FrameTextField;
  /** The spec label's id, for custom frames */
  labelId?: string;
  /** Longest text the label takes */
  maxLength: number;
  /** What the field is called in the editor ("Label", "Second line", "Text") */
  name: string;
  /** The text as the frame stores it now */
  value: string;
}

const BUILT_IN_NAMES = { text: "Label", secondaryText: "Second line" };

/** The field a preview label edits, or null when the frame has no such label. */
export function frameTextTarget(
  frame: AnyQRFrame | undefined,
  marker: string,
): FrameTextTarget | null {
  if (!frame || frame.style === "none") return null;
  if (frame.style !== "custom") {
    if (marker === "text") {
      return {
        marker,
        field: "text",
        maxLength: FRAME_TEXT_MAX_LENGTH,
        name: BUILT_IN_NAMES.text,
        value: frame.text ?? DEFAULT_FRAME_TEXT,
      };
    }
    if (marker === "secondaryText") {
      return {
        marker,
        field: "secondaryText",
        maxLength: FRAME_TEXT_MAX_LENGTH,
        name: BUILT_IN_NAMES.secondaryText,
        value: frame.secondaryText ?? "",
      };
    }
    return null;
  }
  const label = frame.spec.labels.find((item) => item.id === marker);
  if (!label) return null;
  const maxLength = Math.min(
    label.maxLength ?? FRAME_TEXT_MAX_LENGTH,
    FRAME_TEXT_MAX_LENGTH,
  );
  const base = { marker, labelId: label.id, maxLength };
  if (label.slot === "primary") {
    return {
      ...base,
      field: "text",
      name: BUILT_IN_NAMES.text,
      value: frame.text ?? label.text,
    };
  }
  if (label.slot === "secondary") {
    return {
      ...base,
      field: "secondaryText",
      name: BUILT_IN_NAMES.secondaryText,
      value: frame.secondaryText ?? label.text,
    };
  }
  return { ...base, field: "label", name: "Text", value: label.text };
}

/**
 * Text as typed, kept within the limit: line breaks become spaces, and it
 * stops at `max` UTF-16 units without splitting a character (the frame
 * schema counts UTF-16 units, the engine counts characters; this fits both).
 */
export function clampFrameText(text: string, max: number): string {
  let out = "";
  for (const char of text.replace(/[\r\n\t]+/g, " ")) {
    if (out.length + char.length > max) break;
    out += char;
  }
  return out;
}

/** Characters left before `text` reaches `max`. */
export function charactersLeft(text: string, max: number): number {
  return Math.max(0, max - text.length);
}

/** Whether to show the characters left: within a third of the limit (at most 8). */
export function nearTextLimit(text: string, max: number): boolean {
  return charactersLeft(text, max) <= Math.min(8, Math.ceil(max / 3));
}

/**
 * The frame showing `text` in `target`. A draft keeps the text as typed
 * (trailing spaces included, so typing a space works); `commit` cleans it
 * with sanitizeFrameText. A fixed spec label is always cleaned, because the
 * spec must validate to draw.
 */
export function withFrameText(
  frame: AnyQRFrame,
  target: FrameTextTarget,
  text: string,
  { commit = false }: { commit?: boolean } = {},
): AnyQRFrame {
  const clamped = clampFrameText(text, target.maxLength);
  if (target.field === "label") {
    if (frame.style !== "custom") return frame;
    const clean = sanitizeFrameText(clamped, target.maxLength);
    return {
      ...frame,
      spec: {
        ...frame.spec,
        labels: frame.spec.labels.map((label) =>
          label.id === target.labelId ? { ...label, text: clean } : label,
        ),
      },
    };
  }
  const value = commit ? sanitizeFrameText(clamped, target.maxLength) : clamped;
  return { ...frame, [target.field]: value } as AnyQRFrame;
}

// ── The menu: size, colors, icon ─────────────────────────────────────────

export interface FrameTweaks {
  fontScale: number;
  /** The text color the frame sets, or null when its labels don't use it */
  textColor: string | null;
  /** The frame color, or null when the frame doesn't paint with it */
  frameColor: string | null;
  /** Distinct icons a custom frame places (none on built-in frames) */
  icons: FrameSpecIcon[];
}

/**
 * The values the menu shows. `drawnTextColor` is the label's fill in the
 * preview: a built-in frame's default text color depends on its style, so
 * the drawing is the source of truth until a color is picked.
 */
export function frameTweaks(
  frame: AnyQRFrame,
  drawnTextColor?: string | null,
): FrameTweaks {
  const fontScale = frame.fontScale ?? 1;
  if (frame.style === "custom") {
    const tokens = specTokens(frame.spec);
    const colors = customFrameColors(frame);
    return {
      fontScale,
      textColor: tokens.has("text") ? colors.text : null,
      frameColor: tokens.has("frame") ? colors.frame : null,
      icons: specIcons(frame.spec),
    };
  }
  const frameColor =
    frame.color ??
    (frame.style === "gradient-border"
      ? GRADIENT_FRAME_DEFAULTS.from
      : "#000000");
  return {
    fontScale,
    textColor: frame.textColor ?? drawnTextColor ?? "#ffffff",
    frameColor,
    icons: [],
  };
}

export const clampFontScale = (scale: number) =>
  Math.min(FRAME_FONT_SCALE_MAX, Math.max(FRAME_FONT_SCALE_MIN, scale));

export type FrameTweak =
  | { kind: "fontScale"; value: number }
  | { kind: "textColor"; value: string }
  | { kind: "frameColor"; value: string }
  | { kind: "icon"; from: FrameSpecIcon; to: FrameSpecIcon };

/** The frame with one menu change applied. */
export function withFrameTweak(
  frame: AnyQRFrame,
  tweak: FrameTweak,
): AnyQRFrame {
  switch (tweak.kind) {
    case "fontScale":
      return { ...frame, fontScale: clampFontScale(tweak.value) };
    case "textColor":
      return { ...frame, textColor: tweak.value };
    case "frameColor":
      return { ...frame, color: tweak.value };
    default: {
      if (frame.style !== "custom") return frame;
      const custom: QRCustomFrame = frame;
      return {
        ...custom,
        spec: swapSpecIcon(custom.spec, tweak.from, tweak.to),
      };
    }
  }
}
