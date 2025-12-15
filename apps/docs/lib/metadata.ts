import type { Metadata } from "next/types";

export function createMetadata(override: Metadata): Metadata {
  return {
    ...override,
    openGraph: {
      title: override.title ?? undefined,
      description: override.description ?? undefined,
      url: "https://qrdx.dev",
      images: "/og-image.png",
      siteName: "QRDX",
      ...override.openGraph,
    },
    twitter: {
      card: "summary_large_image",
      creator: "@bucharitesh",
      title: override.title ?? undefined,
      description: override.description ?? undefined,
      images: "/og-image.png",
      ...override.twitter,
    },
    alternates: {
      canonical: override.alternates?.canonical,
      ...override.alternates,
    },
  };
}

export const baseUrl =
  process.env.NODE_ENV === "development" ||
  !process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? new URL("http://localhost:3000")
    : new URL(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
