// The scene and photo examples on /ai/art: real images from the art
// pipeline (scripts/ai/art-eval.ts --text <ART_MODE_EXAMPLES_TEXT>), saved
// as small WebP in public/images/ai-art-scenes.
// tests/lib/ai-art-scene-examples.test.ts checks that each one still scans.

import { CANONICAL_ORIGIN } from "@repo/config";
import type { ArtMode } from "./config";

/** What every example encodes: the /ai/art page itself. */
export const ART_MODE_EXAMPLES_TEXT = `${CANONICAL_ORIGIN}/ai/art`;

export interface ArtModeExample {
  /** File name in public/images/ai-art-scenes, and its caption's key */
  id:
    | "lighthouse"
    | "painted-townhouses"
    | "venice-canals"
    | "cottage-garden"
    | "neon-city"
    | "photo-mountain"
    | "photo-latte"
    | "photo-dog";
  mode: Exclude<ArtMode, "code">;
}

/**
 * Scene mode from style presets of the same names (presets.ts); photo mode
 * from the sample photos in public/images/art-samples/photos.
 */
export const ART_MODE_EXAMPLES: readonly ArtModeExample[] = [
  { id: "painted-townhouses", mode: "scene" },
  { id: "lighthouse", mode: "scene" },
  { id: "photo-mountain", mode: "photo" },
  { id: "venice-canals", mode: "scene" },
  { id: "cottage-garden", mode: "scene" },
  { id: "photo-latte", mode: "photo" },
  { id: "neon-city", mode: "scene" },
  { id: "photo-dog", mode: "photo" },
];

export const artModeExampleSrc = (id: ArtModeExample["id"]): string =>
  `/images/ai-art-scenes/${id}.webp`;
