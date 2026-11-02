"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useEffect, useRef } from "react";
import { EGG_QR, QRDX_QR_M } from "@/components/fx/qr-matrix";
import {
  beltLine,
  cable,
  cablePoints,
  cumulative,
  faceX,
  faceY,
  faceZ,
  finderOrigins,
  finderPaths,
  local,
  matrixX,
  matrixY,
  matrixZLocal,
  modulesPath,
  path,
  prism,
  proj,
  roundRect,
  TRACK,
  trackGeometry,
} from "./hero-scene-geometry";

// The QRdx flow, drawn in code as one isometric SVG and played as one 13 s
// loop of CSS keyframes (transform and opacity only, no script per frame):
//    0.2 s  design: the studio screen builds a code, then a sweep styles it
//           (round dots, rounded eyes) while the side dial turns
//    2.5 s  print: the printer feeds that card out onto its tray
//    3.8 s  pick and place: the arm lifts the card onto the belt (6.2 s)
//   always  the belt carries the printed cards round, four at a time
//    8.6 s  scan: a card passes the gate, the beam lights, the phone ticks
//    9.0 s  measure: the read runs to the analytics panel, which slides its
//           chart along and grows a new bar (10.4 s)
//   11.3 s  dynamic: the big card swaps its destination link, same code
//   12.3 s  the studio screen clears for the next design
// Belt cards and chart bars run on longer cycles (4 and 7 loops) with
// staggered delays, so the picture repeats every loop without jumps. Paused
// off screen and in background tabs; reduced motion freezes one frame.

const LOOP = 13;
const T = {
  design: 1.1,
  print: 2.45,
  printed: 3.7,
  pick: 4.85,
  place: 6.2,
  scan: 8.6,
  bar: 10.4,
  swap: 11.3,
  clear: 12.3,
};
/** Reduced motion: the loop time the scene freezes at (the arm uses its own). */
const STILL = 9.2;
const STILL_ARM = 5.5;

// --- Keyframes ---------------------------------------------------------------

type Frame = readonly [number, string];
const EASE = "animation-timing-function:cubic-bezier(.45,0,.25,1);";
const OUT = "animation-timing-function:cubic-bezier(.2,.7,.2,1);";
const r2 = (n: number) => Math.round(n * 100) / 100;
const op = (o: number) => `opacity:${o};`;
const tr = (x: number, y: number) =>
  `transform:translate(${r2(x)}px,${r2(y)}px);`;
const rot = (a: number) => `transform:rotate(${r2(a)}deg);`;

const RULES: string[] = [];
/** Registers a keyframe animation and returns the class that plays it. */
function anim(name: string, frames: readonly Frame[], dur = LOOP) {
  const body = [...frames]
    .sort((a, b) => a[0] - b[0])
    .map(([t, css]) => `${Math.round((t / dur) * 1e5) / 1e3}%{${css}}`)
    .join("");
  RULES.push(
    `@keyframes sc-${name}{${body}}.sc .k-${name}{animation:sc-${name} ${dur}s linear infinite both;animation-delay:calc(var(--o,0s) - var(--sc-at,0s))}`,
  );
  return `k-${name}`;
}
/** Per-element phase offsets for the staggered cycles. */
const OFFSETS: string[] = [];
function offset(name: string, seconds: number) {
  OFFSETS.push(`.sc .${name}{--o:${r2(seconds)}s}`);
  return name;
}
/** Keyframes that move along a polyline at constant speed between t0 and t1. */
function travel(pts: readonly [number, number][], t0: number, t1: number) {
  const d = cumulative(pts);
  const total = d.at(-1) || 1;
  const first = pts[0] ?? [0, 0];
  const last = pts.at(-1) ?? first;
  return [
    [0, tr(...first)] as Frame,
    ...pts.map(
      (p, k): Frame => [t0 + ((t1 - t0) * (d[k] ?? 0)) / total, tr(...p)],
    ),
    [LOOP, tr(...last)] as Frame,
  ];
}
const blip = (t0: number, t1: number, fade = 0.08): Frame[] => [
  [0, op(0)],
  [t0, op(0)],
  [t0 + fade, op(1)],
  [t1 - fade, op(1)],
  [t1, op(0)],
  [LOOP, op(0)],
];

// --- The studio: design -------------------------------------------------------

const QR = QRDX_QR_M;
const QN = QR.length;
const QUIET = 2;
const QS = QN + QUIET * 2;
const BANDS = 5;
const ROWS = Math.ceil(QN / BANDS);

function finderSet(top: boolean, round: boolean) {
  const at = finderOrigins(QN).filter(([, y]) => (y === 0) === top);
  const ring = at
    .map(([x, y]) =>
      round
        ? roundRect(x, y, 7, 7, 2.3) + roundRect(x + 1, y + 1, 5, 5, 1.6)
        : `M${x} ${y}h7v7h-7zM${x + 1} ${y + 1}h5v5h-5z`,
    )
    .join("");
  const eye = at
    .map(([x, y]) =>
      round ? roundRect(x + 2, y + 2, 3, 3, 1) : `M${x + 2} ${y + 2}h3v3h-3z`,
    )
    .join("");
  const halo = at
    .map(([x, y]) => roundRect(x - 0.7, y - 0.7, 8.4, 8.4, 2.8))
    .join("");
  return { ring, eye, halo };
}

/**
 * The code arrives in five row bands (square modules settling in), then a
 * sweep restyles each band as it passes: round dots, rounded accent eyes.
 */
const DESIGN = Array.from({ length: BANDS }, (_, i) => {
  const from = i * ROWS;
  const to = from + ROWS;
  const appear = 0.2 + i * 0.1;
  const morph = T.design + 0.1 + i * 0.2;
  let finders: {
    raw: ReturnType<typeof finderSet>;
    round: ReturnType<typeof finderSet>;
  } | null = null;
  if (i === 0)
    finders = { raw: finderSet(true, false), round: finderSet(true, true) };
  if (i === BANDS - 1)
    finders = { raw: finderSet(false, false), round: finderSet(false, true) };
  return {
    key: `band-${from}`,
    raw: modulesPath(QR, true, { from, to }),
    dots: modulesPath(QR, true, { from, to, dot: true }),
    finders,
    rawCls: anim(`raw${i}`, [
      [0, `${op(0)}transform:translateY(-1.4px);`],
      [appear, `${OUT}${op(0)}transform:translateY(-1.4px);`],
      [appear + 0.45, `${op(1)}transform:translateY(0);`],
      [morph, `${op(1)}transform:translateY(0);`],
      [morph + 0.25, `${op(0)}transform:translateY(0);`],
      [LOOP, `${op(0)}transform:translateY(0);`],
    ]),
    dotCls: anim(`dot${i}`, [
      [0, op(0)],
      [morph, op(0)],
      [morph + 0.3, op(1)],
      [T.clear, op(1)],
      [T.clear + 0.45, op(0)],
      [LOOP, op(0)],
    ]),
  };
});
/** The style sweep: passes each band's top row as that band morphs (25 rows/s). */
const SWEEP_CLS = (() => {
  const y = (t: number) => QUIET + 25 * (t - T.design - 0.1);
  const t0 = T.design + 0.1 - QUIET / 25;
  const t1 = t0 + (QS - 0.6) / 25;
  const at = (t: number) => `transform:translateY(${r2(y(t))}px);`;
  return anim("sweep", [
    [0, `${op(0)}transform:translateY(0);`],
    [t0, `${op(0)}${at(t0)}`],
    [t0 + 0.08, `${op(1)}${at(t0 + 0.08)}`],
    [t1 - 0.08, `${op(1)}${at(t1 - 0.08)}`],
    [t1, `${op(0)}${at(t1)}`],
    [LOOP, `${op(0)}${at(t1)}`],
  ]);
})();
const DIAL_CLS = anim("dial", [
  [0, rot(0)],
  [T.design, `${EASE}${rot(0)}`],
  [T.design + 1.2, rot(360)],
  [LOOP, rot(360)],
]);

const DEVICE = {
  base: prism(30, 60, 330, 320, 0, 16, 28),
  body: prism(70, 95, 300, 265, 16, 262, 24),
  screen: faceY(265.6, 90, 40, 280, 236, 14),
  qr: matrixY(100, 266, 226, 170 / QS),
  dial: matrixX(300.6, 160, 170, 1),
  vents: Array.from({ length: 6 }, (_, i) => {
    const z = 60 + i * 9;
    return path([proj(300.6, 230, z), proj(300.6, 196, z)], false);
  }).join(""),
  buttonA: prism(104, 116, 150, 156, 262, 274, 9),
  buttonB: prism(166, 116, 236, 150, 262, 268, 9),
  knob: prism(250, 118, 280, 148, 262, 286, 15),
  led: proj(288, 265.6, 30),
};
const SCREWS = [
  [44, 74],
  [316, 74],
  [44, 306],
  [316, 306],
].map(([x = 0, y = 0]) => proj(x, y, 16));

// --- Cards: printed, carried, on the belt -----------------------------------

const CARD_Z = 3;
/** A printed card, its top face centred on the origin. */
const CARD = prism(-24, -24, 24, 24, -CARD_Z, 0, 5, local);
/** A small code for the card face: three eyes and a few modules. */
const MINI = [
  "111010111",
  "101001101",
  "111011111",
  "000101000",
  "101110110",
  "010010101",
  "111011001",
  "101001011",
  "111010110",
];
const MINI_PATH = modulesPath(MINI);
const MINI_AT = matrixZLocal(-17, -17, 0, 34 / MINI.length);

function QrCard() {
  return (
    <>
      <path d={CARD.side} className="s" />
      <path d={CARD.top} className="f" />
      <path d={MINI_PATH} transform={MINI_AT} fill="var(--sc-icon)" />
    </>
  );
}

// --- Print ---------------------------------------------------------------------

const PRINTER = {
  body: prism(-400, 240, -280, 400, 0, 118, 18),
  slot: faceX(-279.5, 290, 48, 350, 60, 3),
  panel: faceY(400.5, -380, 70, -300, 104, 6),
  roll: prism(-380, 260, -300, 300, 118, 140, 20),
  led: proj(-292, 400.5, 88),
  tray: prism(-284, 288, -214, 352, 46, 52, 4),
};
/** The printed card's top-face centre once it rests on the tray. */
const TRAY_AT = proj(-250, 320, 52 + CARD_Z);
const FEED = (() => {
  const [x, y] = proj(-306, 320, 52 + CARD_Z);
  return [x - TRAY_AT[0], y - TRAY_AT[1]] as const;
})();
/** Clips the card to the outside of the printer's slot face (x > -280). */
const FEED_CLIP = path([
  proj(-280, 200, 54),
  proj(-280, 440, 54),
  proj(-110, 440, 0),
  proj(-110, 200, 0),
]);
const PRINT_CLS = anim("print", [
  [0, `${op(0)}${tr(...FEED)}`],
  [T.print - 0.06, `${op(0)}${tr(...FEED)}`],
  [T.print, `${OUT}${op(1)}${tr(...FEED)}`],
  [T.printed, `${op(1)}${tr(0, 0)}`],
  [T.pick, `${op(1)}${tr(0, 0)}`],
  [T.pick + 0.02, `${op(0)}${tr(0, 0)}`],
  [T.pick + 0.04, `${op(0)}${tr(...FEED)}`],
  [LOOP, `${op(0)}${tr(...FEED)}`],
]);
const PRINT_LED_CLS = anim("printled", [
  [0, op(0.25)],
  [T.print - 0.25, op(0.25)],
  [T.print - 0.05, op(1)],
  [T.printed, op(1)],
  [T.printed + 0.3, op(0.25)],
  [LOOP, op(0.25)],
]);

// --- Pick and place ------------------------------------------------------------

/**
 * A two-link arm drawn in screen space beside the printer. Each pose is a
 * target for the suction tip; angles come from inverse kinematics (elbow
 * up), and the tool counter-rotates so it always points straight down.
 */
const ARM_K = 1.2;
const L1 = 74;
const L2 = 70;
const LT = 24;
const SHOULDER = proj(-250, 200, 34);
const ARM_BASE = prism(-276, 174, -224, 226, 0, 14, 22);
const ARM_TURRET = prism(-262, 188, -238, 212, 14, 30, 10);
const PLACE_AT = proj(TRACK.x0, 320, TRACK.z1 + CARD_Z);

const deg = (a: number) => (a * 180) / Math.PI;
function reach([tx, ty]: readonly [number, number]) {
  const a = L1 * ARM_K;
  const b = L2 * ARM_K;
  const wx = tx - SHOULDER[0];
  const wy = ty - LT * ARM_K - SHOULDER[1];
  const d = Math.min(Math.hypot(wx, wy), a + b - 0.01);
  const c = Math.max(-1, Math.min(1, (d * d - a * a - b * b) / (2 * a * b)));
  const [best] = [1, -1]
    .map((sign) => {
      const e = sign * Math.acos(c);
      const s =
        Math.atan2(wy, wx) - Math.atan2(b * Math.sin(e), a + b * Math.cos(e));
      return { s: deg(s), e: deg(e), elbowY: Math.sin(s) * a };
    })
    .sort((p, q) => p.elbowY - q.elbowY);
  return best ?? { s: 0, e: 0, elbowY: 0 };
}
const lift = ([x, y]: readonly [number, number], h: number) =>
  [x, y - h] as const;
const POSES = {
  rest: reach([SHOULDER[0] - 26, SHOULDER[1] - 46]),
  overTray: reach(lift(TRAY_AT, 30)),
  tray: reach(TRAY_AT),
  lifted: reach(lift(TRAY_AT, 42)),
  overBelt: reach(lift(PLACE_AT, 40)),
  belt: reach(PLACE_AT),
};
const ARM_STEPS: [number, keyof typeof POSES, boolean][] = [
  [0, "rest", false],
  [T.pick - 1.05, "rest", true],
  [T.pick - 0.35, "overTray", true],
  [T.pick, "tray", false],
  [T.pick + 0.1, "tray", true],
  [T.pick + 0.45, "lifted", true],
  [T.place - 0.35, "overBelt", true],
  [T.place, "belt", false],
  [T.place + 0.1, "belt", true],
  [T.place + 0.4, "overBelt", true],
  [T.place + 1.3, "rest", false],
  [LOOP, "rest", false],
];
const ARM_CLS = (() => {
  // Unwrap each joint so consecutive poses never swing the long way round.
  const near = (a: number, prev: number) =>
    a + 360 * Math.round((prev - a) / 360);
  let s = 0;
  let e = 0;
  const angles = ARM_STEPS.map(([, pose], k) => {
    const p = POSES[pose];
    s = k === 0 ? p.s : near(p.s, s);
    e = k === 0 ? p.e : near(p.e, e);
    return { s, e };
  });
  const joint = (
    name: string,
    angle: (p: { s: number; e: number }) => number,
  ) =>
    anim(
      name,
      ARM_STEPS.map(
        ([t, , ease], k): Frame => [
          t,
          `${ease ? EASE : ""}${rot(angle(angles[k] ?? { s: 0, e: 0 }))}`,
        ],
      ),
    );
  return {
    shoulder: joint("shoulder", (p) => p.s),
    elbow: joint("elbow", (p) => p.e),
    wrist: joint("wrist", (p) => -(p.s + p.e)),
    held: anim("held", [
      [0, op(0)],
      [T.pick, op(0)],
      [T.pick + 0.02, op(1)],
      [T.place, op(1)],
      [T.place + 0.02, op(0)],
      [LOOP, op(0)],
    ]),
  };
})();

// --- Carry ---------------------------------------------------------------------

/**
 * The belt runs counter-clockwise from the arm's drop point. A card is placed
 * every loop and the speed is set so the card placed two loops earlier is
 * under the gate at T.scan; each card fades out at the far corner after
 * four loops, as the next one lands.
 */
const BELT_LINE = beltLine(320);
const BELT_DIST = cumulative(BELT_LINE);
/** Where the gate stands on the right straight (clear of the big card in front). */
const GATE_Y = 100;
const D_GATE = (() => {
  const k = BELT_LINE.findIndex(
    ([x, y]) =>
      Math.abs(x - TRACK.x1) < 0.01 &&
      Math.abs(y - (TRACK.y1 - TRACK.r)) < 0.01,
  );
  return (BELT_DIST[k] ?? 0) + (TRACK.y1 - TRACK.r - GATE_Y);
})();
const SPEED = D_GATE / (2 * LOOP + T.scan - T.place);
const BELT = 4 * LOOP;
const LIFE = SPEED * BELT;
const BELT_CLS = (() => {
  const frames: Frame[] = [];
  const at = (x: number, y: number) => proj(x, y, TRACK.z1 + CARD_Z);
  for (let k = 0; k < BELT_LINE.length; k++) {
    const d = BELT_DIST[k] ?? 0;
    const [x = 0, y = 0] = BELT_LINE[k] ?? [];
    if (d >= LIFE) {
      const [px = 0, py = 0] = BELT_LINE[k - 1] ?? [];
      const pd = BELT_DIST[k - 1] ?? 0;
      const u = (LIFE - pd) / (d - pd || 1);
      frames.push([BELT, tr(...at(px + (x - px) * u, py + (y - py) * u))]);
      break;
    }
    frames.push([d / SPEED, tr(...at(x, y))]);
  }
  const marked = (D_GATE + 8) / SPEED;
  return {
    move: anim("belt", frames, BELT),
    fade: anim(
      "beltfade",
      [
        [0, op(1)],
        [BELT - 1.2, op(1)],
        [BELT, op(0)],
      ],
      BELT,
    ),
    mark: anim(
      "mark",
      [
        [0, `${op(0)}transform:scale(.4);`],
        [marked, `${OUT}${op(0)}transform:scale(.4);`],
        [marked + 0.35, `${op(1)}transform:scale(1);`],
        [BELT, `${op(1)}transform:scale(1);`],
      ],
      BELT,
    ),
  };
})();
const BELT_CARDS = [0, 1, 2, 3].map((k) =>
  offset(`o-belt-${k}`, T.place + k * LOOP - BELT),
);

// --- Scan ----------------------------------------------------------------------

const GATE = {
  legA: prism(500, GATE_Y - 17, 516, GATE_Y + 17, 0, 150, 5),
  legB: prism(604, GATE_Y - 17, 620, GATE_Y + 17, 0, 150, 5),
  beam: prism(494, GATE_Y - 21, 626, GATE_Y + 21, 150, 168, 10),
  curtain: path([
    proj(516, GATE_Y, TRACK.z1),
    proj(604, GATE_Y, TRACK.z1),
    proj(604, GATE_Y, 150),
    proj(516, GATE_Y, 150),
  ]),
  laser: path(
    [
      proj(520, GATE_Y, TRACK.z1 + CARD_Z),
      proj(600, GATE_Y, TRACK.z1 + CARD_Z),
    ],
    false,
  ),
  stand: prism(546, GATE_Y - 5, 574, GATE_Y + 11, 168, 178, 6),
  phone: prism(526, GATE_Y - 1, 594, GATE_Y + 10, 178, 318, 12),
  screen: faceY(GATE_Y + 10.4, 532, 186, 588, 310, 9),
  ui: matrixY(560, GATE_Y + 10.6, 266, 1),
};
const ARC_R = 17;
const ARC = 2 * Math.PI * ARC_R;
const beam = (base: number): Frame[] => [
  [0, op(base)],
  [T.scan - 0.8, `${EASE}${op(base)}`],
  [T.scan - 0.2, op(1)],
  [T.scan + 0.7, `${EASE}${op(1)}`],
  [T.scan + 1.4, op(base)],
  [LOOP, op(base)],
];
const SCAN_CLS = {
  curtain: anim("curtain", beam(0.25)),
  laser: anim("laser", beam(0.35)),
  spin: anim("spin", [
    [0, `${op(0)}${rot(0)}`],
    [T.scan - 0.8, `${op(0)}${rot(0)}`],
    [T.scan - 0.6, `${op(1)}${rot(98)}`],
    [T.scan + 0.2, `${op(1)}${rot(491)}`],
    [T.scan + 0.35, `${op(0)}${rot(565)}`],
    [LOOP, `${op(0)}${rot(565)}`],
  ]),
  tick: anim("tick", [
    [0, `${op(0)}transform:scale(.6);`],
    [T.scan + 0.25, `${OUT}${op(0)}transform:scale(.6);`],
    [T.scan + 0.55, `${op(1)}transform:scale(1);`],
    [T.scan + 2.4, `${op(1)}transform:scale(1);`],
    [T.scan + 2.8, `${op(0)}transform:scale(1);`],
    [LOOP, `${op(0)}transform:scale(.6);`],
  ]),
};

// --- Measure -------------------------------------------------------------------

/** Ground cables, drawn under the track. */
const CABLE_GATE: [number, number][] = [
  [330, 200],
  [440, 200],
  [440, GATE_Y],
  [500, GATE_Y],
];
const CABLES = [
  cable([
    [-280, 360],
    [-230, 360],
    [-230, 300],
    [40, 300],
  ]),
  cable(CABLE_GATE),
  cable([
    [690, 352],
    [640, 352],
    [640, GATE_Y],
    [620, GATE_Y],
  ]),
];
/** Three cables from the studio to the analytics panel. */
const bundle = (o: number): [number, number][] => [
  [420 + o, -236],
  [420 + o, -60 + o],
  [262 + o, -60 + o],
  [262 + o, 90],
];
const BUNDLE = [-10, 0, 10].map((o) => cable(bundle(o), 24));
/** A read travels gate → studio, then studio → panel (it passes under the base). */
const PULSE = (() => {
  const a0 = T.scan + 0.35;
  const a1 = T.scan + 0.85;
  const b0 = T.scan + 0.95;
  const b1 = T.bar - 0.1;
  return {
    toStudio: anim(
      "pulse-a",
      travel(cablePoints([...CABLE_GATE].reverse()), a0, a1),
    ),
    toStudioFade: anim("pulse-a-o", blip(a0, a1)),
    toPanel: anim(
      "pulse-b",
      travel(cablePoints([...bundle(0)].reverse(), 24), b0, b1),
    ),
    toPanelFade: anim("pulse-b-o", blip(b0, b1)),
  };
})();

const PANEL = {
  body: prism(330, -262, 520, -240, 0, 178, 16),
  feet: [
    prism(350, -262, 370, -232, 0, 6, 4),
    prism(480, -262, 500, -232, 0, 6, 4),
  ],
  screen: faceY(-239.6, 346, 18, 504, 162, 10),
  ui: matrixY(352, -239.4, 156, 1),
};
/**
 * A rolling chart: seven bars, six on show. Each loop the chart slides one
 * slot left and the newest bar grows on the right as the read arrives.
 */
const BAR_H = [46, 72, 58, 88, 64, 104, 80];
const BAR_CYCLE = LOOP * BAR_H.length;
const BAR_STEP = 22;
const BAR_CLS = (() => {
  const at = (slot: number, s: number, o: number) =>
    `transform:translate(${slot * BAR_STEP}px,0) scale(1,${s});${op(o)}`;
  const frames: Frame[] = [
    [0, `${OUT}${at(5, 0, 1)}`],
    [0.6, at(5, 1, 1)],
  ];
  for (let m = 1; m <= 6; m++) {
    frames.push([LOOP * m - 0.5, `${EASE}${at(6 - m, 1, 1)}`]);
    frames.push([LOOP * m, at(5 - m, 1, m === 6 ? 0 : 1)]);
  }
  frames.push([BAR_CYCLE, at(-1, 1, 0)]);
  return anim("bar", frames, BAR_CYCLE);
})();
const BARS = BAR_H.map((h, j) => ({
  h,
  cls: offset(`o-bar-${j}`, T.bar + j * LOOP - BAR_CYCLE),
}));

// --- Dynamic: the big card swaps its destination, same printed code ----------

const BIG_QR = EGG_QR.hero;
const BIG = {
  body: prism(690, 330, 900, 372, 0, 242, 26),
  face: faceY(372.6, 702, 14, 888, 230, 18),
  qr: matrixY(708, 373, 224, 174 / QS),
  caption: matrixY(795, 372.8, 32, 1),
  bloom: proj(795, 372, 120),
  // The two edges that face the camera: front-top and front-right.
  edges: `${path([proj(716, 372, 242), proj(874, 372, 242)], false)}${path([proj(900, 346, 226), proj(900, 346, 16)], false)}`,
};
// The glowing card is an easter egg (lib/easter-eggs.ts); same size, same finders.
const BIG_MODULES = modulesPath(BIG_QR, true);
const QR_FINDERS = finderPaths(QN);
const LINK_ICON = [
  "M3.27 12A5.46 5.46 0 0 1 2 8.5C2 5.48 4.47 3 7.5 3h5C15.52 3 18 5.48 18 8.5S15.53 14 12.5 14H10",
  "M20.73 12A5.46 5.46 0 0 1 22 15.5c0 3.02-2.47 5.5-5.5 5.5h-5C8.48 21 6 18.52 6 15.5S8.47 10 11.5 10H14",
];
const SWAP = 2 * LOOP;
const DYNAMIC_CLS = {
  linkA: anim(
    "link-a",
    [
      [0, `${op(1)}transform:translateY(0);`],
      [T.swap, `${EASE}${op(1)}transform:translateY(0);`],
      [T.swap + 0.45, `${op(0)}transform:translateY(-7px);`],
      [T.swap + 0.5, `${op(0)}transform:translateY(7px);`],
      [T.swap + LOOP, `${EASE}${op(0)}transform:translateY(7px);`],
      [T.swap + LOOP + 0.45, `${op(1)}transform:translateY(0);`],
      [SWAP, `${op(1)}transform:translateY(0);`],
    ],
    SWAP,
  ),
  linkB: anim(
    "link-b",
    [
      [0, `${op(0)}transform:translateY(7px);`],
      [T.swap, `${EASE}${op(0)}transform:translateY(7px);`],
      [T.swap + 0.45, `${op(1)}transform:translateY(0);`],
      [T.swap + LOOP, `${EASE}${op(1)}transform:translateY(0);`],
      [T.swap + LOOP + 0.45, `${op(0)}transform:translateY(-7px);`],
      [T.swap + LOOP + 0.5, `${op(0)}transform:translateY(7px);`],
      [SWAP, `${op(0)}transform:translateY(7px);`],
    ],
    SWAP,
  ),
  flash: anim("flash", [
    [0, op(0)],
    [T.swap, op(0)],
    [T.swap + 0.3, op(0.9)],
    [T.swap + 1.3, op(0)],
    [LOOP, op(0)],
  ]),
  glint: (() => {
    const from = -6;
    const to = QS + 6;
    const t0 = T.swap + 0.15;
    const t1 = T.swap + 1.05;
    const at = (x: number) => `transform:translateX(${r2(x)}px);`;
    return anim("glint", [
      [0, `${op(0)}${at(from)}`],
      [t0, `${EASE}${op(1)}${at(from)}`],
      [t1, `${op(1)}${at(to)}`],
      [t1 + 0.02, `${op(0)}${at(to)}`],
      [LOOP, `${op(0)}${at(to)}`],
    ]);
  })(),
};

// --- Scenery -------------------------------------------------------------------

const track = trackGeometry();

/**
 * The drawing's own bounds within the 1600 × 900 canvas (~10% zoom). The top
 * edge sits above the plant's tallest leaf (y ≈ -20) so nothing is clipped.
 */
const VIEWBOX = "70 -30 1460 910";

/** Legs under the raised track. */
const LEGS = [
  [-204, 40],
  [-204, 330],
  [594, 20],
  [594, 300],
  [60, 504],
  [380, 504],
  [120, -164],
  [420, -164],
].map(([x = 0, y = 0]) => prism(x - 5, y - 5, x + 5, y + 5, 0, TRACK.z0, 3));

/** Finished cards set down beside the line. */
const PARKED = [proj(640, 470, CARD_Z), proj(-40, -260, CARD_Z)];

/** A small server stack: two rack units with status LEDs and vents. */
const SERVER = [0, 1].map((u) => {
  const z0 = u * 58;
  const z1 = z0 + 54;
  return {
    box: prism(-170, 560, -60, 640, z0, z1, 10),
    face: faceY(640.5, -160, z0 + 10, -70, z1 - 10, 6),
    leds: [0, 1, 2].map((i) => proj(-150 + i * 12, 640.6, z0 + 27)),
    vents: [0, 1, 2, 3]
      .map((i) => {
        const z = z0 + 18 + i * 6;
        return path([proj(-110, 640.6, z), proj(-78, 640.6, z)], false);
      })
      .join(""),
  };
});

const PLANT = {
  pot: prism(-330, 10, -270, 70, 0, 44, 30),
  soil: faceZ(44, -326, 14, -274, 66, 26),
  stem: proj(-300, 40, 44),
};
const LEAVES = (() => {
  const [x, y] = PLANT.stem;
  const leaf = (dx: number, dy: number, w: number) =>
    `M${x} ${y}C${x + dx * 0.2 - w} ${y + dy * 0.5} ${x + dx - w} ${y + dy * 0.9} ${x + dx} ${y + dy}C${x + dx + w} ${y + dy * 0.6} ${x + dx * 0.3 + w} ${y + dy * 0.3} ${x} ${y}Z`;
  return [
    leaf(-46, -70, 10),
    leaf(-6, -96, 12),
    leaf(38, -76, 10),
    leaf(62, -38, 8),
    leaf(-62, -30, 8),
  ];
})();

const STYLE = `
.sc .f{fill:var(--sc-fill);stroke:var(--sc-line);stroke-width:1.5;stroke-linejoin:round}
.sc .s{fill:var(--sc-side);stroke:var(--sc-line);stroke-width:1.5;stroke-linejoin:round}
.sc .l{fill:none;stroke:var(--sc-line);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.sc .l2{fill:none;stroke:var(--sc-line-2);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.sc .scr{fill:var(--sc-screen);stroke:var(--sc-line-2);stroke-width:1.5}
.sc .ic{fill:none;stroke:var(--sc-icon);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.sc .rim{fill:none;stroke:url(#sc-hue);stroke-width:2.6;stroke-linejoin:round}
.sc .glow{opacity:var(--sc-glow)}
.sc .lift{opacity:var(--sc-lift)}
.sc .k-mark,.sc .k-tick{transform-box:fill-box;transform-origin:center}
.sc .k-bar{transform-box:fill-box;transform-origin:50% 100%}
${RULES.join("\n")}
${OFFSETS.join("")}
.sc[data-paused] *{animation-play-state:paused!important}
@media (prefers-reduced-motion:reduce){.sc{--sc-at:${STILL}s}.sc .still-arm{--sc-at:${STILL_ARM}s}.sc *{animation-play-state:paused!important}}
`;

export function HeroScene({ className }: { className?: string }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    // Reduced motion is handled in CSS: every animation is frozen on a
    // composed frame, so there is nothing to run here.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let onScreen = true;
    const update = () => {
      if (onScreen && document.visibilityState === "visible") {
        delete svg.dataset.paused;
      } else {
        svg.dataset.paused = "";
      }
    };
    const io = new IntersectionObserver(
      ([entry]) => {
        onScreen = Boolean(entry?.isIntersecting);
        update();
      },
      { rootMargin: "80px" },
    );
    io.observe(svg);
    document.addEventListener("visibilitychange", update);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  return (
    <svg
      ref={ref}
      viewBox={VIEWBOX}
      role="img"
      aria-label="Animated drawing of the QRdx flow: a studio screen designs and styles a QR code, a printer prints it on a card, a robot arm places the card on a conveyor, a phone on a gate scans each card as it passes, the scan travels to an analytics panel that adds a new bar, and a large dynamic QR card swaps its destination link without being reprinted"
      className={cn(
        "sc block h-auto w-full select-none",
        "[--sc-fill:#ffffff] [--sc-side:#eef0f3] [--sc-line:rgba(18,18,28,0.24)] [--sc-line-2:rgba(18,18,28,0.42)] [--sc-screen:#f6f7fb] [--sc-ink:#0b0b0d] [--sc-icon:rgba(18,18,28,0.6)] [--sc-glow:0.5] [--sc-lift:0] [--sc-band:#1d3fae] [--sc-eye:var(--primary)] [--sc-edge:rgba(42,91,255,0.8)]",
        "dark:[--sc-fill:#0f0f13] dark:[--sc-side:#08080a] dark:[--sc-line:rgba(255,255,255,0.25)] dark:[--sc-line-2:rgba(255,255,255,0.4)] dark:[--sc-screen:#050507] dark:[--sc-ink:#e9edff] dark:[--sc-icon:rgba(255,255,255,0.75)] dark:[--sc-glow:1] dark:[--sc-lift:0.38] dark:[--sc-band:#e3ebff] dark:[--sc-eye:#ffffff] dark:[--sc-edge:rgba(225,233,255,0.85)]",
        className,
      )}
    >
      <style>{STYLE}</style>
      <defs>
        <linearGradient id="sc-hue" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--primary)" />
          <stop offset="1" stopColor="#7c5cff" />
        </linearGradient>
        <linearGradient id="sc-hue-3" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--primary)" />
          <stop offset="0.55" stopColor="#7c5cff" />
          <stop offset="1" stopColor="#22c3ee" />
        </linearGradient>
        <filter id="sc-soft" x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
        <radialGradient id="sc-bloom">
          <stop offset="0" stopColor="var(--primary)" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#7c5cff" stopOpacity="0.16" />
          <stop offset="1" stopColor="#7c5cff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sc-beam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--primary)" stopOpacity="0.5" />
          <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
        {/* The big card's modules: the brand blend with a light band (module units). */}
        <linearGradient
          id="sc-sweep"
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2="29"
          y2="14"
          spreadMethod="reflect"
        >
          <stop offset="0" stopColor="var(--primary)" />
          <stop offset="0.5" style={{ stopColor: "var(--sc-band)" }} />
          <stop offset="1" stopColor="#7c5cff" />
        </linearGradient>
        <linearGradient id="sc-glint" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <pattern
          id="sc-cells"
          width="1"
          height="1"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M1 0H0V1"
            fill="none"
            stroke="var(--sc-line)"
            strokeWidth="0.06"
          />
        </pattern>
        <clipPath id="sc-feed">
          <path d={FEED_CLIP} />
        </clipPath>
        <clipPath id="sc-big-qr">
          <rect width={QS} height={QS} />
        </clipPath>
      </defs>

      {/* Behind the track: plant, analytics panel, cables. */}
      <g>
        <path d={PLANT.pot.side} className="s" />
        <path d={PLANT.pot.top} className="f" />
        <path d={PLANT.soil} className="l" />
        {LEAVES.map((d) => (
          <path key={d} d={d} className="f" />
        ))}
      </g>

      <g>
        <ellipse
          cx={proj(425, -240, 90)[0]}
          cy={proj(425, -240, 90)[1]}
          rx={130}
          ry={110}
          fill="url(#sc-bloom)"
          className="glow"
        />
        {PANEL.feet.map((p) => (
          <g key={p.top}>
            <path d={p.side} className="s" />
            <path d={p.top} className="f" />
          </g>
        ))}
        <path d={PANEL.body.side} className="s" />
        <path d={PANEL.body.top} className="f" />
        <path d={PANEL.screen} className="scr" />
        <path
          d={PANEL.screen}
          className="rim glow"
          strokeWidth={7}
          filter="url(#sc-soft)"
        />
        <path d={PANEL.screen} className="rim" />
        <g transform={PANEL.ui}>
          <path d="M8 6h36M8 14h22" className="l2" />
          <path d="M8 134h138" className="l" />
          <g className="glow">
            {BARS.map(({ h, cls }) => (
              <g key={cls} className={cls}>
                <rect
                  x={12}
                  y={134 - h}
                  width={12}
                  height={h}
                  rx={2}
                  fill="url(#sc-hue-3)"
                  className={BAR_CLS}
                />
              </g>
            ))}
          </g>
        </g>
      </g>

      <g>
        {BUNDLE.map((d) => (
          <path key={d} d={d} className="l2" />
        ))}
        {CABLES.map((d) => (
          <path key={d} d={d} className="l2" />
        ))}
        {/* The read, travelling to the studio and on to the panel. */}
        {[
          [PULSE.toStudio, PULSE.toStudioFade],
          [PULSE.toPanel, PULSE.toPanelFade],
        ].map(([move, fade]) => (
          <g key={move} className={move}>
            <g className={fade}>
              <circle r={8} fill="url(#sc-hue)" opacity={0.25} />
              <circle r={3.6} fill="url(#sc-hue)" />
            </g>
          </g>
        ))}
      </g>

      {/* The arm's base stands behind the belt, beside the printer. */}
      <g>
        <path d={ARM_BASE.side} className="s" />
        <path d={ARM_BASE.top} className="f" />
        <path d={ARM_TURRET.side} className="s" />
        <path d={ARM_TURRET.top} className="f" />
      </g>

      {/* Printer, left of the track, with its output tray. */}
      <g>
        <path d={PRINTER.body.side} className="s" />
        <path d={PRINTER.body.top} className="f" />
        <path d={PRINTER.roll.side} className="s" />
        <path d={PRINTER.roll.top} className="f" />
        <path d={PRINTER.panel} className="l2" />
        <circle
          cx={PRINTER.led[0]}
          cy={PRINTER.led[1]}
          r={3.2}
          fill="url(#sc-hue)"
          className={cn(PRINT_LED_CLS, "still-arm")}
        />
        <path d={PRINTER.tray.side} className="s" />
        <path d={PRINTER.tray.top} className="f" />
        <path d={PRINTER.slot} className="scr" />
        <g clipPath="url(#sc-feed)">
          <g transform={`translate(${TRAY_AT[0]} ${TRAY_AT[1]})`}>
            <g className={cn(PRINT_CLS, "still-arm")}>
              <QrCard />
            </g>
          </g>
        </g>
      </g>

      {LEGS.map((p) => (
        <g key={p.top}>
          <path d={p.side} className="s" />
          <path d={p.top} className="f" />
        </g>
      ))}

      {/* The conveyor. */}
      <g>
        <path d={track.innerWall} className="s" />
        <path d={track.outerSide} className="s" />
        <path d={track.top} className="f" fillRule="evenodd" />
        <path d={track.rails} className="l" strokeDasharray="2 10" />
      </g>

      {/* The gate's inner leg sits behind the passing cards. */}
      <path d={GATE.legA.side} className="s" />
      <path d={GATE.legA.top} className="f" />

      {/* Printed cards riding the belt; each gets a tick once it is read. */}
      <g>
        {BELT_CARDS.map((o) => (
          <g key={o} className={cn(BELT_CLS.move, o)}>
            <g className={BELT_CLS.fade}>
              <QrCard />
              <g className={BELT_CLS.mark}>
                <circle cx={30} cy={-16} r={7} fill="url(#sc-hue)" />
                <path
                  d="M26.8 -16l2.2 2.2 4.2-4.4"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            </g>
          </g>
        ))}
      </g>

      {/* Pick-and-place arm. */}
      <g
        className="still-arm"
        transform={`translate(${SHOULDER[0]} ${SHOULDER[1]}) scale(${ARM_K})`}
      >
        <g className={ARM_CLS.shoulder}>
          <rect
            x={-9}
            y={-9}
            width={L1 + 18}
            height={18}
            rx={9}
            className="f"
          />
          <path d={`M14 0H${L1 - 12}`} className="l" />
          <g transform={`translate(${L1} 0)`}>
            <g className={ARM_CLS.elbow}>
              <rect
                x={-7}
                y={-7}
                width={L2 + 14}
                height={14}
                rx={7}
                className="f"
              />
              <path d={`M12 0H${L2 - 10}`} className="l" />
              <g transform={`translate(${L2} 0)`}>
                <g className={ARM_CLS.wrist}>
                  <rect
                    x={-3.5}
                    y={0}
                    width={7}
                    height={LT - 7}
                    rx={3}
                    className="f"
                  />
                  <path d={`M-8 ${LT}h16l-3-7h-10z`} className="f" />
                  <path
                    d={`M-6 ${LT}h12`}
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                  <g className={ARM_CLS.held}>
                    <g transform={`translate(0 ${LT}) scale(${1 / ARM_K})`}>
                      <QrCard />
                    </g>
                  </g>
                  <circle r={6} className="f" />
                </g>
              </g>
              <circle r={7} className="f" />
              <circle r={2.6} fill="url(#sc-hue)" />
            </g>
          </g>
          <circle r={9} className="f" />
          <circle r={3.2} fill="url(#sc-hue)" />
        </g>
      </g>

      {/* The studio: designs and styles the code. */}
      <g>
        <path d={DEVICE.base.side} className="s" />
        <path d={DEVICE.base.top} className="f" />
        {SCREWS.map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={2.4} className="l2" />
        ))}
        <path d={DEVICE.body.side} className="s" />
        <path d={DEVICE.body.top} className="f" />
        <path d={DEVICE.vents} className="l" />
        <g transform={DEVICE.dial}>
          <circle r={26} className="l2" />
          <circle r={18} className="f" />
          <g className={DIAL_CLS}>
            <path d="M0 -18V-8" className="l2" />
          </g>
        </g>
        {[DEVICE.buttonA, DEVICE.buttonB, DEVICE.knob].map((p) => (
          <g key={p.top}>
            <path d={p.side} className="s" />
            <path d={p.top} className="f" />
          </g>
        ))}
        <path
          d={DEVICE.screen}
          className="rim glow"
          strokeWidth={9}
          filter="url(#sc-soft)"
        />
        <path d={DEVICE.screen} className="scr" />
        <path d={DEVICE.screen} className="rim" strokeWidth={3.2} />
        {/* A real, scannable code for https://qrdx.dev, styled live. */}
        <g transform={DEVICE.qr}>
          <rect width={QS} height={QS} fill="url(#sc-cells)" opacity={0.6} />
          <g transform={`translate(${QUIET} ${QUIET})`}>
            {DESIGN.map((band) => (
              <g key={band.key}>
                <g className={band.rawCls}>
                  <path d={band.raw} fill="var(--sc-ink)" />
                  {band.finders ? (
                    <>
                      <path
                        d={band.finders.raw.ring}
                        fill="var(--sc-ink)"
                        fillRule="evenodd"
                      />
                      <path d={band.finders.raw.eye} fill="var(--sc-ink)" />
                    </>
                  ) : null}
                </g>
                <g className={band.dotCls}>
                  <path d={band.dots} fill="var(--sc-ink)" />
                  {band.finders ? (
                    <>
                      <path
                        d={band.finders.round.halo}
                        fill="none"
                        stroke="url(#sc-hue)"
                        strokeWidth={0.4}
                        opacity={0.7}
                      />
                      <path
                        d={band.finders.round.ring}
                        fill="var(--sc-ink)"
                        fillRule="evenodd"
                      />
                      <path d={band.finders.round.eye} fill="url(#sc-hue)" />
                    </>
                  ) : null}
                </g>
              </g>
            ))}
          </g>
          <g className={SWEEP_CLS}>
            <rect
              x={0}
              y={-1.2}
              width={QS}
              height={1.2}
              fill="url(#sc-hue)"
              opacity={0.18}
            />
            <rect x={0} y={0} width={QS} height={0.4} fill="url(#sc-hue)" />
          </g>
        </g>
        <circle
          cx={DEVICE.led[0]}
          cy={DEVICE.led[1]}
          r={3}
          fill="url(#sc-hue)"
        />
      </g>

      {/* Scanner gate over the track, with a phone on top. */}
      <g>
        <g className="glow">
          <path
            d={GATE.curtain}
            fill="url(#sc-beam)"
            className={SCAN_CLS.curtain}
          />
        </g>
        <path
          d={GATE.laser}
          fill="none"
          stroke="url(#sc-hue)"
          strokeWidth={2}
          strokeLinecap="round"
          className={SCAN_CLS.laser}
        />
        <path d={GATE.legB.side} className="s" />
        <path d={GATE.legB.top} className="f" />
        <path d={GATE.beam.side} className="s" />
        <path d={GATE.beam.top} className="f" />
        <path d={GATE.stand.side} className="s" />
        <path d={GATE.stand.top} className="f" />
        <path d={GATE.phone.side} className="s" />
        <path d={GATE.phone.top} className="f" />
        <path d={GATE.screen} className="scr" />
        <path d={GATE.screen} className="rim glow" />
        <g transform={GATE.ui}>
          <circle r={ARC_R} className="l" />
          <g className={SCAN_CLS.spin}>
            <circle
              r={ARC_R}
              fill="none"
              stroke="url(#sc-hue)"
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray={`${ARC * 0.28} ${ARC}`}
            />
          </g>
          <g className={SCAN_CLS.tick}>
            <circle
              r={ARC_R}
              fill="none"
              stroke="url(#sc-hue)"
              strokeWidth={3}
            />
            <path
              d="M-7 0l5 5 9-10"
              fill="none"
              stroke="url(#sc-hue)"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          <path d="M-16 34h32M-10 42h20" className="l2" />
        </g>
      </g>

      {/* Server stack. */}
      <g>
        {SERVER.map((u) => (
          <g key={u.box.top}>
            <path d={u.box.side} className="s" />
            <path d={u.box.top} className="f" />
            <path d={u.face} className="l2" />
            <path d={u.vents} className="l" />
            {u.leds.map(([x, y], i) => (
              <circle
                key={`${x}-${y}`}
                cx={x}
                cy={y}
                r={2.6}
                fill="url(#sc-hue)"
                opacity={[1, 0.55, 0.3][i]}
              />
            ))}
          </g>
        ))}
      </g>

      {PARKED.map(([x, y]) => (
        <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}>
          <QrCard />
        </g>
      ))}

      {/* The big dynamic QR card: same code, new destination. */}
      <g>
        <ellipse
          cx={BIG.bloom[0]}
          cy={BIG.bloom[1]}
          rx={230}
          ry={200}
          fill="url(#sc-bloom)"
          className="glow"
        />
        <path d={BIG.body.side} className="s" />
        <path d={BIG.body.top} className="f" />
        <path
          d={BIG.face}
          className="rim glow"
          strokeWidth={10}
          filter="url(#sc-soft)"
        />
        <path d={BIG.face} className="scr" />
        <path d={BIG.face} fill="url(#sc-hue-3)" fillOpacity={0.1} />
        <g transform={BIG.qr}>
          <rect width={QS} height={QS} fill="url(#sc-cells)" />
          <g transform={`translate(${QUIET} ${QUIET})`}>
            <path d={BIG_MODULES} fill="url(#sc-sweep)" />
            <path d={BIG_MODULES} fill="#ffffff" className="lift" />
            <path
              d={QR_FINDERS.ring}
              fill="url(#sc-sweep)"
              fillRule="evenodd"
            />
            <path d={QR_FINDERS.eye} style={{ fill: "var(--sc-eye)" }} />
          </g>
          {/* A sheen crossing the code as the link changes (clipped to it). */}
          <g clipPath="url(#sc-big-qr)">
            <g className={DYNAMIC_CLS.glint}>
              <rect
                x={-2.5}
                y={0}
                width={5}
                height={QS}
                transform="skewX(-16)"
                fill="url(#sc-glint)"
              />
            </g>
          </g>
        </g>
        {/* Its destination link, swapped on the fly. */}
        <g transform={BIG.caption}>
          <path d={roundRect(-62, -10, 124, 20, 10)} className="l2" />
          <g transform="translate(-55 -6.8) scale(0.56)">
            {LINK_ICON.map((d) => (
              <path key={d} d={d} className="ic" strokeWidth={2.6} />
            ))}
          </g>
          <path
            d="M-30 0h30"
            fill="none"
            stroke="var(--sc-icon)"
            strokeWidth={3}
            strokeLinecap="round"
          />
          <path
            d="M8 0h44"
            fill="none"
            stroke="var(--primary)"
            strokeWidth={3}
            strokeLinecap="round"
            className={DYNAMIC_CLS.linkA}
          />
          <path
            d="M8 0h22"
            fill="none"
            stroke="var(--primary)"
            strokeWidth={3}
            strokeLinecap="round"
            className={DYNAMIC_CLS.linkB}
          />
        </g>
        <path d={BIG.face} className="rim" strokeWidth={3.2} />
        <path
          d={BIG.face}
          className={cn("rim", DYNAMIC_CLS.flash)}
          strokeWidth={6}
        />
        <path
          d={BIG.edges}
          className="rim glow"
          strokeWidth={6}
          filter="url(#sc-soft)"
        />
        <path
          d={BIG.edges}
          fill="none"
          stroke="var(--sc-edge)"
          strokeWidth={1.6}
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
