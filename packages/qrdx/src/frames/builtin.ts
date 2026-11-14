// The built-in frames: the engine's classic call-to-action frames. Each is a
// frame spec (./builtin/*.json), drawn by src/frame-spec.ts exactly like a
// custom frame. A frame option names one by its style, as saved designs, the
// image API, the CLI and the React props always have:
//
//   { style: "banner-bottom", text: "Scan me", color: "#111827" }
//
// Those names (FRAME_STYLES) are accepted for good. The frame's `text` and
// `secondaryText` fill the spec's primary and secondary labels, `color`,
// `textColor` and `secondaryColor` set its frame, text and accent colors and
// `fontScale` scales its labels, the same as on `{ style: "custom", spec }`.
// tests/frame-spec-parity.test.ts proves each spec draws what the engine's
// hand-written layout for the style drew up to qrdx 0.0.51.
import type { ColorConfig } from "../../types/color";
import type { FrameStyle, QRFrame } from "../../types/frame";
import type { AnyQRFrame, FrameSpec } from "../../types/frame-spec";
import { CUSTOM_FRAME_STYLE } from "../../types/frame-spec-rules";
import type { FrameLayout } from "../frame";
import {
  type FrameSlotFields,
  frameSpecLayout,
  getFrameSpecColors,
  resolveFrameSpec,
} from "../frame-spec";
import badge from "./builtin/badge.json";
import bannerBottom from "./builtin/banner-bottom.json";
import bannerTop from "./builtin/banner-top.json";
import bannerTopBottom from "./builtin/banner-top-bottom.json";
import border from "./builtin/border.json";
import chatBubble from "./builtin/chat-bubble.json";
import circle from "./builtin/circle.json";
import envelope from "./builtin/envelope.json";
import focus from "./builtin/focus.json";
import gradientBorder from "./builtin/gradient-border.json";
import menuCard from "./builtin/menu-card.json";
import phone from "./builtin/phone.json";
import polaroid from "./builtin/polaroid.json";
import roundedBorder from "./builtin/rounded-border.json";
import speechBubble from "./builtin/speech-bubble.json";
import speechBubbleTop from "./builtin/speech-bubble-top.json";
import sticker from "./builtin/sticker.json";
import tag from "./builtin/tag.json";
import ticket from "./builtin/ticket.json";

/** A built-in frame's style name (every FRAME_STYLES value but "none"). */
export type BuiltInFrameStyle = Exclude<FrameStyle, "none">;

export interface BuiltInFrame {
  /** The frame's name as a style: `{ style: "banner-bottom" }` draws it */
  style: BuiltInFrameStyle;
  /** Its name in pickers and lists */
  name: string;
  /** Words a search matches besides the name */
  tags: readonly string[];
  /**
   * What the main label sits on: the frame color, or the code's own
   * background (so a label color has to read on that)
   */
  labelOn: "frame" | "background";
  spec: FrameSpec;
}

const frame = (
  style: BuiltInFrameStyle,
  name: string,
  spec: unknown,
  labelOn: BuiltInFrame["labelOn"],
  tags: string[]
): BuiltInFrame => ({ style, name, tags, labelOn, spec: spec as FrameSpec });

/** Every built-in frame, in the order pickers list them. */
export const BUILT_IN_FRAMES: readonly BuiltInFrame[] = [
  frame("banner-bottom", "Banner", bannerBottom, "frame", ["bottom", "band"]),
  frame("banner-top", "Top banner", bannerTop, "frame", ["top", "band"]),
  frame("banner-top-bottom", "Two banners", bannerTopBottom, "frame", [
    "top",
    "bottom",
    "band",
  ]),
  frame("border", "Border", border, "background", ["square", "outline"]),
  frame("rounded-border", "Rounded", roundedBorder, "background", [
    "border",
    "outline",
  ]),
  frame("gradient-border", "Gradient", gradientBorder, "background", [
    "border",
    "colorful",
  ]),
  frame("focus", "Focus", focus, "background", ["corners", "brackets"]),
  frame("speech-bubble", "Bubble", speechBubble, "frame", ["speech"]),
  frame("speech-bubble-top", "Bubble top", speechBubbleTop, "frame", [
    "speech",
  ]),
  frame("chat-bubble", "Chat", chatBubble, "frame", ["message", "bubble"]),
  frame("circle", "Circle", circle, "frame", ["round", "ring", "curved"]),
  frame("badge", "Ribbon", badge, "frame", ["badge", "banner"]),
  frame("sticker", "Sticker", sticker, "frame", ["label"]),
  frame("polaroid", "Polaroid", polaroid, "frame", ["photo", "picture"]),
  frame("phone", "Phone", phone, "background", ["mobile", "screen"]),
  frame("ticket", "Ticket", ticket, "frame", ["event", "pass"]),
  frame("tag", "Tag", tag, "frame", ["price", "label"]),
  frame("envelope", "Envelope", envelope, "frame", ["mail", "letter"]),
  frame("menu-card", "Menu card", menuCard, "background", [
    "menu",
    "restaurant",
  ]),
];

const BY_STYLE = new Map<string, BuiltInFrame>(
  BUILT_IN_FRAMES.map((item) => [item.style, item])
);

/** The built-in frame a style names, if any ("none" names none). */
export function getBuiltInFrame(style: string): BuiltInFrame | undefined {
  return BY_STYLE.get(style);
}

/** The spec each built-in frame style draws. */
export const BUILT_IN_FRAME_SPECS: Partial<Record<FrameStyle, FrameSpec>> =
  Object.fromEntries(BUILT_IN_FRAMES.map((item) => [item.style, item.spec]));

/**
 * Default colors of the "gradient-border" frame when `color` and
 * `secondaryColor` are unset: its spec's frame and accent colors.
 */
export const GRADIENT_FRAME_DEFAULTS = {
  from: gradientBorder.colors.frame,
  to: gradientBorder.colors.accent,
};

/**
 * The spec a frame draws: a custom frame's own, a built-in style's, or null
 * for no frame. A custom frame's spec is returned as given (draw it, or
 * check it with frameSpecSchema, before trusting it).
 */
export function frameSpecOf(
  frame: AnyQRFrame | null | undefined
): FrameSpec | null {
  if (!frame || frame.style === "none") {
    return null;
  }
  if (frame.style === CUSTOM_FRAME_STYLE) {
    return frame.spec ?? null;
  }
  return getBuiltInFrame(frame.style)?.spec ?? null;
}

/**
 * The frame, text and accent colors a frame paints with: its options, else
 * its spec's defaults. Null for no frame, or a custom frame without a
 * readable spec.
 */
export function getFrameColors(
  frame: AnyQRFrame | null | undefined
): { frame: string; text: string; accent: string } | null {
  const spec = frameSpecOf(frame);
  if (!(frame && typeof spec?.colors?.frame === "string")) {
    return null;
  }
  return getFrameSpecColors(spec, frame);
}

// Built-in frames mark their labels with the frame option each one shows
const LEGACY_FIELDS: FrameSlotFields = {
  primary: "text",
  secondary: "secondaryText",
};

/**
 * Layout of a frame named by its style, drawn from that style's spec. An
 * unknown style draws the banner, as the engine always has.
 */
export function getBuiltInFrameLayout(
  size: number,
  frame: QRFrame,
  bgColor?: ColorConfig
): FrameLayout {
  const spec = getBuiltInFrame(frame.style)?.spec ?? bannerBottom;
  return frameSpecLayout(
    size,
    resolveFrameSpec(spec),
    frame,
    bgColor,
    LEGACY_FIELDS
  );
}
