// The wall's image route (app/gallery/[file]/route.ts): one SVG per wall
// tile, sized exactly as the page reserves for it (so the lazy image
// can't shift the layout), with nothing it would have to fetch (an SVG shown
// as an <img> can't load external files).
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, generateStaticParams } from "@/app/gallery/[file]/route";
import { galleryImage, WALL_TILES } from "@/lib/landing/showcase-gallery";

const get = (file: string) =>
  GET(new Request(`http://localhost/gallery/${file}`), {
    params: Promise.resolve({ file }),
  });

describe("wall images", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("list no paths, in builds or next dev: each renders on its first request", () => {
    // next dev rewrites .next/dev/prerender-manifest.json without a lock
    // whenever a route lists paths; 40 parallel image requests corrupted it.
    // Builds leave them to request time too (lib/static-params.ts).
    vi.stubEnv("NODE_ENV", "development");
    expect(generateStaticParams()).toEqual([]);
    vi.stubEnv("NODE_ENV", "production");
    expect(generateStaticParams()).toEqual([]);
  });

  it("serve one file per tile", () => {
    for (const tile of WALL_TILES) {
      expect(galleryImage(tile).src).toBe(`/gallery/${tile.id}.svg`);
    }
  });

  it.each(WALL_TILES.map((tile) => [tile.id, tile] as const))(
    "%s is a self-contained SVG of the reserved size",
    async (_id, tile) => {
      const response = await get(`${tile.id}.svg`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(
        "image/svg+xml; charset=utf-8",
      );
      const svg = await response.text();
      const root = /^<svg\b[^>]*>/.exec(svg)?.[0] ?? "";
      expect(root).toContain('xmlns="http://www.w3.org/2000/svg"');
      const { width, height } = galleryImage(tile);
      expect(Number(/\swidth="([\d.]+)"/.exec(root)?.[1])).toBeCloseTo(
        width,
        2,
      );
      expect(Number(/\sheight="([\d.]+)"/.exec(root)?.[1])).toBeCloseTo(
        height,
        2,
      );
      expect(svg).not.toMatch(/href="(?!data:|#)/);
    },
  );

  it("answers 404 for anything else", async () => {
    expect((await get("nope.svg")).status).toBe(404);
    expect((await get("type-wifi")).status).toBe(404);
    expect((await get("type-wifi.png")).status).toBe(404);
  });
});
