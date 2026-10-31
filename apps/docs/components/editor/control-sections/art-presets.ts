import type { QRArtMode } from "qrdx/types";

/** A ready-made image for Logo QR or Image QR, served from /public. */
export interface ArtSample {
  id: string;
  name: string;
  src: string;
}

const LOGOS = "/images/art-samples/logos";
const PHOTOS = "/images/art-samples/photos";

/** Fictional brand marks (bold, flat shapes read best in Logo QR). */
const LOGO_SAMPLES: ArtSample[] = [
  { id: "bloom", name: "Bloom", src: `${LOGOS}/bloom.svg` },
  { id: "cafe", name: "Café", src: `${LOGOS}/cafe.svg` },
  { id: "summit", name: "Summit", src: `${LOGOS}/summit.svg` },
  { id: "wave", name: "Wave", src: `${LOGOS}/wave.svg` },
  { id: "leaf", name: "Leaf", src: `${LOGOS}/leaf.svg` },
  { id: "monogram", name: "Q mark", src: `${LOGOS}/monogram.svg` },
];

const PHOTO_SAMPLES: ArtSample[] = [
  { id: "latte", name: "Latte", src: `${PHOTOS}/latte.webp` },
  { id: "dog", name: "Dog", src: `${PHOTOS}/dog.webp` },
  { id: "mountain", name: "Peak", src: `${PHOTOS}/mountain.webp` },
  { id: "sneaker", name: "Sneaker", src: `${PHOTOS}/sneaker.webp` },
  { id: "flowers", name: "Flowers", src: `${PHOTOS}/flowers.webp` },
  { id: "portrait", name: "Portrait", src: `${PHOTOS}/portrait.webp` },
];

export const ART_SAMPLES: Record<QRArtMode, ArtSample[]> = {
  logo: LOGO_SAMPLES,
  halftone: PHOTO_SAMPLES,
};

export const ART_STRENGTHS = [
  { id: "subtle", name: "Subtle", value: 0.35 },
  { id: "balanced", name: "Balanced", value: 0.6 },
  { id: "bold", name: "Bold", value: 0.85 },
] as const;

/** Strength a new art code starts at (Balanced). */
export const DEFAULT_ART_STRENGTH = 0.6;

/** Settings every art code gets, so it keeps scanning. */
export const ART_RECOMMENDED = {
  level: "H",
  /** Quiet zone, in modules */
  minMargin: 4,
} as const;
