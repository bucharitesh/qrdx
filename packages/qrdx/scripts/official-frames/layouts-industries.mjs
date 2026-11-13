// Layouts for the industry and use-case frames (catalogue-industries.mjs),
// with the same conventions as layouts.mjs: each takes options and returns
// { w, h, qr, shapes, labels }, the code is 1000 wide (800 in landscape
// layouts), and the plate around it is the engine's. layouts.mjs re-exports
// these, so build.mjs finds them by name.
//
// Options: cta, note and m as in layouts.mjs, plus each layout's own below.
import { bezier, mix, path, shape, strokeLine, text } from "./lib.mjs";
import { motif } from "./motifs.mjs";

const F = "frame";
const T = "text";
const AC = "accent";
const BG = "background";
const tint = (n) => mix(F, BG, n);
const shade = (n) => mix(F, "#000000", n);

const QR = 1000;
const PAD = 80;
const qrAt = (x, y) => ({ x, y, size: QR, padding: PAD, radius: 24 });
const wideQr = (x, y) => ({ x, y, size: 800, padding: 64, radius: 19.2 });

const isLight = (paint) =>
  paint === BG ||
  (typeof paint === "object" && paint.mix?.[1] === BG && paint.amount >= 0.6);
const ink = (on) => (isLight(on) ? F : T);

const mot = (o, cx, cy, size, fill, fill2 = AC) =>
  o.m ? motif(o.m, cx, cy, size, fill, fill2) : [];
const cta = (o, box, on, extra = {}) =>
  text("cta", "primary", o.cta, box, { color: ink(on), on, ...extra });
const note = (o, box, on, extra = {}) =>
  o.note === undefined || o.note === null
    ? []
    : [
        text("note", "secondary", o.note, box, {
          color: ink(on),
          on,
          weight: "regular",
          ...extra,
        }),
      ];

// ── Signs ───────────────────────────────────────────────────────────────────

/**
 * A yard sign: a panel hanging from the arm of a post, and a rider under it
 * for the note. light: a light panel with a solid border.
 */
export function yardSign(o) {
  const w = 1500;
  const px = 230;
  const py = 190;
  const head = o.m ? 300 : 70;
  const qy = py + head + PAD;
  const pb = qy + QR + PAD;
  const panelH = pb - py + 280;
  const riderY = py + panelH + 70;
  const h = o.note ? riderY + 200 : py + panelH + 40;
  const fill = o.light ? tint(0.9) : F;
  const shapes = [
    shape.rect(40, 0, 70, h, shade(0.25), 8),
    shape.rect(40, 30, w - 40, 70, shade(0.25), 12),
  ];
  for (const x of [px + 180, w - 180]) {
    shapes.push(shape.rect(x - 8, 96, 16, py - 90, tint(0.45), 6));
    if (o.note) {
      shapes.push(
        shape.rect(
          x - 8,
          py + panelH - 10,
          16,
          riderY - py - panelH + 20,
          tint(0.45),
          6
        )
      );
    }
  }
  shapes.push(shape.rect(px, py, w - px, panelH, F, 28));
  if (o.light) {
    shapes.push(
      shape.rect(px + 24, py + 24, w - px - 48, panelH - 48, fill, 14)
    );
  }
  shapes.push(...mot(o, px + (w - px) / 2, py + 190, 170, ink(fill)));
  const labels = [cta(o, [px + 70, pb + 50, w - px - 140, 180], fill)];
  if (o.note) {
    shapes.push(shape.rect(px + 120, riderY, w - px - 240, 170, AC, 20));
    labels.push(
      ...note(o, [px + 170, riderY + 20, w - px - 340, 130], AC, {
        weight: "bold",
      })
    );
  }
  return { w, h, qr: qrAt(px + (w - px - QR) / 2, qy), shapes, labels };
}

/** A sign on two posts, with a round badge for the motif on top. */
export function postSign(o) {
  const w = 1240;
  const head = 320;
  const qy = head + PAD;
  const pb = qy + QR + PAD;
  const signH = pb + 260;
  const h = signH + 200;
  const fill = o.light ? tint(0.9) : F;
  const shapes = [
    shape.rect(250, signH - 20, 56, h - signH + 20, shade(0.25)),
    shape.rect(w - 306, signH - 20, 56, h - signH + 20, shade(0.25)),
    shape.rect(0, 0, w, signH, F, 48),
  ];
  if (o.light) shapes.push(shape.rect(26, 26, w - 52, signH - 52, fill, 28));
  shapes.push(shape.circle(620, 170, 125, o.light ? F : BG));
  shapes.push(
    ...mot(o, 620, 170, 150, o.light ? BG : F, o.light ? tint(0.5) : AC)
  );
  const labels = [cta(o, [90, pb + 40, w - 180, 180], fill)];
  return { w, h, qr: qrAt(120, qy), shapes, labels };
}

/** A sidewalk A-frame board: a wood frame, a handle slot and splayed feet. */
export function sandwichBoard(o) {
  const w = 1600;
  const top = 170;
  const head = o.m || o.note ? 200 : 40;
  const qy = top + head + PAD;
  const pb = qy + QR + PAD;
  const boardH = pb + 300;
  const h = boardH + 120;
  const lean = 100;
  const frame = path()
    .poly([
      [lean, 0],
      [w - lean, 0],
      [w, boardH],
      [w - 170, boardH],
      [w - 150, h],
      [w - 260, h],
      [w - 280, boardH],
      [280, boardH],
      [260, h],
      [150, h],
      [170, boardH],
      [0, boardH],
    ])
    .rrect(w / 2 - 150, 50, 300, 80, 40, true);
  const edge = (y) => lean * (1 - y / boardH) + 80;
  const inner = path().poly([
    [edge(top - 30), top - 30],
    [w - edge(top - 30), top - 30],
    [w - edge(boardH - 70), boardH - 70],
    [edge(boardH - 70), boardH - 70],
  ]);
  const fill = o.light ? tint(0.9) : shade(0.15);
  const shapes = [shape.path(frame, F, "evenodd"), shape.path(inner, fill)];
  const labels = [cta(o, [220, pb + 40, w - 440, 180], fill)];
  if (o.m && o.note) {
    shapes.push(...mot(o, 330, top + 90, 140, ink(fill)));
    labels.push(
      ...note(o, [440, top + 30, w - 700, 120], fill, { align: "start" })
    );
  } else if (o.m) {
    shapes.push(...mot(o, w / 2, top + 90, 150, ink(fill)));
  } else {
    labels.push(...note(o, [260, top + 30, w - 520, 120], fill));
  }
  return { w, h, qr: qrAt(300, qy), shapes, labels };
}

/** A shelf strip carrying the note, with a card hanging under it. */
export function shelfTalker(o) {
  const w = 1500;
  const strip = 150;
  const cardY = strip + 70;
  const head = o.m ? 240 : 60;
  const qy = cardY + head + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 280;
  const fill = o.light ? tint(0.9) : F;
  const shapes = [
    shape.rect(0, 0, w, strip, AC, 16),
    shape.rect(w / 2 - 70, strip - 10, 140, cardY - strip + 30, tint(0.55), 8),
    shape.rect(130, cardY, w - 260, h - cardY, F, 44),
  ];
  if (o.light)
    shapes.push(shape.rect(150, cardY + 20, w - 300, h - cardY - 40, fill, 28));
  shapes.push(...mot(o, w / 2, cardY + 140, 150, ink(fill)));
  const labels = [cta(o, [200, pb + 40, w - 400, 180], fill)];
  labels.push(...note(o, [120, 20, w - 240, 110], AC, { weight: "bold" }));
  return { w, h, qr: qrAt(250, qy), shapes, labels };
}

/** A clipboard: a board with a clip, and the code on its sheet of paper. */
export function clipboard(o) {
  const w = 1320;
  const paperY = 200;
  const head = o.note || o.m ? 200 : 70;
  const qy = paperY + head + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 330;
  const clip = path().rrect(430, 20, 460, 170, 40).circle(660, 85, 34, true);
  const shapes = [
    shape.rect(0, 90, w, h - 90, o.light ? tint(0.55) : F, 56),
    shape.rect(60, paperY, w - 120, h - paperY - 60, BG, 12),
    shape.rect(60, paperY, w - 120, 14, tint(0.75)),
    shape.path(clip, shade(0.3)),
  ];
  const labels = [cta(o, [140, pb + 40, w - 280, 170], BG)];
  if (o.m && o.note) {
    shapes.push(...mot(o, 230, paperY + 115, 120, F));
    labels.push(
      ...note(o, [330, paperY + 60, w - 490, 110], BG, {
        weight: "bold",
        align: "start",
      })
    );
  } else if (o.m) {
    shapes.push(...mot(o, w / 2, paperY + 115, 130, F));
  } else {
    labels.push(
      ...note(o, [160, paperY + 60, w - 320, 110], BG, { weight: "bold" })
    );
  }
  if (o.note || o.m)
    shapes.push(shape.rect(160, paperY + 192, w - 320, 8, tint(0.7), 4));
  return { w, h, qr: qrAt(160, qy), shapes, labels };
}

// ── Objects ─────────────────────────────────────────────────────────────────

/** A team shirt, the code on its chest and the label under it. */
export function jersey(o) {
  const w = 1800;
  const qy = 330 + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 300;
  const shirt = path().poly([
    [690, 0],
    [1110, 0],
    [1550, 130],
    [1800, 470],
    [1580, 640],
    [1530, 560],
    [1530, h],
    [270, h],
    [270, 560],
    [220, 640],
    [0, 470],
    [250, 130],
  ]);
  const collar = path()
    .M(690, 0)
    .Q(900, 220, 1110, 0)
    .L(1040, 0)
    .Q(900, 140, 760, 0)
    .Z();
  const fill = o.light ? tint(0.9) : F;
  const shapes = [shape.path(shirt, F)];
  if (o.light) {
    shapes.push(
      shape.path(
        path().poly([
          [300, 600],
          [1500, 600],
          [1500, h - 30],
          [300, h - 30],
        ]),
        fill
      )
    );
  }
  shapes.push(shape.path(path().M(690, 0).Q(900, 220, 1110, 0).Z(), BG));
  shapes.push(shape.path(collar, AC));
  // Cuffs: bands along each sleeve's end, 70 deep along its two edges
  const toward = (from, to, d) => {
    const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
    return [
      from[0] + ((to[0] - from[0]) * d) / len,
      from[1] + ((to[1] - from[1]) * d) / len,
    ];
  };
  for (const [a, b, shoulder, pit] of [
    [
      [0, 470],
      [220, 640],
      [250, 130],
      [270, 560],
    ],
    [
      [1800, 470],
      [1580, 640],
      [1550, 130],
      [1530, 560],
    ],
  ]) {
    shapes.push(
      shape.poly([a, b, toward(b, pit, 70), toward(a, shoulder, 70)], AC)
    );
  }
  const labels = [cta(o, [340, pb + 50, 1120, 190], fill)];
  return { w, h, qr: qrAt(400, qy), shapes, labels };
}

/** A vinyl banner with eyelets in its corners and ties going out. Wide. */
export function grommetBanner(o) {
  const w = 2000;
  const h = 1140;
  const fill = o.light ? tint(0.9) : F;
  const shapes = [];
  for (const [x, y, dx, dy] of [
    [110, 110, -1, -1],
    [w - 110, 110, 1, -1],
    [110, h - 110, -1, 1],
    [w - 110, h - 110, 1, 1],
  ]) {
    shapes.push(
      shape.path(
        strokeLine(
          [
            [x, y],
            [x + dx * 110, y + dy * 110],
          ],
          14,
          { round: true }
        ),
        tint(0.4)
      )
    );
  }
  shapes.push(shape.rect(40, 40, w - 80, h - 80, F, 14));
  if (o.light) shapes.push(shape.rect(66, 66, w - 132, h - 132, fill, 6));
  for (const [x, y] of [
    [110, 110],
    [w - 110, 110],
    [110, h - 110],
    [w - 110, h - 110],
  ]) {
    shapes.push(shape.circle(x, y, 30, o.light ? F : tint(0.55), 15));
  }
  const tx = 1110;
  const tw = w - tx - 170;
  const labels = [];
  let y = 400;
  if (o.m) {
    shapes.push(...mot(o, tx + 90, 300, 170, ink(fill)));
    y = 470;
  }
  labels.push(cta(o, [tx, y, tw, 190], fill, { align: "start" }));
  labels.push(...note(o, [tx, y + 210, tw, 100], fill, { align: "start" }));
  return { w, h, qr: wideQr(190, 170), shapes, labels };
}

/** A bone-shaped pet tag, standing up, with a ring hole at the top. */
export function petTag(o) {
  const bar = 1240;
  const lobe = 220;
  const w = bar + 2 * (lobe - 60);
  const x0 = (w - bar) / 2;
  const top = 230;
  const head = o.note ? 150 : 40;
  const qy = top + head + PAD;
  const pb = qy + QR + PAD;
  const barBottom = pb + 230;
  const h = barBottom + 200;
  const bone = path()
    .rrect(x0, top - 40, bar, barBottom - top + 80, 40)
    .circle(lobe, lobe, lobe)
    .circle(w - lobe, lobe, lobe)
    .circle(lobe, h - lobe, lobe)
    .circle(w - lobe, h - lobe, lobe);
  const fill = o.light ? tint(0.9) : F;
  const shapes = [shape.path(bone, F)];
  if (o.light) {
    shapes.push(shape.rect(x0 + 30, top, bar - 60, barBottom - top, fill, 30));
  }
  shapes.push(shape.circle(lobe - 40, lobe - 40, 45, BG));
  const labels = [cta(o, [x0 + 80, pb + 40, bar - 160, 180], fill)];
  labels.push(...note(o, [x0 + 120, top + 20, bar - 240, 110], fill));
  return { w, h, qr: qrAt(x0 + 120, qy), shapes, labels };
}

/** A collection jar: a lid with a coin slot, the code on its label. */
export function donationJar(o) {
  const w = 1440;
  const lidY = 100;
  const bodyY = 300;
  const labelY = bodyY + 80;
  const qy = labelY + 40 + PAD;
  const pb = qy + QR + PAD;
  const labelH = pb - labelY + 240;
  const h = labelY + labelH + 100;
  const jar = path()
    .M(220, bodyY)
    .L(w - 220, bodyY)
    .C(w - 100, bodyY, w - 40, bodyY + 60, w - 40, bodyY + 170)
    .L(w - 40, h - 90)
    .Q(w - 40, h, w - 130, h)
    .L(130, h)
    .Q(40, h, 40, h - 90)
    .L(40, bodyY + 170)
    .C(40, bodyY + 60, 100, bodyY, 220, bodyY)
    .Z();
  const lid = path()
    .rrect(200, lidY, w - 400, 160, 30)
    .rrect(w / 2 - 150, lidY + 60, 300, 40, 20, true);
  // A coin about to drop into the slot (or the motif, over it)
  const shapes = o.m
    ? motif(o.m, w / 2, 48, 90, AC, AC)
    : [shape.circle(w / 2, 46, 44, AC), shape.circle(w / 2, 46, 28, tint(0.6))];
  shapes.push(
    shape.path(jar, F),
    shape.rect(250, lidY + 140, w - 500, bodyY - lidY - 130, shade(0.3)),
    shape.path(lid, shade(0.3), "evenodd"),
    shape.rect(100, labelY, w - 200, labelH, o.light ? BG : tint(0.9), 30)
  );
  const labels = [
    cta(o, [160, pb + 40, w - 320, 170], o.light ? BG : tint(0.9)),
  ];
  return { w, h, qr: qrAt(220, qy), shapes, labels };
}

/** A charging post: the code on its face and a cable to a plug holster. */
export function evCharger(o) {
  const w = 1560;
  const body = 1240;
  const head = 300;
  const qy = head + PAD;
  const pb = qy + QR + PAD;
  const bodyH = pb + 270;
  const h = bodyH + 120;
  const shapes = [
    shape.path(
      strokeLine(
        bezier(
          [body + 70, 900],
          [body + 90, 1500],
          [w - 30, 1250],
          [body - 20, bodyH - 60],
          28
        ),
        40,
        {
          round: true,
        }
      ),
      shade(0.2)
    ),
    shape.rect(body - 40, 560, 220, 360, shade(0.2), 40),
    shape.rect(body + 40, 620, 80, 160, tint(0.5), 30),
    shape.rect(0, 0, body, bodyH, F, 90),
    shape.rect(0, bodyH - 20, body, h - bodyH + 20, shade(0.3), 24),
  ];
  shapes.push(...mot(o, 620, 160, 170, T));
  const labels = [cta(o, [90, pb + 40, body - 180, 180], F)];
  return { w, h, qr: qrAt(120, qy), shapes, labels };
}

// ── Cards ───────────────────────────────────────────────────────────────────

/** A card with its top corner folded down. light: a light card, solid fold. */
export function foldedCorner(o) {
  const w = 1240;
  const fold = 240;
  const head = o.m ? 330 : o.note ? 220 : 90;
  const qy = head + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 280;
  const fill = o.light ? tint(0.9) : F;
  const card = path().poly([
    [0, 0],
    [w - fold, 0],
    [w, fold],
    [w, h],
    [0, h],
  ]);
  const shapes = [shape.path(card, F)];
  if (o.light) {
    const k = 18;
    shapes.push(
      shape.path(
        path().poly([
          [k, k],
          [w - fold - k * 0.41, k],
          [w - k, fold + k * 0.41],
          [w - k, h - k],
          [k, h - k],
        ]),
        fill
      )
    );
  }
  shapes.push(
    shape.path(
      path().poly([
        [w - fold, 0],
        [w - fold, fold - 20],
        [w - fold + 20, fold],
        [w, fold],
      ]),
      o.light ? F : tint(0.6)
    )
  );
  const labels = [cta(o, [90, pb + 40, w - 180, 180], fill)];
  if (o.m) {
    shapes.push(...mot(o, 140, 150, 150, ink(fill)));
    labels.push(
      ...note(o, [260, 100, w - fold - 300, 100], fill, { align: "start" })
    );
  } else {
    labels.push(
      ...note(o, [100, 50, w - fold - 140, 110], fill, { align: "start" })
    );
  }
  return { w, h, qr: qrAt(120, qy), shapes, labels };
}

/** A card with two more stacked behind it, offset down and to the right. */
export function stackedCards(o) {
  const w = 1340;
  const cw = 1240;
  const head = o.m ? (o.note ? 320 : 240) : o.note ? 210 : 60;
  const qy = head + PAD;
  const pb = qy + QR + PAD;
  const ch = pb + 280;
  const h = ch + 100;
  const fill = o.light ? tint(0.92) : F;
  const shapes = [
    shape.rect(100, 100, cw, ch, tint(0.75), 48),
    shape.rect(50, 50, cw, ch, tint(0.45), 48),
    shape.rect(0, 0, cw, ch, F, 48),
  ];
  if (o.light) shapes.push(shape.rect(16, 16, cw - 32, ch - 32, fill, 34));
  shapes.push(...mot(o, cw / 2, 120, 140, ink(fill)));
  const labels = [cta(o, [90, pb + 40, cw - 180, 180], fill)];
  labels.push(
    ...note(o, [120, o.m ? 210 : 60, cw - 240, o.m ? 96 : 110], fill)
  );
  return { w, h, qr: qrAt(120, qy), shapes, labels };
}

/** A cloud-shaped bubble around the code, with two puffs trailing off. */
export function thoughtCloud(o) {
  const ox = 30;
  const w = 1600 + 2 * ox;
  const cy0 = 120;
  const qy = cy0 + 140 + PAD;
  const pb = qy + QR + PAD;
  const cloudBottom = pb + 300;
  const h = cloudBottom + 250;
  const cloud = (grow) => {
    const p = path().rrect(
      ox + 110 - grow,
      cy0 - grow,
      w - 2 * ox - 220 + 2 * grow,
      cloudBottom - cy0 + 2 * grow,
      120
    );
    const across = 6;
    for (let i = 0; i <= across; i++) {
      const x = ox + 150 + ((w - 2 * ox - 300) * i) / across;
      p.circle(x, cy0 + 20, 120 + grow).circle(x, cloudBottom - 20, 120 + grow);
    }
    const down = 6;
    for (let i = 1; i < down; i++) {
      const y = cy0 + ((cloudBottom - cy0) * i) / down;
      p.circle(ox + 120, y, 115 + grow).circle(w - ox - 120, y, 115 + grow);
    }
    return p;
  };
  const fill = o.light ? tint(0.9) : F;
  const shapes = o.light
    ? [shape.path(cloud(18), F), shape.path(cloud(0), fill)]
    : [shape.path(cloud(0), F)];
  shapes.push(shape.circle(ox + 300, cloudBottom + 150, 50, F));
  shapes.push(shape.circle(ox + 175, cloudBottom + 215, 28, F));
  const labels = [cta(o, [ox + 260, pb + 50, w - 2 * ox - 520, 180], fill)];
  return { w, h, qr: qrAt(ox + 300, qy), shapes, labels };
}

/** A big arrow pointing left at the code, the label in its shaft. Wide. */
export function sideArrow(o) {
  const w = 2000;
  const h = 1040;
  const ax = 1060;
  const arrow = path().poly([
    [ax, h / 2],
    [ax + 300, h / 2 - 330],
    [ax + 300, h / 2 - 170],
    [w - 40, h / 2 - 170],
    [w - 40, h / 2 + 170],
    [ax + 300, h / 2 + 170],
    [ax + 300, h / 2 + 330],
  ]);
  const shapes = [
    shape.rect(0, 0, ax - 20, h, o.light ? tint(0.9) : F, 60),
    shape.path(arrow, AC),
  ];
  const labels = [cta(o, [ax + 300, h / 2 - 120, w - ax - 380, 240], AC)];
  labels.push(
    ...note(o, [ax + 80, 70, w - ax - 120, 110], BG, { align: "start" })
  );
  return { w, h, qr: wideQr(120, 120), shapes, labels };
}
