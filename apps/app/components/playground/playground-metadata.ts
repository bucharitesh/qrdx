import type { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";

// /playground's metadata is translated in app/[lang]/playground/(editor)/
// page.tsx (messages: playground.metaTitle, playground.metaDescription).
export const PLAYGROUND_KEYWORDS = [
  "custom qr code designer",
  "qr code designer",
  "custom qr code generator",
  "qr code with logo",
  "qr code no signup",
];

/**
 * Shared theme links (/playground/<themeId>) canonicalize to the main
 * playground. They keep the site-wide image: a segment's image file only
 * covers pages in that segment.
 */
export const sharedThemeMetadata: Metadata = createMetadata({
  title: "Custom QR Code Designer: Logo, Colors, Frames",
  description:
    "Design a custom QR code with your logo, colors, gradients, dot patterns and frames, then download PNG, SVG, PDF or EPS. Free, no signup, no watermark.",
  keywords: PLAYGROUND_KEYWORDS,
  path: "/playground",
});
