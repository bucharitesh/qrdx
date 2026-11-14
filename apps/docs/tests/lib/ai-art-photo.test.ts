// Photo mode's crop (components/sections/ai-art/art-mode-photo.ts): the
// square a crop position picks from a photo. The canvas work runs in the
// browser; this is its arithmetic.
import { describe, expect, it } from "vitest";
import { photoCrop } from "@/components/sections/ai-art/art-mode-photo";

describe("photoCrop", () => {
  it("takes the center square by default", () => {
    expect(photoCrop(4000, 3000)).toEqual({ x: 500, y: 0, side: 3000 });
    expect(photoCrop(1080, 1920)).toEqual({ x: 0, y: 420, side: 1080 });
    expect(photoCrop(800, 800)).toEqual({ x: 0, y: 0, side: 800 });
  });

  it("moves along the long side, and stays inside the photo", () => {
    expect(photoCrop(4000, 3000, 0)).toEqual({ x: 0, y: 0, side: 3000 });
    expect(photoCrop(4000, 3000, 1)).toEqual({ x: 1000, y: 0, side: 3000 });
    expect(photoCrop(1080, 1920, 1)).toEqual({ x: 0, y: 840, side: 1080 });
    expect(photoCrop(4000, 3000, -2)).toEqual(photoCrop(4000, 3000, 0));
    expect(photoCrop(4000, 3000, 7)).toEqual(photoCrop(4000, 3000, 1));
  });
});
