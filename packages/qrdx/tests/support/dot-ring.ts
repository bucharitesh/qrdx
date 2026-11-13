// Helpers for the dot ring template's pixel checks (dot-ring-template.test.ts and
// png-sharp-path.test.ts).
import { decodePng } from "../../src/utils/png";

/** True when resvg finds a font to draw text with on this machine. */
export async function machineHasFonts(): Promise<boolean> {
  const { Resvg } = await import("@resvg/resvg-js");
  const pixels = new Resvg(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><text x="4" y="32" font-size="32" font-family="sans-serif">M</text></svg>'
  ).render().pixels;
  return pixels.some((value, index) => index % 4 === 3 && value > 0);
}

/**
 * Light pixels in the ring's band over the top of a 593-pixel dot ring PNG: the
 * ring is black there, so only white letters are light.
 */
export async function lightOnTopOfRing(png: Uint8Array): Promise<number> {
  const image = await decodePng(png);
  if (!image) throw new Error("the PNG doesn't decode");
  let light = 0;
  for (let y = 30; y < 60; y++) {
    for (let x = 200; x < 393; x++) {
      if ((image.data[(y * image.width + x) * 4] as number) > 200) light++;
    }
  }
  return light;
}
