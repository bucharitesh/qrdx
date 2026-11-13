// The installable scanner (/scan): its web app manifest, scope and share
// target. Client-safe. Each language installs as its own app, scoped to its
// own scanner page (/scan, /hi/scan …), so an install from a language page
// opens in that language; English keeps the unprefixed, canonical /scan.
//
// The service worker (public/scan-sw.js) is registered once per language
// with the same scope, keeps that page for offline use and receives shared
// images at <scope>/share. It hands them to the page through the Cache
// Storage below: images never leave the device and never go in a URL.
import type { MetadataRoute } from "next";
import { LOCALE_INFO, type Locale } from "./i18n/config";
import { localizeHref } from "./i18n/paths";

/** The brand blue the icons are drawn on (scripts/scanner-app-icons.ts). */
export const SCANNER_APP_BLUE = "#0051ff";
/** The site's light and dark page backgrounds (design-system --background). */
export const SCANNER_APP_LIGHT = "#fdfdfd";
export const SCANNER_APP_DARK = "#0f0f12";

/** The form field the share target posts images in (public/scan-sw.js reads it). */
export const SHARE_FIELD = "images";
/** Where the service worker leaves shared images for the page (and the page deletes them). */
export const SHARE_CACHE = "qrdx-scan-shared";
/** The hash the share target redirects to; the page clears it once read. */
export const SHARED_HASH = "#shared";

/** The scanner page, and the installed app's scope: /scan, /hi/scan. */
export function scannerScope(locale: Locale): string {
  return localizeHref("/scan", locale);
}

export function scannerManifestPath(locale: Locale): string {
  return `${scannerScope(locale)}/manifest.webmanifest`;
}

/** Shared images are posted here; the service worker answers before the server does. */
export function scannerSharePath(locale: Locale): string {
  return `${scannerScope(locale)}/share`;
}

export interface ScannerAppCopy {
  name: string;
  shortName: string;
  description: string;
  cameraShortcut: string;
  imageShortcut: string;
}

const icon = (
  name: string,
  size: number,
  purpose: "any" | "maskable" | "monochrome",
) => ({
  src: `/app-icons/scanner/${name}-${size}.png`,
  sizes: `${size}x${size}`,
  type: "image/png",
  purpose,
});

export function scannerManifest(
  locale: Locale,
  copy: ScannerAppCopy,
): MetadataRoute.Manifest {
  const scope = scannerScope(locale);
  const info = LOCALE_INFO[locale];
  return {
    // English keeps the id of the manifest it replaces (installs stay one app).
    id: scope,
    name: copy.name,
    short_name: copy.shortName,
    description: copy.description,
    lang: info.hreflang[0],
    dir: info.dir,
    start_url: scope,
    scope,
    display: "standalone",
    background_color: SCANNER_APP_DARK,
    theme_color: SCANNER_APP_DARK,
    categories: ["utilities", "productivity"],
    icons: [
      icon("icon", 192, "any"),
      icon("icon", 512, "any"),
      icon("maskable", 192, "maskable"),
      icon("maskable", 512, "maskable"),
      icon("monochrome", 512, "monochrome"),
    ],
    shortcuts: [
      {
        name: copy.cameraShortcut,
        url: `${scope}#camera`,
        icons: [96, 192].map((size) => icon("shortcut-camera", size, "any")),
      },
      {
        name: copy.imageShortcut,
        url: `${scope}#image`,
        icons: [96, 192].map((size) => icon("shortcut-image", size, "any")),
      },
    ],
    share_target: {
      action: scannerSharePath(locale),
      method: "POST",
      enctype: "multipart/form-data",
      params: { files: [{ name: SHARE_FIELD, accept: ["image/*"] }] },
    },
  };
}

/** The manifest as a response (app/scan/manifest.webmanifest and its translations). */
export function manifestResponse(manifest: MetadataRoute.Manifest): Response {
  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

/** Where a share that reached the server (no service worker yet) goes back to. */
export function sharedRedirect(request: Request, locale: Locale): Response {
  const target = new URL(
    `${scannerScope(locale)}${SHARED_HASH}`,
    request.url,
  ).toString();
  return Response.redirect(target, 303);
}
