import "server-only";

import {
  Calendar,
  Call,
  DocumentText,
  type Icon,
  Instagram,
  Link21,
  Location,
  Sms,
  Whatsapp,
  Wifi,
} from "iconsax-reactjs";
import { createElement } from "react";
import { serializeQrSvg } from "@/lib/qr-render";
import type { LogoChoice, LogoIconId } from "./style";

// The editor's quick logo icons (components/editor/control-sections/
// logo-presets.tsx) built on the server: the same glyph on the same white
// tile with the same marker, so the editor's logo picker shows the icon as
// selected after a design is applied.

const GLYPHS: Record<LogoIconId, Icon> = {
  wifi: Wifi,
  location: Location,
  phone: Call,
  email: Sms,
  link: Link21,
  file: DocumentText,
  calendar: Calendar,
  whatsapp: Whatsapp,
  instagram: Instagram,
};

const GLYPH_COLOR = "#111111";
const MARKER = "data-qrdx-icon";

/** The icon as the SVG data URL an uploaded logo is stored as. */
export function logoIconDataUrl(id: LogoIconId): string {
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
