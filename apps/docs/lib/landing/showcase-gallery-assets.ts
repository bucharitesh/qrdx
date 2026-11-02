import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createQRArtImage, decodePNGPixels } from "qrdx";
import type {
  GalleryArtSample,
  GalleryAssets,
  GalleryCode,
} from "./showcase-gallery";

// Files the gallery codes are drawn with, read from disk. The gallery images
// are prerendered at build time (app/gallery/[file]/route.ts), so these reads
// happen in the build (and in tests), where the working directory is
// apps/docs.

const LOGOS: Record<NonNullable<GalleryCode["logo"]>, string> = {
  cafe: "public/images/art-samples/logos/cafe.svg",
};

/**
 * The art samples as the editor samples them (loadQRArtImage: drawn at up
 * to 4x, box-filtered to 160 px, photos cropped square), saved as PNG from
 * public/images/art-samples/logos/bloom.svg and photos/dog.webp.
 * Re-sample them if those files change.
 */
const ART: Record<GalleryArtSample, string> = {
  bloom: "lib/landing/gallery-art/bloom.png",
  dog: "lib/landing/gallery-art/dog.png",
};

const read = (file: string) => readFile(join(process.cwd(), file));

async function loadArt(sample: GalleryArtSample) {
  const pixels = await decodePNGPixels(new Uint8Array(await read(ART[sample])));
  if (!pixels) throw new Error(`Could not decode the ${sample} art sample`);
  return createQRArtImage(pixels);
}

/** Loads the logo or art sample a gallery code needs (nothing for most). */
export async function loadGalleryAssets(
  code: GalleryCode,
): Promise<GalleryAssets> {
  const assets: GalleryAssets = {};
  if (code.logo) {
    const svg = (await read(LOGOS[code.logo])).toString("utf8");
    assets.logo = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }
  if (code.art) {
    assets.artImage = await loadArt(code.art.sample);
  }
  return assets;
}
