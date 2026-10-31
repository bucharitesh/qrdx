import type { Metadata } from "next";

export const baseUrl =
  process.env.NODE_ENV === "development"
    ? new URL("http://localhost:3000")
    : new URL(
        process.env.VERCEL_PROJECT_PRODUCTION_URL
          ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
          : (process.env.NEXT_PUBLIC_APP_URL ?? "https://qrdx.dev"),
      );

export const siteName = "QRdx";

export const siteTitle = "Free QR Code Generator & Dynamic QR Codes | QRdx";

export const siteDescription =
  "Unlimited free QR codes with logos, colors and patterns, no signup or watermark. Plus editable dynamic codes, hosted pages and scan analytics. Open source.";

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
 */
export function createMetadata({
  path,
  ...override
}: Metadata & { path?: string }): Metadata {
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
      images: [defaultOgImage],
      ...override.openGraph,
    },
    twitter: {
      card: "summary_large_image",
      creator: "@bucharitesh",
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
