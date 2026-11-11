// What a `logoIcon` value may be, wherever one is accepted (image API, codes
// API, MCP, community, code snippets): one of the editor's quick icons, or a
// brand from Simple Icons by slug, optionally with a color.
//
//   wifi, location, phone, email, link, file, calendar, whatsapp, instagram
//     a quick icon on a white tile, as the editor's Quick icons draw it
//   spotify, paypal:black, whatsapp:white, ...
//     the brand's mark, bare (a plate is logoOptions.plate); no color means
//     the brand color
//
// Safe to import anywhere: whether a slug exists is checked where the mark
// is drawn (lib/qr-design/logo.ts), so the full catalogue stays server-side.

import { z } from "zod";
import {
  type BrandLogoColor,
  logoMarkerOf,
  parseBrandLogoRef,
} from "@/lib/brand-logos/svg";
import { LOGO_ICON_IDS, type LogoIconId } from "./style";

/** A quick icon id, or `<slug>` / `<slug>:<brand|black|white>`. */
export const LOGO_ICON_PATTERN = /^[a-z0-9]{1,64}(?::(?:brand|black|white))?$/;

export type ParsedLogoIcon =
  | { kind: "quick"; id: LogoIconId }
  | { kind: "brand"; slug: string; color: BrandLogoColor };

export const isQuickLogoIcon = (value: unknown): value is LogoIconId =>
  typeof value === "string" &&
  (LOGO_ICON_IDS as readonly string[]).includes(value);

/** A quick icon or a brand, or null when `value` is neither form. */
export function parseLogoIcon(value: unknown): ParsedLogoIcon | null {
  if (typeof value !== "string" || !LOGO_ICON_PATTERN.test(value)) return null;
  if (isQuickLogoIcon(value)) return { kind: "quick", id: value };
  const brand = parseBrandLogoRef(value);
  return brand ? { kind: "brand", ...brand } : null;
}

/**
 * The shortest value that asks for this logo: a quick id, a slug alone for
 * a brand-colored mark (unless the slug is also a quick icon), else
 * `<slug>:<color>`.
 */
export function formatLogoIcon(icon: ParsedLogoIcon): string {
  if (icon.kind === "quick") return icon.id;
  return icon.color === "brand" && !isQuickLogoIcon(icon.slug)
    ? icon.slug
    : `${icon.slug}:${icon.color}`;
}

/**
 * The logoIcon a stored logo (an SVG data URL QRdx made) stands for: a
 * quick icon's id, or a brand tagged with its color as QRdx tags them
 * (`spotify:brand`). Any other tag is ignored.
 */
export function logoIconOf(logo: unknown): string | null {
  const marker = logoMarkerOf(logo);
  if (isQuickLogoIcon(marker)) return marker;
  if (!marker?.includes(":")) return null;
  const parsed = parseLogoIcon(marker);
  return parsed ? formatLogoIcon(parsed) : null;
}

export const LOGO_ICON_HELP = `A logo QRdx draws: a quick icon on a white tile (${LOGO_ICON_IDS.join(", ")}), or any brand from Simple Icons by its slug (spotify, paypal, googlemaps), drawn in its brand color. Add :black or :white for those colors (whatsapp:white). Brand logos have no tile; set logoOptions.plate for a plate behind one.`;

export const logoIconSchema = z
  .string()
  .regex(
    LOGO_ICON_PATTERN,
    "Must be a quick icon id or a Simple Icons slug, optionally followed by :brand, :black or :white",
  )
  .describe(LOGO_ICON_HELP);
