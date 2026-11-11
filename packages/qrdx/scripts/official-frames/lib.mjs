// Geometry and spec helpers for the official frame generator.
// Paths are built from absolute commands so they can be moved, scaled,
// mirrored and rotated before they are written into a spec.

export const r = (n) => {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
};

// ── Path builder ────────────────────────────────────────────────────────────
// A path is a list of commands: ["M", x, y], ["L", x, y], ["C", x1, y1, x2,
// y2, x, y], ["Q", x1, y1, x, y], ["A", rx, ry, rot, large, sweep, x, y], ["Z"].

export class P {
  constructor() {
    this.c = [];
  }
  M(x, y) {
    this.c.push(["M", x, y]);
    return this;
  }
  L(x, y) {
    this.c.push(["L", x, y]);
    return this;
  }
  C(a, b, c, d, x, y) {
    this.c.push(["C", a, b, c, d, x, y]);
    return this;
  }
  Q(a, b, x, y) {
    this.c.push(["Q", a, b, x, y]);
    return this;
  }
  A(rx, ry, rot, large, sweep, x, y) {
    this.c.push(["A", rx, ry, rot, large, sweep, x, y]);
    return this;
  }
  Z() {
    this.c.push(["Z"]);
    return this;
  }
  /** Circle as two arcs; clockwise on screen unless ccw. */
  circle(cx, cy, rad, ccw = false) {
    const s = ccw ? 0 : 1;
    return this.M(cx - rad, cy)
      .A(rad, rad, 0, 1, s, cx + rad, cy)
      .A(rad, rad, 0, 1, s, cx - rad, cy)
      .Z();
  }
  ellipse(cx, cy, rx, ry, ccw = false) {
    const s = ccw ? 0 : 1;
    return this.M(cx - rx, cy)
      .A(rx, ry, 0, 1, s, cx + rx, cy)
      .A(rx, ry, 0, 1, s, cx - rx, cy)
      .Z();
  }
  poly(points, ccw = false) {
    const pts = ccw ? [...points].reverse() : points;
    for (const [i, [x, y]] of pts.entries()) {
      if (i === 0) this.M(x, y);
      else this.L(x, y);
    }
    return this.Z();
  }
  rrect(x, y, w, h, rad = 0, ccw = false) {
    const k = Math.min(rad, w / 2, h / 2);
    if (k <= 0) {
      return this.poly(
        [
          [x, y],
          [x + w, y],
          [x + w, y + h],
          [x, y + h],
        ],
        ccw
      );
    }
    if (!ccw) {
      return this.M(x + k, y)
        .L(x + w - k, y)
        .A(k, k, 0, 0, 1, x + w, y + k)
        .L(x + w, y + h - k)
        .A(k, k, 0, 0, 1, x + w - k, y + h)
        .L(x + k, y + h)
        .A(k, k, 0, 0, 1, x, y + h - k)
        .L(x, y + k)
        .A(k, k, 0, 0, 1, x + k, y)
        .Z();
    }
    return this.M(x + k, y)
      .A(k, k, 0, 0, 0, x, y + k)
      .L(x, y + h - k)
      .A(k, k, 0, 0, 0, x + k, y + h)
      .L(x + w - k, y + h)
      .A(k, k, 0, 0, 0, x + w, y + h - k)
      .L(x + w, y + k)
      .A(k, k, 0, 0, 0, x + w - k, y)
      .Z();
  }
  add(other) {
    this.c.push(...(other instanceof P ? other.c : other));
    return this;
  }
}

export const path = () => new P();

/** Applies (x, y) => [x', y'] plus a uniform scale, rotation and mirror for arcs. */
export function transform(
  cmds,
  {
    s = 1,
    dx = 0,
    dy = 0,
    rot = 0,
    flipX = false,
    flipY = false,
    ox = 0,
    oy = 0,
  } = {}
) {
  const rad = (rot * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const mirrored = flipX !== flipY;
  const pt = (x, y) => {
    let px = x - ox;
    let py = y - oy;
    if (flipX) px = -px;
    if (flipY) py = -py;
    const rx = px * cos - py * sin;
    const ry = px * sin + py * cos;
    return [rx * s + dx, ry * s + dy];
  };
  return cmds.map((cmd) => {
    const [op, ...a] = cmd;
    switch (op) {
      case "M":
      case "L":
        return [op, ...pt(a[0], a[1])];
      case "C":
        return [op, ...pt(a[0], a[1]), ...pt(a[2], a[3]), ...pt(a[4], a[5])];
      case "Q":
        return [op, ...pt(a[0], a[1]), ...pt(a[2], a[3])];
      case "A": {
        const sweep = mirrored ? 1 - a[4] : a[4];
        return [
          "A",
          a[0] * s,
          a[1] * s,
          (a[2] + rot) % 360,
          a[3],
          sweep,
          ...pt(a[5], a[6]),
        ];
      }
      default:
        return [op];
    }
  });
}

export function toD(cmds) {
  let out = "";
  for (const [op, ...a] of cmds) {
    if (op === "Z") {
      out += "Z";
      continue;
    }
    if (op === "A") {
      out += `A${r(a[0])} ${r(a[1])} ${r(a[2])} ${a[3]} ${a[4]} ${r(a[5])} ${r(a[6])}`;
      continue;
    }
    out += op + a.map(r).join(" ");
  }
  return out;
}

// ── Strokes as filled outlines (specs have no strokes) ──────────────────────

export function bezier(p0, p1, p2, p3, n = 24) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push([
      u * u * u * p0[0] +
        3 * u * u * t * p1[0] +
        3 * u * t * t * p2[0] +
        t * t * t * p3[0],
      u * u * u * p0[1] +
        3 * u * u * t * p1[1] +
        3 * u * t * t * p2[1] +
        t * t * t * p3[1],
    ]);
  }
  return pts;
}

export function quad(p0, p1, p2, n = 20) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push([
      u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
      u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
    ]);
  }
  return pts;
}

export function arcPoints(cx, cy, rad, a0, a1, n = 24) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
  }
  return pts;
}

/** A polyline of `width`, as a closed outline (miter joins, butt or round ends). */
export function strokeLine(
  points,
  width,
  { round = false, taper = false } = {}
) {
  const half = width / 2;
  const n = points.length;
  const normals = points.map((_, i) => {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    return [-dy / len, dx / len];
  });
  const w = (i) =>
    taper ? half * (0.35 + 0.65 * Math.sin((Math.PI * i) / (n - 1))) : half;
  const left = points.map((p, i) => [
    p[0] + normals[i][0] * w(i),
    p[1] + normals[i][1] * w(i),
  ]);
  const right = points.map((p, i) => [
    p[0] - normals[i][0] * w(i),
    p[1] - normals[i][1] * w(i),
  ]);
  const p = path().M(...left[0]);
  for (let i = 1; i < n; i++) p.L(...left[i]);
  if (round && !taper) p.A(half, half, 0, 0, 1, ...right[n - 1]);
  else p.L(...right[n - 1]);
  for (let i = n - 2; i >= 0; i--) p.L(...right[i]);
  if (round && !taper) p.A(half, half, 0, 0, 1, ...left[0]);
  return p.Z();
}

/** Thick ring segment from a0 to a1 (degrees, clockwise on screen). */
export function ringArc(cx, cy, inner, outer, a0, a1) {
  const at = (rad, deg) => [
    cx + rad * Math.cos((deg * Math.PI) / 180),
    cy + rad * Math.sin((deg * Math.PI) / 180),
  ];
  const large = a1 - a0 > 180 ? 1 : 0;
  return path()
    .M(...at(outer, a0))
    .A(outer, outer, 0, large, 1, ...at(outer, a1))
    .L(...at(inner, a1))
    .A(inner, inner, 0, large, 0, ...at(inner, a0))
    .Z();
}

export function starPoints(cx, cy, outer, inner, n, start = -90) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const rad = i % 2 === 0 ? outer : inner;
    const a = ((start + (180 / n) * i) * Math.PI) / 180;
    pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
  }
  return pts;
}

export function regular(cx, cy, rad, n, start = -90) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = ((start + (360 / n) * i) * Math.PI) / 180;
    pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
  }
  return pts;
}

// ── Colors ──────────────────────────────────────────────────────────────────

export const mix = (a, b, amount) => ({ mix: [a, b], amount });

const hexToRgb = (hex) => {
  let h = hex.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
};
const rgbToHex = (rgb) =>
  `#${rgb
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;

export function resolveColor(color, palette, background = "#ffffff") {
  const base = (ref) => {
    switch (ref) {
      case "frame":
        return palette.frame;
      case "text":
        return palette.text ?? palette.frame;
      case "accent":
        return palette.accent ?? palette.frame;
      case "background":
        return background;
      default:
        return ref;
    }
  };
  if (typeof color === "string") return base(color);
  const a = hexToRgb(base(color.mix[0]));
  const b = hexToRgb(base(color.mix[1]));
  return rgbToHex(a.map((v, i) => v + (b[i] - v) * color.amount));
}

const lum = (hex) => {
  const [R, G, B] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.039_28 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
};
export const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

// ── Text metrics (the engine's estimate) ────────────────────────────────────

export function charEm(ch) {
  if (ch === " ") return 0.3;
  if (/[MWmw@%]/.test(ch)) return 0.92;
  if (/[A-Z0-9#&]/.test(ch)) return 0.72;
  if (/[il.,:;!'|1]/.test(ch)) return 0.32;
  return 0.6;
}
export const textEm = (t) =>
  Math.max(
    [...t].reduce((s, c) => s + charEm(c), 0),
    1
  );

// ── Spec pieces ─────────────────────────────────────────────────────────────

export const shape = {
  rect: (x, y, w, h, fill, rad, hole) => ({
    type: "rect",
    x: r(x),
    y: r(y),
    width: r(w),
    height: r(h),
    ...(rad ? { radius: r(rad) } : {}),
    fill,
    ...(hole
      ? {
          hole: {
            x: r(hole.x),
            y: r(hole.y),
            width: r(hole.width),
            height: r(hole.height),
            ...(hole.radius ? { radius: r(hole.radius) } : {}),
          },
        }
      : {}),
  }),
  circle: (cx, cy, rad, fill, hole) => ({
    type: "circle",
    cx: r(cx),
    cy: r(cy),
    r: r(rad),
    ...(hole ? { hole: r(hole) } : {}),
    fill,
  }),
  ellipse: (cx, cy, rx, ry, fill) => ({
    type: "ellipse",
    cx: r(cx),
    cy: r(cy),
    rx: r(rx),
    ry: r(ry),
    fill,
  }),
  poly: (points, fill) => ({
    type: "polygon",
    points: points.map(([x, y]) => [r(x), r(y)]),
    fill,
  }),
  path: (p, fill, rule) => ({
    type: "path",
    d: toD(p instanceof P ? p.c : p),
    fill,
    ...(rule === "evenodd" ? { fillRule: "evenodd" } : {}),
  }),
  line: (x1, y1, x2, y2, width, fill, opts = {}) => ({
    type: "line",
    x1: r(x1),
    y1: r(y1),
    x2: r(x2),
    y2: r(y2),
    width: r(width),
    ...(opts.cap ? { cap: opts.cap } : {}),
    ...(opts.dash ? { dash: opts.dash.map(r) } : {}),
    fill,
  }),
  icon: (icon, x, y, size, fill) => ({
    type: "icon",
    icon,
    x: r(x),
    y: r(y),
    size: r(size),
    fill,
  }),
};

/**
 * A text label. `on` is the paint behind it (generator only: contrast check).
 */
export function text(
  id,
  slot,
  value,
  box,
  { color = "text", weight, align, fontSize, on, maxLength } = {}
) {
  return {
    type: "text",
    id,
    slot,
    text: value,
    color,
    box: { x: r(box[0]), y: r(box[1]), width: r(box[2]), height: r(box[3]) },
    ...(weight === "regular" ? { weight } : {}),
    ...(align && align !== "middle" ? { align } : {}),
    ...(fontSize ? { fontSize: r(fontSize) } : {}),
    ...(maxLength ? { maxLength } : {}),
    _on: on,
  };
}

export function curved(
  id,
  slot,
  value,
  { cx, cy, radius, side, spread },
  fontSize,
  { color = "text", weight, on } = {}
) {
  return {
    type: "curved",
    id,
    slot,
    text: value,
    color,
    curve: {
      cx: r(cx),
      cy: r(cy),
      radius: r(radius),
      side,
      ...(spread ? { spread } : {}),
    },
    fontSize: r(fontSize),
    ...(weight === "regular" ? { weight } : {}),
    _on: on,
  };
}

/** Effective font size of a label at fontScale 1 with its default text. */
export function labelFont(label) {
  if (label.type === "curved") {
    const { radius, spread = 140 } = label.curve;
    const arc = radius * ((spread * Math.PI) / 180);
    return Math.min(
      label.fontSize,
      arc / (textEm(label.text) + 0.08 * label.text.length)
    );
  }
  const base = label.fontSize ?? label.box.height * 0.52;
  return Math.min(
    base,
    label.box.height * 0.95,
    label.box.width / textEm(label.text)
  );
}
