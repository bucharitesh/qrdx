// node scripts/icons.mjs
//
// Draws the app icons and launch screens for ios/ and android/ from the QRdx
// mark (packages/design-system/components/brand/brand-marks.tsx): a white
// mark on the brand blue, like the installable web scanner's icons
// (apps/docs/scripts/scanner-app-icons.ts). Re-run after `cap add`, then
// commit the images. Uses the website's sharp.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const docs = path.resolve(root, "../docs");
const sharp = createRequire(path.join(docs, "package.json"))("sharp");

const BLUE = "#0051ff";
const DARK = "#0f0f12";
const MARK = readFileSync(
  path.resolve(
    root,
    "../../packages/design-system/components/brand/brand-marks.tsx"
  ),
  "utf8"
).match(/LOGO_MARK_PATH =\s*"([^"]+)"/)[1];

/** The mark (a 256 box) at `scale` of a square canvas, over an optional fill. */
function svg(size, { scale, background, radius = 0, circle = false }) {
  const mark = size * scale;
  const offset = (size - mark) / 2;
  let fill = "";
  if (background && circle) {
    fill = `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${background}"/>`;
  } else if (background) {
    fill = `<rect width="${size}" height="${size}" rx="${radius * size}" fill="${background}"/>`;
  }
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${fill}<g transform="translate(${offset} ${offset}) scale(${mark / 256})"><path d="${MARK}" fill="#fff"/></g></svg>`
  );
}

async function png(file, image, { opaque = false } = {}) {
  let pipeline = sharp(image);
  if (opaque) {
    pipeline = pipeline.flatten({ background: BLUE });
  }
  await pipeline.png({ compressionLevel: 9 }).toFile(path.join(root, file));
  console.log(file);
}

/** A launch screen: the rounded icon in the middle of a dark canvas. */
async function splash(file, width, height) {
  const tile = Math.round(Math.min(width, height) * 0.22);
  const icon = await sharp(
    svg(tile, { scale: 0.56, background: BLUE, radius: 0.22 })
  )
    .png()
    .toBuffer();
  const image = await sharp({
    create: { width, height, channels: 3, background: DARK },
  })
    .composite([{ input: icon, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(path.join(root, file), image);
  console.log(file);
}

// iOS: one 1024 icon (no transparency; iOS rounds the corners) and the launch image.
await png(
  "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
  svg(1024, { scale: 0.56, background: BLUE }),
  { opaque: true }
);
for (const name of [
  "splash-2732x2732.png",
  "splash-2732x2732-1.png",
  "splash-2732x2732-2.png",
]) {
  await splash(
    `ios/App/App/Assets.xcassets/Splash.imageset/${name}`,
    2732,
    2732
  );
}

// Android: adaptive icons (blue background colour, white mark in the 66 dp
// safe zone of the 108 dp foreground, which is also the themed icon), and
// the legacy square and round icons.
const res = "android/app/src/main/res";
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [density, factor] of Object.entries(DENSITIES)) {
  const icon = 48 * factor;
  const foreground = 108 * factor;
  await png(
    `${res}/mipmap-${density}/ic_launcher.png`,
    svg(icon, { scale: 0.56, background: BLUE, radius: 0.22 })
  );
  await png(
    `${res}/mipmap-${density}/ic_launcher_round.png`,
    svg(icon, { scale: 0.5, background: BLUE, circle: true })
  );
  await png(
    `${res}/mipmap-${density}/ic_launcher_foreground.png`,
    svg(foreground, { scale: 0.42 })
  );
}
const SPLASHES = {
  drawable: [480, 320],
  "drawable-port-mdpi": [320, 480],
  "drawable-port-hdpi": [480, 800],
  "drawable-port-xhdpi": [720, 1280],
  "drawable-port-xxhdpi": [960, 1600],
  "drawable-port-xxxhdpi": [1280, 1920],
  "drawable-land-mdpi": [480, 320],
  "drawable-land-hdpi": [800, 480],
  "drawable-land-xhdpi": [1280, 720],
  "drawable-land-xxhdpi": [1600, 960],
  "drawable-land-xxxhdpi": [1920, 1280],
};
for (const [folder, [width, height]] of Object.entries(SPLASHES)) {
  await splash(`${res}/${folder}/splash.png`, width, height);
}
