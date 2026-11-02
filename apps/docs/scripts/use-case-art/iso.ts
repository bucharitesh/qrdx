// Isometric helpers for the use-case illustrations: the same camera as the
// home hero (components/sections/home/hero-scene-geometry.ts), with an origin
// and scale per scene. World units: x runs right-down, y runs left-down, z up.
// The faces that show are the top, the +x face (right) and the +y face (left).

export type V3 = readonly [number, number, number];
type P2 = [number, number];

const C = Math.cos(Math.PI / 6);
const S = 0.5;

const r1 = (n: number) => Math.round(n * 10) / 10;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export const pts = (list: readonly P2[], close = true) =>
  `M${list.map(([a, b]) => `${r1(a)} ${r1(b)}`).join("L")}${close ? "Z" : ""}`;

/** A rounded rectangle in its own 2D space (SVG units), clockwise. */
export function roundRect(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const q = Math.min(r, w / 2, h / 2);
  if (q <= 0) return `M${r1(x)} ${r1(y)}h${r1(w)}v${r1(h)}h${r1(-w)}z`;
  return `M${r1(x + q)} ${r1(y)}h${r1(w - 2 * q)}a${q} ${q} 0 0 1 ${q} ${q}v${r1(h - 2 * q)}a${q} ${q} 0 0 1-${q} ${q}h${r1(-(w - 2 * q))}a${q} ${q} 0 0 1-${q}-${q}v${r1(-(h - 2 * q))}a${q} ${q} 0 0 1 ${q}-${q}z`;
}

type W2 = [number, number];

/**
 * A rounded rectangle in a plane, split into the chain that faces the camera
 * (+u/+v sides) and the chain facing away. Both run in order.
 */
function outline(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  steps = 8,
) {
  const q = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2);
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    const out: W2[] = [];
    const n = q <= 0 ? 1 : Math.max(1, Math.round((steps * (a1 - a0)) / 90));
    for (let i = 0; i <= n; i++) {
      const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
      out.push([cx + q * Math.cos(a), cy + q * Math.sin(a)]);
    }
    return out;
  };
  const front = [
    ...arc(x1 - q, y0 + q, -45, 0),
    ...arc(x1 - q, y1 - q, 0, 90),
    ...arc(x0 + q, y1 - q, 90, 135),
  ];
  const back = [
    ...arc(x0 + q, y1 - q, 135, 180),
    ...arc(x0 + q, y0 + q, 180, 270),
    ...arc(x1 - q, y0 + q, 270, 315),
  ];
  return { front, back, all: [...front, ...back] };
}

/** One scene's camera: the hero's projection at origin (ox, oy), scale k. */
export function camera(ox: number, oy: number, k = 1) {
  const p = (x: number, y: number, z = 0): P2 => [
    ox + (x - y) * C * k,
    oy + ((x + y) * S - z) * k,
  ];
  /** A direction in world units, projected (no origin). */
  const dir = ([x, y, z]: V3): P2 => [(x - y) * C * k, ((x + y) * S - z) * k];

  /** Polygon through world points. */
  const poly = (list: readonly V3[], close = true) =>
    pts(
      list.map(([x, y, z]) => p(x, y, z)),
      close,
    );

  /** A rounded box standing on z0: its top face and the band of sides that shows. */
  const prism = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    z0: number,
    z1: number,
    r = 0,
  ) => {
    const o = outline(x0, y0, x1, y1, r);
    return {
      top: pts(o.all.map(([x, y]) => p(x, y, z1))),
      side: pts([
        ...o.front.map(([x, y]) => p(x, y, z1)),
        ...[...o.front].reverse().map(([x, y]) => p(x, y, z0)),
      ]),
    };
  };

  /** A sharp box: top, right (+x) and left (+y) faces. */
  const box = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
  ) => ({
    top: poly([
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1],
    ]),
    right: poly([
      [x1, y0, z1],
      [x1, y1, z1],
      [x1, y1, z0],
      [x1, y0, z0],
    ]),
    left: poly([
      [x0, y1, z1],
      [x1, y1, z1],
      [x1, y1, z0],
      [x0, y1, z0],
    ]),
  });

  /** An upright cylinder: the side band and the top ellipse. */
  const cylinder = (
    cx: number,
    cy: number,
    z0: number,
    z1: number,
    r: number,
  ) => {
    const [tx, ty] = p(cx, cy, z1);
    const [bx, by] = p(cx, cy, z0);
    const rx = r1(Math.SQRT2 * C * k * r);
    const ry = r1(Math.SQRT2 * S * k * r);
    return {
      side: `M${r1(tx - rx)} ${r1(ty)}L${r1(bx - rx)} ${r1(by)}A${rx} ${ry} 0 0 0 ${r1(bx + rx)} ${r1(by)}L${r1(tx + rx)} ${r1(ty)}A${rx} ${ry} 0 0 1 ${r1(tx - rx)} ${r1(ty)}Z`,
      top: { cx: r1(tx), cy: r1(ty), rx, ry },
      bottom: { cx: r1(bx), cy: r1(by), rx, ry },
    };
  };

  /**
   * SVG matrix that draws 2D content (u right, v down, one unit each) onto
   * the plane through world point `o` spanned by world vectors `u` and `v`.
   */
  const plane = (o: V3, u: V3, v: V3) => {
    const [e, f] = p(...o);
    const [a, b] = dir(u);
    const [c, d] = dir(v);
    return `matrix(${r3(a)} ${r3(b)} ${r3(c)} ${r3(d)} ${r1(e)} ${r1(f)})`;
  };
  /** Content on the right face x = const: u runs toward -y, v down. */
  const onRight = (x: number, y: number, z: number) =>
    plane([x, y, z], [0, -1, 0], [0, 0, -1]);
  /** Content on the left face y = const: u runs along +x, v down. */
  const onLeft = (x: number, y: number, z: number) =>
    plane([x, y, z], [1, 0, 0], [0, 0, -1]);
  /** Content lying flat at height z: u along +x, v along +y. */
  const onTop = (x: number, y: number, z: number) =>
    plane([x, y, z], [1, 0, 0], [0, 1, 0]);

  return {
    k,
    p,
    dir,
    poly,
    prism,
    box,
    cylinder,
    plane,
    onRight,
    onLeft,
    onTop,
  };
}

export type Camera = ReturnType<typeof camera>;
