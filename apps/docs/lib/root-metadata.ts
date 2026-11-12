import type { Metadata, Viewport } from "next";
import {
  baseUrl,
  siteDescription,
  siteKeywords,
  siteName,
  siteTitle,
} from "@/lib/metadata";

/**
 * Both root layouts' metadata (app/(app) in English, app/[lang] per
 * locale). No canonical or og:url here: every child would inherit them;
 * pages set their own through createMetadata() or localizedMetadata().
 */
export function rootMetadata({
  title = siteTitle,
  description = siteDescription,
  ogLocale = "en_US",
}: {
  title?: string;
  description?: string;
  ogLocale?: string;
} = {}): Metadata {
  return {
    metadataBase: baseUrl,
    title: {
      default: title,
      template: `%s | ${siteName}`,
    },
    description,
    applicationName: siteName,
    keywords: siteKeywords,
    authors: [{ name: "Ritesh Bucha", url: "https://github.com/bucharitesh" }],
    creator: "Ritesh Bucha",
    openGraph: {
      siteName,
      locale: ogLocale,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      creator: "@bucha_ritesh",
    },
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "any" },
        { url: "/favicon.svg", type: "image/svg+xml" },
        { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      ],
      apple: "/apple-touch-icon.png",
    },
    manifest: "/site.webmanifest",
  };
}

export const rootViewport: Viewport = {
  width: "device-width",
  initialScale: 1.0,
};
