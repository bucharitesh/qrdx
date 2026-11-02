// The QRdx figures: one small isometric scene per meaning, in the home
// hero's line style (the same camera, strokes, tokens and brand accent as the
// use-case illustrations). Each scene draws through its camera from VIEWS
// into a 320 × 256 viewBox and returns three depth layers, back to front:
// the plinth, the objects, and the frontmost object (usually the code). The
// pointer moves the layers by different amounts, and each layer rises in
// turn when the figure first shows. Groups with a k-* class run the figure's
// idle loop (hairline.module.css). generate.ts adds the gradients and the
// figure's real code (`#code`; Layers also uses `#code-body`/`#code-eyes`).
//
// Classes: f = face, s / s2 = sides, l / l2 = lines, tx / tx2 = text lines,
// ic = icon strokes, rim = the brand edge on the face that carries the code,
// acc = brand fill, vf = accent stroke, glow = bloom, shade = ground shadow,
// beam = a scan line.

import { LOGO_MARK_PATH } from "@/components/brand-marks";
import type { HairlineFigureName } from "@/components/mockups/hairline-figures";
import {
  block,
  bloom,
  type Camera,
  camera,
  circle,
  code,
  faceLeft,
  faceRight,
  faceTop,
  g,
  k,
  line,
  path,
  r1,
  rr,
  seg,
  shade,
  slab,
  sparkle,
  tube,
  type V3,
} from "./draw";

/** Back to front: plinth, objects, frontmost object. */
type Layers = [string[], string[], string[]];

/** Brand bloom behind world point `at`, sized in world units. */
const glow = (cam: Camera, at: V3, rx: number, ry: number) =>
  bloom(...cam.p(...at), r1(rx * cam.k), r1(ry * cam.k));

/** Soft shadow on the ground under world point `at`. */
const drop = (cam: Camera, at: V3, rx: number, ry: number) =>
  shade(...cam.p(...at), r1(rx * cam.k), r1(ry * cam.k));

/** The plinth every figure stands on, with its soft ground shadow. */
function plinth(
  cam: Camera,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r = 12,
  h = 7,
) {
  const [cx, cy] = cam.p((x0 + x1) / 2, (y0 + y1) / 2, -h);
  const rx = ((x1 - x0 + (y1 - y0)) * 0.866 * cam.k) / 2;
  return (
    shade(cx, cy + 10 * cam.k, r1(rx * 0.9), r1(13 * cam.k)) +
    slab(cam, x0, y0, x1, y1, -h, 0, r)
  );
}

/** A white tick on a brand disc, centred at (x, y) in the current plane. */
const badge = (x: number, y: number, r = 6) =>
  `${circle(x, y, r, "acc")}<path class="tick" d="M${r1(x - r * 0.42)} ${r1(y + r * 0.02)}l${r1(r * 0.3)} ${r1(r * 0.32)} ${r1(r * 0.58)}-${r1(r * 0.62)}"/>`;

/** Viewfinder corners around a w × h box at (x, y). */
const finder = (x: number, y: number, w: number, h: number, c = 4) =>
  `<path class="vf" d="M${x} ${y + c}V${y}H${x + c}M${x + w - c} ${y}H${x + w}V${y + c}M${x + w} ${y + h - c}V${y + h}H${x + w - c}M${x + c} ${y + h}H${x}V${y + h - c}"/>`;

/** Text lines under a code on a card. */
const caption = (x: number, y: number, w: number) =>
  line(x, x + w, y, "tx2") + line(x, x + w * 0.66, y + 7);

/** A scan line across x0..x1 at y that sweeps `d` units down (loop "sweep"). */
const sweep = (x0: number, x1: number, y: number, d: number) =>
  k(
    "sweep",
    `<path class="beam-w" d="M${x0} ${y}H${x1}"/><path class="beam" d="M${x0} ${y}H${x1}"/>`,
    `--d:${d}px`,
  );

// --- CodeCard: a printed code card on a stand, with its short link ---------
// Loop: a scan line sweeps the code.

function codeCard(cam: Camera): Layers {
  const link =
    "M9.5 9.6h-2a2.6 2.6 0 0 1 0-5.2h2M12.5 4.4h2a2.6 2.6 0 0 1 0 5.2h-2M8.6 7h4.8";
  return [
    [
      plinth(cam, -78, -52, 78, 56),
      glow(cam, [-6, 0, 52], 70, 58),
      slab(cam, -46, -9, 34, 7, 0, 6, 3),
    ],
    [
      faceLeft(
        cam,
        [-40, 0, 98],
        rr(0, 0, 68, 90, 5),
        `${code(10, 10, 48, 48)}${caption(10, 70, 36)}${sweep(6, 62, 10, 48)}`,
        { rim: true, depth: 3.5 },
      ),
    ],
    [
      faceTop(
        cam,
        [-6, 24, 0],
        rr(0, 0, 66, 14, 7),
        `<path class="ic" d="${link}" transform="translate(2 0)"/>${line(24, 56, 7, "tx2")}`,
        { depth: 3 },
      ),
    ],
  ];
}

// --- LinkSwap: one printed code, its link moved to a new destination -------
// Loop: the destination page swaps between two pages.

function linkSwap(cam: Camera): Layers {
  const page = (bright: boolean) =>
    `<path class="${bright ? "s" : "ghost"}" d="${rr(5, 5, 38, 15, 2)}"/>${line(5, 34, 28, bright ? "tx2" : "tx")}${line(5, 40, 35)}${line(5, 28, 42)}`;
  const other = `<path class="s" d="${rr(5, 5, 18, 15, 2)}${rr(25, 5, 18, 15, 2)}"/>${line(5, 40, 28, "tx2")}${line(5, 30, 35)}`;
  return [
    [
      plinth(cam, -84, -48, 84, 52),
      // On the plinth: the old link (dashed) and the new one, with its arrow.
      g(
        cam.onTop(0, 0, 0),
        '<path class="dash" d="M-26 8C-8 -2 0 -16 12 -22"/><path class="vf" d="M-26 16C-6 22 6 30 26 32M23 28.5L27 32L22.4 34.6"/>',
      ),
      g(
        cam.onLeft(16, -26, 48),
        `<path class="ghost" d="${rr(0, 0, 48, 48, 4)}"/>${page(false)}`,
      ),
    ],
    [
      faceLeft(
        cam,
        [-76, 12, 66],
        rr(0, 0, 46, 66, 4),
        `${code(7, 7, 32, 32)}${caption(7, 49, 23)}`,
        { rim: true },
      ),
    ],
    [
      glow(cam, [54, 34, 26], 46, 34),
      faceLeft(
        cam,
        [30, 34, 52],
        rr(0, 0, 48, 52, 4),
        `${k("swap-a", page(true))}${k("swap-b", other)}${badge(40, 44, 5.5)}`,
      ),
    ],
  ];
}

// --- ScanPhone: a phone scanning a printed code ----------------------------
// Loop: a laser line passes over the code, then the phone's tick pops.

function scanPhone(cam: Camera): Layers {
  return [
    [plinth(cam, -72, -58, 72, 56), glow(cam, [30, -14, 6], 64, 40)],
    [
      faceTop(
        cam,
        [2, -44, 0],
        rr(0, 0, 60, 60, 5),
        `${code(8, 8, 44, 44)}${sweep(4, 56, 8, 44)}`,
        { rim: true, depth: 2.5 },
      ),
    ],
    [
      drop(cam, [-24, 22, 0], 34, 9),
      faceLeft(
        cam,
        [-48, 24, 104],
        rr(0, 0, 46, 86, 8),
        `<path class="scr" d="${rr(3, 3, 40, 80, 6)}"/>${finder(9, 15, 28, 28)}${code(13, 19, 20, 20)}${k("pop", badge(23, 62, 6.5))}`,
        { depth: 4 },
      ),
    ],
  ];
}

// --- Loupe: a magnifier over a code, checking it scans ---------------------
// Loop: the lens glides over the modules, magnifying what's under it.

const LOUPE_ZOOM = 1.8;

function loupe(cam: Camera): Layers {
  // The card lies at z = 2 with its face's (0, 0) at world (-46, -46).
  const face = cam.plane([-46, -46, 2], [1, 0, 0], [0, 1, 0]);
  // The lens hovers over face point (u, v); it shows that spot magnified.
  const [u, v] = [50, 54];
  const [sx, sy] = cam.p(u - 46, v - 46, 2);
  const R = 30 * cam.k;
  const lift = 16 * cam.k;
  const S = [sx, sy - lift] as const;
  const zoom = `translate(${u} ${v}) scale(${LOUPE_ZOOM}) translate(${-u} ${-v})`;
  const [hx, hy] = [S[0] + R * 0.72, S[1] + R * 0.72];
  const ring = `M${r1(S[0] - R)} ${r1(S[1])}a${r1(R)} ${r1(R)} 0 1 0 ${r1(2 * R)} 0a${r1(R)} ${r1(R)} 0 1 0 ${r1(-2 * R)} 0`;
  return [
    [plinth(cam, -70, -60, 70, 60), glow(cam, [0, 0, 2], 80, 50)],
    [
      faceTop(cam, [-46, -46, 0], rr(0, 0, 92, 92, 6), code(10, 10, 72, 72), {
        rim: true,
        depth: 2.5,
      }),
    ],
    [
      k(
        "glide",
        [
          shade(sx, sy, r1(R * 0.85), r1(R * 0.36)),
          tube(`M${r1(hx)} ${r1(hy)}l${r1(R * 0.85)} ${r1(R * 0.75)}`, 7),
          `<clipPath id="lens"><circle cx="${r1(S[0])}" cy="${r1(S[1])}" r="${r1(R)}"/></clipPath>`,
          // The magnified modules move the other way, so the lens always
          // shows the spot under its centre (see k-glide-in).
          `<g clip-path="url(#lens)">${circle(S[0], S[1], r1(R), "paper")}${k("glide-in", g(face, g(zoom, code(10, 10, 72, 72))))}</g>`,
          tube(ring, 5),
          `<g transform="translate(${r1(S[0] + R * 0.78)} ${r1(S[1] - R * 0.78)})">${badge(0, 0, r1(8 * cam.k))}</g>`,
        ].join(""),
      ),
    ],
  ];
}

// --- Measure: a printed code with a ruler and its height marked ------------
// Loop: a marker slides along the ruler.

function measure(cam: Camera): Layers {
  const ticks = Array.from({ length: 15 }, (_, i) => {
    const x = -50 + i * 6.5;
    return `M${r1(x)} 26V${i % 2 ? 29.5 : 32}`;
  }).join("");
  return [
    [
      plinth(cam, -80, -48, 80, 52),
      glow(cam, [-18, 0, 56], 64, 60),
      slab(cam, -60, -8, 22, 6, 0, 7, 3),
    ],
    [
      faceLeft(
        cam,
        [-56, 0, 106],
        rr(0, 0, 74, 99, 4),
        `${code(10, 10, 54, 54)}${caption(10, 76, 42)}<path class="vf" d="M84 0V99M80 0H88M80 99H88"/>`,
        { rim: true },
      ),
    ],
    [
      block(cam, -54, 24, 0, 46, 36, 3),
      g(
        cam.onTop(0, 0, 3),
        `<path class="l2" d="${ticks}"/>${k("slide", '<path class="acc" d="M-50 25.4l-2.6-4.4h5.2z"/>')}`,
      ),
    ],
  ];
}

// --- Chart: a code's scans as bars on an analytics tile ---------------------
// Loop: the newest bar grows and settles.

function chart(cam: Camera): Layers {
  const heights = [18, 30, 24, 44, 64];
  const bar = (i: number) => {
    const x = -14 + i * 18;
    return block(
      cam,
      x - 5,
      -2,
      4,
      x + 5,
      10,
      4 + (heights[i] ?? 0),
      i === 4 ? "acc" : "f",
    );
  };
  // The last bar rises out of the tile: clipped above its own footprint.
  const [ax, ay] = cam.p(53, 10, 4);
  const [bx, by] = cam.p(63, 10, 4);
  const [cx, cy] = cam.p(63, -2, 4);
  const clip = `<clipPath id="bar"><path d="M${r1(ax)} 0H${r1(cx)}V${r1(cy)}L${r1(bx)} ${r1(by)}L${r1(ax)} ${r1(ay)}Z"/></clipPath>`;
  return [
    [
      plinth(cam, -84, -56, 84, 56),
      slab(cam, -30, -44, 72, 44, 0, 4, 7),
      g(cam.onTop(0, 0, 4), `<path class="l" d="M-22 30H64"/>`),
    ],
    [
      glow(cam, [56, 6, 50], 40, 50),
      bar(0),
      bar(1),
      bar(2),
      bar(3),
      clip,
      `<g clip-path="url(#bar)">${k("grow", bar(4))}</g>`,
    ],
    [
      faceLeft(
        cam,
        [-76, 8, 62],
        rr(0, 0, 40, 56, 4),
        `${code(6, 6, 28, 28)}${caption(6, 42, 20)}`,
        { rim: true },
      ),
    ],
  ];
}

// --- Stack: a CSV becomes a stack of codes ---------------------------------
// Loop: a highlight steps down the CSV rows while the top card lifts.

function stack(cam: Camera): Layers {
  const grid = "M0 14H54M0 26H54M0 38H54M0 50H54M0 62H54M18 0V74M36 0V74";
  const card = (i: number) => {
    const jx = [0, 2, -1, 1, -2, 1, 0][i] ?? 0;
    const jy = [0, -1, 2, 0, 1, -1, 0][i] ?? 0;
    const top = i === 6;
    return faceTop(
      cam,
      [-6 + jx, -24 + jy, i * 5],
      rr(0, 0, 58, 58, 5),
      top ? code(8, 8, 42, 42) : "",
      { depth: 3.4, rim: top },
    );
  };
  return [
    [
      plinth(cam, -82, -58, 82, 58),
      faceTop(
        cam,
        [-74, -50, 0],
        rr(0, 0, 54, 74, 4),
        `${k("row", `<path class="hi" d="${rr(0.6, 14.6, 52.8, 10.8, 1.5)}"/>`)}<path class="l" d="${grid}"/>${line(4, 14, 7, "tx2")}${line(22, 32, 7, "tx2")}${line(40, 50, 7, "tx2")}`,
        { depth: 1.6 },
      ),
    ],
    [glow(cam, [23, 5, 30], 62, 44), ...[0, 1, 2, 3, 4, 5].map(card)],
    [k("lift", card(6))],
  ];
}

// --- Terminal: a CLI window that prints a code ------------------------------
// Loop: a command types out and the caret blinks.

function terminal(cam: Camera): Layers {
  return [
    [
      plinth(cam, -78, -50, 78, 54),
      glow(cam, [-6, 4, 60], 76, 56),
      drop(cam, [-6, 4, 0], 60, 12),
    ],
    [],
    [
      faceLeft(
        cam,
        [-62, 4, 106],
        rr(0, 0, 112, 84, 6),
        [
          '<path class="l" d="M0 13H112"/>',
          circle(8, 6.5, 1.7, "dot"),
          circle(14, 6.5, 1.7, "dot"),
          circle(20, 6.5, 1.7, "dot"),
          '<path class="ic" d="M8 22l3.5 3-3.5 3"/>',
          line(16, 48, 25, "tx2"),
          line(8, 44, 36),
          line(8, 36, 44),
          k("type", line(8, 48, 52)),
          k("blink", `<path class="acc" d="${rr(8, 60, 5, 8, 1)}"/>`),
          code(62, 22, 42, 42),
        ].join(""),
        { rim: true, depth: 4 },
      ),
    ],
  ];
}

// --- AuthorizedApp: the QRdx app and another app, joined by a key -----------
// Loop: a pulse hops from app to app under the key, which nudges.

function authorizedApp(cam: Camera): Layers {
  const tile = (x: number, top: string) =>
    slab(cam, x, -24, x + 48, 24, 0, 16, 12, top);
  const key =
    "M-17 0a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0 -13 0M-4 0H14M8.5 0V5M13 0V4";
  return [
    [
      plinth(cam, -86, -50, 86, 54),
      glow(cam, [-50, 0, 16], 54, 40),
      g(
        cam.onTop(0, 0, 0),
        `<path class="dash" d="M-28 0H28"/>${k("hop", circle(-28, 0, 2.4, "acc"))}`,
      ),
    ],
    [
      tile(-76, "acc"),
      g(
        cam.onTop(-76, -24, 16),
        `<path fill="#fff" transform="translate(10 10) scale(0.1094)" d="${LOGO_MARK_PATH}"/>`,
      ),
      g(cam.onTop(0, 0, 0.6), k("nudge", tube(key, 2.8))),
    ],
    [
      tile(28, "f"),
      g(
        cam.onTop(28, -24, 16),
        `<path class="ic" d="${rr(11, 11, 11, 11, 3)}${rr(26, 11, 11, 11, 3)}${rr(11, 26, 11, 11, 3)}${rr(26, 26, 11, 11, 5.5)}"/>`,
      ),
    ],
  ];
}

// --- Plug: a code's cable about to plug into a socket ----------------------
// Loop: the plug pushes toward the socket and eases back.

function plug(cam: Camera): Layers {
  const socket = cam.box(16, -44, 0, 70, -34, 66);
  const [c0x, c0y] = cam.p(36, -6, 26);
  const [c1x, c1y] = cam.p(-40, 26, 2);
  const cable = `M${r1(c0x)} ${r1(c0y)}C${r1(c0x)} ${r1(c0y + 46 * cam.k)} ${r1(c1x + 60 * cam.k)} ${r1(c1y + 24 * cam.k)} ${r1(c1x)} ${r1(c1y)}`;
  const [dx, dy] = cam.dir([0, -4, 0]);
  return [
    [
      plinth(cam, -82, -54, 82, 54),
      path(socket.right, "s2"),
      path(socket.top, "s"),
      path(socket.left, "f"),
      g(
        cam.onLeft(16, -34, 66),
        `<path class="s" d="${rr(11, 16, 32, 34, 8)}"/><path class="s2" d="${rr(19.5, 25, 4, 12, 2)}${rr(30.5, 25, 4, 12, 2)}"/>`,
      ),
      glow(cam, [36, -22, 30], 44, 38),
    ],
    [
      tube(cable, 3.4),
      // The plug, pulled back from the socket, prongs toward it.
      k(
        "plug",
        block(cam, 30.5, -26, 29, 32.5, -14, 31.5) +
          block(cam, 39.5, -26, 29, 41.5, -14, 31.5) +
          block(cam, 27, -16, 20, 45, 2, 39),
        `--dx:${r1(dx)}px;--dy:${r1(dy)}px`,
      ),
    ],
    [
      faceLeft(
        cam,
        [-80, 22, 58],
        rr(0, 0, 42, 54, 4),
        `${code(6, 6, 30, 30)}${caption(6, 44, 20)}`,
        { rim: true },
      ),
    ],
  ];
}

// --- Webhook: a scan fires a signed request to your endpoint ---------------
// Loop: a pulse travels code → bolt → endpoint; the bolt flashes, the LED
// blinks.

function webhook(cam: Camera): Layers {
  const puck = cam.cylinder(0, 0, 0, 10, 17);
  const server = cam.box(48, -18, 0, 84, 16, 54);
  const bolt = "M1.6 -9.5L-5 1.2H-0.2L-1.8 9.5L5 -1.4H0.2Z";
  return [
    [
      plinth(cam, -98, -40, 98, 40),
      g(
        cam.onTop(0, 0, 0),
        `<path class="vfd" d="M-52 0H-18M18 0H46"/>${k("pulse", circle(-52, 0, 2.6, "acc"))}`,
      ),
    ],
    [
      faceLeft(
        cam,
        [-90, 4, 62],
        rr(0, 0, 40, 56, 4),
        `${code(6, 6, 28, 28)}${caption(6, 42, 20)}`,
        { rim: true },
      ),
      glow(cam, [0, 0, 10], 42, 28),
      path(puck.side, "s"),
      `<ellipse class="f" cx="${puck.top.cx}" cy="${puck.top.cy}" rx="${puck.top.rx}" ry="${puck.top.ry}"/>`,
      g(
        cam.onTop(0, 0, 10),
        `${k("flash", circle(0, 0, 16, "glow"))}<path class="acc" d="${bolt}"/>`,
      ),
    ],
    [
      path(server.right, "s2"),
      path(server.top, "f"),
      path(server.left, "f"),
      g(
        cam.onLeft(48, 16, 54),
        `<path class="l" d="M0 18H36M0 36H36"/>${line(14, 30, 9)}${line(14, 30, 27)}${line(14, 30, 45)}${k("led", circle(7, 9, 1.8, "acc"))}${circle(7, 27, 1.8, "dot")}${circle(7, 45, 1.8, "dot")}`,
      ),
    ],
  ];
}

// --- Domain: a code on your own domain --------------------------------------
// Loop: the globe's meridians drift round.

function domain(cam: Camera): Layers {
  const stand = cam.cylinder(36, -30, 0, 5, 13);
  const R = 30 * cam.k;
  const [gx, top] = cam.p(36, -30, 5);
  const gy = top - R + 3 * cam.k;
  const at = `cx="${r1(gx)}" cy="${r1(gy)}"`;
  const globe = `<g class="l" transform="rotate(-18 ${r1(gx)} ${r1(gy)})"><ellipse ${at} rx="${r1(R)}" ry="${r1(R * 0.34)}"/><path d="M${r1(gx - R * 0.86)} ${r1(gy - R * 0.5)}h${r1(R * 1.72)}M${r1(gx - R * 0.86)} ${r1(gy + R * 0.5)}h${r1(R * 1.72)}"/>${k("spin", `<ellipse ${at} rx="${r1(R)}" ry="${r1(R)}"/>`)}${k("spin2", `<ellipse ${at} rx="${r1(R)}" ry="${r1(R)}"/>`)}</g>`;
  const lock = "M7 9.6h7v5.6H7zM8.4 9.6V8a2.1 2.1 0 0 1 4.2 0v1.6";
  return [
    [plinth(cam, -80, -54, 80, 54)],
    [
      drop(cam, [36, -30, 0], 22, 6),
      path(stand.side, "s"),
      `<ellipse class="f" cx="${stand.top.cx}" cy="${stand.top.cy}" rx="${stand.top.rx}" ry="${stand.top.ry}"/>`,
      bloom(gx, gy, r1(54 * cam.k), r1(50 * cam.k)),
      circle(gx, gy, r1(R), "f"),
      globe,
    ],
    [
      faceLeft(
        cam,
        [-64, 8, 90],
        rr(0, 0, 54, 80, 4),
        `${code(8, 8, 38, 38)}${caption(8, 56, 32)}`,
        { rim: true },
      ),
      faceTop(
        cam,
        [-22, 30, 0],
        rr(0, 0, 90, 20, 10),
        `<path class="ic" d="${lock}" transform="translate(0 -2.2)"/>${line(22, 38, 10, "tx2")}<path class="vf" d="M42 10H74" style="stroke-width:2.2"/>`,
        { depth: 3 },
      ),
    ],
  ];
}

// --- PageForm: a hosted page with a form, beside its code -------------------
// Loop: the form fills in and its button is pressed.

function pageForm(cam: Camera): Layers {
  return [
    [plinth(cam, -76, -54, 76, 54)],
    [
      faceTop(cam, [-66, -10, 0], rr(0, 0, 52, 52, 4), code(7, 7, 38, 38), {
        rim: true,
        depth: 2.5,
      }),
    ],
    [
      glow(cam, [30, -6, 60], 56, 62),
      drop(cam, [30, -6, 0], 34, 9),
      faceRight(
        cam,
        [30, 18, 112],
        rr(0, 0, 50, 96, 8),
        [
          `<path class="scr" d="${rr(3, 3, 44, 90, 6)}"/>`,
          circle(25, 17, 6, "s"),
          line(14, 36, 30, "tx2"),
          line(10, 40, 37),
          `<path class="f" d="${rr(8, 45, 34, 9, 3)}${rr(8, 58, 34, 9, 3)}"/>`,
          k("type", line(12, 30, 49.5)),
          k("type", line(12, 26, 62.5), "animation-delay:2.4s"),
          k("press", `<path class="acc" d="${rr(8, 72, 34, 10, 5)}"/>`),
          line(18, 32, 88),
        ].join(""),
        { depth: 4 },
      ),
    ],
  ];
}

// --- Palette: a fan of swatches beside a styled code ------------------------
// Loop: the fan opens and closes a little.

function palette(cam: Camera): Layers {
  const chips = ["s2", "s", "ink", "acc"];
  const pivot: V3 = [-62, 34, 0];
  const fan = chips.map((chip, i) =>
    faceTop(
      cam,
      [pivot[0], pivot[1], i * 2.4],
      rr(-8, -9, 76, 18, 6),
      `<path class="${chip}" d="${rr(42, -6, 23, 12, 3.5)}"/>${line(4, 30, 0)}`,
      { depth: 2.2, deg: -84 + i * 20, k: `k-fan k-fan${i + 1}` },
    ),
  );
  return [
    [plinth(cam, -82, -56, 82, 56), glow(cam, [34, -24, 56], 62, 60)],
    [
      faceLeft(
        cam,
        [4, -24, 100],
        rr(0, 0, 66, 88, 5),
        `${code(9, 9, 48, 48)}${caption(9, 70, 31)}`,
        { rim: true, depth: 3.5 },
      ),
    ],
    [...fan, g(cam.onTop(pivot[0], pivot[1], 10), circle(0, 0, 2.8, "f"))],
  ];
}

// --- LostCode: a torn code, its halves pulled apart -------------------------
// Loop: the torn half rocks on its corner.

function lostCode(cam: Camera): Layers {
  const tear: [number, number][] = [
    [47, 0],
    [42, 11],
    [49, 22],
    [41, 34],
    [48, 46],
    [40, 58],
    [47, 71],
    [42, 82],
    [45, 92],
  ];
  const run = (list: [number, number][]) =>
    list.map(([x, y]) => `L${x} ${y}`).join("");
  const clips = `<clipPath id="tl"><path d="M-6 -6H47${run(tear)}L45 98H-6Z"/></clipPath><clipPath id="tr"><path d="M47 -6H98V98H45${run([...tear].reverse())}Z"/></clipPath>`;
  const piece = (clip: string, cls: string, inner = "") =>
    `<g clip-path="url(#${clip})"><path class="${cls}" d="${rr(0, 0, 92, 92, 6)}"/>${inner}</g>`;
  const face = cam.plane([-50, -46, 0], [1, 0, 0], [0, 1, 0]);
  const moved = "translate(9 3) rotate(7 45 92)";
  const down = `translate(0 ${r1(2.5 * cam.k)})`;
  return [
    [plinth(cam, -72, -58, 72, 62), clips],
    [
      g(down, g(face, piece("tl", "s"))),
      g(face, piece("tl", "f", code(10, 10, 72, 72))),
    ],
    [
      g(down, g(face, g(moved, k("rock", piece("tr", "s"))))),
      g(face, g(moved, k("rock", piece("tr", "f", code(10, 10, 72, 72))))),
    ],
  ];
}

// --- Question: a question and its answer -----------------------------------
// Loop: the two bubbles bob, out of step.

function question(cam: Camera): Layers {
  const ask = `${rr(0, 0, 64, 52, 11)}M16 51.4L11 64L28 51.4Z`;
  const answer = `${rr(0, 0, 60, 62, 10)}M42 61.4L52 72L50 61.4Z`;
  return [
    [
      plinth(cam, -76, -52, 76, 52),
      drop(cam, [-30, -16, 0], 30, 7),
      drop(cam, [34, 24, 0], 30, 7),
    ],
    [
      k(
        "bob",
        faceLeft(
          cam,
          [-62, -16, 116],
          ask,
          `<path class="tx3" d="M24.5 18.5a7.5 7.5 0 1 1 10.4 6.9c-2.3 1-3.2 2.5-3.2 4.8v1.8"/>${circle(31.7, 39.6, 2.1, "dot")}`,
          { depth: 3.5 },
        ),
      ),
    ],
    [
      glow(cam, [32, 26, 44], 50, 52),
      k(
        "bob2",
        faceLeft(
          cam,
          [4, 24, 80],
          answer,
          `${code(9, 8, 30, 30)}${caption(9, 46, 41)}`,
          { rim: true, depth: 3.5 },
        ),
      ),
    ],
  ];
}

// --- Layers: a code taken apart into frame, body and eyes ------------------
// Loop: the exploded plates breathe apart and back.

function layers(cam: Camera): Layers {
  const corners: [number, number][] = [
    [-46, -46],
    [46, -46],
    [46, 46],
    [-46, 46],
  ];
  const guides = (z0: number, z1: number) =>
    corners.map(([x, y]) => seg(cam, [x, y, z0], [x, y, z1], "dash")).join("");
  const plate = (z: number, id: string) =>
    faceTop(cam, [-46, -46, z], rr(0, 0, 92, 92, 7), code(11, 11, 70, 70, id), {
      face: "glass",
      depth: 1.6,
    });
  return [
    [
      plinth(cam, -60, -60, 60, 60, 12, 7),
      g(
        cam.onTop(-60, -60, 0),
        `<path class="l2" d="${rr(10, 10, 100, 100, 8)}"/><path class="s2" d="${rr(36, 100.5, 48, 6, 3)}"/>`,
      ),
      guides(0, 44),
    ],
    [k("float1", plate(44, "code-body")), guides(44, 88)],
    [glow(cam, [0, 0, 88], 80, 50), k("float2", plate(88, "code-eyes"))],
  ];
}

// --- Prompt: a prompt turns into a styled code ------------------------------
// Loop: the sparkles twinkle.

function prompt(cam: Camera): Layers {
  const [kx, ky] = cam.p(26, -18, 106);
  const s = cam.k;
  return [
    [plinth(cam, -78, -52, 78, 54), glow(cam, [-10, -18, 66], 70, 60)],
    [
      faceLeft(
        cam,
        [-42, -18, 106],
        rr(0, 0, 62, 80, 5),
        `${code(9, 9, 44, 44)}${caption(9, 64, 31)}`,
        { rim: true, depth: 3.5 },
      ),
      k("twinkle", sparkle(kx + 8 * s, ky - 6 * s, r1(8 * s))),
      k("twinkle2", sparkle(kx + 21 * s, ky + 11 * s, r1(4.2 * s))),
    ],
    [
      drop(cam, [-8, 30, 0], 54, 8),
      faceLeft(
        cam,
        [-58, 30, 34],
        rr(0, 0, 104, 20, 10),
        `${sparkle(11, 10, 4.2)}${line(21, 64, 10, "tx2")}${circle(93, 10, 6, "acc")}<path class="tick" d="M90.2 10h5.4M93 7.4l2.6 2.6-2.6 2.6"/>`,
        { depth: 3 },
      ),
    ],
  ];
}

const SCENES: Record<HairlineFigureName, (cam: Camera) => Layers> = {
  AuthorizedApp: authorizedApp,
  Chart: chart,
  CodeCard: codeCard,
  Domain: domain,
  Layers: layers,
  LinkSwap: linkSwap,
  Loupe: loupe,
  LostCode: lostCode,
  Measure: measure,
  PageForm: pageForm,
  Palette: palette,
  Plug: plug,
  Prompt: prompt,
  Question: question,
  ScanPhone: scanPhone,
  Stack: stack,
  Terminal: terminal,
  Webhook: webhook,
};

/**
 * Each figure's camera (origin x, origin y, scale), fitted so the drawing
 * fills the stage and sits centred.
 */
export const VIEWS: Record<HairlineFigureName, [number, number, number]> = {
  AuthorizedApp: [162, 118, 1.24],
  Chart: [160, 139, 1.24],
  CodeCard: [162, 152, 1.13],
  Domain: [160, 152, 1.13],
  Layers: [160, 162, 1.09],
  LinkSwap: [162, 141, 1.24],
  Loupe: [160, 121, 1.21],
  LostCode: [162, 118, 1.24],
  Measure: [162, 159, 1.05],
  PageForm: [160, 151, 1.17],
  Palette: [160, 147, 1.17],
  Plug: [160, 135, 1.24],
  Prompt: [161, 159, 1.04],
  Question: [160, 164, 1],
  ScanPhone: [159, 153, 1.16],
  Stack: [160, 120, 1.24],
  Terminal: [162, 159, 1.04],
  Webhook: [160, 144, 1.2],
};

/** A figure's markup: its three layers, each wrapped for the pointer (L) and the entrance (I). */
export function figureMarkup(name: HairlineFigureName) {
  const layers = SCENES[name](camera(...VIEWS[name]));
  return layers
    .map(
      (parts, i) =>
        `<g class="L${i + 1}"><g class="I${i + 1}">${parts.join("")}</g></g>`,
    )
    .join("");
}
