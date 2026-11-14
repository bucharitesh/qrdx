import { describe, expect, it } from "vitest";
import { bodyPath, eyePath } from "@/components/fx/qr-glyph";
import { QRDX_QR_H, QRDX_QR_M } from "@/components/fx/qr-matrix";

const inEye = (size: number, x: number, y: number) =>
  (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);

/** Dark modules outside the finder patterns, less a centred hole. */
function darkBody(matrix: readonly string[], hole = 0) {
  const size = matrix.length;
  const lo = (size - hole) / 2;
  let count = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inHole = x >= lo && x < lo + hole && y >= lo && y < lo + hole;
      if (matrix[y][x] === "1" && !inEye(size, x, y) && !inHole) count++;
    }
  }
  return count;
}

/** Sum of the widths of the square runs (`M x y h w v1 ...`). */
function runArea(d: string) {
  return [...d.matchAll(/M-?[\d.]+ -?[\d.]+h([\d.]+)v1/g)].reduce(
    (sum, m) => sum + Number(m[1]),
    0,
  );
}

describe("qr-glyph", () => {
  it("draws one dot per dark body module", () => {
    const d = bodyPath(QRDX_QR_M, { shape: "dot", eyeRadius: 2 });
    expect(d.match(/M/g)).toHaveLength(darkBody(QRDX_QR_M));
  });

  it("joins square modules into runs that cover exactly the dark ones", () => {
    const d = bodyPath(QRDX_QR_M, { shape: "square", eyeRadius: 0 });
    expect(runArea(d)).toBe(darkBody(QRDX_QR_M));
    // Runs, not single modules.
    expect(d.match(/M/g)?.length).toBeLessThan(darkBody(QRDX_QR_M));
  });

  it("leaves a centred hole empty", () => {
    const d = bodyPath(QRDX_QR_H, { shape: "square", eyeRadius: 0, hole: 9 });
    expect(runArea(d)).toBe(darkBody(QRDX_QR_H, 9));
    expect(darkBody(QRDX_QR_H, 9)).toBeLessThan(darkBody(QRDX_QR_H));
  });

  it("draws three finder patterns of three shapes each, with finite numbers", () => {
    for (const radius of [0, 2.2]) {
      const d = eyePath(29, radius);
      expect(d.match(/M/g)).toHaveLength(9);
      expect(d).not.toMatch(/NaN|Infinity/);
    }
  });
});
