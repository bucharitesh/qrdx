// One isometric scene per blog illustration, in the home hero's line style.
// Each returns SVG markup for its viewBox (codes.ts); generate.ts adds the
// backdrop, the styles, the gradients and the real codes (`#<id>`).
//
// Classes: f = face, s / s2 = sides, l / l2 = lines, tx / tx2 = text lines,
// ic = icon strokes, rim = the brand edge on the face that carries the code,
// acc = brand fill, vf = accent stroke, beam = accent line, glow = bloom,
// shade = ground shadow, glass = see-through panel, ghost = a dashed outline.

import { BLOG_ART, type BlogArtId } from "./codes";
import {
  badge,
  block,
  type Camera,
  camera,
  circle,
  code,
  ellipse,
  finder,
  g,
  glow,
  hourglass,
  line,
  padlock,
  panelLeft,
  panelRight,
  path,
  phoneLeft,
  pipe,
  plinth,
  r1,
  rr,
  shade,
  signLeft,
  signRight,
  slab,
  sparkle,
  text,
  tile,
  tube,
  wire,
} from "./kit";

// --- Small props -------------------------------------------------------------

/** A web page in face units: header block, then text lines. */
function page(w: number, h: number, bright = true) {
  const head = bright ? "s" : "ghost";
  return (
    path(rr(6, 6, w - 12, h * 0.32, 2.5), head) +
    line(6, w - 14, h * 0.32 + 14, bright ? "tx2" : "tx") +
    line(6, w - 8, h * 0.32 + 22) +
    line(6, w - 22, h * 0.32 + 30) +
    (bright ? path(rr(6, h - 18, w * 0.45, 10, 5), "acc") : "")
  );
}

/** A link glyph (two rounded links) at (x, y), about 14 × 6. */
const linkIcon = (x: number, y: number) =>
  `<path class="ic" transform="translate(${x} ${y})" d="M5 0H3.4a3 3 0 0 0 0 6H5M9 0h1.6a3 3 0 0 1 0 6H9M4.4 3h5.2"/>`;

/** Wi-Fi arcs centred at (x, y). */
const wifiIcon = (x: number, y: number, s = 1) =>
  `<path class="ic" transform="translate(${x} ${y}) scale(${s})" d="M-9 -2a13 13 0 0 1 18 0M-6 1.6a8.4 8.4 0 0 1 12 0M-3 5a4 4 0 0 1 6 0"/>${circle(x, y + 8 * s, 1.4 * s, "dot")}`;

/** A cup and saucer standing at world (x, y, z). */
function cup(cam: Camera, x: number, y: number, z: number, s = 1) {
  const saucer = cam.cylinder(x, y, z, z + 2, 15 * s);
  const body = cam.cylinder(x, y, z + 2, z + 14 * s, 9 * s);
  const coffee = {
    ...body.top,
    rx: r1(body.top.rx - 1.8),
    ry: r1(body.top.ry - 1.1),
  };
  const hx = body.top.cx + body.top.rx;
  const hy = body.top.cy;
  return (
    path(saucer.side, "s") +
    ellipse(saucer.top, "f") +
    tube(`M${r1(hx - 1)} ${r1(hy + 3)}c5 -1 7 3 5 6s-4 2 -5 2`, 2.2) +
    path(body.side, "s") +
    ellipse(body.top, "f") +
    ellipse(coffee, "s2")
  );
}

/** A table tent standing on z = 0 with the code on its front face. */
function tableTent(
  cam: Camera,
  [X0, Y, H]: [number, number, number],
  width: number,
  id = "code",
) {
  const X1 = X0 + width;
  const F = H * 0.25;
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
  const pad = width * 0.14;
  const size = width - 2 * pad;
  return (
    path(end, "s") +
    path(face, "f") +
    g(
      onFace,
      code(pad, pad, size, size, id) +
        line(pad + size * 0.18, pad + size * 0.82, pad + size + 6, "tx2"),
    ) +
    path(face, "rim")
  );
}

/** A key glyph in screen space, bow at (x, y). */
const keyIcon = (x: number, y: number, s = 1) =>
  `<g transform="translate(${x} ${y}) scale(${s})">${circle(0, 0, 4.2, "acc")}${circle(0, 0, 1.5, "f")}${path("M4 0h11v3.4M11.4 0v2.6", "vf")}</g>`;

/** A folder glyph in face units at (x, y), w wide. */
const folderIcon = (x: number, y: number, w = 14) =>
  `<path class="ic" transform="translate(${x} ${y}) scale(${w / 14})" d="M1 2.6a1.6 1.6 0 0 1 1.6-1.6h3l1.6 1.8h4.2a1.6 1.6 0 0 1 1.6 1.6v5.4a1.6 1.6 0 0 1-1.6 1.6H2.6A1.6 1.6 0 0 1 1 9.8Z"/>`;

/** A plug glyph in face units at (x, y). */
const plugIcon = (x: number, y: number) =>
  `<path class="ic" transform="translate(${x} ${y})" d="M4 0v3M10 0v3M2 3h10v3a5 5 0 0 1-10 0ZM7 11v3"/>`;

/** A row of bars rising from z = 0, the last one in brand colour. */
function bars(cam: Camera, x0: number, y: number, heights: number[], w = 9) {
  return heights
    .map((h, i) => {
      const x = x0 + i * (w + 4);
      return i === heights.length - 1
        ? block(cam, x, y, 0, x + w, y + w, h, "acc")
        : block(cam, x, y, 0, x + w, y + w, h);
    })
    .join("");
}

// --- New posts -----------------------------------------------------------------

// A printed code, its short link, and the two places it can send people.
function dynamicCover() {
  const cam = camera(240, 142, 1.12);
  return [
    plinth(cam, -78, -78, 78, 78),
    pipe(cam, [
      [-36, 40, 2],
      [-36, 4, 2],
      [-12, 4, 2],
    ]),
    wire(
      cam,
      [
        [18, -10, 2],
        [18, -46, 2],
      ],
      "dash",
    ),
    pipe(cam, [
      [20, 8, 2],
      [44, 8, 2],
      [44, -12, 2],
    ]),
    glow(cam, [-52, 50, 44], 56, 48),
    signRight(cam, [-56, 22, 0], 56, 74),
    block(cam, -14, -14, 0, 20, 18, 15),
    tile(
      cam,
      [-10, -10, 18],
      26,
      24,
      `${linkIcon(6, 5)}${line(5, 21, 16, "tx2")}`,
      {
        t: 3,
        r: 4,
      },
    ),
    panelLeft(cam, [6, -76, 0], 48, 62, page(48, 62, false), {
      t: 3,
      face: "ghost",
    }),
    panelLeft(cam, [34, -42, 0], 50, 64, page(50, 64), { t: 3 }),
    badge(...cam.p(84, -40, 68), 6),
    // The short link, printed on a tag in front of the redirect.
    tile(
      cam,
      [-10, 30, 1.5],
      62,
      14,
      `${text(5, 9.4, "qrdx.dev/q/aB3dE5f", "mono")}`,
      { t: 1.5, r: 3 },
    ),
  ].join("");
}

// A styled code on a stand, a phone that has just read it, and the branch
// diagram of the open-source repo on the floor in front.
function launchCover() {
  const cam = camera(240, 150, 1.1);
  const branch = `${path("M6 10H84", "l2")}${path("M26 10C36 10 36 22 46 22H84", "vf")}${[
    6, 26, 58, 84,
  ]
    .map((x) => circle(x, 10, 2.6, "f"))
    .join("")}${[46, 70].map((x) => circle(x, 22, 2.6, "acc")).join("")}`;
  const screen = `${finder(7, 9, 22, 22, 4)}${code(10, 12, 16, 16)}${line(6, 30, 40, "tx2")}${line(6, 24, 46)}${line(6, 27, 52)}${badge(18, 60, 4.5)}`;
  return [
    plinth(cam, -78, -78, 78, 78),
    wire(
      cam,
      [
        [-40, 4, 2],
        [30, 4, 2],
        [30, -38, 2],
      ],
      "dash",
    ),
    shade(...cam.p(31, -46, 0), 16, 4),
    glow(cam, [-50, 34, 44], 58, 50),
    signRight(cam, [-58, 2, 0], 56, 74),
    phoneLeft(cam, [14, -44, 76], screen, 0.95),
    tile(cam, [-12, 36, 1.5], 84, 28, branch, { t: 1.5, r: 4 }),
  ].join("");
}

// The same code at three sizes, with a tape measure along the floor.
function sizeCover() {
  const cam = camera(240, 146, 1.1);
  const ticks = Array.from({ length: 18 }, (_, i) =>
    path(`M${i * 8 + 4} 0V${i % 5 === 0 ? 7 : 4}`, "l2"),
  ).join("");
  return [
    plinth(cam, -78, -78, 78, 78),
    glow(cam, [26, -40, 44], 62, 54),
    signRight(cam, [-56, 34, 0], 26, 34, { caption: false }),
    signRight(cam, [-26, 4, 0], 40, 52),
    signRight(cam, [18, -50, 0], 60, 78),
    tile(cam, [-70, 58, 2], 146, 11, ticks, { t: 2, r: 2 }),
    block(cam, -78, 54, 0, -64, 72, 10),
    wire(
      cam,
      [
        [22, -56, 8],
        [22, -56, 88],
      ],
      "beam",
    ),
    wire(
      cam,
      [
        [22, -52, 8],
        [22, -60, 8],
      ],
      "beam",
    ),
    wire(
      cam,
      [
        [22, -52, 88],
        [22, -60, 88],
      ],
      "beam",
    ),
  ].join("");
}

// A terminal sends a request; a styled code comes out the other side.
function apiCover() {
  const cam = camera(240, 144, 1.1);
  const screen = (w: number, h: number) =>
    `${path(rr(4, 4, w - 8, h - 8, 3), "scr")}${circle(10, 10, 1.3, "dot")}${circle(14.5, 10, 1.3, "dot")}${circle(19, 10, 1.3, "dot")}${text(9, 23, "$", "mono-a")}${text(14, 23, "curl api.qrdx.dev/v1/qr", "mono")}${line(9, 56, 32, "tx2")}${line(9, 72, 40)}${line(9, 48, 48)}${text(9, 62, "200  image/svg+xml", "mono-a")}`;
  return [
    plinth(cam, -78, -78, 78, 78),
    pipe(cam, [
      [-30, 28, 2],
      [-30, -4, 2],
      [14, -4, 2],
    ]),
    panelRight(cam, [-60, -24, 0], 92, 72, screen(92, 72), { t: 5 }),
    slab(cam, -68, -30, -46, 74, 0, 4, 3),
    glow(cam, [40, -30, 44], 58, 50),
    signLeft(cam, [16, -26, 0], 56, 72),
    sparkle(...cam.p(78, -28, 88), 6),
    sparkle(...cam.p(86, -20, 74), 3.5),
    // Braces tile in front: the JSON side of the API.
    tile(
      cam,
      [-6, 34, 1.5],
      50,
      16,
      `${text(5, 10.5, '{ "slug": "…" }', "mono")}`,
      { t: 1.5, r: 3 },
    ),
  ].join("");
}

// A café table: menu table tent, Wi-Fi stand and a coffee.
function menuCover() {
  const cam = camera(236, 128, 1.06);
  const top = cam.prism(-80, -62, 80, 62, -6, 0, 10);
  const leg = cam.cylinder(0, 0, -76, -6, 7);
  const foot = cam.cylinder(0, 0, -82, -76, 30);
  const wifiPanel = (w: number, h: number) =>
    `${wifiIcon(w / 2, 10, 0.6)}${code(6, 21, w - 12, w - 12, "wifi")}${line(10, w - 10, h - 6)}`;
  return [
    shade(...cam.p(0, 0, -82), 96, 14),
    path(foot.side, "s"),
    ellipse(foot.top, "f"),
    path(leg.side, "s"),
    path(top.side, "s"),
    path(top.top, "f"),
    glow(cam, [-10, -16, 34], 70, 52),
    tableTent(cam, [-46, -30, 72], 62),
    panelLeft(cam, [30, -50, 0], 42, 60, wifiPanel(42, 60), { t: 5 }),
    slab(cam, 26, -56, 76, -38, 0, 4, 3),
    cup(cam, 48, 26, 0, 1.15),
    tile(
      cam,
      [-68, 12, 1.5],
      40,
      30,
      `${line(5, 24, 7, "tx2")}${line(5, 32, 14)}${line(5, 28, 20)}${line(5, 30, 26)}`,
      { t: 1.5, r: 2 },
    ),
  ].join("");
}

// A chat asks for a code; the assistant's tool call puts a real one on the stand.
function chatCover() {
  const cam = camera(240, 144, 1.1);
  const chat = (w: number, h: number) =>
    `${path(rr(4, 4, w - 8, h - 8, 3), "scr")}${path(rr(w - 58, 11, 46, 13, 6.5), "s2")}${line(w - 52, w - 20, 17.5, "tx2")}${path(rr(10, 30, 52, 22, 6.5), "s")}${text(15, 39, "design_qr", "mono-a")}${line(15, 46, 46)}${path(rr(10, h - 18, w - 20, 8, 4), "ghost")}`;
  return [
    plinth(cam, -78, -78, 78, 78),
    pipe(cam, [
      [-30, 28, 2],
      [-30, -4, 2],
      [14, -4, 2],
    ]),
    panelRight(cam, [-60, -24, 0], 92, 72, chat(92, 72), { t: 5 }),
    slab(cam, -68, -30, -46, 74, 0, 4, 3),
    glow(cam, [40, -30, 44], 58, 50),
    signLeft(cam, [16, -26, 0], 56, 72),
    sparkle(...cam.p(78, -28, 88), 6),
    sparkle(...cam.p(86, -20, 74), 3.5),
  ].join("");
}

// --- Existing posts: covers ------------------------------------------------------

// A code lying flat, its finder patterns marked, a sampling grid above it.
function understandingCover() {
  const cam = camera(232, 150, 1.12);
  const S = 80;
  const grid = Array.from({ length: 9 }, (_, i) => {
    const v = 6 + (i * (S - 12)) / 8;
    return path(`M${r1(v)} 6V${S - 6}M6 ${r1(v)}H${S - 6}`, "l");
  }).join("");
  const pad = 8;
  const cs = S - 2 * pad;
  const eye = (cs * 7) / 25;
  return [
    plinth(cam, -78, -78, 78, 78),
    glow(cam, [0, 0, 10], 70, 50),
    tile(
      cam,
      [-S / 2, -S / 2, 4],
      S,
      S,
      code(pad, pad, cs, cs) +
        finder(pad - 2, pad - 2, eye + 4, eye + 4, 3) +
        finder(pad + cs - eye - 2, pad - 2, eye + 4, eye + 4, 3) +
        finder(pad - 2, pad + cs - eye - 2, eye + 4, eye + 4, 3),
      { t: 4, r: 4, rim: true },
    ),
    wire(
      cam,
      [
        [-S / 2, -S / 2, 6],
        [-S / 2, -S / 2, 54],
      ],
      "dash",
    ),
    wire(
      cam,
      [
        [S / 2, -S / 2, 6],
        [S / 2, -S / 2, 54],
      ],
      "dash",
    ),
    wire(
      cam,
      [
        [-S / 2, S / 2, 6],
        [-S / 2, S / 2, 54],
      ],
      "dash",
    ),
    wire(
      cam,
      [
        [S / 2, S / 2, 6],
        [S / 2, S / 2, 54],
      ],
      "dash",
    ),
    tile(cam, [-S / 2, -S / 2, 56], S, S, grid, {
      t: 1.5,
      r: 4,
      face: "glass",
    }),
    phoneLeft(
      cam,
      [40, -64, 72],
      `${finder(8, 14, 20, 20)}${code(10, 16, 16)}${badge(18, 52, 6)}`,
      0.92,
    ),
  ].join("");
}

// A printed code on a stand with an hourglass and a calendar beside it.
function expireCover() {
  const cam = camera(240, 146, 1.1);
  const [hx, hy] = cam.p(28, 6, 0);
  const cal = Array.from({ length: 12 }, (_, i) =>
    path(
      rr(4 + (i % 4) * 8, 5 + Math.floor(i / 4) * 8.5, 6, 6, 1.2),
      i === 10 ? "acc" : "s2",
    ),
  ).join("");
  return [
    plinth(cam, -78, -78, 78, 78),
    glow(cam, [-40, 30, 44], 58, 50),
    signRight(cam, [-50, 10, 0], 56, 74),
    shade(hx, hy + 2, 20, 5),
    hourglass(hx, hy, 64),
    block(cam, 28, -72, 0, 70, -34, 12),
    tile(cam, [31, -69, 15], 36, 32, cal, { t: 3, r: 3 }),
  ].join("");
}

// Four codes in four styles, one scan line across them all.
function bestFreeCover() {
  const cam = camera(240, 160, 1.08);
  const spots: [number, number, string][] = [
    [-62, 58, "c1"],
    [-26, 22, "c2"],
    [10, -14, "c3"],
    [46, -50, "c4"],
  ];
  const [bx0, by] = cam.p(-48, 72, 38);
  const [bx1] = cam.p(72, -48, 38);
  return [
    plinth(cam, -78, -78, 78, 78),
    glow(cam, [0, 10, 40], 90, 46),
    ...spots.map(([x, y, id]) => signRight(cam, [x, y, 0], 40, 52, { id })),
    path(`M${r1(bx0 - 24)} ${r1(by)}H${r1(bx1 + 30)}`, "beam"),
  ].join("");
}

// A plain code and its styled version, facing each other.
function introCover() {
  const cam = camera(240, 146, 1.1);
  return [
    plinth(cam, -78, -78, 78, 78),
    pipe(cam, [
      [-30, 30, 2],
      [-30, -8, 2],
      [12, -8, 2],
    ]),
    signRight(cam, [-58, 16, 0], 52, 68, { id: "plain", rim: false }),
    glow(cam, [42, -30, 44], 60, 50),
    signLeft(cam, [16, -30, 0], 56, 72, { id: "styled" }),
    sparkle(...cam.p(78, -32, 88), 6),
    sparkle(...cam.p(86, -24, 74), 3.5),
  ].join("");
}

// A code on a hub, connected to four tools.
function integrationsCover() {
  const cam = camera(240, 148, 1.08);
  const hub = cam.cylinder(0, 0, 0, 8, 26);
  const tool = (x: number, y: number, icon: string) =>
    block(cam, x - 12, y - 12, 0, x + 12, y + 12, 12) +
    g(cam.onTop(x - 12, y - 12, 12), icon);
  return [
    plinth(cam, -78, -78, 78, 78),
    pipe(cam, [
      [0, 0, 3],
      [-56, 0, 3],
    ]),
    pipe(cam, [
      [0, 0, 3],
      [56, 0, 3],
    ]),
    pipe(cam, [
      [0, 0, 3],
      [0, -56, 3],
    ]),
    pipe(cam, [
      [0, 0, 3],
      [0, 56, 3],
    ]),
    tool(-56, 0, linkIcon(5, 9)),
    tool(0, -56, folderIcon(5, 6)),
    tool(56, 0, plugIcon(5, 5)),
    tool(
      0,
      56,
      `<g transform="translate(6 12)">${path("M0 0a4 4 0 1 1 8 0a4 4 0 1 1-8 0M8 0h8v3", "ic")}</g>`,
    ),
    path(hub.side, "s"),
    ellipse(hub.top, "f"),
    glow(cam, [0, 0, 50], 50, 44),
    signLeft(cam, [-22, -2, 8], 44, 56),
  ].join("");
}

// --- Existing posts: inline figures ------------------------------------------------

// A plain-words prompt turning into three code styles.
function introStyles() {
  const cam = camera(240, 160, 1.1);
  return [
    plinth(cam, -78, -78, 78, 78),
    glow(cam, [10, -30, 40], 90, 50),
    signLeft(cam, [-60, -46, 0], 34, 44, { id: "c1" }),
    signLeft(cam, [-18, -46, 0], 34, 44, { id: "c2" }),
    signLeft(cam, [24, -46, 0], 34, 44, { id: "c3" }),
    wire(
      cam,
      [
        [-20, 26, 4],
        [-44, -38, 4],
      ],
      "dash",
    ),
    wire(
      cam,
      [
        [-6, 26, 4],
        [-2, -38, 4],
      ],
      "dash",
    ),
    wire(
      cam,
      [
        [8, 26, 4],
        [40, -38, 4],
      ],
      "dash",
    ),
    tile(
      cam,
      [-34, 22, 4],
      64,
      30,
      `${line(6, 40, 9, "tx2")}${line(6, 52, 16)}${line(6, 30, 23)}${sparkle(54, 21, 4)}`,
      { t: 4, r: 6 },
    ),
  ].join("");
}

// The layers of a code pulled apart: paper, modules, eyes, frame.
function introLayers() {
  const cam = camera(240, 248, 1.18);
  const S = 84;
  const pad = 10;
  const cs = S - 2 * pad;
  const o = -S / 2;
  const posts = [
    [o, o],
    [o + S, o],
    [o, o + S],
    [o + S, o + S],
  ] as const;
  return [
    shade(...cam.p(0, 0, -6), 110, 18),
    slab(cam, o - 8, o - 8, o + S + 8, o + S + 8, -6, 0, 8),
    ...posts.map(([x, y]) =>
      wire(
        cam,
        [
          [x, y, 2],
          [x, y, 131],
        ],
        "dash",
      ),
    ),
    tile(cam, [o, o, 4], S, S, "", { t: 4, r: 4 }),
    tile(cam, [o, o, 44], S, S, code(pad, pad, cs, cs, "code-body"), {
      t: 1.5,
      r: 4,
      face: "glass",
    }),
    tile(cam, [o, o, 86], S, S, code(pad, pad, cs, cs, "code-eyes"), {
      t: 1.5,
      r: 4,
      face: "glass",
    }),
    tile(
      cam,
      [o, o, 128],
      S,
      S,
      `${path(rr(4, 4, S - 8, S - 8, 6), "l2")}${path(rr(16, S - 15, S - 32, 8, 4), "acc")}`,
      { t: 1.5, r: 4, face: "glass", rim: true },
    ),
  ].join("");
}

// The code, a fork of it, and the branch that joins them.
function introOpenSource() {
  const cam = camera(240, 176, 1.1);
  const branch = `${path("M6 10H74", "l2")}${path("M24 10C34 10 34 24 44 24H74", "vf")}${[
    6, 24, 50, 74,
  ]
    .map((x) => circle(x, 10, 2.6, "f"))
    .join("")}${[44, 62].map((x) => circle(x, 24, 2.6, "acc")).join("")}`;
  return [
    plinth(cam, -78, -78, 78, 78),
    panelLeft(cam, [12, -66, 6], 48, 62, code(6, 6, 36, 36), {
      t: 4,
      face: "ghost",
    }),
    slab(cam, 8, -72, 64, -56, 0, 6, 3),
    glow(cam, [-20, -30, 44], 58, 50),
    signLeft(cam, [-44, -36, 0], 52, 68),
    tile(cam, [-36, 20, 2], 80, 34, branch, { t: 2, r: 4 }),
  ].join("");
}

// A long link, shortened, printed as a code; its clicks counted.
function integrationsDub() {
  const cam = camera(240, 172, 1.1);
  return [
    plinth(cam, -78, -78, 78, 78),
    tile(cam, [-70, 34, 2], 70, 10, line(4, 66, 5, "tx2"), { t: 2, r: 2 }),
    wire(
      cam,
      [
        [2, 39, 3],
        [10, 39, 3],
      ],
      "beam",
    ),
    tile(
      cam,
      [14, 32, 2],
      30,
      14,
      `${linkIcon(4, 4)}${line(19, 26, 7, "tx2")}`,
      {
        t: 3,
        r: 6,
      },
    ),
    glow(cam, [-30, -20, 44], 56, 48),
    signLeft(cam, [-56, -28, 0], 50, 66),
    bars(cam, 18, -56, [14, 22, 30, 44]),
  ].join("");
}

// A logo picked from a folder, placed in the centre of a code.
function integrationsDrive() {
  const cam = camera(240, 192, 1.12);
  const pad = 7;
  const cs = 50;
  const logo = (ox: number, oy: number, s: number) =>
    `${path(rr(ox, oy, s, s, s * 0.16), "acc")}<path class="tick" d="M${r1(ox + s * 0.26)} ${r1(oy + s * 0.66)}l${r1(s * 0.16)}-${r1(s * 0.24)} ${r1(s * 0.14)} ${r1(s * 0.16)} ${r1(s * 0.2)}-${r1(s * 0.3)}"/>`;
  const at = (v: number) => r1(pad + (v / 1000) * cs);
  const spot = BLOG_ART.integrationsDrive.damage;
  return [
    plinth(cam, -84, -92, 72, 64),
    // The folder: a box with a tab, the picked image lifting out of it.
    block(cam, -68, 14, 0, -24, 50, 24),
    block(cam, -68, 14, 24, -48, 30, 28),
    g(cam.onTop(-68, 30, 24), folderIcon(12, 4, 16)),
    wire(
      cam,
      [
        [-36, 26, 40],
        [-6, -16, 64],
      ],
      "dash",
    ),
    tile(cam, [-40, 16, 46], 22, 22, logo(2, 2, 18), { t: 2, r: 3 }),
    glow(cam, [30, -32, 44], 58, 50),
    panelLeft(
      cam,
      [6, -40, 5],
      64,
      78,
      code(pad, pad, cs, cs) +
        logo(at(spot.x), at(spot.y), r1((spot.w / 1000) * cs)) +
        line(pad, pad + 34, 70, "tx2"),
      { t: 4, rim: true },
    ),
    slab(cam, 2, -46, 74, -30, 0, 5, 3),
  ].join("");
}

// Access approved on a consent screen; only a scoped key comes back.
function integrationsOauth() {
  const cam = camera(240, 150, 1.08);
  const consent = (w: number, h: number) =>
    `${circle(w / 2, 13, 6, "s2")}${line(14, w - 14, 27, "tx2")}${line(18, w - 18, 34)}${path(rr(8, 42, w - 16, 7, 2), "s2")}${path(rr(8, 52, w - 16, 7, 2), "s2")}${path(rr(8, h - 16, (w - 20) / 2, 9, 4.5), "s")}${path(rr(w / 2 + 2, h - 16, (w - 20) / 2, 9, 4.5), "acc")}`;
  const [kx, ky] = cam.p(26, 22, 10);
  const [lx, ly] = cam.p(-60, 44, 14);
  return [
    plinth(cam, -78, -78, 78, 78),
    wire(
      cam,
      [
        [-60, 44, 2],
        [-60, 22, 2],
        [52, 22, 2],
        [52, -30, 2],
      ],
      "dash",
    ),
    shade(lx, ly + 12, 14, 4),
    padlock(lx, ly, 20),
    slab(cam, -34, -36, 22, -18, 0, 4, 3),
    panelLeft(cam, [-30, -30, 4], 48, 74, consent(48, 74), { t: 4 }),
    keyIcon(kx, ky, 1.3),
    glow(cam, [56, -54, 40], 50, 44),
    signLeft(cam, [36, -60, 0], 42, 56),
  ].join("");
}

// A dock of modules: three plugged in, a fourth on its way.
function integrationsExtensible() {
  const cam = camera(240, 222, 1.1);
  const mod = (x: number, z: number) =>
    block(cam, x, -8, z, x + 22, 14, z + 18);
  return [
    shade(...cam.p(0, 0, -6), 130, 18),
    slab(cam, -76, -26, 76, 30, -6, 0, 6),
    block(cam, -70, -20, 0, 70, 24, 12),
    ...[-62, -28, 6].map((x) => mod(x, 12)),
    tile(cam, [40, -8, 12.5], 22, 22, "", { t: 0.5, r: 1, face: "s2" }),
    wire(
      cam,
      [
        [51, 3, 14],
        [51, 3, 40],
      ],
      "dash",
    ),
    mod(40, 44),
    g(cam.onTop(40, -8, 62), plugIcon(4, 4)),
    glow(cam, [-10, -46, 40], 56, 46),
    signLeft(cam, [-34, -48, 0], 48, 62),
  ].join("");
}

// A code half behind frosted glass, with a lock on the glass.
function bestFreePaywall() {
  const cam = camera(240, 158, 1.14);
  const [lx, ly] = cam.p(18, 12, 50);
  return [
    plinth(cam, -78, -78, 78, 78),
    glow(cam, [-8, -10, 44], 60, 50),
    signLeft(cam, [-38, -14, 0], 64, 80),
    panelLeft(cam, [-4, 4, 1], 48, 92, "", { t: 1.5, face: "glass" }),
    padlock(lx, ly, 26, "f"),
  ].join("");
}

// A printed code, a scan counter at its limit, and the sand running out.
function bestFreeScanLimits() {
  const cam = camera(200, 220, 1.08);
  const meter = Array.from({ length: 8 }, (_, i) =>
    path(rr(4 + i * 6, 5, 4, 12, 1), i < 8 ? (i === 7 ? "acc" : "s2") : "s"),
  ).join("");
  const [hx, hy] = cam.p(40, 30, 0);
  return [
    plinth(cam, -70, -70, 70, 70),
    glow(cam, [-24, -10, 46], 58, 50),
    signRight(cam, [-44, -36, 0], 58, 76),
    block(cam, 14, -60, 0, 66, -36, 16),
    tile(cam, [16, -58, 19], 50, 22, meter, { t: 3, r: 3 }),
    shade(hx, hy + 2, 18, 5),
    hourglass(hx, hy, 58),
  ].join("");
}

// Three needs, three codes: designer, developer, in a hurry.
function bestFreePersonas() {
  const cam = camera(240, 160, 1.04);
  const swatches = [0, 1, 2, 3]
    .map((i) =>
      circle(7 + i * 8, 8, 3.2, i === 1 ? "acc" : i === 3 ? "s2" : "f"),
    )
    .join("");
  return [
    plinth(cam, -84, -84, 84, 84),
    // Designer: a styled code and a palette.
    signRight(cam, [-70, 34, 0], 36, 46, { id: "c1" }),
    tile(cam, [-44, 66, 2], 36, 16, swatches, { t: 2, r: 6 }),
    // Developer: a code and a terminal.
    signRight(cam, [-18, -18, 0], 36, 46, { id: "c2" }),
    tile(
      cam,
      [8, 14, 2],
      34,
      22,
      `${path(rr(2, 2, 30, 18, 2), "scr")}${text(5, 10, ">_", "mono-a")}${line(5, 22, 15)}`,
      { t: 2, r: 3 },
    ),
    // In a hurry: a plain code, nothing else.
    signRight(cam, [34, -70, 0], 36, 46, { id: "c3", rim: false }),
  ].join("");
}

// A code with a corner missing still reads: level H rebuilds it.
function understandingErrors() {
  const cam = camera(240, 162, 1.1);
  const W = 70;
  const pad = W * 0.12;
  const cs = W - 2 * pad;
  const at = (v: number) => r1(pad + (v / 1000) * cs);
  const span = (v: number) => r1((v / 1000) * cs);
  const { x, y, w, h } = BLOG_ART.understandingErrors.damage;
  const patch = rr(at(x), at(y), span(w), span(h), 3);
  const hole = path(patch, "f");
  const edge = `<path class="vf" style="stroke-dasharray:2.4 2" d="${patch}"/>`;
  return [
    plinth(cam, -78, -78, 78, 78),
    glow(cam, [-36, 10, 46], 60, 52),
    slab(cam, -50, -18, -36, 58, 0, 5, 3),
    panelRight(
      cam,
      [-46, -14, 5],
      W,
      84,
      code(pad, pad, cs, cs) + hole + edge + line(pad, pad + 36, 78, "tx2"),
      {
        t: 4,
        rim: true,
      },
    ),
    phoneLeft(
      cam,
      [26, -10, 72],
      `${finder(8, 14, 20, 20)}${code(10, 16, 16)}${badge(18, 52, 6)}`,
      0.95,
    ),
  ].join("");
}

// From camera frame to text: find, flatten, sample, decode.
function understandingPipeline() {
  const cam = camera(280, 110, 1.05);
  const S = 46;
  const steps = [-112, -56, 0, 56, 112];
  const pad = 6;
  const cs = S - 2 * pad;
  const eye = (cs * 7) / 21;
  const gridLines = Array.from({ length: 8 }, (_, i) => {
    const v = r1(pad + (i * cs) / 7);
    return path(`M${v} ${pad}V${pad + cs}M${pad} ${v}H${pad + cs}`, "l");
  }).join("");
  const dots = Array.from({ length: 49 }, (_, i) =>
    circle(
      pad + 2.5 + (i % 7) * (cs / 7),
      pad + 2.5 + Math.floor(i / 7) * (cs / 7),
      0.9,
      "acc",
    ),
  ).join("");
  const faces = [
    `<g transform="rotate(-12 ${S / 2} ${S / 2})">${code(pad + 2, pad + 2, cs - 4, cs - 4)}</g>${finder(3, 3, S - 6, S - 6, 6)}`,
    `${code(pad, pad, cs, cs)}${[
      [pad, pad],
      [pad + cs - eye, pad],
      [pad, pad + cs - eye],
    ]
      .map(([x, y]) => path(rr(x - 1.5, y - 1.5, eye + 3, eye + 3, 1.5), "vf"))
      .join("")}`,
    `${code(pad, pad, cs, cs)}${gridLines}`,
    `${code(pad, pad, cs, cs, "code-eyes")}${dots}`,
    `${text(6, 14, "https://", "mono")}${text(6, 22, "qrdx.dev", "mono-a")}${line(6, 34, 30)}${badge(S - 11, S - 11, 5)}`,
  ];
  const chevron = (x: number) => {
    const [cx, cy] = cam.p(x, -x, 2);
    return path(`M${r1(cx - 3)} ${r1(cy - 4)}l4 4-4 4`, "vf");
  };
  return [
    shade(...cam.p(0, 0, -4), 250, 16),
    ...steps.map((x, i) =>
      tile(cam, [x - S / 2, -x - S / 2, 4], S, S, faces[i] ?? "", {
        t: 4,
        r: 4,
        rim: i === 4,
      }),
    ),
    ...[-84, -28, 28, 84].map(chevron),
  ].join("");
}

export const SCENES: Record<BlogArtId, () => string> = {
  dynamicCover,
  launchCover,
  sizeCover,
  apiCover,
  menuCover,
  chatCover,
  understandingCover,
  expireCover,
  bestFreeCover,
  introCover,
  integrationsCover,
  introStyles,
  introLayers,
  introOpenSource,
  integrationsDub,
  integrationsDrive,
  integrationsOauth,
  integrationsExtensible,
  bestFreePaywall,
  bestFreeScanLimits,
  bestFreePersonas,
  understandingErrors,
  understandingPipeline,
};
