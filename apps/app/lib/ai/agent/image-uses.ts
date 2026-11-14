// The ways the chat's use_image tool can put an attached picture into a
// code. Shared by the tool's schema (server) and the browser, which does the
// work: every way but AI art runs in the editor with no AI credits.

export const IMAGE_PLACEMENTS = [
  "logo",
  "logo_qr",
  "image_qr",
  "background",
  "dots",
] as const;

/** A way the editor places a picture itself (no AI). */
export type ImagePlacement = (typeof IMAGE_PLACEMENTS)[number];

/** Everything use_image takes: the placements, or AI art (paid). */
export const IMAGE_USES = [...IMAGE_PLACEMENTS, "ai_art"] as const;
export type ImageUse = (typeof IMAGE_USES)[number];

export const IMAGE_USE_LABELS: Record<ImageUse, string> = {
  logo: "the logo",
  logo_qr: "Logo QR art",
  image_qr: "Image QR art",
  background: "the background",
  dots: "the dots",
  ai_art: "AI art",
};

export const isImagePlacement = (use: ImageUse): use is ImagePlacement =>
  use !== "ai_art";
