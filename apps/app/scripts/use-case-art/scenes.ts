// The eight use-case scenes, drawn in the home hero's isometric line style.
// Each returns SVG markup for a 400 × 300 viewBox; generate.ts adds the
// theme styles, the shared gradients and the real code (`#code`).
//
// Classes (styled in generate.ts): f = face, s / s2 = sides, l / l2 = lines,
// tx = text lines, ic = icon strokes, rim = the brand edge on the face that
// carries the code, glow = brand bloom, shade = soft ground shadow.

import type { UseCaseArtId } from "./codes";
import { type Camera, camera, roundRect, type V3 } from "./iso";

const path = (d: string, cls: string) => `<path class="${cls}" d="${d}"/>`;
const g = (transform: string, inner: string) =>
  `<g transform="${transform}">${inner}</g>`;
const ellipse = (
  e: { cx: number; cy: number; rx: number; ry: number },
  cls: string,
) =>
  `<ellipse class="${cls}" cx="${e.cx}" cy="${e.cy}" rx="${e.rx}" ry="${e.ry}"/>`;
const circle = (cx: number, cy: number, r: number, cls: string) =>
  `<circle class="${cls}" cx="${cx}" cy="${cy}" r="${r}"/>`;
/**
 * The scene's real QR code at (x, y) in the current plane, fitted into a
 * w × h box (framed codes are taller than wide).
 */
const code = (x: number, y: number, w: number, h = w) =>
  `<use href="#code" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
/** A short text-like line in a plane. */
const line = (x0: number, x1: number, y: number, cls = "tx") =>
  `<path class="${cls}" d="M${x0} ${y}H${x1}"/>`;
const shade = (cx: number, cy: number, rx: number, ry: number) =>
  `<ellipse class="shade" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`;
const bloom = (cx: number, cy: number, rx: number, ry: number) =>
  `<ellipse class="glow" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`;

/** A rounded slab (table top, desk, counter): side band, then top. */
function slab(
  cam: Camera,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z0: number,
  z1: number,
  r: number,
) {
  const p = cam.prism(x0, y0, x1, y1, z0, z1, r);
  return path(p.side, "s") + path(p.top, "f");
}

/** A sharp box: both visible sides, then the top. */
function block(
  cam: Camera,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
) {
  const b = cam.box(x0, y0, z0, x1, y1, z1);
  return path(b.left, "s") + path(b.right, "s2") + path(b.top, "f");
}

/** A flat convex shape lying at z0..z1 (a card), rotated by `deg` about its centre. */
function card(
  cam: Camera,
  cx: number,
  cy: number,
  w: number,
  h: number,
  deg: number,
  z0: number,
  z1: number,
) {
  const a = (deg * Math.PI) / 180;
  const corners = [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(
    ([u = 0, v = 0]) =>
      [
        cx + u * Math.cos(a) - v * Math.sin(a),
        cy + u * Math.sin(a) + v * Math.cos(a),
      ] as const,
  );
  let sides = "";
  corners.forEach(([ax, ay], i) => {
    const [bx, by] = corners[(i + 1) % 4] ?? [ax, ay];
    // Outward normal of a clockwise (screen) edge; the edge shows if it
    // faces +x or +y.
    const nx = by - ay;
    const ny = -(bx - ax);
    if (nx + ny <= 0) return;
    sides += path(
      cam.poly([
        [ax, ay, z1],
        [bx, by, z1],
        [bx, by, z0],
        [ax, ay, z0],
      ]),
      "s",
    );
  });
  const top = cam.poly(corners.map(([x, y]) => [x, y, z1] as V3));
  /** Matrix for content on the card's top face, (0, 0) at its back corner. */
  const [ox, oy] = corners[0] ?? [cx, cy];
  const face = cam.plane(
    [ox, oy, z1],
    [Math.cos(a), Math.sin(a), 0],
    [-Math.sin(a), Math.cos(a), 0],
  );
  return { sides, top: path(top, "f"), outline: top, face };
}

/** A tube in screen space: an outline stroke under a face-coloured stroke. */
function tube(d: string, width: number) {
  return `<path class="tube-o" d="${d}" style="stroke-width:${width + 2.2}"/><path class="tube" d="${d}" style="stroke-width:${width}"/>`;
}

/** Leaves on a stem at (x, y), as in the hero's plant. */
function sprig(x: number, y: number, scale = 1) {
  const leaf = (dx: number, dy: number, w: number) => {
    const [a, b, c] = [dx * scale, dy * scale, w * scale];
    return `M${x} ${y}C${x + a * 0.2 - c} ${y + b * 0.5} ${x + a - c} ${y + b * 0.9} ${x + a} ${y + b}C${x + a + c} ${y + b * 0.6} ${x + a * 0.3 + c} ${y + b * 0.3} ${x} ${y}Z`;
  };
  return [
    leaf(-16, -26, 4),
    leaf(-2, -36, 4.5),
    leaf(14, -28, 4),
    leaf(22, -12, 3),
  ]
    .map((d) => path(d, "f"))
    .join("");
}

// --- 1. Menus and tables: a table tent on a café table --------------------

function cafeTableTent() {
  const cam = camera(200, 146, 1);
  const base = cam.cylinder(0, 0, -88, -82, 34);
  const stem = cam.cylinder(0, 0, -82, -8, 6);
  const top = cam.prism(-92, -92, 92, 92, -8, 0, 92);

  // Table tent: ridge along x at y = -16, feet at y = -36 and 4.
  const [X0, X1, Y, H, F] = [-38, 38, -16, 80, 20];
  const slant = Math.hypot(F, H);
  const face = cam.poly([
    [X0, Y, H],
    [X1, Y, H],
    [X1, Y + F, 0],
    [X0, Y + F, 0],
  ]);
  const end = cam.poly([
    [X1, Y - F, 0],
    [X1, Y + F, 0],
    [X1, Y, H],
  ]);
  const onFace = cam.plane([X0, Y, H], [1, 0, 0], [0, F / slant, -H / slant]);
  const [fx, fy] = cam.p(0, Y + F / 2, H / 2);

  // Cup and saucer, front right.
  const saucer = cam.cylinder(56, 4, 0, 2, 19);
  const cup = cam.cylinder(56, 4, 2, 17, 11.5);
  const coffee = { ...cup.top, rx: cup.top.rx - 2.2, ry: cup.top.ry - 1.3 };
  const hx = cup.top.cx + cup.top.rx;
  const hy = cup.top.cy;
  const handle = `M${hx - 1} ${hy + 4}c6 -1 8 4 6 7s-4 3 -6 2`;

  // Bud vase, front left.
  const vase = cam.cylinder(-34, 42, 0, 22, 6);

  return [
    shade(200, 246, 72, 13),
    path(base.side, "s"),
    ellipse(base.top, "f"),
    path(stem.side, "s"),
    path(top.side, "s"),
    path(top.top, "f"),
    bloom(fx, fy, 66, 50),
    path(end, "s"),
    path(face, "f"),
    g(onFace, code(9, 7, 58, 68)),
    path(face, "rim"),
    path(vase.side, "s"),
    ellipse(vase.top, "f"),
    sprig(vase.top.cx, vase.top.cy, 0.9),
    path(saucer.side, "s"),
    ellipse(saucer.top, "f"),
    tube(handle, 2.4),
    path(cup.side, "s"),
    ellipse(cup.top, "f"),
    ellipse(coffee, "s2"),
  ].join("");
}

// --- 2. Business cards: a small stack on a desk ----------------------------

function businessCard() {
  const cam = camera(200, 150, 1);
  const stack = [
    card(cam, 24, -26, 110, 68, 4, 0, 1.6),
    card(cam, 22, -25, 110, 68, -2, 1.6, 3.2),
    card(cam, 20, -24, 110, 68, 0, 3.2, 4.8),
  ];
  // One card face down, half under the stack.
  const loose = card(cam, -50, 30, 96, 60, -14, 0, 1.6);
  const top = stack[2];
  const pen = `M${cam.p(34, 50, 3).join(" ")}L${cam.p(100, 50, 3).join(" ")}`;
  const [tipX, tipY] = cam.p(100, 50, 3);
  const [px, py] = cam.p(20, -24, 4.8);

  return [
    shade(200, 262, 150, 18),
    slab(cam, -116, -84, 116, 76, -14, 0, 16),
    bloom(px + 20, py, 80, 44),
    loose.sides,
    loose.top,
    g(
      loose.face,
      `<path class="ic" d="${roundRect(40, 20, 16, 16, 4.5)}"/>${line(33, 63, 46)}`,
    ),
    ...stack.map((c) => c.sides + c.top),
    top
      ? g(
          top.face,
          `<path class="acc" d="${roundRect(9, 9, 11, 11, 3)}"/>${line(9, 42, 44)}${line(9, 30, 51)}${line(9, 36, 58)}${code(54, 10, 47)}`,
        ) + path(top.outline, "rim")
      : "",
    tube(pen, 5),
    path(
      `M${tipX - 1} ${tipY - 2.6}L${tipX + 7} ${tipY + 4.4}L${tipX + 1.6} ${tipY + 3.3}Z`,
      "f",
    ),
    `<path class="l2" d="M${cam.p(48, 50, 3).join(" ")}m0 -3.2v6.4"/>`,
  ].join("");
}

// --- 3. Guest Wi-Fi: an acrylic stand on a hotel counter --------------------

function hotelWifiSign() {
  const cam = camera(200, 182, 1);
  const panel = cam.box(-12, -42, 9, -7, 42, 124);
  const onPanel = cam.onRight(-7, 42, 124);
  const [fx, fy] = cam.p(-7, 0, 66);
  const wifi = [4, 8.5, 13]
    .map(
      (r) =>
        `M${42 - r * 0.92} ${25 - r * 0.39}A${r} ${r} 0 0 1 ${42 + r * 0.92} ${25 - r * 0.39}`,
    )
    .join("");

  // Service bell, front.
  const bellBase = cam.cylinder(44, 42, 0, 4, 17);
  const [bx, by] = cam.p(44, 42, 4);
  const brx = 15;
  const bry = 8.6;
  const dome = `M${bx - brx} ${by}A${brx} ${brx * 0.95} 0 0 1 ${bx + brx} ${by}A${brx} ${bry} 0 0 1 ${bx - brx} ${by}Z`;
  const knob = `M${bx} ${by - brx * 0.95}v-4`;

  return [
    shade(200, 266, 140, 16),
    slab(cam, -100, -62, 100, 62, -14, 0, 14),
    bloom(fx, fy, 62, 70),
    slab(cam, -26, -48, 8, 48, 0, 9, 5),
    path(panel.left, "s"),
    path(panel.top, "s"),
    path(panel.right, "f"),
    g(
      onPanel,
      `<path class="f" d="${roundRect(6, 6, 72, 103, 3)}"/><path class="ic" d="${wifi}"/>${circle(42, 26, 1.6, "dot")}${code(16, 35, 52)}${line(26, 58, 96)}${line(32, 52, 102)}`,
    ),
    path(panel.right, "rim"),
    path(bellBase.side, "s"),
    ellipse(bellBase.top, "f"),
    path(dome, "f"),
    `<path class="l2" d="${knob}"/>`,
    ellipse({ cx: bx, cy: by - brx * 0.95 - 4.5, rx: 3.4, ry: 1.8 }, "f"),
  ].join("");
}

// --- 4. Payments: a UPI stand at a fruit stall, a phone scanning it ---------

function marketStallUpi() {
  const cam = camera(200, 176, 1);
  const planks = [-22, 22]
    .map((y) => `M${cam.p(-104, y).join(" ")}L${cam.p(104, y).join(" ")}`)
    .join("");

  // Crate of fruit, back right.
  const crate = cam.box(12, -62, 0, 86, -16, 24);
  const opening = cam.poly([
    [16, -58, 24],
    [82, -58, 24],
    [82, -20, 24],
    [16, -20, 24],
  ]);
  const slats = [8, 16]
    .map(
      (z) =>
        `M${cam.p(12, -16, z).join(" ")}L${cam.p(86, -16, z).join(" ")}L${cam.p(86, -62, z).join(" ")}`,
    )
    .join("");
  const fruit: [number, number, number][] = [
    [30, -46, 24],
    [52, -46, 24],
    [74, -46, 24],
    [26, -28, 24],
    [48, -28, 24],
    [70, -28, 24],
    [40, -40, 36],
    [62, -38, 36],
  ];
  fruit.sort((a, b) => a[0] + a[1] + a[2] * 2 - (b[0] + b[1] + b[2] * 2));
  const fruits = fruit
    .map(([x, y, z], i) => {
      const [cx, cy] = cam.p(x, y, z + 6);
      const leaf =
        i % 3 === 1
          ? `<path class="f" d="M${cx + 1} ${cy - 9}c2 -5 7 -6 9 -4c-2 4 -6 5 -9 4z"/>`
          : "";
      return circle(cx, cy, 10, "s") + leaf;
    })
    .join("");

  // UPI stand facing the viewer's left.
  const panel = cam.box(-70, -2, 8, -6, 3, 92);
  const onPanel = cam.onLeft(-70, 3, 92);
  const [fx, fy] = cam.p(-38, 3, 50);

  // A phone held up to the stand: its screen faces us, showing the code.
  const onPhone = cam.onLeft(-96, 40, 100);
  const [tx, ty] = cam.dir([0, -4, 0]);
  const body = roundRect(0, 0, 36, 70, 7);
  const vf = "M6 16v-4h4M26 12h4v4M30 32v4h-4M10 36h-4v-4";
  const tick = "M14.6 52.2l2.4 2.4 4.6-4.8";

  return [
    shade(200, 270, 150, 16),
    slab(cam, -112, -66, 112, 66, -16, 0, 10),
    `<path class="l" d="${planks}"/>`,
    path(crate.left, "s"),
    path(crate.right, "s2"),
    path(crate.top, "f"),
    path(opening, "s2"),
    `<path class="l" d="${slats}"/>`,
    fruits,
    bloom(fx, fy, 64, 56),
    slab(cam, -74, -8, -2, 12, 0, 8, 4),
    path(panel.right, "s2"),
    path(panel.top, "s"),
    path(panel.left, "f"),
    g(
      onPanel,
      `<path class="f" d="${roundRect(5, 5, 54, 74, 3)}"/>${line(22, 42, 14, "tx2")}${code(9, 21, 46)}${line(18, 46, 75)}`,
    ),
    path(panel.left, "rim"),
    g(`translate(${tx} ${ty})`, g(onPhone, `<path class="s" d="${body}"/>`)),
    g(
      onPhone,
      `<path class="f" d="${body}"/><path class="scr" d="${roundRect(3, 3, 30, 64, 4.5)}"/><path class="vf" d="${vf}"/>${code(10, 16, 16)}<circle class="acc" cx="18" cy="52.5" r="6"/><path class="tick" d="${tick}"/>`,
    ),
  ].join("");
}

// --- 5. Packaging and labels: kraft boxes with round code stickers ---------

function productPackaging() {
  const cam = camera(200, 186, 1);
  const sticker = (r: number) =>
    `${circle(r, r, r, "f")}${code(r - r * 0.62, r - r * 0.62, r * 1.24)}`;
  const tape = (x0: number, x1: number, y: number, z: number, drop: number) =>
    `<path class="l" d="M${cam.p(x0, y - 5, z).join(" ")}L${cam.p(x1, y - 5, z).join(" ")}l0 ${drop}M${cam.p(x0, y + 5, z).join(" ")}L${cam.p(x1, y + 5, z).join(" ")}l0 ${drop}"/>`;
  const [fx, fy] = cam.p(-42, 35, 34);

  return [
    shade(200, 268, 140, 16),
    slab(cam, -100, -62, 100, 62, -10, 0, 12),
    bloom(fx, fy, 70, 56),
    // A: big box, sticker on its left face.
    block(cam, -82, -42, 0, -6, 34, 64),
    tape(-82, -6, -4, 64, 14),
    g(
      cam.onLeft(-82, 34, 64),
      `<g transform="translate(14 8)">${sticker(24)}</g>`,
    ),
    // C: small box on A, sticker on its left face.
    block(cam, -68, -30, 64, -22, 16, 100),
    tape(-68, -22, -7, 100, 10),
    g(
      cam.onLeft(-68, 16, 100),
      `<g transform="translate(14 8)">${sticker(14)}</g>`,
    ),
    // B: medium box in front, sticker on its right face.
    block(cam, 10, -36, 0, 78, 26, 46),
    tape(10, 78, -5, 46, 12),
    g(
      cam.onRight(78, 26, 46),
      `<g transform="translate(16 10)">${sticker(18)}</g>`,
    ),
  ].join("");
}

// --- 6. Events and check-ins: a sign and lanyards on a registration desk ---

function eventCheckIn() {
  const cam = camera(200, 176, 1);
  const board = cam.box(-78, -15, 6, -12, -11, 100);
  const onBoard = cam.onLeft(-78, -11, 100);
  const [fx, fy] = cam.p(-45, -11, 52);

  const badge = (cx: number, cy: number, deg: number) => {
    const b = card(cam, cx, cy, 30, 40, deg, 0, 1.4);
    return (
      b.sides +
      b.top +
      g(
        b.face,
        `<path class="l2" d="${roundRect(10, 3.5, 10, 3, 1.5)}"/><path class="s" d="${roundRect(9, 11, 12, 12, 2)}"/>${line(8, 22, 29)}${line(11, 19, 34)}`,
      )
    );
  };
  // A lanyard lying in a loop behind each badge, in the desk plane.
  const cord = (cx: number, cy: number, deg: number, d: string) => {
    const a = (deg * Math.PI) / 180;
    return g(
      cam.plane(
        [cx, cy, 0.6],
        [Math.cos(a), Math.sin(a), 0],
        [-Math.sin(a), Math.cos(a), 0],
      ),
      tube(d, 2.4),
    );
  };
  const loopA =
    "M-1.5 -20C-8 -30 -30 -42 -28 -58C-26 -72 4 -72 9 -60C14 -48 5 -32 1.5 -20";
  const loopB =
    "M-1.5 -20C-6 -34 -2 -56 16 -60C34 -63 36 -46 24 -36C14 -28 6 -25 1.5 -20";

  return [
    shade(200, 268, 150, 16),
    slab(cam, -112, -50, 112, 50, -22, 0, 8),
    bloom(fx, fy, 60, 64),
    slab(cam, -82, -22, -8, -4, 0, 6, 3),
    path(board.right, "s2"),
    path(board.top, "s"),
    path(board.left, "f"),
    g(onBoard, `${code(7, 8, 52, 62)}${line(16, 50, 80)}${line(22, 44, 86)}`),
    path(board.left, "rim"),
    cord(26, 20, -8, loopA),
    cord(72, 6, 16, loopB),
    badge(26, 20, -8),
    badge(72, 6, 16),
  ].join("");
}

// --- 7. Shelves and displays: a tag under a shelf of mugs ------------------

function retailShelfTag() {
  const cam = camera(186, 160, 1);
  const wall = cam.box(-86, -58, -60, 94, -52, 52);
  const bracket = (x: number) =>
    path(
      cam.poly([
        [x, -52, 0],
        [x, -16, 0],
        [x, -52, -34],
      ]),
      "s",
    );
  const mug = (x: number, y: number, r: number, h: number) => {
    const c = cam.cylinder(x, y, 9, 9 + h, r);
    const hx = c.top.cx + c.top.rx;
    const hy = c.top.cy;
    const handle = `M${hx - 1} ${hy + h * 0.22}c${r * 0.7} -1 ${r * 0.8} ${h * 0.5} 0 ${h * 0.55}`;
    return (
      tube(handle, 2.6) +
      path(c.side, "s") +
      ellipse(c.top, "f") +
      ellipse({ ...c.top, rx: c.top.rx - 2, ry: c.top.ry - 1.2 }, "s2")
    );
  };
  const TY = 10.6;
  const onTag = cam.onLeft(-16, TY, 6);
  const tag = cam.poly([
    [-16, TY, 6],
    [42, TY, 6],
    [42, TY, -72],
    [-16, TY, -72],
  ]);
  const [fx, fy] = cam.p(13, TY, -32);

  return [
    path(wall.left, "wall"),
    path(wall.right, "wall"),
    path(wall.top, "wall"),
    bracket(-60),
    bracket(64),
    bloom(fx, fy, 56, 54),
    block(cam, -90, -52, 0, 90, 10, 9),
    mug(-60, -26, 13, 28),
    mug(-22, -20, 11, 21),
    mug(46, -24, 14, 25),
    path(tag, "f"),
    g(
      onTag,
      `<path class="s" d="${roundRect(20, -3, 18, 9, 2)}"/>${line(9, 27, 17, "tx2")}${code(9, 24, 40)}${line(9, 44, 71)}`,
    ),
    path(tag, "rim"),
  ].join("");
}

// --- 8. Posters and signs: a poster in a bus shelter ------------------------

function busStopPoster() {
  const cam = camera(196, 196, 0.86);
  const glass = cam.poly([
    [-92, -56, 6],
    [30, -56, 6],
    [30, -56, 116],
    [-92, -56, 116],
  ]);
  const glints = [
    `M${cam.p(-80, -56, 30).join(" ")}L${cam.p(-58, -56, 90).join(" ")}`,
    `M${cam.p(-70, -56, 26).join(" ")}L${cam.p(-52, -56, 74).join(" ")}`,
  ].join("");
  const post = (x: number, y: number) => {
    const c = cam.cylinder(x, y, 0, 118, 2.2);
    return path(c.side, "s");
  };
  const box = cam.box(30, -58, 6, 40, 4, 114);
  const onPoster = cam.onRight(40, 4, 114);
  const [fx, fy] = cam.p(40, -27, 60);
  const pole = cam.cylinder(98, -50, 0, 132, 2);
  const onSign = cam.onLeft(98 - 15, -50 + 2.6, 150);

  return [
    shade(196, 272, 160, 15),
    slab(cam, -112, -64, 112, 60, -9, 0, 8),
    `<path class="l" d="M${cam.p(-112, 44).join(" ")}L${cam.p(112, 44).join(" ")}"/>`,
    post(-92, -58),
    path(glass, "glass"),
    `<path class="l" d="${glints}"/>`,
    // Bench.
    block(cam, -80, -54, 26, -16, -40, 30),
    `<path class="l2" d="M${cam.p(-74, -40, 26).join(" ")}V${cam.p(-74, -40, 0)[1]}M${cam.p(-22, -40, 26).join(" ")}V${cam.p(-22, -40, 0)[1]}"/>`,
    post(-92, 4),
    // Roof.
    slab(cam, -100, -64, 46, 10, 116, 124, 4),
    bloom(fx, fy, 64, 78),
    path(box.left, "s"),
    path(box.top, "s"),
    path(box.right, "f"),
    g(
      onPoster,
      `<path class="tx2" d="M8 12H40M8 19H30"/>${code(9, 30, 44)}${line(9, 46, 86)}${line(9, 34, 92)}`,
    ),
    path(box.right, "rim"),
    path(pole.side, "s"),
    g(
      onSign,
      `${circle(15, 15, 15, "f")}<path class="ic" d="${roundRect(8, 9, 14, 10, 2.5)}M8 15H22"/>${circle(11, 21, 1.4, "dot")}${circle(19, 21, 1.4, "dot")}`,
    ),
  ].join("");
}

export const SCENES: Record<UseCaseArtId, () => string> = {
  "cafe-table-tent": cafeTableTent,
  "business-card": businessCard,
  "hotel-wifi-sign": hotelWifiSign,
  "market-stall-upi": marketStallUpi,
  "product-packaging": productPackaging,
  "event-check-in": eventCheckIn,
  "retail-shelf-tag": retailShelfTag,
  "bus-stop-poster": busStopPoster,
};
