import { parseLinkUrl, playgroundHref } from "@/lib/playground-links";
import { packStyleParam } from "@/lib/playground-style-pack";
import type { QRStyle } from "@/types/theme";
import { FAMILY, FAMILY_GRADIENT, INK } from "./demos/qr-family";

// The home hero's style and frame choices (components/sections/home/
// hero-editor.tsx), and the playground link that carries them: the same
// family as the hero code above, ink on white with brand blue only as an
// accent.

export const HERO_STYLES = {
  classic: {
    label: "Classic",
    style: {
      ...FAMILY,
      dotColor: INK,
      bodyPattern: "square",
      cornerEyePattern: "square",
      cornerEyeDotPattern: "square",
    },
  },
  rounded: { label: "Rounded", style: FAMILY },
  dots: {
    label: "Dots",
    style: {
      ...FAMILY,
      bodyPattern: "circle",
      // Circle eyes are on the engine's fragile list (WEAK_EYES); extra-rounded
      // keeps the soft look and reads in every decoder.
      cornerEyePattern: "extra-rounded",
      cornerEyeDotPattern: "circle",
    },
  },
  gradient: { label: "Gradient", style: FAMILY_GRADIENT },
} satisfies Record<string, { label: string; style: QRStyle }>;

export const HERO_FRAMES = {
  none: { label: "No frame", frame: undefined },
  banner: {
    label: "Scan me",
    frame: { style: "banner-bottom", text: "Scan me", color: INK },
  },
  border: {
    label: "Border",
    frame: { style: "rounded-border", text: "", color: INK },
  },
} satisfies Record<string, { label: string; frame: QRStyle["frame"] }>;

export type HeroStyleKey = keyof typeof HERO_STYLES;
export type HeroFrameKey = keyof typeof HERO_FRAMES;

/** The hero code's whole look for a style and frame. */
export function heroLook(styleKey: HeroStyleKey, frameKey: HeroFrameKey) {
  return {
    ...HERO_STYLES[styleKey].style,
    level: "Q",
    frame: HERO_FRAMES[frameKey].frame,
  } satisfies QRStyle;
}

/**
 * "Customize in the playground": the hero's look as a `style`, and what was
 * typed. A web address travels after the `#` (never sent to a server); other
 * text can't travel in a link, so the playground opens on the Text type for
 * it to be typed again. Packed without the validator, which would grow the
 * home page's script; the playground validates every link it opens, and
 * tests/home/hero-looks.test.ts decodes every combination.
 */
export function heroPlaygroundHref(
  styleKey: HeroStyleKey,
  frameKey: HeroFrameKey,
  value: string,
): string {
  const style = packStyleParam(heroLook(styleKey, frameKey));
  const url = parseLinkUrl(value);
  if (url) return playgroundHref({ style, url });
  return playgroundHref(value.trim() ? { style, type: "text" } : { style });
}
