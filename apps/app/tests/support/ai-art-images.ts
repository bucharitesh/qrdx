// Stand-ins for Gemini's AI art output, made from the real control image, so
// tests run the real scan check and Image QR blend with no network.
import { decodePNGPixels } from "qrdx";
import { toPng } from "../../../../packages/qrdx/tests/support/raster";

/**
 * A "restyle" of the control image: a colorful scene whose light and dark
 * follow the modules by `keep` (0–1). With `smear`, a band across the middle
 * loses its modules, the way a model that ignores the grid would paint it.
 */
export async function paintedArt(
  controlPng: Uint8Array,
  { keep, smear = false }: { keep: number; smear?: boolean },
): Promise<Uint8Array> {
  const control = await decodePNGPixels(controlPng);
  if (!control) throw new Error("Control image is not a readable PNG");
  const { width, height, data } = control;
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const dark = (data[i] as number) < 128;
      const hue = (Math.sin(x / 90) + Math.cos(y / 70)) / 2;
      const scene = [120 + 100 * hue, 150, 90 + 120 * (1 - hue)];
      const smeared = smear && y > height * 0.3 && y < height * 0.7;
      const target = smeared ? 150 : dark ? 30 : 225;
      for (let c = 0; c < 3; c++) {
        out[i + c] = (scene[c] as number) * (1 - keep) + target * keep;
      }
      out[i + 3] = 255;
    }
  }
  return toPng({ width, height, data: out });
}

/** Deterministic noise in [−1, 1] per pixel. */
const noise = (x: number, y: number, seed: number) => {
  const h = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return (h - Math.floor(h)) * 2 - 1;
};

/**
 * What defeats jsQR in real model output, with the module pattern intact:
 * the code redrawn `scale` times as large and moved by `shift` px (as GPT
 * Image 2 did), speckled texture inside the modules (`speckle`, 0–255 luma
 * amplitude, in 3 px grains) and a mid-tone scene painted into the quiet
 * zone instead of a light border.
 */
export async function texturedArt(
  controlPng: Uint8Array,
  {
    speckle = 90,
    scale = 1,
    shift = [0, 0],
    seed = 1,
  }: {
    speckle?: number;
    scale?: number;
    shift?: [number, number];
    seed?: number;
  } = {},
): Promise<Uint8Array> {
  const control = await decodePNGPixels(controlPng);
  if (!control) throw new Error("Control image is not a readable PNG");
  const { width, height, data } = control;
  const out = new Uint8ClampedArray(width * height * 4);
  const cx = width / 2;
  const cy = height / 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Where this pixel was in the control image
      const sx = Math.floor(cx + (x - cx - shift[0]) / scale);
      const sy = Math.floor(cy + (y - cy - shift[1]) / scale);
      const inside = sx >= 0 && sy >= 0 && sx < width && sy < height;
      const value = inside ? (data[(sy * width + sx) * 4] as number) : 255;
      const hue = (Math.sin(x / 70) + Math.cos(y / 55)) / 2;
      const grain = noise(Math.floor(x / 3), Math.floor(y / 3), seed);
      // The scene: dark modules deep green, light ones pale, the border a
      // mid-tone wash of the same scene.
      const border =
        x < 150 || y < 150 || x >= width - 150 || y >= height - 150;
      const base =
        border && value > 128 ? 120 + 40 * hue : value < 128 ? 40 : 205;
      const l = Math.min(
        255,
        Math.max(0, base + speckle * grain * (value < 128 ? 0.8 : 1)),
      );
      const i = (y * width + x) * 4;
      out[i] = l * (0.85 + 0.15 * hue);
      out[i + 1] = l;
      out[i + 2] = l * (0.9 - 0.1 * hue);
      out[i + 3] = 255;
    }
  }
  return toPng({ width, height, data: out });
}

/**
 * A scene-mode "artwork" from a scene control (the code on a grey canvas,
 * lib/ai/art-image.ts sceneControl): the canvas becomes a soft colored
 * scene, the code's light modules and margin `light` and its dark ones
 * `dark`, both scene colors rather than black and white. With `speckle`,
 * grain inside the code (0–255 luma amplitude, in 3 px grains).
 */
export async function sceneArt(
  controlPng: Uint8Array,
  {
    light = [150, 190, 235],
    dark = [20, 40, 80],
    speckle = 0,
    seed = 1,
  }: {
    light?: [number, number, number];
    dark?: [number, number, number];
    speckle?: number;
    seed?: number;
  } = {},
): Promise<Uint8Array> {
  const control = await decodePNGPixels(controlPng);
  if (!control) throw new Error("Control image is not a readable PNG");
  const { width, height, data } = control;
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const value = data[i] as number;
      const canvas = Math.abs(value - 150) < 20;
      const grain = speckle * noise(Math.floor(x / 3), Math.floor(y / 3), seed);
      const scene = [
        60 + 80 * (x / width),
        120 + 60 * Math.sin(y / 90),
        90 + 50 * Math.cos(x / 70),
      ];
      const color = canvas ? scene : value < 128 ? dark : light;
      for (let c = 0; c < 3; c++) {
        out[i + c] = (color[c] as number) + (canvas ? 0 : grain);
      }
      out[i + 3] = 255;
    }
  }
  return toPng({ width, height, data: out });
}

/** A photo stand-in: a soft two-color gradient, as a PNG data: URL. */
export async function gradientPhoto(size = 1024): Promise<string> {
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      out[i] = 230 - (120 * y) / size;
      out[i + 1] = 140 + (60 * x) / size;
      out[i + 2] = 60 + (150 * y) / size;
      out[i + 3] = 255;
    }
  }
  const png = await toPng({ width: size, height: size, data: out });
  return `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
}
