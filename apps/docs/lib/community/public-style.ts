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
import { LOGO_ICON_IDS, type LogoIconId } from "@/lib/qr-design/style";
import type { ThemeStyles } from "@/types/theme";

const SVG_DATA_URL = "data:image/svg+xml,";
const MARKER = "data-qrdx-icon";

/** What was taken out of a design before it was shared. */
export type RemovedPart = "logo" | "art" | "image";

/** A design as it is stored in the community: no images, icons by id. */
export interface PublishableStyle {
  style: ThemeStyles;
  /** A quick logo icon, drawn again from its id on read */
  logoIcon: LogoIconId | null;
  removed: RemovedPart[];
}

/**
 * The quick logo icon a stored logo is tagged with, or null. Only the id is
 * read (and only a known one); the rest of the data URL is ignored.
 */
export function presetLogoIcon(logo: unknown): LogoIconId | null {
  if (typeof logo !== "string" || !logo.startsWith(SVG_DATA_URL)) return null;
  for (const id of LOGO_ICON_IDS) {
    if (logo.includes(encodeURIComponent(`${MARKER}="${id}"`))) return id;
  }
  return null;
}

export const isLogoIconId = (value: unknown): value is LogoIconId =>
  typeof value === "string" &&
  (LOGO_ICON_IDS as readonly string[]).includes(value);

/**
 * `style` without uploaded logos or image art. A quick icon becomes its id;
 * an uploaded logo is dropped and the logo switched off, so the shared
 * design never shows the QRdx mark in its place either. The QRdx mark itself
 * (showLogo without customLogo) is kept.
 */
export function toPublishableStyle(style: ThemeStyles): PublishableStyle {
  const { customLogo, art, ...rest } = style;
  const removed: RemovedPart[] = [];
  let logoIcon: LogoIconId | null = null;
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
