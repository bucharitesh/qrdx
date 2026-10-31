// Building blocks for QR themes: curated palettes, pattern families and the
// pairing rules between them. The theme generator (scripts/themes/generate.ts)
// samples these, renders and decodes every candidate and keeps the best; the
// playground's Shuffle (./shuffle.ts) samples the same blocks at runtime with
// a contrast check only, so everything listed here must already scan well.
import type {
  BodyPattern,
  CornerEyeDotPattern,
  CornerEyePattern,
  FrameStyle,
} from "qrdx/types";
import type { ThemeCategory } from "@/types/theme";

export interface Palette {
  id: string;
  /** One evocative word, used to name generated themes ("Harbor Pebble") */
  word: string;
  category: Exclude<ThemeCategory, "gradient" | "industry" | "seasonal">;
  bg: string;
  /** Modules */
  fg: string;
  /** Eye frames */
  eye: string;
  /** Eye centres */
  dot: string;
  /** Module gradient (two stops) when a theme from this palette gets one */
  gradient?: readonly [string, string];
  /** Light modules on a dark background */
  inverted?: boolean;
}

export const PALETTES: readonly Palette[] = [
  // Essentials: near-monochrome
  {
    id: "ink",
    word: "Ink",
    category: "essentials",
    bg: "#FFFFFF",
    fg: "#111111",
    eye: "#111111",
    dot: "#111111",
  },
  {
    id: "paper",
    word: "Paper",
    category: "essentials",
    bg: "#FAF7F0",
    fg: "#1F1B16",
    eye: "#1F1B16",
    dot: "#1F1B16",
  },
  {
    id: "graphite",
    word: "Graphite",
    category: "essentials",
    bg: "#F5F5F4",
    fg: "#292524",
    eye: "#1C1917",
    dot: "#57534E",
  },
  {
    id: "slate",
    word: "Slate",
    category: "essentials",
    bg: "#F8FAFC",
    fg: "#1E293B",
    eye: "#0F172A",
    dot: "#334155",
    gradient: ["#0F172A", "#475569"],
  },
  {
    id: "fog",
    word: "Fog",
    category: "essentials",
    bg: "#F3F4F6",
    fg: "#111827",
    eye: "#374151",
    dot: "#111827",
  },
  // Brand colours: one confident hue
  {
    id: "cobalt",
    word: "Cobalt",
    category: "brand",
    bg: "#FFFFFF",
    fg: "#0B2E6B",
    eye: "#1D4ED8",
    dot: "#1D4ED8",
    gradient: ["#0B2E6B", "#1D4ED8"],
  },
  {
    id: "harbor",
    word: "Harbor",
    category: "brand",
    bg: "#F0F7FB",
    fg: "#0C3B5E",
    eye: "#0E6BA8",
    dot: "#0E6BA8",
    gradient: ["#0C3B5E", "#155E75"],
  },
  {
    id: "forest",
    word: "Forest",
    category: "brand",
    bg: "#F2F7F2",
    fg: "#173A2A",
    eye: "#1F6B45",
    dot: "#1F6B45",
    gradient: ["#14532D", "#115E59"],
  },
  {
    id: "lagoon",
    word: "Lagoon",
    category: "brand",
    bg: "#EFFAF8",
    fg: "#0F3F3C",
    eye: "#0F766E",
    dot: "#0F766E",
    gradient: ["#134E4A", "#1D4ED8"],
  },
  {
    id: "crimson",
    word: "Crimson",
    category: "brand",
    bg: "#FFF8F7",
    fg: "#4A0E12",
    eye: "#B42318",
    dot: "#B42318",
    gradient: ["#9F1239", "#92400E"],
  },
  {
    id: "ember",
    word: "Ember",
    category: "brand",
    bg: "#FFF7ED",
    fg: "#5A2408",
    eye: "#B8400B",
    dot: "#B8400B",
    gradient: ["#9A3412", "#9F1239"],
  },
  {
    id: "violet",
    word: "Violet",
    category: "brand",
    bg: "#FAF8FF",
    fg: "#2E1065",
    eye: "#6D28D9",
    dot: "#6D28D9",
    gradient: ["#4C1D95", "#9D174D"],
  },
  {
    id: "emerald",
    word: "Emerald",
    category: "brand",
    bg: "#F0FBF5",
    fg: "#064E3B",
    eye: "#047857",
    dot: "#047857",
  },
  {
    id: "terracotta",
    word: "Terracotta",
    category: "brand",
    bg: "#FBF3EC",
    fg: "#5A2617",
    eye: "#A2431F",
    dot: "#A2431F",
    gradient: ["#7A2E16", "#8A3716"],
  },
  {
    id: "sage",
    word: "Sage",
    category: "brand",
    bg: "#F1F4EC",
    fg: "#2C3A28",
    eye: "#4C6343",
    dot: "#4C6343",
  },
  {
    id: "mocha",
    word: "Mocha",
    category: "brand",
    bg: "#F6EFE7",
    fg: "#3B2618",
    eye: "#6E4A33",
    dot: "#6E4A33",
  },
  {
    id: "olive",
    word: "Olive",
    category: "brand",
    bg: "#F5F2E8",
    fg: "#33361A",
    eye: "#5E6326",
    dot: "#5E6326",
  },
  // Soft & pastel: tinted paper, medium-deep ink
  {
    id: "blush",
    word: "Blush",
    category: "pastel",
    bg: "#FDEEF2",
    fg: "#6B2138",
    eye: "#A8325A",
    dot: "#A8325A",
    gradient: ["#8A2846", "#6B2B8C"],
  },
  {
    id: "peach",
    word: "Peach",
    category: "pastel",
    bg: "#FFF0E6",
    fg: "#6E2F14",
    eye: "#A84A23",
    dot: "#A84A23",
  },
  {
    id: "sky",
    word: "Sky",
    category: "pastel",
    bg: "#EAF4FD",
    fg: "#18355A",
    eye: "#2B63B5",
    dot: "#2B63B5",
    gradient: ["#1E3A8A", "#155E75"],
  },
  {
    id: "lilac",
    word: "Lilac",
    category: "pastel",
    bg: "#F3EFFC",
    fg: "#3A2A6E",
    eye: "#6A4BC4",
    dot: "#6A4BC4",
    gradient: ["#3A2A6E", "#7A3E9D"],
  },
  {
    id: "mint",
    word: "Mint",
    category: "pastel",
    bg: "#EAF8F1",
    fg: "#12463A",
    eye: "#1A6E53",
    dot: "#1A6E53",
  },
  {
    id: "butter",
    word: "Butter",
    category: "pastel",
    bg: "#FFF8DF",
    fg: "#4A3A08",
    eye: "#7F5C0E",
    dot: "#7F5C0E",
  },
  // Bold & vibrant: saturated ink on white
  {
    id: "electric",
    word: "Electric",
    category: "bold",
    bg: "#FFFFFF",
    fg: "#3A1CC9",
    eye: "#D1105A",
    dot: "#D1105A",
    gradient: ["#3A1CC9", "#BE0F5A"],
  },
  {
    id: "fuchsia",
    word: "Fuchsia",
    category: "bold",
    bg: "#FFFFFF",
    fg: "#BE0F5A",
    eye: "#6D28D9",
    dot: "#6D28D9",
    gradient: ["#BE0F5A", "#6D28D9"],
  },
  {
    id: "signal",
    word: "Signal",
    category: "bold",
    bg: "#FFFFFF",
    fg: "#0033CC",
    eye: "#C83F00",
    dot: "#C83F00",
  },
  {
    id: "zest",
    word: "Zest",
    category: "bold",
    bg: "#F7FEE7",
    fg: "#1A2E05",
    eye: "#3F6212",
    dot: "#3F6212",
    gradient: ["#14532D", "#3F6212"],
  },
  {
    id: "tangerine",
    word: "Tangerine",
    category: "bold",
    bg: "#FFF4E5",
    fg: "#8A2C00",
    eye: "#B84300",
    dot: "#B84300",
    gradient: ["#9A3412", "#9D174D"],
  },
  {
    id: "ultramarine",
    word: "Ultramarine",
    category: "bold",
    bg: "#F2F5FF",
    fg: "#1E1B8F",
    eye: "#3D35E0",
    dot: "#3D35E0",
    gradient: ["#1E1B8F", "#7E22CE"],
  },
  // Elegant: quiet grounds, one precious accent
  {
    id: "navy-gold",
    word: "Admiral",
    category: "elegant",
    bg: "#FBF8F1",
    fg: "#14213D",
    eye: "#14213D",
    dot: "#8C6A1C",
  },
  {
    id: "gilt",
    word: "Gilt",
    category: "elegant",
    bg: "#FFFDF7",
    fg: "#1A1A1A",
    eye: "#1A1A1A",
    dot: "#8C6A1C",
  },
  {
    id: "rose-gold",
    word: "Rosé",
    category: "elegant",
    bg: "#FBF2EF",
    fg: "#4A2522",
    eye: "#8E4E43",
    dot: "#8E4E43",
  },
  {
    id: "bordeaux",
    word: "Bordeaux",
    category: "elegant",
    bg: "#FAF6F2",
    fg: "#4A0F1F",
    eye: "#4A0F1F",
    dot: "#8A1C34",
  },
  {
    id: "jade",
    word: "Jade",
    category: "elegant",
    bg: "#FAF8F2",
    fg: "#0B3B2E",
    eye: "#0B3B2E",
    dot: "#8C6A1C",
  },
  // Playful: two cheerful inks
  {
    id: "candy",
    word: "Candy",
    category: "playful",
    bg: "#FFF3F9",
    fg: "#5B1650",
    eye: "#C2255C",
    dot: "#7C3AED",
    gradient: ["#7C2D92", "#A21B4F"],
  },
  {
    id: "diner",
    word: "Diner",
    category: "playful",
    bg: "#FFF5E1",
    fg: "#2B2A6E",
    eye: "#BF3B26",
    dot: "#BF3B26",
  },
  {
    id: "popsicle",
    word: "Popsicle",
    category: "playful",
    bg: "#FFFAF0",
    fg: "#1F3A93",
    eye: "#C8311F",
    dot: "#C8311F",
  },
  {
    id: "grape",
    word: "Grape",
    category: "playful",
    bg: "#F6F0FF",
    fg: "#3B0A75",
    eye: "#C0126E",
    dot: "#C0126E",
    gradient: ["#3B0A75", "#A10E5E"],
  },
  // Dark: light modules on a dark ground (some older scanner apps miss these)
  {
    id: "midnight",
    word: "Midnight",
    category: "dark",
    bg: "#0B1220",
    fg: "#E2E8F0",
    eye: "#7DD3FC",
    dot: "#7DD3FC",
    gradient: ["#7DD3FC", "#C4B5FD"],
    inverted: true,
  },
  {
    id: "neon",
    word: "Neon",
    category: "dark",
    bg: "#0D1117",
    fg: "#5CFFB0",
    eye: "#5CFFB0",
    dot: "#F472B6",
    gradient: ["#5CFFB0", "#38BDF8"],
    inverted: true,
  },
  {
    id: "obsidian",
    word: "Obsidian",
    category: "dark",
    bg: "#0E0D0B",
    fg: "#E7C873",
    eye: "#E7C873",
    dot: "#F5E3A3",
    gradient: ["#F5E3A3", "#C9A24A"],
    inverted: true,
  },
  {
    id: "aubergine",
    word: "Aubergine",
    category: "dark",
    bg: "#1B1026",
    fg: "#F3E8FF",
    eye: "#E879F9",
    dot: "#E879F9",
    gradient: ["#F0ABFC", "#C4B5FD"],
    inverted: true,
  },
  {
    id: "pine",
    word: "Pine",
    category: "dark",
    bg: "#0E1A14",
    fg: "#D9F2E3",
    eye: "#86EFAC",
    dot: "#86EFAC",
    inverted: true,
  },
];

/** A look that body, eye frame and eye centre commit to together. */
export interface StyleFamily {
  id: string;
  /** Texture word for generated names ("Harbor Pebble") */
  word: string;
  bodies: readonly BodyPattern[];
  eyes: readonly CornerEyePattern[];
  /** Playful families may lift the eye centre from the body shape */
  playful?: boolean;
}

export const STYLE_FAMILIES: readonly StyleFamily[] = [
  {
    id: "crisp",
    word: "Grid",
    bodies: ["square", "vertical-line", "horizontal-line", "mosaic"],
    eyes: ["square", "bevel", "octagon"],
  },
  {
    id: "dotted",
    word: "Dot",
    bodies: ["circle", "circle-large", "random-dots"],
    eyes: ["gear", "extra-rounded", "rounded"],
  },
  {
    id: "soft",
    word: "Pebble",
    bodies: ["rounded", "circle-large", "liquid", "classy-rounded"],
    eyes: ["rounded", "extra-rounded", "squircle"],
  },
  {
    id: "fluid",
    word: "Flow",
    bodies: ["liquid", "liquid-horizontal", "liquid-vertical", "classy"],
    eyes: ["extra-rounded", "squircle", "rounded"],
  },
  {
    id: "organic",
    word: "Leaf",
    bodies: ["leaf", "classy", "classy-rounded"],
    eyes: ["leaf", "leaf-reverse", "drop", "petal"],
  },
  {
    id: "geometric",
    word: "Facet",
    bodies: ["hexagon", "octagon"],
    eyes: ["octagon", "bevel", "shield"],
  },
  {
    id: "playful",
    word: "Pop",
    bodies: ["heart", "plus", "random-dots"],
    eyes: ["extra-rounded", "petal", "squircle"],
    playful: true,
  },
];

/**
 * Deliberate mixes across families (a crisp frame around soft dots, and so
 * on). Anything not listed here stays inside its family.
 */
export const CONTRAST_MIXES: readonly {
  body: BodyPattern;
  eyes: readonly CornerEyePattern[];
}[] = [
  { body: "circle", eyes: ["square", "squircle"] },
  { body: "circle-large", eyes: ["square", "gear"] },
  { body: "square", eyes: ["rounded", "extra-rounded", "squircle"] },
  { body: "rounded", eyes: ["square", "gear"] },
  { body: "liquid", eyes: ["square", "leaf"] },
  { body: "hexagon", eyes: ["rounded", "squircle"] },
  { body: "vertical-line", eyes: ["rounded", "extra-rounded"] },
  { body: "horizontal-line", eyes: ["rounded", "extra-rounded"] },
  { body: "classy", eyes: ["square"] },
  { body: "leaf", eyes: ["rounded", "extra-rounded"] },
];

/** Eye centres that echo each eye frame, best match first. */
export const EYE_DOTS: Readonly<
  Partial<Record<CornerEyePattern, readonly CornerEyeDotPattern[]>>
> = {
  square: ["square"],
  rounded: ["rounded", "squircle"],
  "extra-rounded": ["extra-rounded", "rounded"],
  squircle: ["squircle", "rounded"],
  gear: ["circle"],
  bevel: ["square"],
  octagon: ["octagon", "hexagon"],
  shield: ["rounded", "square"],
  leaf: ["leaf", "drop"],
  "leaf-reverse": ["leaf-reverse"],
  drop: ["drop", "leaf"],
  petal: ["flower"],
};

/** Eye centres a playful body may borrow (a plus body with plus centres). */
export const PLAYFUL_DOTS: Readonly<
  Partial<Record<BodyPattern, CornerEyeDotPattern>>
> = {
  plus: "plus",
};

/**
 * Patterns the generator never uses. circle-mixed's small dots, diamond and
 * banner centres and curly eyes fail strict decoders (see packages/qrdx
 * tests/support/known-issues.ts); circle eyes cost 20 points of scan score.
 * Star and heart centres, star bodies and cushion eyes failed the generator's
 * decode test too often (run 1: 2/12, 14/24, 23/31) to use without a check.
 */
export const UNSCANNABLE = {
  bodies: ["circle-mixed", "small-square", "diamond", "pacman", "star"],
  eyes: ["curly", "circle", "cushion"],
  dots: ["diamond", "banner", "star", "heart"],
} as const satisfies {
  bodies: readonly BodyPattern[];
  eyes: readonly CornerEyePattern[];
  dots: readonly CornerEyeDotPattern[];
};

/** Frames the generator puts a call to action on. */
export const FRAME_CHOICES: readonly FrameStyle[] = [
  "banner-bottom",
  "banner-top",
  "rounded-border",
  "speech-bubble",
  "chat-bubble",
  "sticker",
  "polaroid",
];

export const FRAME_CTAS: readonly string[] = [
  "Scan me",
  "Scan to visit",
  "Point your camera",
  "Scan for more",
  "Tap in with your phone",
];

/** Quiet zone, in modules: 3–5, mostly 4. */
export const MARGINS: readonly number[] = [3, 4, 4, 4, 4, 5];

/**
 * Gradient themes use level H (a denser code), so each stop needs more
 * contrast than solid modules, and the octagon body reads poorly that dense
 * at 160 px.
 */
export const GRADIENT_STOP_CONTRAST = 6;
export const GRADIENT_BODY_EXCLUDE: readonly BodyPattern[] = ["octagon"];

/** Share of themes with a module gradient and with a frame. */
export const GRADIENT_RATE = 0.2;
export const FRAME_RATE = 0.15;
/** Share of themes that use a contrast mix instead of a pure family. */
export const MIX_RATE = 0.25;
