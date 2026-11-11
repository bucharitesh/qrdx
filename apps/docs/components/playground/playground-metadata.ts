import type { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";

// The home page owns "QR code generator"; the playground is the designer.
const PLAYGROUND = {
  title: "Custom QR Code Designer: Logo, Colors, Frames",
  description:
    "Design a custom QR code with your logo, colors, gradients, dot patterns and frames, then download PNG, SVG, PDF or EPS. Free, no signup, no watermark.",
  keywords: [
    "custom qr code designer",
    "qr code designer",
    "custom qr code generator",
    "qr code with logo",
    "qr code no signup",
  ],
  path: "/playground",
} satisfies Metadata & { path: string };

/** /playground, with its own image in (editor)/opengraph-image.tsx. */
export const playgroundMetadata: Metadata = createMetadata({
  ...PLAYGROUND,
  ownOgImage: true,
});

/**
 * Shared theme links (/playground/<themeId>) canonicalize to the main
 * playground. They keep the site-wide image: a segment's image file only
 * covers pages in that segment.
 */
export const sharedThemeMetadata: Metadata = createMetadata(PLAYGROUND);
