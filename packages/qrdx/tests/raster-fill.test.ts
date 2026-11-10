/** biome-ignore-all lint/suspicious/noBitwiseOperators: a seeded PRNG (mulberry32) for reproducible cases */
// The test rasterizer's polygon fill (support/raster.ts) keeps an active edge
// list so a code's body path, with thousands of edges, doesn't make every
// sample row test every edge. It must paint exactly the bytes the original
// fill painted: the scan tests decode these pixels. Each case fills the same
// polygons with both and compares every byte.
import { describe, expect, it } from "vitest";
import {
  coverageMask,
  createImage,
  fillPolygons,
  fillPolygonsReference,
  type RasterImage,
} from "./support/raster";

type Point = [number, number];

// Small deterministic generator, so a failure is reproducible.
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function randomPolygons(next: () => number, size: number): Point[][] {
  const polygons: Point[][] = [];
  const count = 1 + Math.floor(next() * 6);
  for (let p = 0; p < count; p++) {
    const points: Point[] = [];
    const corners = 3 + Math.floor(next() * 8);
    for (let c = 0; c < corners; c++) {
      // Some points outside the image, some on exact pixel rows.
      const x = (next() * 1.4 - 0.2) * size;
      const y =
        next() < 0.2 ? Math.round(next() * size) : (next() * 1.4 - 0.2) * size;
      points.push([x, y]);
    }
    polygons.push(points);
  }
  return polygons;
}

/** A QR-like body: many small squares and circles, as a code's path has. */
function moduleGrid(next: () => number, modules: number, cell: number) {
  const polygons: Point[][] = [];
  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (next() < 0.5) continue;
      const x = col * cell + cell * 0.05;
      const y = row * cell + cell * 0.05;
      const s = cell * 0.9;
      if (next() < 0.5) {
        polygons.push([
          [x, y],
          [x + s, y],
          [x + s, y + s],
          [x, y + s],
        ]);
      } else {
        const circle: Point[] = [];
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          circle.push([
            x + s / 2 + (Math.cos(a) * s) / 2,
            y + s / 2 + (Math.sin(a) * s) / 2,
          ]);
        }
        polygons.push(circle);
      }
    }
  }
  return polygons;
}

function bothFills(
  base: RasterImage,
  polygons: Point[][],
  evenOdd: boolean,
  mask: ReturnType<typeof coverageMask> | null,
  alpha: number
) {
  const fast = { ...base, data: base.data.slice() };
  const reference = { ...base, data: base.data.slice() };
  const color = { r: 17, g: 120, b: 230, a: 0.9 };
  fillPolygons(fast, polygons, color, alpha, evenOdd, mask);
  fillPolygonsReference(reference, polygons, color, alpha, evenOdd, mask);
  return { fast: fast.data, reference: reference.data };
}

function firstDifference(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return i;
  }
  return -1;
}

describe("the rasterizer's polygon fill", () => {
  it("paints the same bytes as the original on random polygons", () => {
    const next = random(0x5_1c_ed);
    for (let n = 0; n < 400; n++) {
      const size = 8 + Math.floor(next() * 56);
      const base = createImage(size, size, next() < 0.5 ? "#ffffff" : null);
      const polygons = randomPolygons(next, size);
      const evenOdd = next() < 0.5;
      const mask =
        next() < 0.3
          ? coverageMask(randomPolygons(next, size), next() < 0.5, null)
          : null;
      const alpha = next() < 0.3 ? 0.4 : 1;
      const { fast, reference } = bothFills(
        base,
        polygons,
        evenOdd,
        mask,
        alpha
      );
      expect(firstDifference(fast, reference), `case ${n}`).toBe(-1);
    }
  });

  it("paints the same bytes as the original on a QR-like body", () => {
    const next = random(0xc0_de);
    for (const [modules, cell] of [
      [21, 4],
      [29, 3.5],
      [41, 2.7],
    ] as const) {
      const size = Math.ceil(modules * cell);
      const base = createImage(size, size, "#ffffff");
      const polygons = moduleGrid(next, modules, cell);
      for (const evenOdd of [false, true]) {
        const { fast, reference } = bothFills(base, polygons, evenOdd, null, 1);
        expect(firstDifference(fast, reference), `${modules} modules`).toBe(-1);
      }
    }
  });
});
