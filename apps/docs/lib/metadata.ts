import { BRAND_NAME, CANONICAL_ORIGIN } from "@repo/config";
import type { Metadata } from "next";

// Readers reach the docs through the main app (qrdx.dev proxies them here),
// so every absolute URL (canonical, hreflang, Open Graph, the sitemap) is
// written against NEXT_PUBLIC_APP_URL. Unlike the main app's copy, never
// VERCEL_PROJECT_PRODUCTION_URL: on this project that's the docs site's own
// domain. Under `next dev` the main app's dev server is the front door.
export const baseUrl =
  process.env.NODE_ENV === "development"
    ? new URL("http://localhost:3000")
    : new URL(process.env.NEXT_PUBLIC_APP_URL ?? CANONICAL_ORIGIN);

export const siteName = BRAND_NAME;

// Brand first: "qrdx" is the site's biggest search query.
export const siteTitle =
  "QRdx: Free QR Code Generator with Logos and Dynamic Codes";

export const siteDescription =
  "Free, open-source QR code generator: unlimited codes with logos, colors and frames, no signup or watermark. Plus dynamic codes and scan analytics.";

/** Root-layout `keywords`; search engines mostly ignore them, so keep them few and accurate. */
export const siteKeywords = [
  "free qr code generator",
  "dynamic qr code generator",
  "qr code with logo",
  "qr code generator no signup",
  "qr code landing page",
  "qr code analytics",
  "open source qr code generator",
  "qr code api",
  "react qr code library",
  "eps qr code",
];

/** Served by app/opengraph-image.tsx */
export const defaultOgImage = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "QRdx: free QR code generator with dynamic QR codes, hosted pages and scan analytics",
};

function plainTitle(title: Metadata["title"]): string | undefined {
  if (!title) return undefined;
  if (typeof title === "string") return title;
  if ("absolute" in title && title.absolute) return title.absolute;
  if ("default" in title) return title.default;
  return undefined;
}

/**
 * Page metadata with canonical URL, Open Graph and Twitter card filled in.
 * Pass `path` (e.g. "/pricing") to set `alternates.canonical` and `og:url`.
 * Explicit `openGraph` / `twitter` / `alternates` fields win over the defaults.
 *
 * Pass `ownOgImage: true` when the route segment has its own
 * `opengraph-image.tsx`. Next.js only uses a segment's image file when that
 * segment's metadata sets no `openGraph.images`, so the site-wide default
 * would hide it. Every other page needs the default: setting `openGraph`
 * without images drops the image inherited from app/opengraph-image.tsx.
 */
export function createMetadata({
  path,
  ownOgImage = false,
  ...override
}: Metadata & { path?: string; ownOgImage?: boolean }): Metadata {
  const url = path ? new URL(path, baseUrl).toString() : undefined;
  const title = plainTitle(override.title);
  const description = override.description ?? undefined;

  return {
    ...override,
    openGraph: {
      type: "website",
      siteName,
      locale: "en_US",
      title,
      description,
      url,
      ...(!ownOgImage && { images: [defaultOgImage] }),
      ...override.openGraph,
    },
    twitter: {
      card: "summary_large_image",
      creator: "@bucha_ritesh",
      title,
      description,
      ...override.twitter,
    },
    alternates: {
      ...(url && { canonical: url }),
      ...override.alternates,
    },
  };
}
