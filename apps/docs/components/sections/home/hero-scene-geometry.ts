// Isometric geometry for the hero scene, computed once at module load. World
// units: x runs right-down, y runs left-down, z up. Everything is projected
// with one fixed camera into a 1600 × 900 viewBox.

export const VIEW_W = 1600;
export const VIEW_H = 900;

const C = Math.cos(Math.PI / 6);
const S = 0.5;
const OX = 820;
const OY = 250;

type P2 = [number, number];

export const proj = (x: number, y: number, z = 0): P2 => [
  OX + (x - y) * C,
  OY + (x + y) * S - z,
];
/** Projection without the scene offset, for parts drawn around a local origin. */
export const local = (x: number, y: number, z = 0): P2 => [
  (x - y) * C,
  (x + y) * S - z,
];

const r1 = (n: number) => Math.round(n * 10) / 10;
export const path = (pts: P2[], close = true) =>
  `M${pts.map(([a, b]) => `${r1(a)} ${r1(b)}`).join("L")}${close ? "Z" : ""}`;

type W2 = [number, number];

/**
 * A rounded rectangle in the ground plane, split into the chain that faces
 * the camera (+x/+y sides) and the chain facing away. Both run in order.
 */
function outline(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  steps = 6,
): { front: W2[]; back: W2[]; all: W2[] } {
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    const pts: W2[] = [];
    const n = Math.max(1, Math.round((steps * Math.abs(a1 - a0)) / 90));
    for (let i = 0; i <= n; i++) {
      const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return pts;
  };
  const front = [
    ...arc(x1 - r, y0 + r, -45, 0),
    ...arc(x1 - r, y1 - r, 0, 90),
    ...arc(x0 + r, y1 - r, 90, 135),
  ];
  const back = [
    ...arc(x0 + r, y1 - r, 135, 180),
    ...arc(x0 + r, y0 + r, 180, 270),
    ...arc(x1 - r, y0 + r, 270, 315),
  ];
  return { front, back, all: [...front, ...back] };
}

export interface Prism {
  top: string;
  side: string;
}

/** A rounded box: its top face and the band of side faces that shows. */
export function prism(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z0: number,
  z1: number,
  r: number,
  at: (x: number, y: number, z: number) => P2 = proj,
): Prism {
  const o = outline(x0, y0, x1, y1, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2));
  const topPts = o.all.map(([x, y]) => at(x, y, z1));
  const sidePts = [
    ...o.front.map(([x, y]) => at(x, y, z1)),
    ...[...o.front].reverse().map(([x, y]) => at(x, y, z0)),
  ];
  return { top: path(topPts), side: path(sidePts) };
}

/** A rounded rectangle lying in the plane y = const, given in (x, z). */
export function faceY(
  y: number,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  r: number,
) {
  const o = outline(x0, z0, x1, z1, r);
  return path(o.all.map(([x, z]) => proj(x, y, z)));
}

/** A rounded rectangle lying in the plane x = const, given in (y, z). */
export function faceX(
  x: number,
  y0: number,
  z0: number,
  y1: number,
  z1: number,
  r: number,
) {
  const o = outline(y0, z0, y1, z1, r);
  return path(o.all.map(([y, z]) => proj(x, y, z)));
}

/** A rounded rectangle lying flat at height z. */
export function faceZ(
  z: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
) {
  const o = outline(x0, y0, x1, y1, r);
  return path(o.all.map(([x, y]) => proj(x, y, z)));
}

/**
 * SVG matrix that draws 2D content (u right, v down) onto the plane y = const,
 * with (0, 0) at world (x, y, z) and `s` world units per content unit.
 */
export const matrixY = (x: number, y: number, z: number, s: number) => {
  const [e, f] = proj(x, y, z);
  return `matrix(${r3(C * s)} ${r3(S * s)} 0 ${r3(s)} ${r1(e)} ${r1(f)})`;
};
/** Same for the plane x = const (u runs toward -y, so left to right on screen). */
export const matrixX = (x: number, y: number, z: number, s: number) => {
  const [e, f] = proj(x, y, z);
  return `matrix(${r3(C * s)} ${r3(-S * s)} 0 ${r3(s)} ${r1(e)} ${r1(f)})`;
};
/** Same for a flat plane z = const (u along +x, v along +y). */
export const matrixZ = (x: number, y: number, z: number, s: number) => {
  const [e, f] = proj(x, y, z);
  return `matrix(${r3(C * s)} ${r3(S * s)} ${r3(-C * s)} ${r3(S * s)} ${r1(e)} ${r1(f)})`;
};
/** matrixZ around a local origin (no scene offset). */
export const matrixZLocal = (x: number, y: number, z: number, s: number) => {
  const [e, f] = local(x, y, z);
  return `matrix(${r3(C * s)} ${r3(S * s)} ${r3(-C * s)} ${r3(S * s)} ${r1(e)} ${r1(f)})`;
};

function r3(n: number) {
  return Math.round(n * 1000) / 1000;
}

/** A polyline on the ground with rounded corners, for cables. */
export function cable(points: [number, number, number?][], r = 18) {
  const pts = points.map(([x, y, z = 0]) => [x, y, z] as const);
  let d = "";
  for (let i = 0; i < pts.length; i++) {
    const [x, y, z] = pts[i] as readonly [number, number, number];
    if (i === 0 || i === pts.length - 1) {
      const [a, b] = proj(x, y, z);
      d += `${i === 0 ? "M" : "L"}${r1(a)} ${r1(b)}`;
      continue;
    }
    const prev = pts[i - 1] as readonly [number, number, number];
    const next = pts[i + 1] as readonly [number, number, number];
    const toward = (p: readonly [number, number, number], t: number) => {
      const len = Math.hypot(p[0] - x, p[1] - y) || 1;
      const k = Math.min(r, len / 2) / len;
      return proj(x + (p[0] - x) * k * t, y + (p[1] - y) * k * t, z);
    };
    const [ax, ay] = toward(prev, 1);
    const [bx, by] = toward(next, 1);
    const [cx, cy] = proj(x, y, z);
    d += `L${r1(ax)} ${r1(ay)}Q${r1(cx)} ${r1(cy)} ${r1(bx)} ${r1(by)}`;
  }
  return d;
}

/** "M x y h1 v1 h-1 z" for every dark module, optionally skipping finders. */
export function modulesPath(code: readonly string[], skipFinders = false) {
  const n = code.length;
  const finder = (x: number, y: number) =>
    (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  let d = "";
  code.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== "1" || (skipFinders && finder(x, y))) continue;
      d += `M${x} ${y}h1v1h-1z`;
    }
  });
  return d;
}

/** The three finder patterns as rings + centres, in module units. */
export function finderPaths(n: number) {
  const at = [
    [0, 0],
    [n - 7, 0],
    [0, n - 7],
  ];
  const ring = at
    .map(
      ([x, y]) => `M${x} ${y}h7v7h-7zM${(x ?? 0) + 1} ${(y ?? 0) + 1}v5h5v-5z`,
    )
    .join("");
  const eye = at
    .map(([x, y]) => `M${(x ?? 0) + 2} ${(y ?? 0) + 2}h3v3h-3z`)
    .join("");
  // A rounded outline one module outside each finder (in the quiet zone).
  const halo = at
    .map(([x, y]) => `M${(x ?? 0) - 0.6} ${(y ?? 0) - 0.6}h8.2v8.2h-8.2z`)
    .join("");
  return { ring, eye, halo };
}

/** The conveyor: a raised rounded loop. */
export const TRACK = {
  x0: -170,
  y0: -130,
  x1: 560,
  y1: 470,
  r: 96,
  half: 34,
  z0: 22,
  z1: 36,
};

export function trackGeometry() {
  const { x0, y0, x1, y1, r, half, z0, z1 } = TRACK;
  const outer = outline(
    x0 - half,
    y0 - half,
    x1 + half,
    y1 + half,
    r + half,
    10,
  );
  const inner = outline(
    x0 + half,
    y0 + half,
    x1 - half,
    y1 - half,
    r - half,
    10,
  );
  const mid = outline(x0, y0, x1, y1, r, 12);
  const top = `${path(outer.all.map(([x, y]) => proj(x, y, z1)))}${path(
    inner.all.map(([x, y]) => proj(x, y, z1)),
  )}`;
  const outerSide = path([
    ...outer.front.map(([x, y]) => proj(x, y, z1)),
    ...[...outer.front].reverse().map(([x, y]) => proj(x, y, z0)),
  ]);
  const innerWall = path([
    ...inner.back.map(([x, y]) => proj(x, y, z1)),
    ...[...inner.back].reverse().map(([x, y]) => proj(x, y, z0)),
  ]);
  const railA = outline(x0 - 14, y0 - 14, x1 + 14, y1 + 14, r + 14, 10);
  const railB = outline(x0 + 14, y0 + 14, x1 - 14, y1 - 14, r - 14, 10);
  const rails =
    path(railA.all.map(([x, y]) => proj(x, y, z1))) +
    path(railB.all.map(([x, y]) => proj(x, y, z1)));
  // The tiles ride the centre line, clockwise on screen.
  const motion = path(mid.all.map(([x, y]) => proj(x, y, z1)));
  return { top, outerSide, innerWall, rails, motion };
}
