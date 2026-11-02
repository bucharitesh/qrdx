// The gallery's image route (app/gallery/[file]/route.ts): one SVG per
// gallery code, sized exactly as the page reserves for it (so the lazy image
// can't shift the layout), with nothing it would have to fetch (an SVG shown
// as an <img> can't load external files).
import { describe, expect, it } from "vitest";
import { GET, generateStaticParams } from "@/app/gallery/[file]/route";
import { GALLERY_CODES, galleryImage } from "@/lib/landing/showcase-gallery";

const get = (file: string) =>
  GET(new Request(`http://localhost/gallery/${file}`), {
    params: Promise.resolve({ file }),
  });

describe("gallery images", () => {
  it("prerender one file per code", () => {
    expect(generateStaticParams()).toEqual(
      GALLERY_CODES.map((code) => ({ file: `${code.id}.svg` })),
    );
    for (const code of GALLERY_CODES) {
      expect(galleryImage(code).src).toBe(`/gallery/${code.id}.svg`);
    }
  });

  it.each(GALLERY_CODES.map((code) => [code.id, code] as const))(
    "%s is a self-contained SVG of the reserved size",
    async (_id, code) => {
      const response = await get(`${code.id}.svg`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(
        "image/svg+xml; charset=utf-8",
      );
      const svg = await response.text();
      const root = /^<svg\b[^>]*>/.exec(svg)?.[0] ?? "";
      expect(root).toContain('xmlns="http://www.w3.org/2000/svg"');
      const { width, height } = galleryImage(code);
      expect(Number(/\swidth="([\d.]+)"/.exec(root)?.[1])).toBeCloseTo(
        width,
        3,
      );
      expect(Number(/\sheight="([\d.]+)"/.exec(root)?.[1])).toBeCloseTo(
        height,
        3,
      );
      expect(svg).not.toMatch(/href="(?!data:|#)/);
    },
  );

  it("answers 404 for anything else", async () => {
    expect((await get("nope.svg")).status).toBe(404);
    expect((await get("wifi")).status).toBe(404);
    expect((await get("wifi.png")).status).toBe(404);
  });
});
