import "server-only";

import { logoIconDataUrl } from "@/lib/qr-design/logo";
import type { ThemeStyles } from "@/types/theme";
import { isLogoIconId, toPublishableStyle } from "./public-style";

const iconCache = new Map<string, string | null>();

/** The icon or brand logo drawn from its id; null for an unknown brand. */
function iconUrl(id: string): string | null {
  let url = iconCache.get(id);
  if (url === undefined) {
    try {
      url = logoIconDataUrl(id);
    } catch {
      url = null;
    }
    if (iconCache.size > 500) iconCache.clear();
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
  const url =
    isLogoIconId(logoIcon) && rest.showLogo !== false
      ? iconUrl(logoIcon)
      : null;
  if (url) return { ...rest, showLogo: true, customLogo: url };
  // A brand that isn't there (anymore) shows no logo, never the QRdx mark.
  if (isLogoIconId(logoIcon)) return { ...rest, showLogo: false };
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
