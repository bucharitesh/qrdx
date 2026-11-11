// Reading and editing a custom frame (a frame spec) in the editor: which
// theme colors it uses, its labels, and swapping its icons. The engine
// validates and draws the result; nothing here renders.
import type {
  AnyQRFrame,
  FrameSpec,
  FrameSpecColor,
  FrameSpecIcon,
  FrameSpecLabel,
  FrameSpecPaint,
  QRCustomFrame,
} from "qrdx/types";
import { peekOfficialEntryOfSpec } from "@/lib/frames/library";

export type FrameToken = "frame" | "text" | "accent";

function tokensOfColor(color: FrameSpecColor, into: Set<string>) {
  if (typeof color === "string") {
    into.add(color);
    return;
  }
  for (const part of color.mix) into.add(part);
}

function tokensOfPaint(paint: FrameSpecPaint, into: Set<string>) {
  if (typeof paint === "object" && "gradient" in paint) {
    tokensOfColor(paint.gradient.from, into);
    tokensOfColor(paint.gradient.to, into);
    return;
  }
  tokensOfColor(paint, into);
}

/** The theme colors a spec paints with (so the editor shows only those). */
export function specTokens(spec: FrameSpec): Set<FrameToken> {
  const found = new Set<string>();
  for (const shape of spec.shapes) tokensOfPaint(shape.fill, found);
  for (const label of spec.labels) tokensOfColor(label.color, found);
  if (spec.bleed && spec.bleed !== "none") tokensOfColor(spec.bleed, found);
  const tokens = new Set<FrameToken>();
  for (const token of ["frame", "text", "accent"] as const) {
    if (found.has(token)) tokens.add(token);
  }
  return tokens;
}

/** The colors a custom frame shows now, per token. */
export function customFrameColors(frame: QRCustomFrame) {
  const { colors } = frame.spec;
  const base = frame.color ?? colors.frame;
  return {
    frame: base,
    text: frame.textColor ?? colors.text ?? base,
    accent: frame.secondaryColor ?? colors.accent ?? base,
  };
}

export const labelOfSlot = (
  spec: FrameSpec,
  slot: "primary" | "secondary",
): FrameSpecLabel | undefined =>
  spec.labels.find((label) => label.slot === slot);

/** Distinct icons a spec places, in order. */
export function specIcons(spec: FrameSpec): FrameSpecIcon[] {
  const icons: FrameSpecIcon[] = [];
  for (const shape of spec.shapes) {
    if (shape.type === "icon" && !icons.includes(shape.icon)) {
      icons.push(shape.icon);
    }
  }
  return icons;
}

/** The spec with every `from` icon drawn as `to` instead. */
export function swapSpecIcon(
  spec: FrameSpec,
  from: FrameSpecIcon,
  to: FrameSpecIcon,
): FrameSpec {
  return {
    ...spec,
    shapes: spec.shapes.map((shape) =>
      shape.type === "icon" && shape.icon === from
        ? { ...shape, icon: to }
        : shape,
    ),
  };
}

/**
 * A name for the frame header: the official frame's, else "Custom". Official
 * names come from the frame library's index once it has loaded
 * (useFrameLibrary({ withIndex: true }) loads it and re-renders).
 */
export function customFrameName(frame: QRCustomFrame): string {
  return peekOfficialEntryOfSpec(frame.spec)?.name ?? "Custom";
}

/** Keeps a frame's text and colors when its style changes. */
export function carryFrameSettings(frame: AnyQRFrame) {
  return {
    ...(frame.text !== undefined ? { text: frame.text } : {}),
    ...(frame.secondaryText !== undefined
      ? { secondaryText: frame.secondaryText }
      : {}),
    ...(frame.color ? { color: frame.color } : {}),
    ...(frame.textColor ? { textColor: frame.textColor } : {}),
    ...(frame.secondaryColor ? { secondaryColor: frame.secondaryColor } : {}),
    ...(frame.fontScale !== undefined ? { fontScale: frame.fontScale } : {}),
  };
}
