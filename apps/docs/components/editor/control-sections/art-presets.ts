import type { QRArtMode, QRArtVariant } from "qrdx/types";

/** Looks within each art mode (first = the renderer's default). */
export const ART_VARIANT_OPTIONS: Record<
  QRArtMode,
  { id: QRArtVariant; name: string; hint: string }[]
> = {
  logo: [
    {
      id: "blend",
      name: "Traced",
      hint: "Your logo is traced into crisp shapes that fill the code under a fine dot screen.",
    },
    {
      id: "badge",
      name: "Badge",
      hint: "Your logo sits on a rounded plate in the middle, and the dots take its colors.",
    },
  ],
  halftone: [
    {
      id: "color",
      name: "Color",
      hint: "Your photo shows in full color, with a small dot in each module that keeps it scannable.",
    },
    {
      id: "mono",
      name: "Mono",
      hint: "A black-and-white halftone of your photo, with each module's center kept true so it scans.",
    },
  ],
};

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
