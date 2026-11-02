// The blog's illustrations (public/blog/<post>/*.svg, written by
// scripts/blog-art/generate.ts) each carry real QR codes. Every baked code
// must scan as the data codes.ts promises, including the ones a scene partly
// covers (a missing patch, a centre logo). Every image a post references
// must exist.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BLOG_ART, BLOG_ART_IDS, type BlogArt } from "@/scripts/blog-art/codes";
import {
  decodeQR,
  rasterizeSvg,
  simulateCamera,
} from "../../../packages/qrdx/tests/support/raster";

const PUBLIC = join(import.meta.dirname, "../public");
const BLOG = join(import.meta.dirname, "../content/blog");

function symbol(svg: string, id: string) {
  const match = svg.match(
    new RegExp(`<symbol id="${id}" viewBox="([^"]+)">([\\s\\S]*?)</symbol>`),
  );
  return match ? { viewBox: match[1] ?? "", inner: match[2] ?? "" } : null;
}

/** Visible modules only, black on white. */
const flatten = (inner: string) =>
  inner
    .replace(/<g class="qh">[\s\S]*?<\/g>/g, "")
    .replace(/<\w+ class="qh"[^>]*\/>/g, "")
    .replace(/class="q[123]"/g, 'fill="#000000"')
    .replace(/class="qp"/g, 'fill="#ffffff"');

/**
 * A baked code as a flat SVG: the whole symbol, or its body and eyes
 * symbols drawn together when the scene only uses the split ones.
 */
function bakedCode(file: string, id: string, cover?: string) {
  const svg = readFileSync(join(PUBLIC, "blog", `${file}.svg`), "utf8");
  const whole = symbol(svg, id);
  const parts = whole
    ? [whole]
    : [symbol(svg, `${id}-body`), symbol(svg, `${id}-eyes`)];
  if (parts.some((part) => !part)) {
    throw new Error(`${file}.svg has no #${id} symbol`);
  }
  const viewBox = parts[0]?.viewBox ?? "";
  const [, , width, height] = viewBox.split(" ");
  const body = parts.map((part) => flatten(part?.inner ?? "")).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}">${body}${cover ?? ""}</svg>`;
}

const cases = BLOG_ART_IDS.flatMap((art) =>
  BLOG_ART[art].codes.map((code) => [art, code.id] as const),
);

describe("blog illustrations", () => {
  it.each(cases)("%s carries #%s, which decodes to its data", (art, id) => {
    const { file, codes, damage }: BlogArt = BLOG_ART[art];
    const cover =
      damage && damage.id === id
        ? `<rect fill="#ffffff" x="${damage.x}" y="${damage.y}" width="${damage.w}" height="${damage.h}"/>`
        : undefined;
    const image = rasterizeSvg(bakedCode(file, id, cover), {
      width: 480,
      pad: 24,
    });
    expect(decodeQR(simulateCamera(image, 4))).toBe(
      codes.find((code) => code.id === id)?.value,
    );
  });

  it("every image a post references exists", () => {
    for (const name of readdirSync(BLOG).filter((f) => f.endsWith(".mdx"))) {
      const source = readFileSync(join(BLOG, name), "utf8");
      const paths = [
        ...source.matchAll(/^image: (\/blog\/\S+)$/gm),
        ...source.matchAll(/src="(\/blog\/[^"]+)"/g),
      ].map((match) => match[1] ?? "");
      expect(paths.length, name).toBeGreaterThan(0);
      for (const path of paths) {
        expect(existsSync(join(PUBLIC, path)), `${name}: ${path}`).toBe(true);
      }
    }
  });

  it("every illustration has been generated", () => {
    for (const art of BLOG_ART_IDS) {
      expect(
        existsSync(join(PUBLIC, "blog", `${BLOG_ART[art].file}.svg`)),
      ).toBe(true);
    }
  });
});
