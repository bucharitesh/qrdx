// When art renders, by colors: getQRArtColorIssue must agree with the
// renderer, so the editor can say why art isn't showing.
import { describe, expect, it } from "vitest";
import {
  createQRArtImage,
  getQRArtColorIssue,
  getQRAsSVGDataUri,
  QR_ART_MIN_LUMA_GAP,
} from "../src/index";

// A small two-tone image: enough for logo art to have something to draw.
function sampleArt() {
  const size = 16;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const dark = (i % size) + Math.floor(i / size) < size;
    data.set(dark ? [20, 40, 160, 255] : [250, 250, 250, 255], i * 4);
  }
  const image = createQRArtImage({ width: size, height: size, data });
  return { mode: "logo" as const, image };
}

describe("getQRArtColorIssue", () => {
  it.each([
    ["#000000", "#ffffff", null],
    ["#761731", "#ffffff", null],
    ["#761731", "#682929", "low-contrast"], // the owner's dark-on-dark report
    ["#777777", "#888888", "low-contrast"],
    ["#ffffff", "#000000", "inverted"],
    ["#ffffff", "#682929", "inverted"],
  ] as const)("%s on %s → %s", (fg, bg, issue) => {
    expect(getQRArtColorIssue(fg, bg)).toBe(issue);
  });

  it("keeps the documented threshold", () => {
    expect(QR_ART_MIN_LUMA_GAP).toBe(0.35);
  });

  it("matches what the renderer does", async () => {
    const art = sampleArt();
    for (const [fgColor, bgColor] of [
      ["#000000", "#ffffff"],
      ["#761731", "#682929"],
      ["#ffffff", "#000000"],
    ]) {
      const uri = await getQRAsSVGDataUri({
        value: "https://qrdx.dev",
        level: "H",
        fgColor,
        bgColor,
        art,
      });
      const svg = decodeURIComponent(uri.slice(uri.indexOf(",") + 1));
      const renders = svg.includes("data-qrdx-art=");
      expect(renders, `${fgColor} on ${bgColor}`).toBe(
        getQRArtColorIssue(fgColor, bgColor) === null
      );
    }
  });
});
