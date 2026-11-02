/** biome-ignore-all lint/style/noMagicNumbers: shape geometry */
/** biome-ignore-all lint/suspicious/noBitwiseOperators: integer hashing */
// Geometry primitives for the module, eye, eye-dot and frame shapes. Every
// shape is plain path data (M/L/A/C/Z, absolute coordinates, no transforms),
// so the SVG, canvas (Path2D), PDF and EPS outputs draw exactly the same
// outline. Closed shapes run clockwise on screen (y down), so many of them in
// one path union cleanly under the nonzero fill rule.

import { fmt } from "./utils/fmt";

export type Point = [number, number];

/** Closed polygon through `points`. */
export function polygonPath(points: Point[]): string {
  if (points.length === 0) {
    return "";
  }
  const [first, ...rest] = points as [Point, ...Point[]];
  return `M${fmt(first[0])} ${fmt(first[1])}${rest
    .map(([x, y]) => `L${fmt(x)} ${fmt(y)}`)
    .join("")}Z`;
}

/** Clockwise circle as two arcs. */
export function circlePath(cx: number, cy: number, r: number): string {
  return `M${fmt(cx - r)} ${fmt(cy)}A${fmt(r)} ${fmt(r)} 0 1 1 ${fmt(cx + r)} ${fmt(cy)}A${fmt(r)} ${fmt(r)} 0 1 1 ${fmt(cx - r)} ${fmt(cy)}Z`;
}

/**
 * Rectangle with its own radius per corner, clockwise from the top-left:
 * `[topLeft, topRight, bottomRight, bottomLeft]`.
 */
export function roundedRectPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radii: [number, number, number, number] | number = 0
): string {
  const limit = Math.min(width, height) / 2;
  const [tl, tr, br, bl] = (
    typeof radii === "number" ? [radii, radii, radii, radii] : radii
  ).map((r) => Math.max(0, Math.min(r, limit))) as [
    number,
    number,
    number,
    number,
  ];
  const arc = (r: number, toX: number, toY: number) =>
    r > 0 ? `A${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(toX)} ${fmt(toY)}` : "";
  return (
    `M${fmt(x + tl)} ${fmt(y)}` +
    `H${fmt(x + width - tr)}${arc(tr, x + width, y + tr)}` +
    `V${fmt(y + height - br)}${arc(br, x + width - br, y + height)}` +
    `H${fmt(x + bl)}${arc(bl, x, y + height - bl)}` +
    `V${fmt(y + tl)}${arc(tl, x + tl, y)}Z`
  );
}

/** Points of a regular polygon (clockwise), first vertex at `rotation` degrees. */
export function regularPolygon(
  cx: number,
  cy: number,
  radius: number,
  sides: number,
  rotation = -90
): Point[] {
  return Array.from({ length: sides }, (_, i) => {
    const angle = ((rotation + (360 / sides) * i) * Math.PI) / 180;
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
  });
}

/** Points of a star with `points` tips, the first tip straight up. */
export function starPoints(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  points = 5
): Point[] {
  return Array.from({ length: points * 2 }, (_, i) => {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (Math.PI / points) * i;
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
  });
}

/**
 * Points of a superellipse |x/a|^e + |y/b|^e = 1 (a squircle when e = 4),
 * clockwise from the right.
 */
export function superellipsePoints(
  cx: number,
  cy: number,
  a: number,
  b: number,
  exponent = 4,
  steps = 64
): Point[] {
  return Array.from({ length: steps }, (_, i) => {
    const t = (2 * Math.PI * i) / steps;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    return [
      cx + a * Math.sign(cos) * Math.abs(cos) ** (2 / exponent),
      cy + b * Math.sign(sin) * Math.abs(sin) ** (2 / exponent),
    ];
  });
}

/**
 * Heart centered on (cx, cy), `size` wide; its height is about 0.92 × size.
 * Drawn clockwise from the top notch.
 */
export function heartPath(cx: number, cy: number, size: number): string {
  const s = size / 2;
  const p = (x: number, y: number) => `${fmt(cx + x * s)} ${fmt(cy + y * s)}`;
  return (
    `M${p(0, -0.52)}` +
    `C${p(0.18, -0.92)} ${p(0.98, -0.94)} ${p(1, -0.34)}` +
    `C${p(1, 0.12)} ${p(0.5, 0.48)} ${p(0, 0.92)}` +
    `C${p(-0.5, 0.48)} ${p(-1, 0.12)} ${p(-1, -0.34)}` +
    `C${p(-0.98, -0.94)} ${p(-0.18, -0.92)} ${p(0, -0.52)}Z`
  );
}

/** Rotates `points` by `degrees` around (cx, cy). */
export function rotatePoints(
  points: Point[],
  cx: number,
  cy: number,
  degrees: number
): Point[] {
  if (degrees === 0) {
    return points;
  }
  const angle = (degrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return points.map(([x, y]) => [
    cx + (x - cx) * cos - (y - cy) * sin,
    cy + (x - cx) * sin + (y - cy) * cos,
  ]);
}

/**
 * Deterministic pseudo-random number in [0, 1) for a module position, so
 * "random" styles render the same markup on the server and the client.
 */
export function hash2(x: number, y: number, salt = 0): number {
  let h =
    Math.imul(x + 0x9e_37_79_b9, 0x85_eb_ca_6b) ^
    Math.imul(y + salt, 0xc2_b2_ae_35);
  h = Math.imul(h ^ (h >>> 15), 0x2c_1b_3c_6d);
  h = Math.imul(h ^ (h >>> 12), 0x29_7a_2d_39);
  h ^= h >>> 15;
  return (h >>> 0) / 4_294_967_296;
}

/** Small deterministic string hash (FNV-1a), base 36. */
export function hashString(value: string): string {
  let h = 0x81_1c_9d_c5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01_00_01_93);
  }
  return (h >>> 0).toString(36);
}
