// The sample codes' image route (app/sample-codes/[file]/route.ts): one SVG
// per code, sized exactly as the page reserves for it (so the lazy image
// can't shift the layout), with nothing it would have to fetch (an SVG shown
// as an <img> can't load external files).
import { describe, expect, it } from "vitest";
import { GET, generateStaticParams } from "@/app/sample-codes/[file]/route";
import { ALL_PAGE_CODES, pageCodeImage } from "@/lib/landing/page-codes";

const get = (file: string) =>
  GET(new Request(`http://localhost/sample-codes/${file}`), {
    params: Promise.resolve({ file }),
  });

describe("sample code images", () => {
  it("prerender one file per code", () => {
    expect(generateStaticParams()).toEqual(
      ALL_PAGE_CODES.map((code) => ({ file: `${code.id}.svg` })),
    );
  });

  it.each(ALL_PAGE_CODES.map((code) => [code.id, code] as const))(
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
      const { width, height } = pageCodeImage(code);
      // The <img> attributes are whole pixels.
      expect(Number(/\swidth="([\d.]+)"/.exec(root)?.[1])).toBeCloseTo(
        width,
        0,
      );
      expect(Number(/\sheight="([\d.]+)"/.exec(root)?.[1])).toBeCloseTo(
        height,
        0,
      );
      expect(svg).not.toMatch(/href="(?!data:|#)/);
    },
  );

  it("answers 404 for anything else", async () => {
    expect((await get("nope.svg")).status).toBe(404);
    expect((await get("type-wifi-1")).status).toBe(404);
    expect((await get("type-wifi-1.png")).status).toBe(404);
  });
});
