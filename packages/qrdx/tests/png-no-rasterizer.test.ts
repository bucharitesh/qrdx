// When neither optional rasterizer is installed, the export throws an error
// naming the packages to install. Both are mocked away here, so this runs
// even where they are (they are dev dependencies).

import { describe, expect, it, vi } from "vitest";
import { rasterizeSvgToPng } from "../src/rasterize";

vi.mock("@resvg/resvg-js", () => {
  throw new Error("Cannot find package '@resvg/resvg-js'");
});
vi.mock("sharp", () => {
  throw new Error("Cannot find package 'sharp'");
});

describe("without a rasterizer", () => {
  it("names the packages to install", async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>';
    await expect(rasterizeSvgToPng(svg, null)).rejects.toThrow(
      /install @resvg\/resvg-js[\s\S]*install sharp/
    );
  });
});
