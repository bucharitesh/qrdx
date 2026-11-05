import { getFrameLayout, getOfficialFrame, isFrameActive } from "qrdx";
import type { AnyQRFrame, ColorConfig, FrameStyle, QRProps } from "qrdx/types";
import type { ContentType } from "@/types/qr-content";
import type { ThemeStyles } from "@/types/theme";
import { defaultPresets } from "@/utils/qr-presets";

/**
 * Sample codes on the marketing pages outside the home gallery: every QR
 * code type page, every /qr-codes-for and /qr-codes-on page and the three
 * hubs show real codes in built-in themes (utils/qr-presets.ts), each fitting
 * its page, instead of one house style everywhere.
 *
 * A code is a built-in theme as it ships, or with one of the engine's frames
 * added (an official frame from qrdx OFFICIAL_FRAMES or a built-in frame
 * style), colored the way a theme colors its own frame: the theme's ink with
 * its paper for the label. The image route (app/sample-codes/[file]) draws
 * each one at build time, and tests/page-codes/ decodes every one.
 */

/** The official frames for use cases (the seasonal ones come and go). */
export const OFFICIAL_FRAME_IDS = [
  "attendance",
  "audio-guide",
  "book-now",
  "check-in",
  "donate",
  "event-ticket",
  "feedback-bubble",
  "follow-us",
  "get-the-app",
  "order-at-table",
  "product-info",
  "register-product",
  "review-us",
  "rsvp-card",
  "save-contact",
  "scan-to-pay",
  "shop-window",
  "sign-rider",
  "table-tent",
  "wifi-card",
] as const;

export type OfficialFrameId = (typeof OFFICIAL_FRAME_IDS)[number];

export type BuiltInFrameStyle = Exclude<FrameStyle, "none">;

/**
 * Names for the built-in frame styles, as the editor's frame picker shows
 * them (components/editor/control-sections/frame-controls.tsx).
 */
export const FRAME_STYLE_NAMES: Record<BuiltInFrameStyle, string> = {
  "banner-bottom": "Banner",
  "banner-top": "Top banner",
  "banner-top-bottom": "Two banners",
  border: "Border",
  "rounded-border": "Rounded",
  "gradient-border": "Gradient",
  focus: "Focus",
  "speech-bubble": "Bubble",
  "speech-bubble-top": "Bubble top",
  "chat-bubble": "Chat",
  circle: "Circle",
  badge: "Ribbon",
  sticker: "Sticker",
  polaroid: "Polaroid",
  phone: "Phone",
  ticket: "Ticket",
  tag: "Tag",
  envelope: "Envelope",
  "menu-card": "Menu card",
};

interface FrameLabels {
  text?: string;
  secondaryText?: string;
}

/** A frame added to the theme: official (by id) or a built-in style. */
export type CodeFrame =
  | ({ official: OfficialFrameId } & FrameLabels)
  | ({ style: BuiltInFrameStyle } & FrameLabels);

export interface PageCode {
  /** Unique slug: the image is /sample-codes/<id>.svg. */
  id: string;
  /** Short name on the tile, e.g. "Guest Wi-Fi". */
  label: string;
  /** What the code holds; scanning it gives exactly this. */
  value: string;
  /** The content type the value is, for the alt text and playground link. */
  type: ContentType;
  /** Built-in theme (a key of defaultPresets). */
  preset: string;
  /**
   * A frame added in the theme's colors. Unset keeps the theme's own frame
   * (only the industry themes have one); null draws the theme without it.
   */
  frame?: CodeFrame | null;
}

/** Width the codes are drawn at, before any frame (as the home gallery). */
export const PAGE_CODE_SIZE = 240;

const WHITE = "#ffffff";

/** Built-in frame styles that set their label on the paper, not on a band. */
const LABEL_ON_PAPER = new Set<BuiltInFrameStyle>([
  "border",
  "rounded-border",
  "phone",
  "menu-card",
  "focus",
  "gradient-border",
]);

/** A solid color from a theme color, or the first stop of a gradient. */
function solid(color: ColorConfig | undefined): string | undefined {
  if (!color) return undefined;
  if (typeof color === "string") return color;
  if (color.type === "solid") return color.color;
  if (color.type === "image") return color.underlay;
  return color.stops[0]?.color;
}

/** Relative luminance of a #rrggbb color (0 dark, 1 light). */
function luminance(hex: string): number {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match) return 0;
  const value = Number.parseInt(match[1] as string, 16);
  const channel = (shift: number) => {
    const c = ((value >> shift) & 0xff) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

/** The theme's ink: its eye color, else its module color. */
function inkOf(styles: ThemeStyles): string {
  return (
    solid(styles.eyeColor) ??
    solid(styles.fgColor) ??
    solid(styles.dotColor) ??
    "#111111"
  );
}

export function presetOf(code: Pick<PageCode, "preset">) {
  const preset = defaultPresets[code.preset];
  if (!preset) throw new Error(`Unknown theme "${code.preset}"`);
  return preset;
}

/** The frame a code is drawn with, colored from its theme (or none). */
export function frameOf(code: PageCode): AnyQRFrame | undefined {
  const styles = presetOf(code).styles;
  if (code.frame === null) return undefined;
  if (code.frame === undefined) {
    return styles.frame && isFrameActive(styles.frame)
      ? styles.frame
      : undefined;
  }
  const ink = inkOf(styles);
  const paper = solid(styles.bgColor) ?? WHITE;
  const labels: FrameLabels = {};
  if (code.frame.text !== undefined) labels.text = code.frame.text;
  if (code.frame.secondaryText !== undefined) {
    labels.secondaryText = code.frame.secondaryText;
  }
  if ("official" in code.frame) {
    const official = getOfficialFrame(code.frame.official);
    if (!official) throw new Error(`Unknown frame "${code.frame.official}"`);
    const spec = official.spec;
    // Labels keep the spec's contrast: light on the ink, or ink on paper.
    const lightText = luminance(spec.colors.text ?? WHITE) > 0.5;
    return {
      style: "custom",
      spec,
      color: ink,
      textColor: lightText ? paper : ink,
      ...labels,
    };
  }
  const frame: AnyQRFrame = { style: code.frame.style, color: ink, ...labels };
  // Labels on the frame's band read in the paper color; labels on the paper
  // keep the engine's default, the frame color.
  if (!LABEL_ON_PAPER.has(code.frame.style)) frame.textColor = paper;
  if (code.frame.style === "gradient-border") {
    frame.secondaryColor = solid(styles.dotColor) ?? ink;
  }
  return frame;
}

/** The frame's name for the tile ("Wi-Fi card"), or undefined. */
export function frameName(code: PageCode): string | undefined {
  if (code.frame === null) return undefined;
  if (code.frame === undefined) {
    const style = presetOf(code).styles.frame?.style;
    return style && style !== "none" && style !== "custom"
      ? FRAME_STYLE_NAMES[style]
      : undefined;
  }
  if ("official" in code.frame) {
    return getOfficialFrame(code.frame.official)?.name;
  }
  return FRAME_STYLE_NAMES[code.frame.style];
}

/** The theme's name ("Harbor"). */
export const themeName = (code: Pick<PageCode, "preset">) =>
  presetOf(code).label;

/** The style the code is drawn in, as the editor stores it. */
export function codeStyles(code: PageCode): ThemeStyles {
  const { frame: _frame, ...styles } = presetOf(code).styles;
  const frame = frameOf(code);
  return frame ? { ...styles, frame } : styles;
}

/** Props for `<QRCodeSVG>` (and the scan tests) drawing the code. */
export function pageCodeProps(code: PageCode): QRProps {
  const styles = presetOf(code).styles;
  const props: QRProps = {
    value: code.value,
    size: PAGE_CODE_SIZE,
    bgColor: styles.bgColor,
    fgColor: styles.fgColor,
    eyeColor: styles.eyeColor,
    dotColor: styles.dotColor,
    bodyPattern: styles.bodyPattern,
    cornerEyePattern: styles.cornerEyePattern,
    cornerEyeDotPattern: styles.cornerEyeDotPattern,
    level: styles.level,
    margin: styles.margin,
  };
  const frame = frameOf(code);
  if (frame) props.frame = frame;
  return props;
}

/** Image URL of a code (app/sample-codes/[file]/route.ts). */
export const pageCodePath = (code: Pick<PageCode, "id">) =>
  `/sample-codes/${code.id}.svg`;

/** A code's image URL and intrinsic size (a frame makes it larger). */
export function pageCodeImage(code: PageCode): {
  src: string;
  width: number;
  height: number;
  framed: boolean;
} {
  const src = pageCodePath(code);
  const frame = frameOf(code);
  if (!frame) {
    return {
      src,
      width: PAGE_CODE_SIZE,
      height: PAGE_CODE_SIZE,
      framed: false,
    };
  }
  const layout = getFrameLayout(
    PAGE_CODE_SIZE,
    frame,
    presetOf(code).styles.bgColor,
  );
  // Whole pixels for the <img> attributes; the SVG keeps its exact size.
  return {
    src,
    width: Math.round(layout.width),
    height: Math.round(layout.height),
    framed: true,
  };
}
