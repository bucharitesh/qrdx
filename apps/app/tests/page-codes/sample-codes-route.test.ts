// The sample codes' image route (app/sample-codes/[file]/route.ts): one SVG
// per code, sized exactly as the page reserves for it (so the lazy image
// can't shift the layout), with nothing it would have to fetch (an SVG shown
// as an <img> can't load external files).
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, generateStaticParams } from "@/app/sample-codes/[file]/route";
import { ALL_PAGE_CODES, pageCodeImage } from "@/lib/landing/page-codes";

const get = (file: string) =>
  GET(new Request(`http://localhost/sample-codes/${file}`), {
    params: Promise.resolve({ file }),
  });

describe("sample code images", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("list no paths, in builds or next dev: each renders on its first request", () => {
    // next dev rewrites .next/dev/prerender-manifest.json without a lock
    // whenever a route lists paths; parallel image requests corrupted it.
    // Builds leave them to request time too (lib/static-params.ts).
    vi.stubEnv("NODE_ENV", "development");
    expect(generateStaticParams()).toEqual([]);
    vi.stubEnv("NODE_ENV", "production");
    expect(generateStaticParams()).toEqual([]);
  });

  it("render every code on request", async () => {
    // With no static paths, dynamicParams must stay at its default (true)
    // or every image would answer 404.
    const route = await import("@/app/sample-codes/[file]/route");
    expect("dynamicParams" in route).toBe(false);
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
