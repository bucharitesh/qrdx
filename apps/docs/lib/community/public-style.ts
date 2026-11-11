// What a design shared in the community may carry, and nothing more.
//
// A saved theme can hold an uploaded logo (`customLogo`: a data URL or a
// link) and Logo QR / Image QR art (`art`, built from an uploaded image).
// Neither is ever published: they are the creator's own images. The editor's
// quick logo icons are stored in the same form as an upload (an SVG data URL
// tagged data-qrdx-icon="<id>", components/editor/control-sections/
// logo-presets.tsx), and anyone can forge that tag, so only the icon's id is
// kept and the icon is drawn again from QRdx's own glyph when the design is
// read (toPublicStyle in ./public-style-server.ts). The stored data URL is
// never republished.

import { hasImageFills, withoutImageFills } from "@/lib/paint/image-fills";
import { logoIconOf, parseLogoIcon } from "@/lib/qr-design/logo-icon";
import type { ThemeStyles } from "@/types/theme";

/** What was taken out of a design before it was shared. */
export type RemovedPart = "logo" | "art" | "image";

/** A design as it is stored in the community: no images, icons by id. */
export interface PublishableStyle {
  style: ThemeStyles;
  /** A quick logo icon or brand logo, drawn again from its id on read */
  logoIcon: string | null;
  removed: RemovedPart[];
}

/**
 * The quick logo icon or brand logo a stored logo is tagged with, as a
 * logoIcon (`wifi`, `spotify`, `paypal:white`), or null. Only the tag is
 * read; the rest of the data URL is ignored. A brand is drawn again from
 * QRdx's own copy of Simple Icons, so a forged tag can only ever show a
 * real brand mark (and an unknown slug shows none).
 */
export function presetLogoIcon(logo: unknown): string | null {
  return logoIconOf(logo);
}

export const isLogoIconId = (value: unknown): value is string =>
  parseLogoIcon(value) !== null;

/**
 * `style` without uploaded logos or image art. A quick icon becomes its id;
 * an uploaded logo is dropped and the logo switched off, so the shared
 * design never shows the QRdx mark in its place either. The QRdx mark itself
 * (showLogo without customLogo) is kept.
 */
export function toPublishableStyle(style: ThemeStyles): PublishableStyle {
  const { customLogo, art, ...rest } = style;
  const removed: RemovedPart[] = [];
  let logoIcon: string | null = null;
  // Image fills are uploads too: each gives way to its underlay color
  const next: ThemeStyles = withoutImageFills({ ...rest });
  if (hasImageFills(rest)) removed.push("image");

  if (art !== undefined) removed.push("art");
  if (customLogo) {
    logoIcon = presetLogoIcon(customLogo);
    if (logoIcon) {
      next.showLogo = style.showLogo !== false;
    } else {
      removed.push("logo");
      next.showLogo = false;
    }
  }
  if (!next.showLogo) logoIcon = null;
  return { style: next, logoIcon, removed };
}

/** Plain-language note for the publish dialog about what isn't shared. */
export function removedPartsNote(removed: RemovedPart[]): string | null {
  const pictures = removed.includes("image")
    ? " Image fills aren't shared either; those parts use their underlay color."
    : "";
  const note = uploadsNote(removed);
  if (!note) {
    return pictures
      ? "Your image fills aren't shared; those parts use their underlay color."
      : null;
  }
  return `${note}${pictures}`;
}

function uploadsNote(removed: RemovedPart[]): string | null {
  if (removed.includes("logo") && removed.includes("art")) {
    return "Your uploaded logo and image art aren't shared. The published design has neither.";
  }
  if (removed.includes("logo")) {
    return "Your uploaded logo isn't shared. The published design has no logo.";
  }
  if (removed.includes("art")) {
    return "Your image art isn't shared. The published design uses plain modules.";
  }
  return null;
}
