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
