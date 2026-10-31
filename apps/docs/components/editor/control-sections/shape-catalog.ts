import type {
  BodyPattern,
  CornerEyeDotPattern,
  CornerEyePattern,
} from "qrdx/types";

// How the Design tab groups the shapes: a few common ones in the compact row,
// the rest by category in the "More" browser. Names and ids come from the
// pattern lists in components/playground; any id missing here lands in
// "Decorative", so new shapes always show up.

export type ShapeCategory = "classic" | "rounded" | "decorative" | "playful";

export const SHAPE_CATEGORIES: { id: ShapeCategory; label: string }[] = [
  { id: "classic", label: "Classic" },
  { id: "rounded", label: "Rounded" },
  { id: "decorative", label: "Decorative" },
  { id: "playful", label: "Playful" },
];

export const BODY_FEATURED: BodyPattern[] = [
  "circle",
  "square",
  "rounded",
  "classy-rounded",
  "liquid",
];

export const BODY_CATEGORY: Partial<Record<BodyPattern, ShapeCategory>> = {
  square: "classic",
  "small-square": "classic",
  rounded: "classic",
  circle: "classic",
  "circle-large": "classic",
  liquid: "rounded",
  "liquid-horizontal": "rounded",
  "liquid-vertical": "rounded",
  classy: "rounded",
  "classy-rounded": "rounded",
  leaf: "rounded",
  "random-dots": "rounded",
  "horizontal-line": "decorative",
  "vertical-line": "decorative",
  diamond: "decorative",
  octagon: "decorative",
  hexagon: "decorative",
  mosaic: "decorative",
  plus: "decorative",
  star: "playful",
  heart: "playful",
  pacman: "playful",
  "circle-mixed": "playful",
};

export const EYE_FEATURED: CornerEyePattern[] = [
  "square",
  "rounded",
  "extra-rounded",
  "circle",
  "leaf",
];

export const EYE_CATEGORY: Partial<Record<CornerEyePattern, ShapeCategory>> = {
  square: "classic",
  rounded: "classic",
  "extra-rounded": "classic",
  squircle: "classic",
  cushion: "classic",
  bevel: "classic",
  octagon: "classic",
  circle: "rounded",
  drop: "rounded",
  leaf: "rounded",
  "leaf-reverse": "rounded",
  petal: "rounded",
  shield: "decorative",
  diya: "decorative",
  message: "decorative",
  pointy: "decorative",
  gear: "playful",
  curly: "playful",
};

export const EYE_DOT_FEATURED: CornerEyeDotPattern[] = [
  "square",
  "rounded",
  "circle",
  "squircle",
  "leaf",
];

export const EYE_DOT_CATEGORY: Partial<
  Record<CornerEyeDotPattern, ShapeCategory>
> = {
  square: "classic",
  rounded: "classic",
  "extra-rounded": "classic",
  circle: "classic",
  squircle: "classic",
  octagon: "classic",
  hexagon: "classic",
  dots: "rounded",
  leaf: "rounded",
  "leaf-reverse": "rounded",
  drop: "rounded",
  "drop-reverse": "rounded",
  flower: "rounded",
  plus: "decorative",
  "cross-rounded": "decorative",
  diamond: "decorative",
  banner: "decorative",
  "rounded-triangle": "decorative",
  message: "decorative",
  "message-reverse": "decorative",
  diya: "decorative",
  "diya-reverse": "decorative",
  heart: "playful",
  star: "playful",
};

/** Matching outer + centre pairs: one per outer shape, so every eye is one tap. */
export interface EyePreset {
  id: string;
  name: string;
  outer: CornerEyePattern;
  centre: CornerEyeDotPattern;
}

export const EYE_PRESETS: EyePreset[] = [
  { id: "square", name: "Square", outer: "square", centre: "square" },
  { id: "rounded", name: "Rounded", outer: "rounded", centre: "rounded" },
  { id: "soft", name: "Soft", outer: "extra-rounded", centre: "circle" },
  { id: "circle", name: "Circle", outer: "circle", centre: "circle" },
  { id: "leaf", name: "Leaf", outer: "leaf", centre: "leaf" },
  { id: "squircle", name: "Squircle", outer: "squircle", centre: "squircle" },
  { id: "cushion", name: "Cushion", outer: "cushion", centre: "rounded" },
  { id: "bevel", name: "Bevel", outer: "bevel", centre: "square" },
  { id: "octagon", name: "Octagon", outer: "octagon", centre: "octagon" },
  {
    id: "leaf-reverse",
    name: "Leaf reverse",
    outer: "leaf-reverse",
    centre: "leaf-reverse",
  },
  { id: "drop", name: "Drop", outer: "drop", centre: "drop" },
  { id: "petal", name: "Petal", outer: "petal", centre: "flower" },
  { id: "shield", name: "Shield", outer: "shield", centre: "rounded" },
  { id: "diya", name: "Diya", outer: "diya", centre: "circle" },
  { id: "message", name: "Message", outer: "message", centre: "rounded" },
  { id: "pointy", name: "Pointy", outer: "pointy", centre: "square" },
  { id: "gear", name: "Gear", outer: "gear", centre: "circle" },
  { id: "curly", name: "Curly", outer: "curly", centre: "circle" },
];

export const EYE_PRESET_FEATURED = [
  "square",
  "rounded",
  "soft",
  "circle",
  "leaf",
];
