// Frame layouts. Each takes options and returns the drawable part of a spec:
// { w, h, qr, shapes, labels }. Units: the code is 1000 wide (800 in
// landscape layouts); the plate around it is the engine's.
//
// Options every layout understands:
//   cta    primary label text           note   secondary label text (or "")
//   m      main motif name              m2     second motif (distinct)
//   fill   motif paint ("frame" etc.)   fill2  motif second paint
import {
  arcPoints,
  bezier,
  curved,
  mix,
  P,
  path,
  quad,
  ringArc,
  shape,
  starPoints,
  strokeLine,
  text,
} from "./lib.mjs";
import { motif } from "./motifs.mjs";

const F = "frame";
const T = "text";
const AC = "accent";
const BG = "background";
const tint = (n) => mix(F, BG, n);
const atint = (n) => mix(AC, BG, n);

const QR = 1000;
const PAD = 80;
const qrAt = (x, y, extra = {}) => ({
  x,
  y,
  size: QR,
  padding: PAD,
  radius: 24,
  ...extra,
});

/** Motif `name` (if any), painted with o.fill / o.fill2 unless given. */
function mot(o, name, cx, cy, size, fill, fill2) {
  return name
    ? motif(name, cx, cy, size, fill ?? o.fill ?? F, fill2 ?? o.fill2 ?? AC)
    : [];
}

/** Main label at a box, on a paint */
const cta = (o, box, on, color = on === BG || isTint(on) ? F : T, extra = {}) =>
  text("cta", "primary", o.cta, box, { color, on, ...extra });
const note = (
  o,
  box,
  on,
  color = on === BG || isTint(on) ? F : T,
  extra = {}
) =>
  o.note === undefined || o.note === null
    ? []
    : [
        text("note", "secondary", o.note, box, {
          color,
          on,
          weight: "regular",
          ...extra,
        }),
      ];
const isTint = (paint) =>
  typeof paint === "object" && paint.mix?.[1] === BG && paint.amount >= 0.6;

// ── Cards ───────────────────────────────────────────────────────────────────

/** Dark card: motif and note on top, the call to action under the code. */
export function cardSolid(o) {
  const head = o.m ? 330 : o.note ? 200 : 40;
  const qy = head + PAD;
  const plateBottom = qy + QR + PAD;
  const h = plateBottom + 250;
  const shapes = [shape.rect(0, 0, 1240, h, F, 72)];
  const labels = [];
  if (o.m) {
    shapes.push(...mot(o, o.m, 620, 110, 150, o.mfill ?? T, o.mfill2 ?? AC));
    labels.push(...note(o, [120, 200, 1000, 96], F, T));
  } else if (o.note) {
    labels.push(...note(o, [120, 50, 1000, 110], F, T));
  }
  labels.unshift(cta(o, [80, plateBottom + 40, 1080, 170], F, T));
  return { w: 1240, h, qr: qrAt(120, qy), shapes, labels };
}

/** Light card with a hairline border and a solid band for the call to action. */
export function cardBand(o) {
  const top = o.bandTop;
  const head = o.m || o.note ? 300 : 60;
  const band = 250;
  const h = head + QR + 2 * PAD + 60 + band;
  const shapes = [
    shape.rect(0, 0, 1240, h, o.tintBg ? tint(0.92) : BG, 56),
    shape.rect(0, 0, 1240, h, F, 56, {
      x: 20,
      y: 20,
      width: 1200,
      height: h - 40,
      radius: 38,
    }),
  ];
  const labels = [];
  const qy = top ? band + 60 + PAD : head + PAD;
  const bandY = top ? 0 : h - band;
  shapes.push(shape.rect(0, bandY, 1240, band, F, 56));
  shapes.push(shape.rect(0, top ? band - 60 : bandY, 1240, 60, F));
  labels.push(cta(o, [100, bandY + 30, 1040, band - 60], F, T));
  const headY = top ? qy + QR + PAD : 0;
  const headH = top ? h - headY : head;
  if (o.m && o.note) {
    shapes.push(...mot(o, o.m, 620, headY + headH * 0.34, 140));
    labels.push(
      ...note(
        o,
        [140, headY + headH * 0.6, 960, 96],
        o.tintBg ? tint(0.92) : BG
      )
    );
  } else if (o.m) {
    shapes.push(...mot(o, o.m, 620, headY + headH / 2, 150));
  } else if (o.note) {
    labels.push(
      ...note(
        o,
        [140, headY + headH / 2 - 55, 960, 110],
        o.tintBg ? tint(0.92) : BG
      )
    );
  }
  return { w: 1240, h, qr: qrAt(120, qy), shapes, labels };
}

/** Light card, a pill button under the code, motif and note above. */
export function cardPill(o) {
  const head = o.m ? 300 : o.note ? 200 : 60;
  const qy = head + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 300;
  const bg = o.tintBg ? tint(0.9) : BG;
  const shapes = [shape.rect(0, 0, 1240, h, bg, 64)];
  if (!o.tintBg)
    shapes.push(
      shape.rect(0, 0, 1240, h, tint(0.82), 64, {
        x: 12,
        y: 12,
        width: 1216,
        height: h - 24,
        radius: 54,
      })
    );
  const labels = [];
  if (o.m) {
    shapes.push(...mot(o, o.m, 620, 96, 130));
    labels.push(...note(o, [140, 180, 960, 90], bg));
  } else labels.push(...note(o, [140, 60, 960, 100], bg));
  shapes.push(shape.rect(170, pb + 60, 900, 180, F, 90));
  labels.unshift(cta(o, [230, pb + 60, 780, 180], F, T));
  return { w: 1240, h, qr: qrAt(120, qy), shapes, labels };
}

/** A tab hanging under a framed code. */
export function tabBottom(o) {
  const tabW = o.wide ? 1040 : 820;
  const border = 40;
  const cardH = QR + 2 * PAD + 2 * border;
  const tabH = o.note ? 300 : 230;
  const h = cardH + tabH;
  const x0 = (1240 - tabW) / 2;
  const shapes = [
    shape.rect(0, 0, 1240, cardH, F, 64),
    shape.rect(x0, cardH - 64, tabW, tabH + 64, F, 64),
  ];
  const labels = [
    cta(o, [x0 + 50, cardH + 10, tabW - 100, o.note ? 160 : 180], F, T),
  ];
  labels.push(...note(o, [x0 + 70, cardH + 165, tabW - 140, 90], F, T));
  if (o.m) shapes.push(...mot(o, o.m, x0 + 90, cardH + 100, 0));
  return { w: 1240, h, qr: qrAt(120, 120), shapes, labels };
}

/** A folder tab on top-left carrying the call to action. */
export function tabTop(o) {
  const tabH = 220;
  const cardY = tabH - 50;
  const h = cardY + QR + 2 * PAD + 80 + (o.note ? 150 : 0);
  const tabW = o.tabW ?? 1000;
  const shapes = [
    shape.rect(0, 0, tabW, tabH, F, 56),
    shape.rect(0, cardY, 1240, h - cardY, F, 56),
    shape.rect(0, cardY, 200, 100, F),
  ];
  const labels = [
    cta(o, [60, 25, tabW - 120 - (o.m ? 140 : 0), 150], F, T, {
      align: "start",
    }),
  ];
  if (o.m) shapes.push(...mot(o, o.m, tabW - 110, 100, 120, T, AC));
  const qy = cardY + 40 + PAD;
  labels.push(...note(o, [120, qy + QR + PAD + 30, 1000, 100], F, T));
  return { w: 1240, h, qr: qrAt(120, qy), shapes, labels };
}

/** A ribbon banner across the bottom with folded tails. */
export function ribbon(o) {
  const w = 1440;
  const cx = 100;
  const head = o.m || o.note ? 300 : 80;
  const qy = head + PAD;
  const rY = qy + QR + PAD + 50;
  const cardBottom = rY + 130;
  const rH = 220;
  const h = rY + rH + 70;
  const shapes = [shape.rect(cx, 0, 1240, cardBottom, o.solid ? F : BG, 56)];
  if (!o.solid)
    shapes.push(
      shape.rect(cx, 0, 1240, cardBottom, F, 56, {
        x: cx + 18,
        y: 18,
        width: 1204,
        height: cardBottom - 36,
        radius: 40,
      })
    );
  // Tails
  shapes.push(
    shape.poly(
      [
        [0, rY + 70],
        [170, rY + 70],
        [170, rY + rH + 70],
        [0, rY + rH + 70],
        [70, rY + 70 + rH / 2],
      ],
      mix(F, "#000000", 0.25)
    ),
    shape.poly(
      [
        [w, rY + 70],
        [w - 170, rY + 70],
        [w - 170, rY + rH + 70],
        [w, rY + rH + 70],
        [w - 70, rY + 70 + rH / 2],
      ],
      mix(F, "#000000", 0.25)
    ),
    shape.poly(
      [
        [100, rY + rH],
        [170, rY + rH + 70],
        [170, rY + rH],
      ],
      mix(F, "#000000", 0.55)
    ),
    shape.poly(
      [
        [w - 100, rY + rH],
        [w - 170, rY + rH + 70],
        [w - 170, rY + rH],
      ],
      mix(F, "#000000", 0.55)
    ),
    shape.rect(100, rY, w - 200, rH, o.ribbonFill ?? F)
  );
  const labels = [
    cta(o, [180, rY + 20, w - 360, rH - 40], o.ribbonFill ?? F, T),
  ];
  const headBg = o.solid ? F : BG;
  if (o.m) {
    shapes.push(
      ...mot(
        o,
        o.m,
        w / 2,
        o.note ? 105 : 150,
        o.note ? 120 : 160,
        o.solid ? T : F
      )
    );
    labels.push(...note(o, [cx + 140, 185, 960, 90], headBg));
  } else labels.push(...note(o, [cx + 140, 110, 960, 100], headBg));
  return { w, h, qr: qrAt(cx + 120, qy), shapes, labels };
}

// ── Bubbles ─────────────────────────────────────────────────────────────────

/** A speech bubble over the code with the call to action. */
export function bubbleTop(o) {
  const bubbleH = o.note ? 330 : 250;
  const tail = 80;
  const cardY = bubbleH + tail + 20;
  const h = cardY + QR + 2 * PAD + 80;
  const tx = o.tailX ?? 620;
  const shapes = [
    shape.rect(0, 0, 1240, bubbleH, F, o.round ? bubbleH / 2 : 60),
    shape.poly(
      [
        [tx - 70, bubbleH - 2],
        [tx + 70, bubbleH - 2],
        [tx + (o.tailSkew ?? -30), bubbleH + tail],
      ],
      F
    ),
    shape.rect(0, cardY, 1240, h - cardY, tint(0.9), 64),
  ];
  const labels = [cta(o, [100, 30, 1040, o.note ? 170 : 190], F, T)];
  labels.push(...note(o, [140, 200, 960, 90], F, T));
  if (o.m) shapes.push(...mot(o, o.m, 620, h - 0, 0));
  return { w: 1240, h, qr: qrAt(120, cardY + 40 + PAD), shapes, labels };
}

/** The whole frame is a speech bubble with its tail at the bottom. */
export function bubbleFrame(o) {
  const head = o.m || o.note ? 280 : 60;
  const qy = head + PAD;
  const bodyH = qy + QR + PAD + 230;
  const tailSide = o.tail ?? "left";
  const tx = tailSide === "left" ? 220 : tailSide === "right" ? 1020 : 620;
  const dir = tailSide === "left" ? -1 : tailSide === "right" ? 1 : 0;
  const h = bodyH + 150;
  const fill = o.light ? BG : F;
  const shapes = [];
  if (o.light) {
    shapes.push(shape.rect(0, 0, 1240, bodyH, F, 90));
    shapes.push(
      shape.poly(
        [
          [tx - 90, bodyH - 10],
          [tx + 90, bodyH - 10],
          [tx + 140 * dir, h],
        ],
        F
      )
    );
    shapes.push(shape.rect(22, 22, 1196, bodyH - 44, BG, 70));
    shapes.push(
      shape.poly(
        [
          [tx - 58, bodyH - 30],
          [tx + 58, bodyH - 30],
          [tx + 110 * dir + (dir === 0 ? 0 : 0), h - 52],
        ],
        BG
      )
    );
  } else {
    shapes.push(shape.rect(0, 0, 1240, bodyH, F, 90));
    shapes.push(
      shape.poly(
        [
          [tx - 90, bodyH - 10],
          [tx + 90, bodyH - 10],
          [tx + 140 * dir, h],
        ],
        F
      )
    );
  }
  const labels = [cta(o, [100, qy + QR + PAD + 25, 1040, 180], fill)];
  if (o.m) {
    shapes.push(
      ...mot(
        o,
        o.m,
        620,
        o.note ? 100 : 150,
        o.note ? 110 : 150,
        o.light ? F : T,
        AC
      )
    );
    labels.push(...note(o, [140, 170, 960, 90], fill));
  } else labels.push(...note(o, [140, 80, 960, 100], fill));
  return { w: 1240, h, qr: qrAt(120, qy), shapes, labels };
}

/** Two chat bubbles: a light one with the note, a solid one with the call to action. */
export function chatPair(o) {
  const shapes = [];
  const topH = 200;
  const qy = topH + 80 + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 80 + 230;
  shapes.push(shape.rect(0, 0, 900, topH, tint(0.86), 70));
  shapes.push(
    shape.poly(
      [
        [120, topH - 2],
        [260, topH - 2],
        [90, topH + 70],
      ],
      tint(0.86)
    )
  );
  shapes.push(shape.rect(300, pb + 70, 940, 220, F, 80));
  shapes.push(
    shape.poly(
      [
        [980, pb + 72],
        [1120, pb + 72],
        [1180, pb - 10],
      ],
      F
    )
  );
  const labels = [cta(o, [360, pb + 90, 820, 180], F, T)];
  labels.push(
    ...note(o, [60, 40, 780, 120], tint(0.86), F, { align: "start" })
  );
  shapes.push(
    shape.rect(40, qy - PAD - 20, 1160, QR + 2 * PAD + 40, tint(0.95), 56)
  );
  if (o.m) shapes.push(...mot(o, o.m, 160, pb + 180, 150));
  return { w: 1240, h, qr: qrAt(120, qy), shapes, labels };
}

// ── Tickets and stamps ──────────────────────────────────────────────────────

/** Vertical ticket: side notches at a perforation, stub with the call to action. */
export function ticketV(o) {
  const qy = (o.m ? 260 : 120) + PAD - 40;
  const perfY = qy + QR + PAD + 60;
  const h = perfY + (o.note ? 380 : 300);
  const nR = 60;
  const body = path()
    .M(64, 0)
    .L(1176, 0)
    .A(64, 64, 0, 0, 1, 1240, 64)
    .L(1240, perfY - nR)
    .A(nR, nR, 0, 0, 0, 1240, perfY + nR)
    .L(1240, h - 64)
    .A(64, 64, 0, 0, 1, 1176, h)
    .L(64, h)
    .A(64, 64, 0, 0, 1, 0, h - 64)
    .L(0, perfY + nR)
    .A(nR, nR, 0, 0, 0, 0, perfY - nR)
    .L(0, 64)
    .A(64, 64, 0, 0, 1, 64, 0)
    .Z();
  const fill = o.light ? tint(0.88) : F;
  const shapes = [
    shape.path(body, fill),
    shape.line(
      100,
      perfY,
      1140,
      perfY,
      10,
      o.light ? tint(0.5) : mix(F, BG, 0.55),
      { dash: [36, 24] }
    ),
  ];
  const labels = [cta(o, [100, perfY + 50, 1040, 180], fill)];
  labels.push(...note(o, [140, perfY + 235, 960, 90], fill));
  if (o.m) shapes.push(...mot(o, o.m, 620, 120, 150, o.light ? F : T, AC));
  return { w: 1240, h, qr: qrAt(120, qy), shapes, labels };
}

/** Horizontal ticket: the code on the left, a stub on the right. */
export function ticketH(o) {
  const w = 2000;
  const h = 1040;
  const perfX = 1100;
  const nR = 56;
  const body = path()
    .M(56, 0)
    .L(perfX - nR, 0)
    .A(nR, nR, 0, 0, 0, perfX + nR, 0)
    .L(w - 56, 0)
    .A(56, 56, 0, 0, 1, w, 56)
    .L(w, h - 56)
    .A(56, 56, 0, 0, 1, w - 56, h)
    .L(perfX + nR, h)
    .A(nR, nR, 0, 0, 0, perfX - nR, h)
    .L(56, h)
    .A(56, 56, 0, 0, 1, 0, h - 56)
    .L(0, 56)
    .A(56, 56, 0, 0, 1, 56, 0)
    .Z();
  const fill = o.light ? tint(0.88) : F;
  const stub = o.light ? F : tint(0.88);
  const shapes = [shape.path(body, fill)];
  // Stub colored differently
  shapes.push(
    shape.path(
      path()
        .M(perfX + nR, 0)
        .L(w - 56, 0)
        .A(56, 56, 0, 0, 1, w, 56)
        .L(w, h - 56)
        .A(56, 56, 0, 0, 1, w - 56, h)
        .L(perfX + nR, h)
        .A(nR, nR, 0, 0, 1, perfX, h - nR)
        .L(perfX, nR)
        .A(nR, nR, 0, 0, 1, perfX + nR, 0)
        .Z(),
      stub
    )
  );
  shapes.push(
    shape.line(
      perfX,
      110,
      perfX,
      h - 110,
      10,
      o.light ? tint(0.5) : mix(F, BG, 0.5),
      { dash: [34, 24] }
    )
  );
  const sx = perfX + 50;
  const sw = w - perfX - 100;
  const labels = [cta(o, [sx, 500, sw, 170], stub)];
  labels.push(...note(o, [sx, 690, sw, 96], stub));
  if (o.m)
    shapes.push(
      ...mot(o, o.m, perfX + (w - perfX) / 2, 300, 200, o.light ? T : F, AC)
    );
  return {
    w,
    h,
    qr: { x: 120, y: 120, size: 800, padding: 64, radius: 19.2 },
    shapes,
    labels,
  };
}

/** Postage stamp: perforated edge, inner hairline, motif in a corner. */
export function stamp(o) {
  const w = 1320;
  const head = 280;
  const qy = head + PAD;
  const h = qy + QR + PAD + 280;
  const bite = 22;
  const step = 66;
  const p = path();
  // Perimeter with semicircle bites (clockwise)
  const nx = Math.round(w / step);
  const ny = Math.round(h / step);
  const sx = w / nx;
  const sy = h / ny;
  p.M(0, 0);
  for (let i = 0; i < nx; i++) {
    const x = i * sx;
    p.L(x + sx / 2 - bite, 0)
      .A(bite, bite, 0, 0, 0, x + sx / 2 + bite, 0)
      .L(x + sx, 0);
  }
  for (let i = 0; i < ny; i++) {
    const y = i * sy;
    p.L(w, y + sy / 2 - bite)
      .A(bite, bite, 0, 0, 0, w, y + sy / 2 + bite)
      .L(w, y + sy);
  }
  for (let i = nx; i > 0; i--) {
    const x = i * sx;
    p.L(x - sx / 2 + bite, h)
      .A(bite, bite, 0, 0, 0, x - sx / 2 - bite, h)
      .L(x - sx, h);
  }
  for (let i = ny; i > 0; i--) {
    const y = i * sy;
    p.L(0, y - sy / 2 + bite)
      .A(bite, bite, 0, 0, 0, 0, y - sy / 2 - bite)
      .L(0, y - sy);
  }
  p.Z();
  const fill = o.light ? tint(0.9) : F;
  const ink = o.light ? F : T;
  const shapes = [
    shape.path(p, fill),
    shape.rect(56, 56, w - 112, h - 112, ink, 10, {
      x: 66,
      y: 66,
      width: w - 132,
      height: h - 132,
      radius: 4,
    }),
  ];
  const labels = [cta(o, [120, h - 250, w - 240, 170], fill)];
  if (o.m) shapes.push(...mot(o, o.m, w - 200, 170, 150, ink, AC));
  labels.push(
    ...note(o, [120, 120, w - 460, 110], fill, ink, { align: "start" })
  );
  return { w, h, qr: qrAt(160, qy), shapes, labels };
}

/** Circle badge with curved labels over and under the code. */
export function seal(o) {
  const w = 2000;
  const c = 1000;
  const pad = 64;
  const qr = { x: 500, y: 500, size: 1000, padding: pad, radius: 40 };
  const shapes = [];
  const fill = o.light ? BG : F;
  const ink = o.light ? F : T;
  if (o.edge === "rosette") {
    shapes.push(shape.poly(starPoints(c, c, 1000, 955, 40), F));
    if (o.light) shapes.push(shape.circle(c, c, 930, BG));
  } else if (o.edge === "scallop") {
    const pts = [];
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const rr = i % 2 === 0 ? 1000 : 972;
      pts.push([c + Math.cos(a) * rr, c + Math.sin(a) * rr]);
    }
    shapes.push(shape.poly(pts, F));
    if (o.light) shapes.push(shape.circle(c, c, 940, BG));
  } else {
    shapes.push(shape.circle(c, c, 1000, F));
    if (o.light) shapes.push(shape.circle(c, c, 970, BG));
  }
  shapes.push(
    shape.circle(
      c,
      c,
      o.light ? 815 : 820,
      o.light ? F : tint(0.25),
      o.light ? 805 : 808
    )
  );
  const labels = [
    curved(
      "cta",
      "primary",
      o.cta,
      { cx: c, cy: c, radius: 905, side: "top", spread: 120 },
      92,
      { color: ink, on: fill }
    ),
  ];
  if (o.note !== undefined && o.note !== null)
    labels.push(
      curved(
        "note",
        "secondary",
        o.note,
        { cx: c, cy: c, radius: 905, side: "bottom", spread: 110 },
        76,
        { color: ink, on: fill, weight: "regular" }
      )
    );
  if (o.m) shapes.push(...mot(o, o.m, c, c - 685, 170, ink, AC));
  if (o.dots !== false) {
    // Two small diamonds where the labels meet
    for (const x of [c - 905, c + 905])
      shapes.push(
        shape.poly(
          [
            [x, c - 26],
            [x + 26, c],
            [x, c + 26],
            [x - 26, c],
          ],
          ink
        )
      );
  }
  return { w, h: w, qr, shapes, labels };
}

/** Phone mockup: the code on the screen, the call to action under it. */
export function phone(o) {
  const w = 1360;
  const h = 2000;
  const bezel = o.light ? 26 : 60;
  const shapes = [shape.rect(0, 0, w, h, F, 190)];
  shapes.push(
    shape.rect(bezel, bezel, w - 2 * bezel, h - 2 * bezel, o.screen ?? BG, 150)
  );
  shapes.push(
    shape.rect(w / 2 - 130, 76 + (o.light ? -20 : 0), 260, 64, F, 32)
  );
  const qy = 420;
  const labels = [];
  const screen = o.screen ?? BG;
  const pb = qy + QR + PAD;
  if (o.m) {
    shapes.push(...mot(o, o.m, w / 2, 250, 120, o.screen ? T : F));
    labels.push(...note(o, [180, pb + 235, w - 360, 90], screen));
  } else labels.push(...note(o, [180, 236, w - 360, 92], screen));
  if (o.button) {
    shapes.push(shape.rect(230, pb + 60, w - 460, 170, o.screen ? T : F, 85));
    labels.unshift(
      cta(o, [290, pb + 60, w - 580, 170], o.screen ? T : F, o.screen ? F : T)
    );
  } else labels.unshift(cta(o, [160, pb + 50, w - 320, 180], screen));
  shapes.push(
    shape.rect(
      w / 2 - 170,
      h - 120 + (o.light ? 30 : 0),
      340,
      18,
      o.screen ? T : F,
      9
    )
  );
  return {
    w,
    h,
    qr: qrAt(180, qy),
    shapes,
    labels: labels.filter((l) => l.box?.height !== 0.1),
  };
}

// ── Arrows and lines ────────────────────────────────────────────────────────

/** The call to action in an arrow-shaped tag pointing up at the code. */
export function arrowTag(o) {
  const qy = (o.note ? 200 : 60) + PAD;
  const pb = qy + QR + PAD;
  const tip = pb + 40;
  const h = tip + 360;
  const shapes = [
    shape.rect(20, qy - PAD - 20, 1200, QR + 2 * PAD + 40, F, 60, {
      x: 40,
      y: qy - PAD,
      width: 1160,
      height: QR + 2 * PAD,
      radius: 40,
    }),
    shape.poly(
      [
        [620, tip],
        [800, tip + 110],
        [1080, tip + 110],
        [1080, h],
        [160, h],
        [160, tip + 110],
        [440, tip + 110],
      ],
      F
    ),
  ];
  const labels = [cta(o, [210, tip + 130, 820, 190], F, T)];
  labels.push(...note(o, [140, 50, 960, 110], BG));
  return { w: 1240, h, qr: qrAt(120, qy), shapes, labels };
}

/** Minimal: the code with a curled arrow and a handwritten-style note. */
export function arrowCurl(o) {
  const qy = 120;
  const pb = qy + QR + PAD;
  const h = pb + 380;
  const shapes = [shape.rect(0, 0, 1240, h, o.tintBg ? tint(0.92) : BG, 48)];
  if (!o.tintBg)
    shapes.push(
      shape.rect(0, 0, 1240, h, tint(0.8), 48, {
        x: 10,
        y: 10,
        width: 1220,
        height: h - 20,
        radius: 40,
      })
    );
  // Arrow from the label to the code's corner
  const arrow = strokeLine(
    bezier(
      [300, pb + 250],
      [150, pb + 230],
      [110, pb + 120],
      [150, pb + 30],
      24
    ),
    18,
    { round: true }
  );
  shapes.push(shape.path(arrow, AC));
  shapes.push(
    shape.poly(
      [
        [150, pb - 30],
        [205, pb + 55],
        [100, pb + 55],
      ],
      AC
    )
  );
  const bg = o.tintBg ? tint(0.92) : BG;
  const labels = [cta(o, [340, pb + 120, 840, 170], bg, F, { align: "start" })];
  labels.push(...note(o, [340, pb + 270, 840, 96], bg, F, { align: "start" }));
  return { w: 1240, h, qr: qrAt(120, qy), shapes, labels };
}

/** Viewfinder corners around the code, label under it. */
export function corners(o) {
  const head = o.note ? 220 : 80;
  const qy = head + PAD + 40;
  const pb = qy + QR + PAD;
  const h = pb + 300;
  const bg = o.tintBg ? tint(0.92) : BG;
  const shapes = [shape.rect(0, 0, 1400, h, bg, 48)];
  const L = 220;
  const t = 34;
  const x0 = 200 - PAD - 60;
  const y0 = qy - PAD - 60;
  const x1 = 200 + QR + PAD + 60;
  const y1 = pb + 60;
  for (const [x, y, sx, sy] of [
    [x0, y0, 1, 1],
    [x1, y0, -1, 1],
    [x0, y1, 1, -1],
    [x1, y1, -1, -1],
  ]) {
    const pts = [
      [x, y],
      [x + L * sx, y],
      [x + L * sx, y + t * sy],
      [x + t * sx, y + t * sy],
      [x + t * sx, y + L * sy],
      [x, y + L * sy],
    ];
    shapes.push(shape.poly(pts, F));
  }
  const labels = [cta(o, [100, pb + 100, 1200, 170], bg, F)];
  labels.push(...note(o, [140, 40, 1120, 100], bg, F));
  return { w: 1400, h, qr: qrAt(200, qy), shapes, labels };
}

/** Rules either side of the label: "— Scan me —". */
export function rules(o) {
  const head = o.m ? 300 : o.note ? 180 : 60;
  const qy = head + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 280;
  const bg = o.tintBg ? tint(0.92) : BG;
  const shapes = [shape.rect(0, 0, 1240, h, bg, 40)];
  if (o.border)
    shapes.push(
      shape.rect(0, 0, 1240, h, F, 40, {
        x: 16,
        y: 16,
        width: 1208,
        height: h - 32,
        radius: 28,
      })
    );
  const labels = [cta(o, [260, pb + 70, 720, 160], bg, F)];
  shapes.push(
    shape.line(60, pb + 150, 220, pb + 150, 10, F),
    shape.line(1020, pb + 150, 1180, pb + 150, 10, F)
  );
  if (o.m) {
    shapes.push(...mot(o, o.m, 620, 100, 120));
    labels.push(...note(o, [140, 180, 960, 96], bg, F));
  } else labels.push(...note(o, [140, 40, 960, 100], bg, F));
  return { w: 1240, h, qr: qrAt(120, qy), shapes, labels };
}

/** Bold label with a short accent underline. */
export function underline(o) {
  const qy = 60 + PAD;
  const pb = qy + QR + PAD;
  const h = pb + (o.note ? 420 : 330);
  const bg = o.tintBg ? tint(0.92) : BG;
  const shapes = [shape.rect(0, 0, 1240, h, bg, 40)];
  if (o.border)
    shapes.push(
      shape.rect(0, 0, 1240, h, tint(0.75), 40, {
        x: 8,
        y: 8,
        width: 1224,
        height: h - 16,
        radius: 34,
      })
    );
  const labels = [
    cta(o, [100, pb + 50, 1040, 180], bg, F, o.left ? { align: "start" } : {}),
  ];
  shapes.push(shape.rect(o.left ? 100 : 520, pb + 245, 200, 22, AC, 11));
  labels.push(
    ...note(
      o,
      [100, pb + 300, 1040, 90],
      bg,
      F,
      o.left ? { align: "start" } : {}
    )
  );
  return { w: 1240, h, qr: qrAt(120, qy), shapes, labels };
}

/** A thin double border: elegant, for invitations and menus. */
export function doubleLine(o) {
  const head = o.m ? 340 : 240;
  const qy = head + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 330;
  const bg = o.tintBg ? tint(0.93) : BG;
  const shapes = [
    shape.rect(0, 0, 1320, h, bg, 0),
    shape.rect(30, 30, 1260, h - 60, F, 0, {
      x: 40,
      y: 40,
      width: 1240,
      height: h - 80,
    }),
    shape.rect(60, 60, 1200, h - 120, F, 0, {
      x: 64,
      y: 64,
      width: 1192,
      height: h - 128,
    }),
  ];
  const labels = [];
  if (o.m) {
    shapes.push(...mot(o, o.m, 660, 150, 140));
    labels.push(...note(o, [180, 225, 960, 100], bg, F));
  } else labels.push(...note(o, [180, 100, 960, 120], bg, F));
  shapes.push(shape.line(470, pb + 70, 850, pb + 70, 6, F));
  shapes.push(
    shape.poly(
      [
        [660, pb + 50],
        [680, pb + 70],
        [660, pb + 90],
        [640, pb + 70],
      ],
      F
    )
  );
  labels.unshift(cta(o, [180, pb + 110, 960, 160], bg, F));
  return { w: 1320, h, qr: qrAt(160, qy), shapes, labels };
}

// ── Objects ─────────────────────────────────────────────────────────────────

/** Instant photo: thick bottom margin, a strip of tape on top. */
export function polaroid(o) {
  const w = 1320;
  const qy = 200;
  const pb = qy + QR + PAD;
  const h = pb + 330;
  const shapes = [
    shape.rect(40, 40, w - 40, h - 40, tint(0.78), 16),
    shape.rect(0, 0, w - 40, h - 40, o.tintBg ? tint(0.94) : BG, 16),
    shape.rect(0, 0, w - 40, h - 40, tint(0.72), 16, {
      x: 6,
      y: 6,
      width: w - 52,
      height: h - 52,
      radius: 12,
    }),
    shape.rect(100, qy - PAD - 40, w - 240, QR + 2 * PAD + 80, F, 6),
    shape.poly(
      [
        [470, 40],
        [810, 20],
        [820, 110],
        [480, 130],
      ],
      atint(0.35)
    ),
  ];
  const bg = o.tintBg ? tint(0.94) : BG;
  const labels = [
    cta(o, [120, pb + 80, w - 280, 150], bg, F, {
      weight: o.regular ? "regular" : undefined,
    }),
  ];
  return { w, h, qr: qrAt(140, qy), shapes, labels };
}

/** Die-cut sticker: thick outline, offset shadow, optional peel. */
export function sticker(o) {
  const w = 1320;
  const head = o.note || o.m ? 230 : 60;
  const qy = head + 60 + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 300;
  const shapes = [
    shape.rect(50, 50, w - 50, h - 50, mix(F, "#000000", 0.0), 110),
    shape.rect(0, 0, w - 50, h - 50, F, 110),
    shape.rect(36, 36, w - 122, h - 122, o.inner ?? AC, 80),
  ];
  const inner = o.inner ?? AC;
  const labels = [cta(o, [100, pb + 40, w - 250, 170], inner)];
  if (o.m) {
    shapes.push(
      ...mot(o, o.m, (w - 50) / 2, 150, 160, o.mfill ?? F, o.mfill2 ?? F)
    );
  } else labels.push(...note(o, [140, 90, w - 330, 120], inner));
  if (o.peel) {
    shapes.push(
      shape.poly(
        [
          [w - 50 - 180, h - 50],
          [w - 50, h - 50 - 180],
          [w - 50, h - 50],
        ],
        BG
      )
    );
    shapes.push(
      shape.poly(
        [
          [w - 50 - 180, h - 50],
          [w - 50, h - 50 - 180],
          [w - 50 - 190, h - 50 - 190],
        ],
        tint(0.6)
      )
    );
  }
  return { w, h, qr: qrAt(110, qy), shapes, labels };
}

/** Hang tag: clipped top corners, a hole and a loop of string. */
export function hangTag(o) {
  const w = 1240;
  const top = 380;
  const qy = top + 40 + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 300;
  const clip = 300;
  const tag = path()
    .poly([
      [clip, 120],
      [w - clip, 120],
      [w, 120 + clip],
      [w, h - 40],
      [w - 40, h],
      [40, h],
      [0, h - 40],
      [0, 120 + clip],
    ])
    .circle(620, 260, 50, true);
  const fill = o.light ? tint(0.88) : F;
  const shapes = [shape.path(tag, fill, "evenodd")];
  shapes.push(
    shape.path(
      strokeLine(bezier([620, 230], [560, 120], [520, 40], [440, 0], 20), 12, {
        round: true,
      }),
      o.light ? F : AC
    )
  );
  const labels = [cta(o, [100, pb + 50, w - 200, 180], fill)];
  labels.push(...note(o, [140, top - 40, w - 280, 0], fill));
  return {
    w,
    h,
    qr: qrAt(120, qy),
    shapes,
    labels: labels.filter((l) => l.box.height > 1),
  };
}

/** Door hanger: tall, with a round cut-out and slit at the top. */
export function doorHanger(o) {
  const w = 1240;
  const top = 470;
  const qy = top + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 330;
  const p = path().rrect(0, 0, w, h, 70).circle(620, 230, 170, true);
  p.add(
    path().poly([
      [620, 400],
      [640, 400],
      [640, 120],
      [620, 120],
    ]).c
  );
  const shapes = [
    shape.path(
      path().rrect(0, 0, w, h, 70).circle(620, 210, 150, true),
      o.light ? tint(0.9) : F,
      "evenodd"
    ),
  ];
  const fill = o.light ? tint(0.9) : F;
  const labels = [cta(o, [100, pb + 50, w - 200, 180], fill)];
  labels.push(...note(o, [100, pb + 215, w - 200, 92], fill));
  return { w, h, qr: qrAt(120, qy), shapes, labels };
}

/** Arched top, like a window or a door: weddings, spring, menus. */
export function arch(o) {
  const w = 1320;
  const archR = w / 2;
  const qy = 470;
  const pb = qy + QR + PAD;
  const h = pb + 330;
  const outer = path()
    .M(0, archR)
    .A(archR, archR, 0, 0, 1, w, archR)
    .L(w, h - 40)
    .Q(w, h, w - 40, h)
    .L(40, h)
    .Q(0, h, 0, h - 40)
    .Z();
  const fill = o.solid ? F : tint(0.9);
  const shapes = [shape.path(outer, fill)];
  const ir = archR - 50;
  const ink = o.solid ? T : F;
  const inner = path()
    .M(50, archR)
    .A(ir, ir, 0, 0, 1, w - 50, archR)
    .L(w - 50, h - 50)
    .L(50, h - 50)
    .Z()
    .M(62, archR)
    .L(62, h - 62)
    .L(w - 62, h - 62)
    .L(w - 62, archR)
    .A(ir - 12, ir - 12, 0, 0, 0, 62, archR)
    .Z();
  shapes.push(shape.path(inner, o.solid ? tint(0.35) : F));
  const labels = [cta(o, [140, pb + 60, w - 280, 170], fill, ink)];
  if (o.m) {
    shapes.push(...mot(o, o.m, w / 2, 240, 150, ink, AC));
  }
  if (!o.m) labels.push(...note(o, [260, 250, w - 520, 110], fill, ink));
  return {
    w,
    h,
    qr: qrAt(160, qy),
    shapes,
    labels: labels.filter((l) => l.box.height > 1),
  };
}

/** Landscape card: the code on one side, a solid panel with text on the other. */
export function landscape(o) {
  const w = 2000;
  const h = 1040;
  const left = o.codeRight;
  const shapes = [shape.rect(0, 0, w, h, o.light ? tint(0.9) : F, 72)];
  const qx = left ? w - 120 - 800 : 120;
  const tx = left ? 110 : 800 + 230;
  const tw = w - 800 - 340;
  const fill = o.light ? tint(0.9) : F;
  const labels = [];
  let y = 300;
  if (o.m) {
    shapes.push(...mot(o, o.m, tx + 90, 250, 180, o.light ? F : T, AC));
    y = 400;
  } else y = 330;
  labels.push(
    cta(o, [tx, y, tw, 190], fill, o.light ? F : T, { align: "start" })
  );
  labels.push(
    ...note(o, [tx, y + 210, tw, 100], fill, o.light ? F : T, {
      align: "start",
    })
  );
  if (o.bar) shapes.push(shape.rect(tx, h - 170, 240, 26, AC, 13));
  return {
    w,
    h,
    qr: { x: qx, y: 120, size: 800, padding: 64, radius: 19.2 },
    shapes,
    labels,
  };
}

/** Business card: greeting and call to action beside the code. */
export function bizCard(o) {
  const w = 2000;
  const h = 1060;
  const shapes = [shape.rect(0, 0, w, h, o.dark ? F : BG, 48)];
  const fill = o.dark ? F : BG;
  const ink = o.dark ? T : F;
  if (!o.dark)
    shapes.push(
      shape.rect(0, 0, w, h, tint(0.78), 48, {
        x: 10,
        y: 10,
        width: w - 20,
        height: h - 20,
        radius: 40,
      })
    );
  if (o.edge)
    shapes.push(
      shape.rect(0, 0, 70, h, AC, 0),
      shape.rect(0, 0, 120, h, AC, 48),
      shape.rect(60, 0, 60, h, fill)
    );
  const qx = w - 130 - 800;
  const tx = o.edge ? 210 : 130;
  const tw = qx - 64 - tx - 60;
  const labels = [];
  if (o.m) shapes.push(...mot(o, o.m, tx + 70, 220, 140, ink, AC));
  labels.push(
    ...note(o, [tx, 390, tw, 170], fill, ink, {
      align: "start",
      weight: undefined,
    })
  );
  shapes.push(shape.rect(tx, 610, 160, 16, AC, 8));
  labels.push(
    cta(o, [tx, 680, tw, 130], fill, ink, { align: "start", weight: "regular" })
  );
  return {
    w,
    h,
    qr: { x: qx, y: 130, size: 800, padding: 64, radius: 19.2 },
    shapes,
    labels,
  };
}

/** Envelope: a pointed flap over the top of the code. */
export function envelope(o) {
  const w = 1320;
  const flap = 520;
  const qy = 420 + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 300;
  const fill = o.light ? tint(0.88) : F;
  const shapes = [
    shape.rect(0, 0, w, h, fill, 40),
    shape.path(
      path()
        .M(40, 0)
        .L(w - 40, 0)
        .Q(w, 0, w - 20, 40)
        .L(w / 2 + 40, flap - 30)
        .Q(w / 2, flap, w / 2 - 40, flap - 30)
        .L(20, 40)
        .Q(0, 0, 40, 0)
        .Z(),
      o.light ? tint(0.7) : mix(F, BG, 0.2)
    ),
  ];
  if (o.m) shapes.push(...mot(o, o.m, w / 2, 190, 140, o.light ? F : T, AC));
  const labels = [cta(o, [140, pb + 50, w - 280, 180], fill)];
  return { w, h, qr: qrAt(160, qy), shapes, labels };
}

/** Receipt: zigzag edges, dashed separators. */
export function receipt(o) {
  const w = 1240;
  const zig = 30;
  const qy = 260 + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 360;
  const pts = [];
  const n = 20;
  for (let i = 0; i <= n; i++) pts.push([(w * i) / n, i % 2 === 0 ? 0 : zig]);
  for (let i = n; i >= 0; i--)
    pts.push([(w * i) / n, i % 2 === 0 ? h : h - zig]);
  const shapes = [shape.poly(pts, tint(0.9))];
  shapes.push(
    shape.line(80, 220, w - 80, 220, 8, F, { dash: [24, 16] }),
    shape.line(80, pb + 40, w - 80, pb + 40, 8, F, { dash: [24, 16] })
  );
  const labels = [cta(o, [100, pb + 80, w - 200, 170], tint(0.9))];
  labels.push(...note(o, [100, 80, w - 200, 110], tint(0.9)));
  return { w, h, qr: qrAt(120, qy), shapes, labels };
}

/** Browser window: a bar with dots and an address pill. */
export function browser(o) {
  const w = 1240;
  const bar = 200;
  const qy = bar + 40 + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 280;
  const shapes = [
    shape.rect(0, 0, w, h, F, 48),
    shape.rect(24, bar, w - 48, h - bar - 24, BG, 30),
    shape.circle(90, 100, 22, tint(0.5)),
    shape.circle(160, 100, 22, tint(0.35)),
    shape.circle(230, 100, 22, tint(0.2)),
    shape.rect(310, 52, 860, 96, tint(0.18), 48),
  ];
  const labels = [cta(o, [100, pb + 40, w - 200, 170], BG, F)];
  labels.push(...note(o, [350, 52, 780, 96], tint(0.18), T));
  return { w, h, qr: qrAt(120, qy), shapes, labels };
}

/** Calendar page: rings over a header band. */
export function calendar(o) {
  const w = 1240;
  const band = 300;
  const qy = band + 40 + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 280;
  const shapes = [
    shape.rect(0, 60, w, h - 60, tint(0.9), 56),
    shape.rect(0, 60, w, band - 60 + 40, F, 56),
    shape.rect(0, band, w, 40, F),
    shape.rect(250, 0, 60, 170, mix(F, "#000000", 0.3), 30),
    shape.rect(930, 0, 60, 170, mix(F, "#000000", 0.3), 30),
  ];
  const labels = [cta(o, [100, pb + 40, w - 200, 170], tint(0.9))];
  labels.push(...note(o, [340, 140, 560, 130], F, T));
  return { w, h, qr: qrAt(120, qy), shapes, labels };
}

/** Gift box: a ribbon crossing under the code, a bow on the lid. */
export function giftBox(o) {
  const w = 1300;
  const lid = 360;
  const qy = lid + 40 + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 290;
  const shapes = [
    shape.rect(30, lid - 120, w - 60, h - lid + 120, F, 30),
    shape.rect(0, lid - 140, w, 150, mix(F, "#000000", 0.18), 24),
    shape.rect(w / 2 - 70, lid - 140, 140, h - lid + 140, AC),
    ...motif("bow", w / 2, 170, 440, AC, mix(AC, "#000000", 0.25)),
  ];
  // Label plaque over the ribbon
  shapes.push(shape.rect(170, pb + 50, w - 340, 190, BG, 95));
  const labels = [cta(o, [230, pb + 50, w - 460, 190], BG, F)];
  return { w, h, qr: qrAt(150, qy), shapes, labels };
}

/** Shopping bag with handles. */
export function bag(o) {
  const w = 1320;
  const top = 300;
  const qy = top + 90 + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 300;
  const shapes = [
    shape.path(
      ringArc(w / 2, top + 10, 230, 280, 180, 360),
      mix(F, "#000000", 0.3)
    ),
    shape.poly(
      [
        [40, top],
        [w - 40, top],
        [w, h],
        [0, h],
      ],
      F
    ),
    shape.rect(40, top, w - 80, 40, mix(F, "#000000", 0.2)),
  ];
  const labels = [cta(o, [140, pb + 50, w - 280, 170], F, T)];
  return { w, h, qr: qrAt(160, qy), shapes, labels };
}

/** House: a roof and chimney over the code. */
export function house(o) {
  const w = 1400;
  const roof = 460;
  const qy = roof + 40 + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 300;
  const fill = o.light ? tint(0.88) : F;
  const shapes = [
    shape.rect(1000, 60, 120, 260, o.light ? F : mix(F, "#000000", 0.3), 8),
    shape.poly(
      [
        [w / 2, 0],
        [w, roof],
        [w - 60, roof],
        [w - 60, h],
        [60, h],
        [60, roof],
        [0, roof],
      ],
      fill
    ),
  ];
  if (o.light)
    shapes.push(
      shape.poly(
        [
          [w / 2, 0],
          [w, roof],
          [w - 60, roof],
          [w / 2, 56],
          [60, roof],
          [0, roof],
        ],
        F
      )
    );
  if (o.m) shapes.push(...mot(o, o.m, w / 2, 300, 120, o.light ? F : T, AC));
  const labels = [cta(o, [160, pb + 50, w - 320, 170], fill)];
  return { w, h, qr: qrAt(200, qy), shapes, labels };
}

/** Storefront awning: scalloped stripes over the card. */
export function awning(o) {
  const w = 1320;
  const aw = 300;
  const qy = aw + 60 + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 300;
  const stripes = 8;
  const sw = w / stripes;
  const shapes = [
    shape.rect(40, 200, w - 80, h - 200, o.light ? tint(0.9) : F, 40),
  ];
  for (let i = 0; i < stripes; i++) {
    const x = i * sw;
    const p = path()
      .M(x, 40)
      .L(x + sw, 40)
      .L(x + sw, aw - sw / 2)
      .A(sw / 2, sw / 2, 0, 0, 1, x, aw - sw / 2)
      .Z();
    shapes.push(shape.path(p, i % 2 === 0 ? AC : BG));
  }
  shapes.push(shape.rect(0, 0, w, 60, mix(AC, "#000000", 0.25), 30));
  const fill = o.light ? tint(0.9) : F;
  const labels = [cta(o, [140, pb + 50, w - 280, 170], fill)];
  return { w, h, qr: qrAt(160, qy), shapes, labels };
}

/** Film strip: sprocket holes down both sides. */
export function filmStrip(o) {
  const w = 1440;
  const qy = (o.note ? 240 : 120) + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 280;
  const p = path().rrect(0, 0, w, h, 30);
  for (let y = 60; y < h - 80; y += 120) {
    p.rrect(40, y, 60, 70, 12, true).rrect(w - 100, y, 60, 70, 12, true);
  }
  const shapes = [shape.path(p, F, "evenodd")];
  const labels = [cta(o, [180, pb + 50, w - 360, 170], F, T)];
  labels.push(...note(o, [180, 70, w - 360, 110], F, T));
  return { w, h, qr: qrAt(220, qy), shapes, labels };
}

/** Event badge: clip slot on top, a header band. */
export function lanyard(o) {
  const w = 1320;
  const head = 380;
  const qy = head + 60 + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 300;
  const shapes = [
    shape.path(
      path()
        .rrect(0, 0, w, h, 60)
        .rrect(w / 2 - 160, 60, 320, 56, 28, true),
      BG,
      "evenodd"
    ),
    shape.path(
      path()
        .rrect(0, 0, w, h, 60)
        .rrect(16, 16, w - 32, h - 32, 46, true),
      tint(0.7),
      "evenodd"
    ),
    shape.path(path().M(0, 170).L(w, 170).L(w, head).L(0, head).Z(), F),
  ];
  const labels = [cta(o, [140, pb + 50, w - 280, 170], BG, F)];
  labels.push(...note(o, [100, 200, w - 200, 140], F, T));
  shapes.push(
    shape.path(
      path()
        .rrect(w / 2 - 160, 60, 320, 56, 28)
        .rrect(w / 2 - 140, 72, 280, 32, 16, true),
      tint(0.5),
      "evenodd"
    )
  );
  return { w, h, qr: qrAt(160, qy), shapes, labels };
}

/** Shield, for clubs, teams and schools. */
export function shield(o) {
  const w = 1500;
  const top = 280;
  const qy = top + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 420;
  const p = path()
    .M(0, 60)
    .Q(w / 2, -40, w, 60)
    .L(w, pb - 40)
    .C(w, h - 260, w * 0.72, h - 80, w / 2, h)
    .C(w * 0.28, h - 80, 0, h - 260, 0, pb - 40)
    .Z();
  const shapes = [shape.path(p, F)];
  shapes.push(shape.rect(80, pb + 40, w - 160, 190, AC, 20));
  const labels = [cta(o, [140, pb + 50, w - 280, 170], AC, o.ctaInk ?? T)];
  if (o.m) shapes.push(...mot(o, o.m, w / 2, 160, 140, T, AC));
  return { w, h, qr: qrAt(250, qy), shapes, labels };
}

/** Laurel wreath around a short note, the call to action under it. */
export function laurel(o) {
  const qy = 60 + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 600;
  const bg = o.tintBg ? tint(0.92) : BG;
  const shapes = [shape.rect(0, 0, 1240, h, bg, 48)];
  if (!o.tintBg)
    shapes.push(
      shape.rect(0, 0, 1240, h, tint(0.8), 48, {
        x: 10,
        y: 10,
        width: 1220,
        height: h - 20,
        radius: 40,
      })
    );
  const cx = 620;
  const cy = pb + 210;
  const rad = 190;
  const p = new P();
  for (const side of [-1, 1]) {
    const pts =
      side < 0
        ? arcPoints(cx, cy, rad, 120, 230, 18)
        : arcPoints(cx, cy, rad, 60, -50, 18);
    p.add(strokeLine(pts, 10, { round: true }));
    for (let i = 2; i < pts.length - 1; i += 3) {
      const [x, y] = pts[i];
      const ang = Math.atan2(y - cy, x - cx);
      const along = [pts[i + 1][0] - x, pts[i + 1][1] - y];
      const al = Math.hypot(...along);
      const ux = along[0] / al;
      const uy = along[1] / al;
      const tx = x + Math.cos(ang) * 46 + ux * 40;
      const ty = y + Math.sin(ang) * 46 + uy * 40;
      const dx = tx - x;
      const dy = ty - y;
      const len = Math.hypot(dx, dy);
      const nx = (-dy / len) * 15;
      const ny = (dx / len) * 15;
      p.M(x, y)
        .Q(x + dx / 2 + nx, y + dy / 2 + ny, tx, ty)
        .Q(x + dx / 2 - nx, y + dy / 2 - ny, x, y)
        .Z();
      // inner leaf
      const ix = x - Math.cos(ang) * 40 + ux * 40;
      const iy = y - Math.sin(ang) * 40 + uy * 40;
      const idx = ix - x;
      const idy = iy - y;
      const il = Math.hypot(idx, idy);
      const inx = (-idy / il) * 13;
      const iny = (idx / il) * 13;
      p.M(x, y)
        .Q(x + idx / 2 + inx, y + idy / 2 + iny, ix, iy)
        .Q(x + idx / 2 - inx, y + idy / 2 - iny, x, y)
        .Z();
    }
  }
  shapes.push(shape.path(p, AC));
  const labels = [cta(o, [100, pb + 420, 1040, 170], bg, F)];
  labels.push(
    ...note(o, [cx - 150, cy - 60, 300, 120], bg, F, { weight: undefined })
  );
  return { w: 1240, h, qr: qrAt(120, qy), shapes, labels };
}

/** Neon: a dark card with a bright hairline tube around the code. */
export function neon(o) {
  const head = o.m ? 260 : 80;
  const qy = head + 40 + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 300;
  const shapes = [
    shape.rect(0, 0, 1240, h, F, 40),
    shape.rect(60, qy - PAD - 40, 1120, QR + 2 * PAD + 80, AC, 60, {
      x: 72,
      y: qy - PAD - 28,
      width: 1096,
      height: QR + 2 * PAD + 56,
      radius: 50,
    }),
  ];
  if (o.m) shapes.push(...mot(o, o.m, 620, 150, 150, AC, T));
  const labels = [cta(o, [100, pb + 60, 1040, 180], F, AC)];
  return { w: 1240, h, qr: qrAt(120, qy), shapes, labels };
}

/** Chalkboard: a dark slate in a wooden frame. */
export function chalkboard(o) {
  const head = o.note ? 260 : 100;
  const qy = head + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 300;
  const shapes = [
    shape.rect(0, 0, 1320, h, AC, 30),
    shape.rect(50, 50, 1220, h - 100, F, 10),
  ];
  const labels = [
    cta(o, [140, pb + 40, 1040, 170], F, T, { weight: "regular" }),
  ];
  labels[0].weight = "regular";
  labels.push(...note(o, [140, 90, 1040, 120], F, T));
  if (o.m) shapes.push(...mot(o, o.m, 1170, pb + 120, 0));
  return { w: 1320, h, qr: qrAt(160, qy), shapes, labels };
}

/** Header circle: a round badge with a motif on the card's top edge. */
export function circleTop(o) {
  const cr = 150;
  const cardY = cr;
  const qy = cardY + cr + 40 + PAD;
  const pb = qy + QR + PAD;
  const h = pb + (o.note ? 330 : 260);
  const shapes = [
    shape.rect(0, cardY, 1240, h - cardY, F, 64),
    shape.circle(620, cr, cr, F),
    shape.circle(620, cr, cr - 30, BG),
  ];
  shapes.push(...mot(o, o.m ?? "star5", 620, cr, 140, F, AC));
  const labels = [cta(o, [100, pb + 40, 1040, 170], F, T)];
  labels.push(...note(o, [140, pb + 210, 960, 90], F, T));
  return { w: 1240, h, qr: qrAt(120, qy), shapes, labels };
}

/** A bold side bar and left-aligned text: modern, editorial. */
export function sideBar(o) {
  const qy = 60 + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 400;
  const bg = o.tintBg ? tint(0.92) : BG;
  const shapes = [
    shape.rect(0, 0, 1300, h, bg, 0),
    shape.rect(0, 0, 40, h, AC),
    shape.rect(0, 0, 1300, h, tint(0.82), 0, {
      x: 0,
      y: 8,
      width: 1292,
      height: h - 16,
    }),
  ];
  const labels = [cta(o, [180, pb + 50, 1000, 170], bg, F, { align: "start" })];
  labels.push(...note(o, [180, pb + 230, 1000, 90], bg, F, { align: "start" }));
  if (o.m) shapes.push(...mot(o, o.m, 1130, pb + 170, 150));
  return { w: 1300, h, qr: qrAt(180, qy), shapes, labels };
}

/** Bands over and under the code. */
export function twoBands(o) {
  const band = 230;
  const qy = band + 40 + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 40 + band;
  const shapes = [
    shape.rect(0, 0, 1240, h, BG, 56),
    shape.rect(0, 0, 1240, h, F, 56, {
      x: 20,
      y: 0,
      width: 1200,
      height: h,
      radius: 0,
    }),
    shape.rect(0, 0, 1240, band, AC, 56),
    shape.rect(0, band - 56, 1240, 56, AC),
    shape.rect(0, h - band, 1240, band, F, 56),
    shape.rect(0, h - band, 1240, 56, F),
  ];
  const labels = [cta(o, [100, h - band + 30, 1040, band - 60], F, T)];
  labels.push(...note(o, [100, 50, 1040, band - 100], AC, o.noteInk ?? T));
  if (o.m) shapes.push(...mot(o, o.m, 140, band / 2, 0));
  return { w: 1240, h, qr: qrAt(120, qy), shapes, labels };
}

/** Bunting: a string of pennants across the top. */
export function bunting(o) {
  const w = 1320;
  const top = 320;
  const qy = top + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 300;
  const shapes = [shape.rect(0, 0, w, h, tint(0.92), 48)];
  const n = 9;
  const sag = 50;
  const y0 = 50;
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    return [40 + (w - 80) * t, y0 + Math.sin(Math.PI * t) * sag];
  });
  shapes.push(
    shape.path(
      strokeLine(
        quad([20, y0 - 10], [w / 2, y0 + 2 * sag], [w - 20, y0 - 10], 30),
        6
      ),
      F
    )
  );
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    shapes.push(
      shape.poly(
        [
          [ax + 8, ay],
          [bx - 8, by],
          [(ax + bx) / 2, (ay + by) / 2 + 110],
        ],
        i % 2 === 0 ? F : AC
      )
    );
  }
  const labels = [cta(o, [140, pb + 50, w - 280, 170], tint(0.92), F)];
  labels.push(...note(o, [140, 220, w - 280, 0.1], tint(0.92), F));
  return {
    w,
    h,
    qr: qrAt(160, qy),
    shapes,
    labels: labels.filter((l) => l.box.height > 1),
  };
}

/** Starburst sticker over the corner: sales and launches. */
export function burstCorner(o) {
  const w = 1300;
  const qy = 520;
  const pb = qy + QR + PAD;
  const h = pb + 280;
  const shapes = [
    shape.rect(0, 160, w - 100, h - 160, F, 56),
    shape.circle(w - 270, 260, 262, BG),
    shape.poly(starPoints(w - 270, 260, 248, 214, 24), AC),
  ];
  const labels = [cta(o, [100, pb + 40, w - 300, 170], F, T)];
  labels.push(
    text("note", "secondary", o.note ?? "", [w - 440, 190, 340, 140], {
      color: o.burstInk ?? T,
      on: AC,
    })
  );
  return { w, h, qr: qrAt(100, qy), shapes, labels };
}

/** Price tag: a pointed top with an eyelet. */
export function priceTag(o) {
  const w = 1240;
  const top = 420;
  const qy = top + 20 + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 280;
  const p = path()
    .poly([
      [w / 2, 0],
      [w, 300],
      [w, h - 50],
      [w - 50, h],
      [50, h],
      [0, h - 50],
      [0, 300],
    ])
    .circle(w / 2, 230, 56, true);
  const fill = o.light ? tint(0.88) : F;
  const shapes = [shape.path(p, fill, "evenodd")];
  shapes.push(shape.circle(w / 2, 230, 86, o.light ? F : tint(0.3), 60));
  const labels = [cta(o, [100, pb + 40, w - 200, 170], fill)];
  return { w, h, qr: qrAt(120, qy), shapes, labels };
}

/** Coupon: dashed cut line around, scissors on the edge. */
export function coupon(o) {
  const w = 1320;
  const qy = (o.note ? 300 : 160) + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 300;
  const shapes = [shape.rect(0, 0, w, h, tint(0.9), 30)];
  const inset = 64;
  for (const [x1, y1, x2, y2] of [
    [inset, inset, w - inset, inset],
    [w - inset, inset, w - inset, h - inset],
    [w - inset, h - inset, inset, h - inset],
    [inset, h - inset, inset, inset],
  ]) {
    shapes.push(shape.line(x1, y1, x2, y2, 8, F, { dash: [30, 20] }));
  }
  shapes.push(shape.rect(170, 20, 150, 88, tint(0.9)));
  shapes.push(...motif("scissors", 245, 64, 100, F, F, { rot: 90 }));
  const labels = [cta(o, [140, pb + 40, w - 280, 170], tint(0.9))];
  labels.push(...note(o, [140, 120, w - 280, 140], tint(0.9), F));
  return { w, h, qr: qrAt(160, qy), shapes, labels };
}

/** Hanging sign: chains from a bracket. */
export function hangingSign(o) {
  const w = 1320;
  const top = 320;
  const qy = top + 60 + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 280;
  const shapes = [
    shape.rect(0, 0, w, 40, mix(F, "#000000", 0.3), 20),
    shape.line(260, 20, 260, top + 20, 14, mix(F, BG, 0.4), { dash: [26, 10] }),
    shape.line(w - 260, 20, w - 260, top + 20, 14, mix(F, BG, 0.4), {
      dash: [26, 10],
    }),
    shape.rect(40, top, w - 80, h - top, F, 40),
    shape.circle(260, top + 40, 16, BG),
    shape.circle(w - 260, top + 40, 16, BG),
  ];
  const labels = [cta(o, [140, pb + 40, w - 280, 170], F, T)];
  return { w, h, qr: qrAt(160, qy), shapes, labels };
}

/** Coffee cup: a lid on top, a sleeve with the call to action. */
export function cupShape(o) {
  const w = 1400;
  const lid = 260;
  const qy = lid + 80 + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 330;
  const shapes = [
    shape.rect(60, 70, w - 120, 110, mix(F, "#000000", 0.3), 40),
    shape.rect(20, 160, w - 40, 110, mix(F, "#000000", 0.3), 30),
    shape.poly(
      [
        [40, lid],
        [w - 40, lid],
        [w - 120, h],
        [120, h],
      ],
      F
    ),
    shape.poly(
      [
        [44 + (pb + 20 - lid) * 0.03, pb + 20],
        [w - 44 - (pb + 20 - lid) * 0.03, pb + 20],
        [w - 100, h - 60],
        [100, h - 60],
      ],
      AC
    ),
  ];
  const labels = [cta(o, [220, pb + 50, w - 440, 170], AC, o.sleeveInk ?? T)];
  return { w, h, qr: qrAt(200, qy), shapes, labels };
}

/** Layered hills under the code and a sun or moon over it: seasons. */
export function scene(o) {
  const w = 1240;
  const head = 330;
  const qy = head + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 330;
  const shapes = [shape.rect(0, 0, w, h, o.sky ?? tint(0.88), 56)];
  shapes.push(
    ...mot(
      o,
      o.m ?? "sun",
      o.mx ?? 930,
      170,
      190,
      o.mfill ?? AC,
      o.mfill2 ?? AC
    )
  );
  const hill1 = path()
    .M(0, pb - 160)
    .C(300, pb - 300, 600, pb - 60, w, pb - 220)
    .L(w, h - 56)
    .Q(w, h, w - 56, h)
    .L(56, h)
    .Q(0, h, 0, h - 56)
    .Z();
  const hill2 = path()
    .M(0, pb + 40)
    .C(380, pb - 70, 820, pb + 120, w, pb - 10)
    .L(w, h - 56)
    .Q(w, h, w - 56, h)
    .L(56, h)
    .Q(0, h, 0, h - 56)
    .Z();
  shapes.push(
    shape.path(hill1, o.hill1 ?? mix(F, BG, 0.45)),
    shape.path(hill2, F)
  );
  const labels = [cta(o, [100, pb + 110, w - 200, 170], F, T)];
  const left = o.mx !== undefined && o.mx < 600;
  labels.push(
    ...note(
      o,
      left ? [420, 120, 720, 110] : [100, 120, 640, 110],
      o.sky ?? tint(0.88),
      o.skyInk ?? F,
      { align: left ? "end" : "start" }
    )
  );
  return { w, h, qr: qrAt(120, qy), shapes, labels };
}

/** A city skyline along the bottom. */
export function skyline(o) {
  const w = 1240;
  const qy = (o.note ? 220 : 80) + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 420;
  const shapes = [shape.rect(0, 0, w, h, o.dark ? F : tint(0.9), 56)];
  const ink = o.dark ? T : F;
  const base = h - 220;
  const blocks = [
    [0, 140],
    [90, 230],
    [190, 180],
    [280, 300],
    [360, 210],
    [450, 260],
    [540, 170],
    [620, 330],
    [700, 220],
    [800, 280],
    [890, 190],
    [980, 250],
    [1070, 160],
    [1150, 210],
    [1240, 0],
  ];
  const pts = [
    [0, h - 56],
    [0, base],
  ];
  for (let i = 0; i < blocks.length - 1; i++) {
    const [x, ht] = blocks[i];
    const [nx] = blocks[i + 1];
    pts.push([x, base - ht + 120], [nx, base - ht + 120]);
  }
  pts.push([w, base], [w, h - 56]);
  const city = path().poly(pts);
  shapes.push(shape.path(city, o.dark ? mix(F, BG, 0.25) : mix(F, BG, 0.6)));
  shapes.push(
    shape.rect(
      0,
      base + 20,
      w,
      h - base - 20,
      o.dark ? mix(F, BG, 0.25) : mix(F, BG, 0.6),
      56
    ),
    shape.rect(0, base + 20, w, 60, o.dark ? mix(F, BG, 0.25) : mix(F, BG, 0.6))
  );
  const labels = [
    cta(
      o,
      [100, base + 30, w - 200, 170],
      o.dark ? mix(F, BG, 0.25) : mix(F, BG, 0.6),
      o.dark ? T : F
    ),
  ];
  labels.push(...note(o, [100, 60, w - 200, 110], o.dark ? F : tint(0.9), ink));
  if (o.m) shapes.push(...mot(o, o.m, 1080, base - 270, 0));
  return { w, h, qr: qrAt(120, qy), shapes, labels };
}

/** Geometric corners: two shapes in the corners, modern seasonal. */
export function geoCorners(o) {
  const w = 1240;
  const qy = (o.note ? 260 : 120) + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 300;
  const bg = o.tintBg ? tint(0.92) : BG;
  const shapes = [shape.rect(0, 0, w, h, bg, 48)];
  shapes.push(
    shape.path(
      path().M(0, 48).Q(0, 0, 48, 0).L(420, 0).A(420, 420, 0, 0, 1, 0, 420).Z(),
      AC
    )
  );
  shapes.push(
    shape.poly(
      [
        [w, h - 460],
        [w, h - 48],
        [w - 48, h],
        [w - 460, h],
      ],
      F
    )
  );
  shapes.push(
    shape.rect(0, 0, w, h, F, 48, {
      x: 14,
      y: 14,
      width: w - 28,
      height: h - 28,
      radius: 38,
    })
  );
  const labels = [
    cta(o, [100, pb + 50, w - 380, 170], bg, F, { align: "start" }),
  ];
  labels.push(...note(o, [460, 90, w - 560, 110], bg, F, { align: "end" }));
  return { w, h, qr: qrAt(120, qy), shapes, labels };
}

/** A wavy band under the code: summer, water, travel. */
export function waveBand(o) {
  const w = 1240;
  const qy = (o.m || o.note ? 280 : 100) + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 330;
  const shapes = [shape.rect(0, 0, w, h, tint(0.9), 56)];
  const wy = pb - 30;
  const wave = path().M(0, wy);
  for (let i = 0; i < 4; i++) {
    const x = (w / 4) * i;
    wave
      .C(x + w / 16, wy - 50, x + (3 * w) / 16, wy - 50, x + w / 8, wy)
      .C(
        x + (5 * w) / 32 + 20,
        wy + 50,
        x + (7 * w) / 32,
        wy + 50,
        x + w / 4,
        wy
      );
  }
  wave
    .L(w, h - 56)
    .Q(w, h, w - 56, h)
    .L(56, h)
    .Q(0, h, 0, h - 56)
    .Z();
  shapes.push(shape.path(wave, F));
  const labels = [cta(o, [100, pb + 100, w - 200, 170], F, T)];
  if (o.m) {
    shapes.push(
      ...mot(o, o.m, 620, o.note ? 110 : 150, o.note ? 120 : 160, AC, F)
    );
    labels.push(...note(o, [140, 190, 960, 90], tint(0.9), F));
  } else labels.push(...note(o, [140, 110, 960, 110], tint(0.9), F));
  return { w, h, qr: qrAt(120, qy), shapes, labels };
}

/** A half-circle behind the top of the code: sunrise, moon, globe. */
export function halfCircle(o) {
  const w = 1240;
  const qy = 420;
  const pb = qy + QR + PAD;
  const h = pb + 300;
  const shapes = [
    shape.rect(0, 0, w, h, o.dark ? F : tint(0.9), 56),
    shape.circle(w / 2, 560, 520, AC),
  ];
  const ink = o.dark ? T : F;
  const labels = [
    cta(o, [100, pb + 50, w - 200, 170], o.dark ? F : tint(0.9), ink),
  ];
  if (o.m) shapes.push(...mot(o, o.m, w / 2, 160, 0));
  return { w, h, qr: qrAt(120, qy), shapes, labels };
}

/** Rounded frame with stitched dashes inside: craft, kids, packaging. */
export function stitched(o) {
  const w = 1240;
  const head = o.m ? 310 : o.note ? 210 : 80;
  const qy = head + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 280;
  const fill = o.light ? tint(0.92) : F;
  const ink = o.light ? F : T;
  const shapes = [shape.rect(0, 0, w, h, fill, 80)];
  const i = 36;
  const rr = 50;
  for (const [x1, y1, x2, y2] of [
    [i + rr, i, w - i - rr, i],
    [w - i, i + rr, w - i, h - i - rr],
    [w - i - rr, h - i, i + rr, h - i],
    [i, h - i - rr, i, i + rr],
  ]) {
    shapes.push(
      shape.line(x1, y1, x2, y2, 8, o.light ? F : mix(F, BG, 0.5), {
        dash: [26, 18],
        cap: "round",
      })
    );
  }
  const labels = [cta(o, [100, pb + 40, w - 200, 170], fill, ink)];
  if (o.m) {
    shapes.push(...mot(o, o.m, 620, 120, 120, ink, AC));
    labels.push(...note(o, [140, 190, 960, 96], fill, ink));
  } else labels.push(...note(o, [140, 70, 960, 110], fill, ink));
  return { w, h, qr: qrAt(120, qy), shapes, labels };
}

/** Boarding pass: header band with a plane, perforated stub. */
export function boardingPass(o) {
  const w = 2000;
  const h = 1240;
  const shapes = [
    shape.rect(0, 0, w, h, tint(0.9), 60),
    shape.rect(0, 0, w, 220, F, 60),
    shape.rect(0, 160, w, 60, F),
  ];
  shapes.push(...motif(o.m ?? "plane", 140, 110, 120, T, T, { rot: 90 }));
  shapes.push(shape.line(1100, 290, 1100, h - 60, 8, F, { dash: [26, 18] }));
  const labels = [
    text("note", "secondary", o.note ?? "Boarding pass", [240, 45, 1000, 130], {
      color: T,
      on: F,
      weight: "regular",
      align: "start",
    }),
  ];
  labels.unshift(
    cta(o, [1180, 760, 760, 170], tint(0.9), F, { align: "start" })
  );
  shapes.push(...motif(o.m2 ?? "suitcase", 1300, 520, 220, F, AC));
  return {
    w,
    h,
    qr: { x: 150, y: 330, size: 800, padding: 64, radius: 19.2 },
    shapes,
    labels,
  };
}

/** Flag colors in a band over the code, the call to action under it. */
export function flagBand(o) {
  const band = 300;
  const qy = band + 40 + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 260;
  const shapes = [
    shape.rect(0, 0, 1240, h, F, 56),
    shape.rect(24, 24, 1192, band - 24, BG, 36),
  ];
  const stripes = o.stripes;
  if (o.vertical) {
    const sw = 1192 / stripes.length;
    stripes.forEach((paint, i) => {
      shapes.push(
        shape.rect(
          24 + i * sw,
          24,
          sw + (i < stripes.length - 1 ? 1 : 0),
          band - 24,
          paint,
          0
        )
      );
    });
  } else {
    const sh = (band - 24) / stripes.length;
    stripes.forEach((paint, i) => {
      shapes.push(
        shape.rect(
          24,
          24 + i * sh,
          1192,
          sh + (i < stripes.length - 1 ? 1 : 0),
          paint,
          0
        )
      );
    });
  }
  // Round the band's outer corners back off with frame-colored corner pieces
  for (const [x, y, sx] of [
    [24, 24, 1],
    [1216, 24, -1],
  ]) {
    shapes.push(
      shape.path(
        path()
          .M(x, y)
          .L(x + 36 * sx, y)
          .A(36, 36, 0, 0, sx > 0 ? 0 : 1, x, y + 36)
          .Z(),
        F
      )
    );
  }
  if (o.m) {
    if (o.disc)
      shapes.push(shape.circle(620, 24 + (band - 24) / 2, 118, o.disc));
    shapes.push(
      ...mot(
        o,
        o.m,
        620,
        24 + (band - 24) / 2,
        o.msize ?? 190,
        o.mfill ?? F,
        o.mfill2 ?? AC
      )
    );
  }
  const labels = [cta(o, [100, pb + 30, 1040, 180], F, T)];
  return { w: 1240, h, qr: qrAt(120, qy), shapes, labels };
}

/** Plain: the code on a solid tile with the label inside, compact. */
export function compact(o) {
  const qy = 40 + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 220;
  const shapes = [shape.rect(0, 0, 1240, h, F, o.square ? 0 : 48)];
  const labels = [cta(o, [80, pb + 20, 1080, 170], F, T)];
  return { w: 1240, h, qr: qrAt(120, qy), shapes, labels };
}

/** Circle frame around a square code (round sticker), labels in the ring. */
export function roundSticker(o) {
  return seal({ ...o, edge: o.edge ?? "plain" });
}

/** The code inside a jar or bottle label with convex edges. */
export function jarLabel(o) {
  const w = 2000;
  const h = 1400;
  const bulge = 100;
  const p = path()
    .M(0, bulge)
    .Q(w / 2, 0, w, bulge)
    .L(w, h - bulge)
    .Q(w / 2, h, 0, h - bulge)
    .Z();
  const fill = o.light ? tint(0.88) : F;
  const ink = o.light ? F : T;
  const shapes = [shape.path(p, fill)];
  shapes.push(
    shape.path(
      path()
        .M(40, bulge + 50)
        .Q(w / 2, 50, w - 40, bulge + 50)
        .L(w - 40, bulge + 62)
        .Q(w / 2, 62, 40, bulge + 62)
        .Z(),
      o.light ? F : mix(F, BG, 0.5)
    )
  );
  shapes.push(
    shape.path(
      path()
        .M(40, h - bulge - 62)
        .Q(w / 2, h - 62, w - 40, h - bulge - 62)
        .L(w - 40, h - bulge - 50)
        .Q(w / 2, h - 50, 40, h - bulge - 50)
        .Z(),
      o.light ? F : mix(F, BG, 0.5)
    )
  );
  const tx = 1110;
  const labels = [cta(o, [tx, 640, 800, 170], fill, ink, { align: "start" })];
  labels.push(...note(o, [tx, 830, 800, 100], fill, ink, { align: "start" }));
  if (o.m) shapes.push(...mot(o, o.m, tx + 100, 470, 180, ink, AC));
  return {
    w,
    h,
    qr: { x: 200, y: 300, size: 800, padding: 64, radius: 19.2 },
    shapes,
    labels,
  };
}
