// bun x tsx scripts/scanner-app-icons.ts
//
// Draws the installable scanner's icons (public/app-icons/scanner/) from the QRdx
// mark: a white mark on the brand blue. Maskable icons keep the mark inside
// the 80% safe circle, so launchers can crop them to any shape. The two
// shortcut icons use the scanner's own iconsax glyphs. Re-run it after the
// mark or the brand colour changes, and commit the PNGs.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { LOGO_MARK_PATH } from "@repo/design-system/components/brand/brand-marks";
import { Camera, GalleryExport } from "iconsax-reactjs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";

const OUT = path.join(__dirname, "../public/app-icons/scanner");
const BLUE = "#0051ff";
const WHITE = "#ffffff";

/** The mark (a 256 box) centred on a square canvas, `scale` of its width. */
function markSvg(
  size: number,
  {
    scale,
    background,
    radius = 0,
    color = WHITE,
  }: { scale: number; background?: string; radius?: number; color?: string },
): string {
  const mark = size * scale;
  const offset = (size - mark) / 2;
  const tile = background
    ? `<rect width="${size}" height="${size}" rx="${radius * size}" fill="${background}"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${tile}<g transform="translate(${offset} ${offset}) scale(${mark / 256})"><path d="${LOGO_MARK_PATH}" fill="${color}"/></g></svg>`;
}

/** An iconsax glyph (24 box) centred on a blue square, half its width. */
function glyphSvg(size: number, Glyph: typeof Camera): string {
  const glyph = renderToStaticMarkup(
    createElement(Glyph, { color: WHITE, size: size / 2, variant: "Linear" }),
  ).replace("<svg ", `<svg x="${size / 4}" y="${size / 4}" `);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${BLUE}"/>${glyph}</svg>`;
}

async function write(name: string, svg: string): Promise<void> {
  await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, name));
  console.log(`public/app-icons/scanner/${name}`);
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  for (const size of [192, 512]) {
    // Shown as is (desktop): a rounded tile.
    await write(
      `icon-${size}.png`,
      markSvg(size, { scale: 0.54, background: BLUE, radius: 0.22 }),
    );
    // Cropped by the launcher (Android, macOS): full bleed, mark in the safe zone.
    await write(
      `maskable-${size}.png`,
      markSvg(size, { scale: 0.5, background: BLUE }),
    );
  }
  // Android's themed (one-colour) icons use the shape only.
  await write("monochrome-512.png", markSvg(512, { scale: 0.5 }));
  // iOS rounds the corners itself and shows transparency as black.
  await write(
    "apple-touch-icon.png",
    markSvg(180, { scale: 0.56, background: BLUE }),
  );
  for (const size of [96, 192]) {
    await write(`shortcut-camera-${size}.png`, glyphSvg(size, Camera));
    await write(`shortcut-image-${size}.png`, glyphSvg(size, GalleryExport));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
