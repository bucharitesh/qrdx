// Option metadata for the style pickers, the docs catalogue and presets:
// one entry per engine value (the Records are typed over the qrdx enums, so
// a new engine value fails tsc until it is listed here).
//
// - category groups the pickers: Classic, Rounded, Decorative, Playful.
// - popularity ranks the 6–8 options to show first (1 = most picked);
//   unranked options are null.
// - scanRisk is "caution" when a style is fragile on its own (scan-score
//   flags circle and curly eyes; diamond and banner centres fail in most
//   eyes); "ok" otherwise. failsWith lists the exact partner values that
//   decoders miss (from qrdx's WEAK_DOT_EYES / WEAK_BODY_EYES, measured with
//   jsQR through the camera model; see packages/qrdx/src/scan-risk.ts).
// - recommendedDot pairs each eye with a centre that reads well in it.

import {
  type BodyPattern,
  type CornerEyeDotPattern,
  type CornerEyePattern,
  type FrameStyle,
  WEAK_BODY_EYES,
  WEAK_DOT_EYES,
  WEAK_DOTS,
} from "qrdx";
import {
  BODY_PATTERN,
  CORNER_EYE_DOT_PATTERNS,
  CORNER_EYE_PATTERNS,
  FRAME_STYLES,
} from "qrdx/types";

export type PatternCategory = "Classic" | "Rounded" | "Decorative" | "Playful";
export type ScanRisk = "ok" | "caution";

export const PATTERN_CATEGORIES: PatternCategory[] = [
  "Classic",
  "Rounded",
  "Decorative",
  "Playful",
];

export interface FailsWith {
  body?: BodyPattern[];
  eye?: CornerEyePattern[];
  dot?: CornerEyeDotPattern[];
}

export interface PatternMeta<T extends string> {
  value: T;
  label: string;
  category: PatternCategory;
  popularity: number | null;
  scanRisk: ScanRisk;
  failsWith: FailsWith;
  /** Why it is "caution", when it is */
  note?: string;
}

export interface EyeMeta extends PatternMeta<CornerEyePattern> {
  recommendedDot: CornerEyeDotPattern;
}

export interface FrameMeta {
  value: FrameStyle;
  label: string;
  category: PatternCategory;
  popularity: number | null;
  /** Frames are drawn around the code, so none affects scanning */
  scanRisk: "ok";
  /** Shows `secondaryText` (a second line) */
  secondLine: boolean;
  /** Default label color is the frame color (else white on the frame) */
  textOnLight: boolean;
}

type Base = Omit<PatternMeta<string>, "value" | "scanRisk" | "failsWith">;

const BODIES: Record<BodyPattern, Base> = {
  square: { label: "Square", category: "Classic", popularity: 1 },
  rounded: { label: "Rounded", category: "Rounded", popularity: 2 },
  circle: { label: "Circle", category: "Rounded", popularity: 3 },
  liquid: { label: "Liquid", category: "Rounded", popularity: 4 },
  classy: { label: "Classy", category: "Decorative", popularity: 5 },
  "circle-large": { label: "Circle Large", category: "Rounded", popularity: 6 },
  "classy-rounded": {
    label: "Classy Rounded",
    category: "Decorative",
    popularity: 7,
  },
  star: { label: "Star", category: "Playful", popularity: 8 },
  "small-square": {
    label: "Small Square",
    category: "Classic",
    popularity: null,
  },
  "horizontal-line": {
    label: "Horizontal Line",
    category: "Classic",
    popularity: null,
  },
  "vertical-line": {
    label: "Vertical Line",
    category: "Classic",
    popularity: null,
  },
  octagon: { label: "Octagon", category: "Classic", popularity: null },
  "liquid-horizontal": {
    label: "Liquid Rows",
    category: "Rounded",
    popularity: null,
  },
  "liquid-vertical": {
    label: "Liquid Columns",
    category: "Rounded",
    popularity: null,
  },
  "random-dots": {
    label: "Random Dots",
    category: "Rounded",
    popularity: null,
  },
  leaf: { label: "Leaf", category: "Decorative", popularity: null },
  diamond: { label: "Diamond", category: "Decorative", popularity: null },
  hexagon: { label: "Hexagon", category: "Decorative", popularity: null },
  mosaic: { label: "Mosaic", category: "Playful", popularity: null },
  plus: { label: "Plus", category: "Playful", popularity: null },
  heart: { label: "Heart", category: "Playful", popularity: null },
  pacman: { label: "Pacman", category: "Playful", popularity: null },
  "circle-mixed": { label: "Mixed", category: "Playful", popularity: null },
};

const EYES: Record<
  CornerEyePattern,
  Base & { recommendedDot: CornerEyeDotPattern; note?: string; caution?: true }
> = {
  square: {
    label: "Square",
    category: "Classic",
    popularity: 1,
    recommendedDot: "square",
  },
  rounded: {
    label: "Rounded",
    category: "Rounded",
    popularity: 2,
    recommendedDot: "rounded",
  },
  "extra-rounded": {
    label: "Extra Rounded",
    category: "Rounded",
    popularity: 3,
    recommendedDot: "extra-rounded",
  },
  leaf: {
    label: "Leaf",
    category: "Decorative",
    popularity: 4,
    recommendedDot: "leaf",
  },
  gear: {
    label: "Gear",
    category: "Decorative",
    popularity: 5,
    recommendedDot: "circle",
  },
  squircle: {
    label: "Squircle",
    category: "Rounded",
    popularity: 6,
    recommendedDot: "squircle",
  },
  drop: {
    label: "Drop",
    category: "Decorative",
    popularity: 7,
    recommendedDot: "drop",
  },
  octagon: {
    label: "Octagon",
    category: "Classic",
    popularity: 8,
    recommendedDot: "octagon",
  },
  bevel: {
    label: "Bevel",
    category: "Classic",
    popularity: null,
    recommendedDot: "square",
  },
  cushion: {
    label: "Cushion",
    category: "Rounded",
    popularity: null,
    recommendedDot: "rounded",
  },
  "leaf-reverse": {
    label: "Leaf Reverse",
    category: "Decorative",
    popularity: null,
    recommendedDot: "leaf-reverse",
  },
  petal: {
    label: "Petal",
    category: "Decorative",
    popularity: null,
    recommendedDot: "drop",
  },
  shield: {
    label: "Shield",
    category: "Decorative",
    popularity: null,
    recommendedDot: "rounded",
  },
  diya: {
    label: "Diya",
    category: "Decorative",
    popularity: null,
    recommendedDot: "diya",
  },
  pointy: {
    label: "Pointy",
    category: "Decorative",
    popularity: null,
    recommendedDot: "diya-reverse",
  },
  message: {
    label: "Message",
    category: "Playful",
    popularity: null,
    recommendedDot: "message",
  },
  circle: {
    label: "Circle",
    category: "Rounded",
    popularity: null,
    recommendedDot: "circle",
    caution: true,
    note: "Only lenient decoders read circle eyes; many apps miss them",
  },
  curly: {
    label: "Curly",
    category: "Playful",
    popularity: null,
    recommendedDot: "circle",
    caution: true,
    note: "Curly eyes fail strict decoders such as ZXing-based apps",
  },
};

const DOTS: Record<CornerEyeDotPattern, Base> = {
  square: { label: "Square", category: "Classic", popularity: 1 },
  rounded: { label: "Rounded", category: "Rounded", popularity: 2 },
  circle: { label: "Circle", category: "Rounded", popularity: 3 },
  leaf: { label: "Leaf", category: "Decorative", popularity: 4 },
  heart: { label: "Heart", category: "Playful", popularity: 5 },
  squircle: { label: "Squircle", category: "Rounded", popularity: 6 },
  flower: { label: "Flower", category: "Playful", popularity: 7 },
  star: { label: "Star", category: "Playful", popularity: 8 },
  "extra-rounded": {
    label: "Extra Rounded",
    category: "Rounded",
    popularity: null,
  },
  octagon: { label: "Octagon", category: "Classic", popularity: null },
  hexagon: { label: "Hexagon", category: "Decorative", popularity: null },
  dots: { label: "Dots", category: "Playful", popularity: null },
  "leaf-reverse": {
    label: "Leaf Reverse",
    category: "Decorative",
    popularity: null,
  },
  drop: { label: "Drop", category: "Decorative", popularity: null },
  "drop-reverse": {
    label: "Drop Reverse",
    category: "Decorative",
    popularity: null,
  },
  plus: { label: "Plus", category: "Playful", popularity: null },
  "cross-rounded": {
    label: "Rounded Cross",
    category: "Playful",
    popularity: null,
  },
  diamond: { label: "Diamond", category: "Decorative", popularity: null },
  message: { label: "Message", category: "Playful", popularity: null },
  "message-reverse": {
    label: "Message Reverse",
    category: "Playful",
    popularity: null,
  },
  diya: { label: "Diya", category: "Decorative", popularity: null },
  "diya-reverse": {
    label: "Diya Reverse",
    category: "Decorative",
    popularity: null,
  },
  "rounded-triangle": {
    label: "Rounded Triangle",
    category: "Playful",
    popularity: null,
  },
  banner: { label: "Banner", category: "Decorative", popularity: null },
};

const FRAMES: Record<FrameStyle, Omit<FrameMeta, "value" | "scanRisk">> = {
  none: {
    label: "None",
    category: "Classic",
    popularity: null,
    secondLine: false,
    textOnLight: false,
  },
  "banner-bottom": {
    label: "Banner",
    category: "Classic",
    popularity: 1,
    secondLine: false,
    textOnLight: false,
  },
  "rounded-border": {
    label: "Rounded",
    category: "Rounded",
    popularity: 2,
    secondLine: false,
    textOnLight: true,
  },
  "speech-bubble": {
    label: "Bubble",
    category: "Rounded",
    popularity: 3,
    secondLine: false,
    textOnLight: false,
  },
  border: {
    label: "Border",
    category: "Classic",
    popularity: 4,
    secondLine: false,
    textOnLight: true,
  },
  "banner-top": {
    label: "Top banner",
    category: "Classic",
    popularity: 5,
    secondLine: false,
    textOnLight: false,
  },
  circle: {
    label: "Circle",
    category: "Rounded",
    popularity: 6,
    secondLine: true,
    textOnLight: false,
  },
  sticker: {
    label: "Sticker",
    category: "Decorative",
    popularity: 7,
    secondLine: false,
    textOnLight: false,
  },
  phone: {
    label: "Phone",
    category: "Playful",
    popularity: 8,
    secondLine: false,
    textOnLight: true,
  },
  "banner-top-bottom": {
    label: "Two banners",
    category: "Classic",
    popularity: null,
    secondLine: true,
    textOnLight: false,
  },
  focus: {
    label: "Focus",
    category: "Classic",
    popularity: null,
    secondLine: false,
    textOnLight: true,
  },
  "speech-bubble-top": {
    label: "Bubble top",
    category: "Rounded",
    popularity: null,
    secondLine: false,
    textOnLight: false,
  },
  "chat-bubble": {
    label: "Chat",
    category: "Rounded",
    popularity: null,
    secondLine: false,
    textOnLight: false,
  },
  "gradient-border": {
    label: "Gradient",
    category: "Decorative",
    popularity: null,
    secondLine: false,
    textOnLight: true,
  },
  badge: {
    label: "Ribbon",
    category: "Decorative",
    popularity: null,
    secondLine: false,
    textOnLight: false,
  },
  polaroid: {
    label: "Polaroid",
    category: "Decorative",
    popularity: null,
    secondLine: false,
    textOnLight: false,
  },
  ticket: {
    label: "Ticket",
    category: "Playful",
    popularity: null,
    secondLine: false,
    textOnLight: false,
  },
  tag: {
    label: "Tag",
    category: "Playful",
    popularity: null,
    secondLine: false,
    textOnLight: false,
  },
  envelope: {
    label: "Envelope",
    category: "Playful",
    popularity: null,
    secondLine: false,
    textOnLight: false,
  },
  "menu-card": {
    label: "Menu card",
    category: "Playful",
    popularity: null,
    secondLine: true,
    textOnLight: true,
  },
};

// Centres that read at phone distances but fail up close (12+ px per module
// through the camera model) and in sharp screenshots (the docs catalogue)
const CLOSE_RANGE_NOTES: Partial<Record<CornerEyeDotPattern, string>> =
  Object.fromEntries(
    WEAK_DOTS.map((dot) => [
      dot,
      "Reads at phone distance, but misses up close and in sharp screenshots",
    ]),
  );

// A centre that fails in most eyes is "caution" on its own
const CAUTION_DOT_EYE_COUNT = 6;

const compact = (failsWith: FailsWith): FailsWith =>
  Object.fromEntries(
    Object.entries(failsWith).filter(([, list]) => list && list.length > 0),
  );

export const BODY_CATALOG: PatternMeta<BodyPattern>[] = BODY_PATTERN.map(
  (value) => {
    const eye = [...(WEAK_BODY_EYES[value] ?? [])];
    return {
      value,
      ...BODIES[value],
      scanRisk: "ok",
      failsWith: compact({ eye }),
    };
  },
);

export const EYE_CATALOG: EyeMeta[] = CORNER_EYE_PATTERNS.map((value) => {
  const { caution, ...meta } = EYES[value];
  const dot = CORNER_EYE_DOT_PATTERNS.filter((d) =>
    WEAK_DOT_EYES[d]?.includes(value),
  );
  const body = BODY_PATTERN.filter((b) => WEAK_BODY_EYES[b]?.includes(value));
  return {
    value,
    ...meta,
    scanRisk: caution ? "caution" : "ok",
    failsWith: compact({ dot, body }),
  };
});

export const DOT_CATALOG: PatternMeta<CornerEyeDotPattern>[] =
  CORNER_EYE_DOT_PATTERNS.map((value) => {
    const eye = [...(WEAK_DOT_EYES[value] ?? [])];
    const caution = eye.length >= CAUTION_DOT_EYE_COUNT;
    const note = caution
      ? "Not a solid 3×3 centre, so strict decoders miss it in most eyes"
      : CLOSE_RANGE_NOTES[value];
    return {
      value,
      ...DOTS[value],
      scanRisk: note ? "caution" : "ok",
      failsWith: compact({ eye }),
      ...(note && { note }),
    };
  });

export const FRAME_CATALOG: FrameMeta[] = FRAME_STYLES.map((value) => ({
  value,
  ...FRAMES[value],
  scanRisk: "ok",
}));

/** The most popular options of a catalog, in rank order. */
export function popular<T extends { popularity: number | null }>(
  catalog: T[],
): T[] {
  return catalog
    .filter((item) => item.popularity !== null)
    .sort((a, b) => (a.popularity ?? 0) - (b.popularity ?? 0));
}

/** True when `partner` is a known-weak pairing for `item`. */
export function failsWithPartner(
  item: { failsWith: FailsWith },
  partner: { body?: string; eye?: string; dot?: string },
): boolean {
  const { failsWith } = item;
  return Boolean(
    (partner.body && failsWith.body?.includes(partner.body as BodyPattern)) ||
      (partner.eye &&
        failsWith.eye?.includes(partner.eye as CornerEyePattern)) ||
      (partner.dot &&
        failsWith.dot?.includes(partner.dot as CornerEyeDotPattern)),
  );
}
