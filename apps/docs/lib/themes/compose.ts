// Samples a theme from the building blocks in ./blocks. Pure and seeded: the
// same random sequence always composes the same theme.
import type {
  BodyPattern,
  CornerEyeDotPattern,
  CornerEyePattern,
} from "qrdx/types";
import type { ThemeCategory, ThemeStyles } from "@/types/theme";
import {
  CONTRAST_MIXES,
  EYE_DOTS,
  FRAME_CHOICES,
  FRAME_CTAS,
  FRAME_RATE,
  GRADIENT_BODY_EXCLUDE,
  GRADIENT_RATE,
  GRADIENT_STOP_CONTRAST,
  MARGINS,
  MIX_RATE,
  PALETTES,
  type Palette,
  PLAYFUL_DOTS,
  STYLE_FAMILIES,
  type StyleFamily,
  UNSCANNABLE,
} from "./blocks";
import { contrastRatio, worstContrast } from "./color";

/** Seeded pseudo-random numbers (mulberry32). */
export function createRandom(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  const pick = <T>(items: readonly T[]): T =>
    items[Math.floor(next() * items.length)] as T;
  const chance = (rate: number) => next() < rate;
  return { next, pick, chance };
}

export type Random = ReturnType<typeof createRandom>;

export interface ComposedTheme {
  name: string;
  category: ThemeCategory;
  styles: ThemeStyles;
  palette: Palette;
  family: StyleFamily;
  /** Body and eyes come from a whitelisted cross-family mix */
  mixed: boolean;
  gradient: boolean;
  inverted: boolean;
}

/** Contrast floors: modules vs background, eye frames/centres vs background. */
export const MODULE_CONTRAST = 4.5;
export const EYE_CONTRAST = 3;
/** Frame label vs the frame it sits on */
export const FRAME_TEXT_CONTRAST = 4.5;

const usable = {
  body: (body: BodyPattern) =>
    !(UNSCANNABLE.bodies as readonly string[]).includes(body),
  eye: (eye: CornerEyePattern) =>
    !(UNSCANNABLE.eyes as readonly string[]).includes(eye),
  dot: (dot: CornerEyeDotPattern) =>
    !(UNSCANNABLE.dots as readonly string[]).includes(dot),
};

const GRADIENT_PALETTE_SHARE =
  PALETTES.filter((palette) => palette.gradient).length / PALETTES.length;

// Dark palettes come up half as often: light-on-dark stays a small share.
const WEIGHTED_PALETTES = PALETTES.flatMap((palette) =>
  palette.inverted ? [palette] : [palette, palette],
);

function familyOf(body: BodyPattern, fallback: StyleFamily) {
  return (
    STYLE_FAMILIES.find((family) => family.bodies.includes(body)) ?? fallback
  );
}

function pickPatterns(random: Random) {
  let family = random.pick(STYLE_FAMILIES);
  const mix = random.chance(MIX_RATE)
    ? random.pick(CONTRAST_MIXES.filter((entry) => usable.body(entry.body)))
    : null;
  const bodies = family.bodies.filter(usable.body);
  const body = mix?.body ?? random.pick(bodies);
  const eyes = (mix?.eyes ?? family.eyes).filter(usable.eye);
  const eye = random.pick(eyes);
  if (mix) family = familyOf(body, family);

  const matches = (EYE_DOTS[eye] ?? ["square"]).filter(usable.dot);
  const borrowed = family.playful ? PLAYFUL_DOTS[body] : undefined;
  let dot: CornerEyeDotPattern;
  if (borrowed && random.chance(0.5)) dot = borrowed;
  else if (matches.length > 1 && random.chance(0.3))
    dot = random.pick(matches.slice(1));
  else dot = matches[0] ?? "square";

  return { family, mixed: Boolean(mix), body, eye, dot };
}

/** Composes one theme. Contrast is not checked here; see `contrastProblems`. */
export function composeTheme(random: Random): ComposedTheme {
  const palette = random.pick(WEIGHTED_PALETTES);
  const { family, mixed, body, eye, dot } = pickPatterns(random);
  const margin = random.pick(MARGINS);
  const wantsGradient = random.chance(GRADIENT_RATE / GRADIENT_PALETTE_SHARE);
  const gradientStops =
    wantsGradient &&
    palette.gradient &&
    !GRADIENT_BODY_EXCLUDE.includes(body) &&
    palette.gradient.every(
      (stop) => contrastRatio(stop, palette.bg) >= GRADIENT_STOP_CONTRAST,
    )
      ? palette.gradient
      : null;
  const angle = random.pick([45, 135]);
  const framed = random.chance(FRAME_RATE);
  const frameStyle = random.pick(FRAME_CHOICES);
  const frameText = random.pick(FRAME_CTAS);

  const styles: ThemeStyles = {
    bgColor: palette.bg,
    fgColor: gradientStops
      ? {
          type: "linear",
          stops: [
            { color: gradientStops[0], offset: 0 },
            { color: gradientStops[1], offset: 100 },
          ],
          angle,
        }
      : palette.fg,
    eyeColor: gradientStops ? gradientStops[0] : palette.eye,
    dotColor: gradientStops ? gradientStops[1] : palette.dot,
    bodyPattern: body,
    cornerEyePattern: eye,
    cornerEyeDotPattern: dot,
    level: gradientStops ? "H" : "Q",
    margin,
    ...(framed && {
      frame: {
        style: frameStyle,
        text: frameText,
        color: gradientStops ? gradientStops[0] : palette.fg,
        textColor: palette.bg,
      },
    }),
  };

  const inverted = Boolean(palette.inverted);
  const category: ThemeCategory = inverted
    ? "dark"
    : gradientStops
      ? "gradient"
      : family.playful
        ? "playful"
        : palette.category;

  return {
    name: `${palette.word} ${family.word}`,
    category,
    styles,
    palette,
    family,
    mixed,
    gradient: Boolean(gradientStops),
    inverted,
  };
}

/** Why a theme's colors would hurt scanning; empty when they're fine. */
export function contrastProblems(styles: ThemeStyles): string[] {
  const problems: string[] = [];
  const modules = worstContrast(styles.fgColor, styles.bgColor);
  if (modules < MODULE_CONTRAST) {
    problems.push(`modules ${modules.toFixed(2)}:1`);
  }
  const eye = worstContrast(styles.eyeColor ?? styles.fgColor, styles.bgColor);
  if (eye < EYE_CONTRAST) problems.push(`eyes ${eye.toFixed(2)}:1`);
  const dot = worstContrast(styles.dotColor ?? styles.fgColor, styles.bgColor);
  if (dot < EYE_CONTRAST) problems.push(`eye centres ${dot.toFixed(2)}:1`);
  const { frame } = styles;
  if (frame?.text && frame.color && frame.textColor) {
    const label = worstContrast(frame.textColor, frame.color);
    if (label < FRAME_TEXT_CONTRAST) {
      problems.push(`frame label ${label.toFixed(2)}:1`);
    }
  }
  return problems;
}
