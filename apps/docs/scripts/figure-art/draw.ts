// Drawing helpers for the product figures, in the hero's isometric line style
// (the camera and shapes come from ../use-case-art/iso.ts). Every helper
// returns SVG markup; the classes are styled by
// components/mockups/hairline.module.css.

import { type Camera, roundRect, type V3 } from "../use-case-art/iso";

export { camera, roundRect } from "../use-case-art/iso";
export type { Camera, V3 };

export const path = (d: string, cls: string) =>
  `<path class="${cls}" d="${d}"/>`;
export const g = (transform: string, inner: string) =>
  `<g transform="${transform}">${inner}</g>`;
export const ellipse = (
  e: { cx: number; cy: number; rx: number; ry: number },
  cls: string,
) =>
  `<ellipse class="${cls}" cx="${e.cx}" cy="${e.cy}" rx="${e.rx}" ry="${e.ry}"/>`;
export const circle = (cx: number, cy: number, r: number, cls: string) =>
  `<circle class="${cls}" cx="${r1(cx)}" cy="${r1(cy)}" r="${r}"/>`;
/** A real code (a `<symbol>`, `#code` by default) fitted into a w × h box. */
export const code = (x: number, y: number, w: number, h = w, id = "code") =>
  `<use href="#${id}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
/** A short text-like line in a plane. */
export const line = (x0: number, x1: number, y: number, cls = "tx") =>
  `<path class="${cls}" d="M${x0} ${y}H${x1}"/>`;
export const shade = (cx: number, cy: number, rx: number, ry: number) =>
  `<ellipse class="shade" cx="${r1(cx)}" cy="${r1(cy)}" rx="${rx}" ry="${ry}"/>`;
export const bloom = (cx: number, cy: number, rx: number, ry: number) =>
  `<ellipse class="glow" cx="${r1(cx)}" cy="${r1(cy)}" rx="${rx}" ry="${ry}"/>`;

export const r1 = (n: number) => Math.round(n * 10) / 10;

/** A screen-space segment between two world points. */
export const seg = (cam: Camera, a: V3, b: V3, cls = "l") =>
  `<path class="${cls}" d="M${cam
    .p(...a)
    .map(r1)
    .join(" ")}L${cam
    .p(...b)
    .map(r1)
    .join(" ")}"/>`;

/** A rounded slab (plinth, desk, tile): side band, then top. */
export function slab(
  cam: Camera,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z0: number,
  z1: number,
  r: number,
  top = "f",
) {
  const p = cam.prism(x0, y0, x1, y1, z0, z1, r);
  return path(p.side, "s") + path(p.top, top);
}

/** A sharp box: both visible sides, then the top. */
export function block(
  cam: Camera,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  top = "f",
) {
  const b = cam.box(x0, y0, z0, x1, y1, z1);
  return path(b.left, "s") + path(b.right, "s2") + path(b.top, top);
}

/** A tube in screen space: an outline stroke under a face-coloured stroke. */
export function tube(d: string, width: number) {
  return `<path class="tube-o" d="${d}" style="stroke-width:${width + 2.2}"/><path class="tube" d="${d}" style="stroke-width:${width}"/>`;
}

/**
 * A thin upright sheet facing the viewer's left (its face is the plane
 * y = `y`, top-left corner at (x, y, z), `w` along +x and `h` down). `shape`
 * is the outline in face units; a copy shifted `depth` toward -y gives it
 * thickness. `inner` is drawn on the face; `rim` adds the brand edge.
 */
export function faceLeft(
  cam: Camera,
  [x, y, z]: V3,
  shape: string,
  inner: string,
  { depth = 3, rim = false, face = "f", k = "" } = {},
) {
  const m = cam.onLeft(x, y, z);
  const [tx, ty] = cam.dir([0, -depth, 0]);
  return sheet(m, `translate(${r1(tx)} ${r1(ty)})`, shape, inner, rim, face, k);
}

/** As faceLeft, for a sheet facing the viewer's right (plane x = `x`, u toward -y). */
export function faceRight(
  cam: Camera,
  [x, y, z]: V3,
  shape: string,
  inner: string,
  { depth = 3, rim = false, face = "f", k = "" } = {},
) {
  const m = cam.onRight(x, y, z);
  const [tx, ty] = cam.dir([-depth, 0, 0]);
  return sheet(m, `translate(${r1(tx)} ${r1(ty)})`, shape, inner, rim, face, k);
}

/** A flat sheet lying at height z (u along +x, v along +y), `depth` thick. */
export function faceTop(
  cam: Camera,
  [x, y, z]: V3,
  shape: string,
  inner: string,
  { depth = 2, rim = false, face = "f", deg = 0, k = "" } = {},
) {
  const a = (deg * Math.PI) / 180;
  const m = cam.plane(
    [x, y, z],
    [Math.cos(a), Math.sin(a), 0],
    [-Math.sin(a), Math.cos(a), 0],
  );
  return sheet(
    m,
    `translate(0 ${r1(depth * cam.k)})`,
    shape,
    inner,
    rim,
    face,
    k,
  );
}

/**
 * A sheet in plane `m`: a copy of `shape` shifted by `back` for thickness,
 * then the face, its content and the optional brand rim. `k` wraps the
 * content (inside the plane) in a group that an idle loop animates, so the
 * loop moves in the plane's own units.
 */
function sheet(
  m: string,
  back: string,
  shape: string,
  inner: string,
  rim: boolean,
  face: string,
  k: string,
) {
  const wrap = (body: string) => (k ? `<g class="${k}">${body}</g>` : body);
  return (
    g(back, g(m, wrap(path(shape, "s")))) +
    g(m, wrap(path(shape, face) + inner + (rim ? path(shape, "rim") : "")))
  );
}

/** A rounded rectangle outline in face units (re-exported for brevity). */
export const rr = roundRect;

/** A group an idle loop animates (see the k-* rules in hairline.module.css). */
export const k = (name: string, inner: string, style = "") =>
  `<g class="k-${name}"${style ? ` style="${style}"` : ""}>${inner}</g>`;

/** A four-point sparkle centred at (x, y), radius r, in screen space. */
export function sparkle(x: number, y: number, r: number, cls = "acc") {
  const q = r * 0.22;
  return path(
    `M${r1(x)} ${r1(y - r)}Q${r1(x + q)} ${r1(y - q)} ${r1(x + r)} ${r1(y)}Q${r1(x + q)} ${r1(y + q)} ${r1(x)} ${r1(y + r)}Q${r1(x - q)} ${r1(y + q)} ${r1(x - r)} ${r1(y)}Q${r1(x - q)} ${r1(y - q)} ${r1(x)} ${r1(y - r)}Z`,
    cls,
  );
}
