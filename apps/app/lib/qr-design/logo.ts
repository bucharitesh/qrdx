import "server-only";

import {
  Calendar,
  Call,
  DocumentText,
  type Icon,
  Link21,
  Location,
  Sms,
  Wifi,
} from "iconsax-reactjs";
import { createElement } from "react";
import { brandMark } from "@/lib/brand-logos/brand-logo";
import { getBrandIcon } from "@/lib/brand-logos/server";
import { brandLogoDataUrl, brandQuickIconDataUrl } from "@/lib/brand-logos/svg";
import { HttpError } from "@/lib/error-response";
import { serializeQrSvg } from "@/lib/qr-render";
import { parseLogoIcon } from "./logo-icon";
import type { LogoChoice, LogoIconId } from "./style";

// The editor's quick logo icons (components/editor/control-sections/
// logo-presets.tsx) built on the server: the same glyph on the same white
// tile with the same marker, so the editor's logo picker shows the icon as
// selected after a design is applied. WhatsApp and Instagram are the real
// marks (Simple Icons); the rest are iconsax glyphs, since they aren't
// brands. Any other brand comes bare from the full catalogue.

type GenericIconId = Exclude<LogoIconId, "whatsapp" | "instagram">;

const GLYPHS: Record<GenericIconId, Icon> = {
  wifi: Wifi,
  location: Location,
  phone: Call,
  email: Sms,
  link: Link21,
  file: DocumentText,
  calendar: Calendar,
};

const GLYPH_COLOR = "#111111";
const MARKER = "data-qrdx-icon";

/** A brand logoIcon that names no Simple Icons brand. */
export class UnknownBrandLogoError extends HttpError {
  constructor(slug: string) {
    super(
      400,
      "VALIDATION_ERROR",
      `logoIcon "${slug}" isn't a brand QRdx has. Use a Simple Icons slug (spotify, paypal, googlemaps) or a quick icon (wifi, phone, email).`,
    );
  }
}

/**
 * A logoIcon (a quick icon id, or a brand slug with an optional color, see
 * ./logo-icon.ts) as the SVG data URL an uploaded logo is stored as.
 * Throws UnknownBrandLogoError for a slug Simple Icons doesn't have.
 */
export function logoIconDataUrl(icon: string): string {
  const parsed = parseLogoIcon(icon);
  if (!parsed) throw new UnknownBrandLogoError(icon);
  if (parsed.kind === "brand") {
    const brand = getBrandIcon(parsed.slug);
    if (!brand) throw new UnknownBrandLogoError(parsed.slug);
    return brandLogoDataUrl(brand, parsed.color);
  }
  const id = parsed.id;
  if (id === "whatsapp" || id === "instagram") {
    return brandQuickIconDataUrl(brandMark(id), id);
  }
  const glyph = serializeQrSvg(
    createElement(GLYPHS[id], { variant: "Bold", color: GLYPH_COLOR }),
  );
  const viewBox = /viewBox="([^"]+)"/.exec(glyph)?.[1] ?? "0 0 24 24";
  const inner = glyph.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" ${MARKER}="${id}"><rect width="96" height="96" rx="22" fill="#ffffff"/><svg x="18" y="18" width="60" height="60" viewBox="${viewBox}" fill="none">${inner}</svg></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(markup)}`;
}

/**
 * The logo fields of ThemeStyles for a design's logo choice. "keep" leaves
 * the code's current logo as it is (the browser keeps it; `current` is the
 * image when known, for saving).
 */
export function resolveLogo(
  logo: LogoChoice,
  current?: { showLogo: boolean; customLogo?: string },
): { showLogo: boolean; customLogo?: string } | "keep" {
  if (logo === "none") return { showLogo: false };
  if (logo === "qrdx") return { showLogo: true };
  if (logo === "keep") {
    return current
      ? {
          showLogo: current.showLogo,
          ...(current.customLogo ? { customLogo: current.customLogo } : {}),
        }
      : "keep";
  }
  return { showLogo: true, customLogo: logoIconDataUrl(logo) };
}
