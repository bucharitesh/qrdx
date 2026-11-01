import {
  Bricolage_Grotesque,
  Cormorant_Garamond,
  DM_Sans,
  Fraunces,
  Instrument_Serif,
  Space_Grotesk,
} from "next/font/google";
import type { LandingTheme } from "@/types/landing";

// Web fonts for hosted pages (the ids in LANDING_FONTS, components/landing/theme).
// None is preloaded: the @font-face rules ship with the page CSS, but a browser
// only downloads a face once text on the page uses it. A page opts in by
// carrying the font's variable class (landingFontClass), so pages that keep the
// system fonts are unchanged.

const fraunces = Fraunces({
  subsets: ["latin", "latin-ext"],
  axes: ["SOFT", "opsz"],
  display: "swap",
  preload: false,
  variable: "--font-lp-fraunces",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
  variable: "--font-lp-instrument-serif",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  preload: false,
  variable: "--font-lp-cormorant",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  preload: false,
  variable: "--font-lp-space-grotesk",
});

const bricolage = Bricolage_Grotesque({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  preload: false,
  variable: "--font-lp-bricolage",
});

const dmSans = DM_Sans({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  preload: false,
  variable: "--font-lp-dm-sans",
});

const FONT_VARIABLES: Record<string, string> = {
  fraunces: fraunces.variable,
  "instrument-serif": instrumentSerif.variable,
  cormorant: cormorant.variable,
  "space-grotesk": spaceGrotesk.variable,
  bricolage: bricolage.variable,
  "dm-sans": dmSans.variable,
};

/**
 * Variable classes for the web fonts a theme uses (body and headings), or
 * undefined when it uses none (system, Geist, ... are defined app-wide).
 */
export function landingFontClass(
  theme: Pick<LandingTheme, "font" | "headingFont">,
): string | undefined {
  const classes = new Set(
    [theme.font, theme.headingFont]
      .map((id) => (id ? FONT_VARIABLES[id] : undefined))
      .filter((value): value is string => Boolean(value)),
  );
  return classes.size > 0 ? [...classes].join(" ") : undefined;
}

/** Every web font's variable class (font pickers that preview each face). */
export const ALL_LANDING_FONT_CLASSES = Object.values(FONT_VARIABLES).join(" ");
