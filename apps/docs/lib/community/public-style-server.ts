import "server-only";

import { logoIconDataUrl } from "@/lib/qr-design/logo";
import type { LogoIconId } from "@/lib/qr-design/style";
import type { ThemeStyles } from "@/types/theme";
import { isLogoIconId, toPublishableStyle } from "./public-style";

const iconCache = new Map<LogoIconId, string>();

function iconUrl(id: LogoIconId): string {
  let url = iconCache.get(id);
  if (!url) {
    url = logoIconDataUrl(id);
    iconCache.set(id, url);
  }
  return url;
}

/**
 * A stored community design as everyone sees it: the quick logo icon drawn
 * again from QRdx's own glyph (never a stored image), nothing else added.
 */
export function toPublicStyle(
  style: ThemeStyles,
  logoIcon: unknown,
): ThemeStyles {
  const { customLogo: _never, art: _none, ...rest } = style;
  if (isLogoIconId(logoIcon) && rest.showLogo !== false) {
    return { ...rest, showLogo: true, customLogo: iconUrl(logoIcon) };
  }
  return rest;
}

/**
 * A saved theme's style made safe to show in the gallery: what the legacy
 * gallery reads straight from qr_preset.style (a live pointer), cleaned on
 * every read.
 */
export function publicStyleFromSaved(style: ThemeStyles): ThemeStyles {
  const clean = toPublishableStyle(style ?? {});
  return toPublicStyle(clean.style, clean.logoIcon);
}
