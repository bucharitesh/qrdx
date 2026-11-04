/** biome-ignore-all lint/style/noMagicNumbers: QR structure and test matrix */
// Logo QR "badge" sizing against the real error correction budget. The plate
// clears every module under and around it; each cleared module can spoil
// its codeword, and each Reed–Solomon block repairs only so many. The badge
// is sized from that budget, not from a share of the code width, because
// codewords are placed by the data layout: in small codes a centered plate
// lands most of its cost on one block.
//
// The cleared modules are measured from the render itself: the code is
// rendered with every data module dark, and the body callback receives the
// modules left after clearing.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createQRArtImage,
  getQRArtBadgeLayout,
  getQRFunctionModules,
  type QRArtRenderOptions,
  renderQRArt,
} from "../src/art";
import qrcodegen from "../src/codegen";
import { damagedCodewords, getCodewordMap } from "../src/codeword-map";
import { ERROR_LEVEL_MAP } from "../src/constants";
import type { ErrorLevel, QRArtImage } from "../types";
import type { Modules } from "../types/common";
import { rasterizeSvg } from "./support/raster";

const FIXTURES = new URL("./fixtures/art/", import.meta.url);
const LOGOS = ["bloom", "cafe", "summit", "wave", "leaf", "monogram"];
const LEVELS: ErrorLevel[] = ["L", "M", "Q", "H"];
const STRENGTHS = [0.5, 0.6, 0.7, 0.8, 0.9, 1];
/** Must match BADGE_EC_SAFETY in src/art.tsx. */
const SAFETY = 0.6;

const images = new Map<string, QRArtImage>();
function logo(name: string): QRArtImage {
  let image = images.get(name);
  if (!image) {
    const svg = readFileSync(new URL(`${name}.svg`, FIXTURES), "utf8");
    image = createQRArtImage(
      rasterizeSvg(svg, { width: 640, background: null }),
      { maxSize: 160 }
    );
    images.set(name, image);
  }
  return image;
}

/** A real code of exactly `version` and `level` (no level boost). */
function code(version: number, level: ErrorLevel): Modules {
  return qrcodegen.QrCode.encodeSegments(
    qrcodegen.QrSegment.makeSegments("Q"),
    ERROR_LEVEL_MAP[level],
    version,
    version,
    -1,
    false
  ).getModules();
}

function options(
  modules: Modules,
  version: number,
  image: QRArtImage,
  intensity: number,
  body?: QRArtRenderOptions["body"]
): QRArtRenderOptions {
  return {
    art: { mode: "logo", variant: "badge", image, intensity },
    modules,
    version,
    margin: 4,
    pixelSize: 10,
    fgColor: "#111111",
    bgColor: "#ffffff",
    body,
  };
}

/** Data modules the rendered badge clears (y × size + x). */
function clearedByRender(
  version: number,
  level: ErrorLevel,
  image: QRArtImage,
  intensity: number
): number[] {
  const fn = getQRFunctionModules(version);
  // Function patterns (and so the format bits) as encoded; all data dark.
  const allDark = code(version, level).map((row, y) =>
    row.map((cell, x) => (fn[y]?.[x] ? cell : true))
  );
  let drawn: Modules | null = null;
  renderQRArt(
    options(allDark, version, image, intensity, (left) => {
      drawn = left;
      return null;
    })
  );
  const left = drawn as Modules | null;
  if (!left) throw new Error("badge drew no body");
  const size = allDark.length;
  const cleared: number[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!(fn[y]?.[x] || left[y]?.[x])) cleared.push(y * size + x);
    }
  }
  return cleared;
}

describe("badge error correction budget", () => {
  const cases: [number, ErrorLevel][] = [];
  for (let version = 1; version <= 10; version++) {
    for (const level of LEVELS) cases.push([version, level]);
  }

  it.each(cases)(
    "version %i-%s: every block keeps its repair margin at every strength",
    (version, level) => {
      const map = getCodewordMap(version, level);
      const budget = Math.floor(map.correctable * SAFETY);
      const over: string[] = [];
      for (const name of LOGOS) {
        let previous = 0;
        for (const intensity of STRENGTHS) {
          const cleared = clearedByRender(
            version,
            level,
            logo(name),
            intensity
          );
          const worst = Math.max(...damagedCodewords(map, cleared));
          if (worst > budget) {
            over.push(`${name}@${intensity}: ${worst} > ${budget}`);
          }
          // Strength only ever grows the plate.
          expect(cleared.length).toBeGreaterThanOrEqual(previous);
          previous = cleared.length;
        }
      }
      expect(over).toEqual([]);
    }
  );

  it("keeps the strength's size wherever the budget allows it", () => {
    // The sizing before the budget, restated: a share of the code width.
    const scale = { L: 0.5, M: 0.72, Q: 0.88, H: 1 } as const;
    let unchanged = 0;
    for (const [version, level] of cases) {
      const modules = code(version, level);
      for (const intensity of STRENGTHS) {
        const layout = getQRArtBadgeLayout(
          options(modules, version, logo("summit"), intensity)
        );
        if (!layout) throw new Error("not a badge");
        const share = (0.18 + 0.15 * intensity) * scale[level];
        expect(layout.wantedBox).toBeCloseTo(
          Math.min(0.32, share) * modules.length,
          9
        );
        if (layout.maxBox >= 2 && layout.wantedBox <= layout.maxBox) {
          expect(layout.box).toBe(layout.wantedBox);
          unchanged++;
        } else if (layout.plate) {
          expect(layout.box).toBeLessThanOrEqual(layout.maxBox);
          expect(layout.box).toBeLessThan(layout.wantedBox);
        }
      }
    }
    console.log(
      `badge unchanged in ${unchanged} of ${cases.length * STRENGTHS.length} cases`
    );
    expect(unchanged).toBeGreaterThan(0);
  });

  it("caps the owner's failing code and leaves large codes alone", () => {
    const value = (text: string, level: ErrorLevel) =>
      qrcodegen.QrCode.encodeText(text, ERROR_LEVEL_MAP[level]);
    const layoutOf = (text: string, level: ErrorLevel, intensity: number) => {
      const qr = value(text, level);
      return getQRArtBadgeLayout(
        options(qr.getModules(), qr.version, logo("summit"), intensity)
      );
    };
    // https://qrdx.dev at H is version 3 (29 modules): failed at 1.0 before.
    const capped = layoutOf("https://qrdx.dev", "H", 1);
    expect(capped?.box).toBeLessThan(capped?.wantedBox ?? 0);
    expect(capped?.plate).not.toBeNull();
    // A 57-module H code keeps its badge at the default strength, and only
    // the top of the slider is capped.
    const long = `https://qrdx.dev/${"a".repeat(84)}`;
    const large = layoutOf(long, "H", 0.6);
    expect(large?.box).toBe(large?.wantedBox);
    const strongest = layoutOf(long, "H", 1);
    expect(strongest?.box).toBeGreaterThan(0.85 * (strongest?.wantedBox ?? 0));
    // Version 1 at L repairs 2 codewords: no plate fits, the code stays plain.
    const tiny = layoutOf("https://qrdx.dev", "L", 1);
    expect(tiny?.plate).toBeNull();
    expect(tiny?.box).toBe(0);
  });

  it("returns null for anything but a badge", () => {
    const qr = qrcodegen.QrCode.encodeText(
      "https://qrdx.dev",
      ERROR_LEVEL_MAP.H
    );
    const base = options(qr.getModules(), qr.version, logo("leaf"), 1);
    expect(
      getQRArtBadgeLayout({ ...base, art: { ...base.art, variant: "blend" } })
    ).toBeNull();
    expect(
      getQRArtBadgeLayout({ ...base, art: { ...base.art, intensity: 0 } })
    ).toBeNull();
  });
});
