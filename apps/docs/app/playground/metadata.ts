import type { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";

// Every /playground/<themeId> variant canonicalizes to the main playground.
export const playgroundMetadata: Metadata = createMetadata({
  title: "QR Code Generator Playground — Free, No Signup",
  description:
    "Create unlimited free QR codes instantly — no signup, no watermarks. Customize colors, dot patterns, logos, and gradients with live preview. Download as PNG, SVG, or JPG.",
  keywords: [
    "free qr code generator",
    "qr code playground",
    "custom qr code maker",
    "qr code no signup",
    "qr code with logo",
  ],
  path: "/playground",
});
