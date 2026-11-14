import type {
  BodyPattern,
  ErrorLevel,
  PickableCornerEyeDotPattern,
  PickableCornerEyePattern,
  QRArtImage,
  QRArtMode,
  QRArtVariant,
  QRFrame,
  QRProps,
} from "qrdx/types";
import { LOGO_MARK_PATH } from "@/components/brand-marks";
import type { ThemeStyles } from "@/types/theme";

/**
 * Showcase styles: the named looks for QR codes drawn on marketing pages, so
 * each section shows a different side of the engine instead of one house
 * style everywhere. Variety comes from shape, frame, logo and art, not from
 * color: ink on white, with the brand blue as the rare accent.
 *
 * Exported names (stable; other sections import them):
 * - `SHOWCASE_INK`, `SHOWCASE_ACCENT`, `SHOWCASE_PAPER`: the three colors.
 * - `SHOWCASE_LOGO`: the QRdx mark as a data URI, for centre logos.
 * - `SHOWCASE_STYLE_NAMES`, `ShowcaseStyleName`: the style names.
 * - `SHOWCASE_STYLES`: each style's look (`ShowcaseStyle`).
 * - `SHOWCASE_PLACEMENTS`: which style each marketing section uses, in page
 *   order (neighbours differ; no style is used more than twice).
 * - `showcaseProps(name, options, overrides?)`: props for `<QRCodeSVG>`.
 *
 * Only offered (non-retired) eyes and eye centres, no weak body × eye pairs,
 * and every style must grade "ok" or better with `getScanScore`:
 * tests/lib/showcase-styles.test.ts renders each one and checks.
 */

export const SHOWCASE_INK = "#0b0b0d";
export const SHOWCASE_ACCENT = "#155dfc";
export const SHOWCASE_PAPER = "#ffffff";

/**
 * The QRdx mark, white on a brand-blue tile (the mark alone is QR-like and
 * melts into the modules). Inline, so it renders on the server and never
 * fetches.
 */
export const SHOWCASE_LOGO = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" rx="60" fill="${SHOWCASE_ACCENT}"/><path fill="#ffffff" transform="translate(56 56) scale(0.5625)" d="${LOGO_MARK_PATH}"/></svg>`,
)}`;

/** Logo QR or Image QR: a sample from public/images/art-samples blended in. */
export interface ShowcaseArt {
  mode: QRArtMode;
  variant: QRArtVariant;
  intensity: number;
  /** Sampled at runtime with `loadQRArtImage(src, { mode })`. */
  src: string;
}

export interface ShowcaseStyle {
  label: string;
  /** What the style shows off. */
  shows: string;
  bodyPattern: BodyPattern;
  cornerEyePattern: PickableCornerEyePattern;
  cornerEyeDotPattern: PickableCornerEyeDotPattern;
  level: ErrorLevel;
  /** Eye centres in the brand blue. */
  accent?: boolean;
  frame?: QRFrame;
  /** Centre logo, as a share of the code's width. */
  logo?: { src: string; scale: number };
  art?: ShowcaseArt;
}

export const SHOWCASE_STYLE_NAMES = [
  "classic",
  "signature",
  "fluid",
  "classy",
  "facet",
  "dots",
  "logo",
  "lines",
  "menu",
  "ticket",
  "logo-art",
  "photo-art",
] as const;

export type ShowcaseStyleName = (typeof SHOWCASE_STYLE_NAMES)[number];

export const SHOWCASE_STYLES: Record<ShowcaseStyleName, ShowcaseStyle> = {
  classic: {
    label: "Classic",
    shows: "Square modules and square eyes: the print-shop standard",
    bodyPattern: "square",
    cornerEyePattern: "square",
    cornerEyeDotPattern: "square",
    level: "Q",
  },
  signature: {
    label: "Signature",
    shows: "Dots with gear eyes, the look the editor and plugins start with",
    bodyPattern: "circle",
    cornerEyePattern: "gear",
    cornerEyeDotPattern: "circle",
    level: "Q",
  },
  fluid: {
    label: "Fluid",
    shows: "Modules that melt into one outline, with brand-blue eye centers",
    bodyPattern: "liquid",
    cornerEyePattern: "squircle",
    cornerEyeDotPattern: "squircle",
    level: "Q",
    accent: true,
  },
  classy: {
    label: "Classy",
    shows: "Rounded classy modules with leaf eyes that face their corners",
    bodyPattern: "classy-rounded",
    cornerEyePattern: "leaf",
    cornerEyeDotPattern: "leaf",
    level: "Q",
  },
  facet: {
    label: "Facet",
    shows: "Hexagon modules with octagon eyes",
    bodyPattern: "hexagon",
    cornerEyePattern: "octagon",
    cornerEyeDotPattern: "hexagon",
    level: "Q",
  },
  dots: {
    label: "Dots",
    shows: "Large, airy dots and soft eyes: a clean code for a short link",
    bodyPattern: "circle-large",
    cornerEyePattern: "squircle",
    cornerEyeDotPattern: "circle",
    level: "M",
  },
  logo: {
    label: "Logo",
    shows: "A center logo (the QRdx mark) on error correction H",
    bodyPattern: "classy",
    cornerEyePattern: "bevel",
    cornerEyeDotPattern: "square",
    level: "H",
    logo: { src: SHOWCASE_LOGO, scale: 0.22 },
  },
  lines: {
    label: "Lines",
    shows: "Vertical bars, like a label printed on packaging",
    bodyPattern: "vertical-line",
    cornerEyePattern: "rounded",
    cornerEyeDotPattern: "rounded",
    level: "Q",
  },
  menu: {
    label: "Menu card",
    shows: "A menu-card frame with a call to action",
    bodyPattern: "classy-rounded",
    cornerEyePattern: "rounded",
    cornerEyeDotPattern: "rounded",
    level: "Q",
    frame: {
      style: "menu-card",
      text: "Menu",
      secondaryText: "Scan to order",
      color: SHOWCASE_INK,
    },
  },
  ticket: {
    label: "Ticket",
    shows: "A ticket frame for events and check-ins",
    bodyPattern: "square",
    cornerEyePattern: "rounded",
    cornerEyeDotPattern: "rounded",
    level: "Q",
    frame: { style: "ticket", text: "Admit one", color: SHOWCASE_INK },
  },
  "logo-art": {
    label: "Logo QR",
    shows: "A logo traced into the modules, its blues filling the code",
    bodyPattern: "circle",
    cornerEyePattern: "rounded",
    cornerEyeDotPattern: "rounded",
    level: "H",
    art: {
      mode: "logo",
      variant: "blend",
      intensity: 0.7,
      src: "/images/art-samples/logos/wave.svg",
    },
  },
  "photo-art": {
    label: "Image QR",
    shows: "A black-and-white portrait showing through every module",
    bodyPattern: "square",
    cornerEyePattern: "rounded",
    cornerEyeDotPattern: "rounded",
    level: "H",
    art: {
      mode: "halftone",
      variant: "color",
      intensity: 0.7,
      src: "/images/art-samples/photos/portrait.webp",
    },
  },
};

/**
 * Where each style is used, in page order. "menu", "ticket" and "lines" are
 * there for the use-case illustrations (menus, events, packaging).
 */
export const SHOWCASE_PLACEMENTS = {
  "home.studio": "fluid",
  "home.scan-score": "logo",
  "home.print-size": "classic",
  "home.dynamic": "dots",
  "plugins.chrome": "signature",
  "plugins.figma": "classic",
  "plugins.raycast": "classy",
  "plugins.canva": "facet",
  "ai-art.logo": "logo-art",
  "ai-art.image": "photo-art",
} as const satisfies Record<string, ShowcaseStyleName>;

export interface ShowcaseOptions {
  value: string;
  /** Width the code is laid out at (the logo is sized from it). */
  size: number;
  /** Quiet zone in modules (default 0: the tiles around codes are white). */
  margin?: number;
  /** Art styles: the sampled image; until it loads the plain code shows. */
  artImage?: QRArtImage | null;
}

/**
 * `name` as an editor design, for a playground link: the same colors,
 * shapes, error correction and frame as showcaseProps. A logo style shows
 * the editor's QRdx mark; art images and custom logos can't travel in a
 * link, so they are left out.
 */
export function showcaseThemeStyles(name: ShowcaseStyleName): ThemeStyles {
  const style = SHOWCASE_STYLES[name];
  return {
    bgColor: SHOWCASE_PAPER,
    fgColor: SHOWCASE_INK,
    eyeColor: SHOWCASE_INK,
    dotColor: style.accent ? SHOWCASE_ACCENT : SHOWCASE_INK,
    bodyPattern: style.bodyPattern,
    cornerEyePattern: style.cornerEyePattern,
    cornerEyeDotPattern: style.cornerEyeDotPattern,
    level: style.level,
    ...(style.frame && { frame: style.frame }),
    ...(style.logo && { showLogo: true }),
  };
}

/** Props for `<QRCodeSVG>` (or `getScanScore`) drawing `name`. */
export function showcaseProps(
  name: ShowcaseStyleName,
  { value, size, margin = 0, artImage }: ShowcaseOptions,
  overrides: Partial<QRProps> = {},
): QRProps {
  const style = SHOWCASE_STYLES[name];
  const props: QRProps = {
    value,
    size,
    margin,
    level: style.level,
    bgColor: SHOWCASE_PAPER,
    fgColor: SHOWCASE_INK,
    eyeColor: SHOWCASE_INK,
    dotColor: style.accent ? SHOWCASE_ACCENT : SHOWCASE_INK,
    bodyPattern: style.bodyPattern,
    cornerEyePattern: style.cornerEyePattern,
    cornerEyeDotPattern: style.cornerEyeDotPattern,
  };
  if (style.frame) {
    props.frame = style.frame;
  }
  if (style.logo) {
    const width = Math.round(size * style.logo.scale);
    props.imageSettings = {
      src: style.logo.src,
      width,
      height: width,
      excavate: true,
    };
  }
  if (style.art && artImage) {
    const { mode, variant, intensity } = style.art;
    props.art = { mode, variant, intensity, image: artImage };
  }
  return { ...props, ...overrides };
}
