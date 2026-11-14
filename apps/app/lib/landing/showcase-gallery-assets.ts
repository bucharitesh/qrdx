import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createQRArtImage, decodePNGPixels } from "qrdx";
import {
  type GalleryArtSample,
  type GalleryAssets,
  type GalleryLogo,
  tileLogo,
  type WallTile,
} from "./showcase-gallery";

// Files the wall's codes are drawn with, read from disk. The images are
// prerendered at build time (app/gallery/[file]/route.ts), so these reads
// happen in the build (and in tests), where the working directory is
// apps/app.

/**
 * The art samples as the editor samples them (loadQRArtImage: drawn at up
 * to 4x, box-filtered to 160 px, photos cropped square), saved as PNG in
 * lib/landing/gallery-art from public/images/art-samples/logos/{bloom,wave}.svg
 * and photos/{dog,portrait}.webp. Re-sample them if those files change.
 *
 * Every read names its folder literally, so the build traces only those
 * folders (a computed path makes it trace the whole project).
 */
async function loadArt(sample: GalleryArtSample) {
  const file = await readFile(
    join(process.cwd(), "lib", "landing", "gallery-art", `${sample}.png`),
  );
  const pixels = await decodePNGPixels(new Uint8Array(file));
  if (!pixels) throw new Error(`Could not decode the ${sample} art sample`);
  return createQRArtImage(pixels);
}

/**
 * A center logo as a data URI. "qrdx" is public/logo.png, the logo the
 * editor shows when "Show logo" is on without an upload (lib/constants.ts
 * DEFAULT_QR_LOGO); the others are sample logos.
 */
async function loadLogo(logo: GalleryLogo): Promise<string> {
  if (logo === "qrdx") {
    const png = await readFile(join(process.cwd(), "public", "logo.png"));
    return `data:image/png;base64,${png.toString("base64")}`;
  }
  const svg = await readFile(
    join(
      process.cwd(),
      "public",
      "images",
      "art-samples",
      "logos",
      `${logo}.svg`,
    ),
    "utf8",
  );
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Loads the logo or art sample a tile needs (nothing for most). */
export async function loadGalleryAssets(
  tile: WallTile,
): Promise<GalleryAssets> {
  const assets: GalleryAssets = {};
  const logo = tileLogo(tile);
  if (logo) assets.logo = await loadLogo(logo);
  if (tile.art) assets.artImage = await loadArt(tile.art.sample);
  return assets;
}
