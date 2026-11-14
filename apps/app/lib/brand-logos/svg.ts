// Brand marks as SVG markup and data URLs, for QR logos. Pure string work:
// safe in the browser, on the server and in tests. A chosen brand logo is
// embedded in the code's style like an uploaded one (an SVG data URL), so
// nothing is fetched from anywhere when the code is drawn or scanned.
//
// The data URL carries data-qrdx-icon="<slug>:<color>" (the editor's quick
// icons carry data-qrdx-icon="<id>"): the editor reads it to show which logo
// is picked, and the API and community redraw the mark from the slug rather
// than trusting the markup (see lib/qr-design/logo-icon.ts).

/** A brand from Simple Icons: its slug, name, color and 24×24 path. */
export interface BrandIcon {
  slug: string;
  title: string;
  /** Brand color, six hex digits without "#" */
  hex: string;
  path: string;
}

/** How a brand mark is colored: its brand color, black or white. */
export const BRAND_LOGO_COLORS = ["brand", "black", "white"] as const;
export type BrandLogoColor = (typeof BRAND_LOGO_COLORS)[number];

export const BRAND_LOGO_COLOR_NAMES: Record<BrandLogoColor, string> = {
  brand: "Brand color",
  black: "Black",
  white: "White",
};

/** Simple Icons slugs: lowercase letters and digits. */
export const BRAND_SLUG = /^[a-z0-9]+$/;

/** The marker attribute a logo data URL carries (shared with quick icons). */
export const LOGO_ICON_MARKER = "data-qrdx-icon";

const SVG_DATA_URL = "data:image/svg+xml,";

export function brandFill(hex: string, color: BrandLogoColor): string {
  if (color === "white") return "#ffffff";
  if (color === "black") return "#000000";
  return `#${hex}`;
}

/**
 * Relative luminance of a six-digit hex color (0 black, 1 white), as WCAG
 * defines it.
 */
export function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.039_28 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** Brand colors this light barely show on a white code. */
const LIGHT_BRAND = 0.6;

/**
 * Whether the mark in `color` needs a plate to be seen on a light code: a
 * white mark, or a brand color as light as Snapchat's yellow.
 */
export function brandNeedsPlate(hex: string, color: BrandLogoColor): boolean {
  return (
    color === "white" || (color === "brand" && luminance(hex) > LIGHT_BRAND)
  );
}

/** The plate color that sets the mark off: its brand color behind white, black behind a light brand color, else white. */
export function brandPlateColor(hex: string, color: BrandLogoColor): string {
  if (color === "white") return `#${hex.toLowerCase()}`;
  if (color === "brand" && luminance(hex) > LIGHT_BRAND) return "#000000";
  return "#ffffff";
}

const escapeXml = (text: string) =>
  text.replace(/[<>&"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** `<slug>:<color>`, the id a brand logo is stored and requested by. */
export const brandLogoRef = (slug: string, color: BrandLogoColor) =>
  `${slug}:${color}`;

/**
 * The bare mark as an SVG document: a 24-unit mark with one unit of air on
 * every side, so the cleared area around it doesn't touch it. A plate, when
 * wanted, is the engine's (logoOptions.plate), not part of the image.
 */
export function brandLogoSvg(icon: BrandIcon, color: BrandLogoColor): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="-1 -1 26 26" ${LOGO_ICON_MARKER}="${brandLogoRef(icon.slug, color)}"><title>${escapeXml(icon.title)}</title><path fill="${brandFill(icon.hex, color)}" d="${icon.path}"/></svg>`;
}

export function brandLogoDataUrl(
  icon: BrandIcon,
  color: BrandLogoColor,
): string {
  return `${SVG_DATA_URL}${encodeURIComponent(brandLogoSvg(icon, color))}`;
}

/**
 * A brand among the editor's quick icons (WhatsApp, Instagram): the mark in
 * its brand color on the same white tile as the other quick icons, tagged
 * with the quick icon's id.
 */
export function brandQuickIconDataUrl(icon: BrandIcon, id: string): string {
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" ${LOGO_ICON_MARKER}="${id}"><title>${escapeXml(icon.title)}</title><rect width="96" height="96" rx="22" fill="#ffffff"/><svg x="22" y="22" width="52" height="52" viewBox="0 0 24 24"><path fill="#${icon.hex}" d="${icon.path}"/></svg></svg>`;
  return `${SVG_DATA_URL}${encodeURIComponent(markup)}`;
}

/** The marker value of a logo data URL (`wifi`, `spotify:brand`), or null. */
export function logoMarkerOf(logo: unknown): string | null {
  if (typeof logo !== "string" || !logo.startsWith(SVG_DATA_URL)) return null;
  const marker = encodeURIComponent(`${LOGO_ICON_MARKER}="`);
  const start = logo.indexOf(marker);
  if (start < 0) return null;
  const from = start + marker.length;
  const end = logo.indexOf(encodeURIComponent('"'), from);
  if (end < 0) return null;
  const value = decodeURIComponent(logo.slice(from, end));
  return /^[a-z0-9]+(?::[a-z]+)?$/.test(value) ? value : null;
}

/** The <title> of a logo data URL (a brand's name), or null. */
export function logoTitleOf(logo: unknown): string | null {
  if (typeof logo !== "string" || !logo.startsWith(SVG_DATA_URL)) return null;
  let markup: string;
  try {
    markup = decodeURIComponent(logo.slice(SVG_DATA_URL.length));
  } catch {
    return null;
  }
  const title = /<title>([^<]{1,120})<\/title>/.exec(markup)?.[1];
  return title
    ? title.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    : null;
}

/** `spotify:white` → { slug, color }; a bare slug means its brand color. */
export function parseBrandLogoRef(
  value: string,
): { slug: string; color: BrandLogoColor } | null {
  const match = /^([a-z0-9]+)(?::([a-z]+))?$/.exec(value);
  if (!match) return null;
  const color = (match[2] ?? "brand") as BrandLogoColor;
  if (!BRAND_LOGO_COLORS.includes(color)) return null;
  return { slug: match[1] as string, color };
}
