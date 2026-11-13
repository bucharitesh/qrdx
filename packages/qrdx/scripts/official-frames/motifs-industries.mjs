// Motifs for the industry and use-case frames (catalogue-industries.mjs):
// food, shops, health and learning, business, real estate, sports, cars,
// beauty and nonprofits. Same conventions as motifs.mjs: a 100 × 100 box
// (centre 50, 50), part "a" in the motif's main color and "b" in its second.
//
// Every part is filled with the nonzero rule. solid() turns each outline
// clockwise and holes() counter-clockwise, so overlapping solids join and a
// hole cuts what it sits on. A hole must sit wholly inside what it cuts.
// Part "b" can be the same color as "a" or as the card behind it, so each
// motif reads from part "a" alone.
//
// motifs.mjs adds these to its own (a name used twice throws).
import {
  arcPoints,
  bezier,
  P,
  path,
  regular,
  ringArc,
  starPoints,
  strokeLine,
  transform,
} from "./lib.mjs";

const M = {};
const def = (name, fn) => {
  if (M[name]) throw new Error(`Motif ${name} defined twice`);
  M[name] = fn;
};

const A = (p) => ({ p, role: "a" });
const B = (p) => ({ p, role: "b" });
const parts = (...list) => list.filter(Boolean);

// ── Outline direction ───────────────────────────────────────────────────────

/** Splits commands into subpaths (each starts with M). */
function subpaths(cmds) {
  const out = [];
  for (const cmd of cmds) {
    if (cmd[0] === "M") out.push([cmd]);
    else out.at(-1)?.push(cmd);
  }
  return out;
}

/** Points along an SVG arc (endpoint form), for the area estimate. */
function arcSamples(from, [, rx, ry, rot, large, sweep, x, y]) {
  const phi = (rot * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (from[0] - x) / 2;
  const dy = (from[1] - y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  let a = Math.abs(rx);
  let b = Math.abs(ry);
  const scale = (x1 * x1) / (a * a) + (y1 * y1) / (b * b);
  if (scale > 1) {
    a *= Math.sqrt(scale);
    b *= Math.sqrt(scale);
  }
  const num = a * a * b * b - a * a * y1 * y1 - b * b * x1 * x1;
  const den = a * a * y1 * y1 + b * b * x1 * x1;
  const k =
    (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / (den || 1)));
  const cx1 = (k * a * y1) / b;
  const cy1 = (-k * b * x1) / a;
  const cx = cos * cx1 - sin * cy1 + (from[0] + x) / 2;
  const cy = sin * cx1 + cos * cy1 + (from[1] + y) / 2;
  const angle = (ux, uy, vx, vy) => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    const v = Math.acos(Math.min(1, Math.max(-1, dot / (len || 1))));
    return ux * vy - uy * vx < 0 ? -v : v;
  };
  const t1 = angle(1, 0, (x1 - cx1) / a, (y1 - cy1) / b);
  let dt = angle(
    (x1 - cx1) / a,
    (y1 - cy1) / b,
    (-x1 - cx1) / a,
    (-y1 - cy1) / b
  );
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const pts = [];
  for (let i = 1; i <= 8; i++) {
    const t = t1 + (dt * i) / 8;
    const ex = a * Math.cos(t);
    const ey = b * Math.sin(t);
    pts.push([cos * ex - sin * ey + cx, sin * ex + cos * ey + cy]);
  }
  return pts;
}

/** Signed area of a subpath (positive: clockwise on screen). */
function area(sub) {
  const pts = [];
  let cur = [sub[0][1], sub[0][2]];
  pts.push(cur);
  for (const cmd of sub.slice(1)) {
    if (cmd[0] === "Z") continue;
    if (cmd[0] === "A") pts.push(...arcSamples(cur, cmd));
    else if (cmd[0] === "C")
      pts.push(
        ...bezier(
          cur,
          [cmd[1], cmd[2]],
          [cmd[3], cmd[4]],
          [cmd[5], cmd[6]],
          8
        ).slice(1)
      );
    else if (cmd[0] === "Q") pts.push([cmd[1], cmd[2]], [cmd[3], cmd[4]]);
    else pts.push([cmd[1], cmd[2]]);
    cur = cmd.slice(-2);
  }
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    s += p[0] * q[1] - q[0] * p[1];
  }
  return s / 2;
}

/** The subpath traced the other way round. */
function reverse(sub) {
  const closed = sub.at(-1)[0] === "Z";
  const segs = [];
  let cur = [sub[0][1], sub[0][2]];
  for (const cmd of sub.slice(1)) {
    if (cmd[0] === "Z") continue;
    segs.push({ cmd, from: cur });
    cur = cmd.slice(-2);
  }
  const out = [["M", ...cur]];
  for (const { cmd, from } of segs.reverse()) {
    if (cmd[0] === "L") out.push(["L", ...from]);
    else if (cmd[0] === "C")
      out.push(["C", cmd[3], cmd[4], cmd[1], cmd[2], ...from]);
    else if (cmd[0] === "Q") out.push(["Q", cmd[1], cmd[2], ...from]);
    else if (cmd[0] === "A")
      out.push(["A", cmd[1], cmd[2], cmd[3], cmd[4], 1 - cmd[5], ...from]);
  }
  if (closed) out.push(["Z"]);
  return out;
}

const orient = (list, sign) => {
  const p = path();
  for (const item of list) {
    const cmds = item instanceof P ? item.c : item;
    for (const sub of subpaths(cmds)) {
      p.add(Math.sign(area(sub)) === sign ? sub : reverse(sub));
    }
  }
  return p;
};
/** Filled outlines (clockwise). */
const solid = (...list) => orient(list, 1);
/** Holes (counter-clockwise): cut whatever solid they sit inside. */
const holes = (...list) => orient(list, -1);
/** Paths drawn as they are, one after another. */
const join = (...list) => {
  const p = path();
  for (const item of list) p.add(item);
  return p;
};
/** Solids and holes as one path. */
const body = (fill, cut = []) => solid(...fill).add(holes(...cut));
/** A stroke, as a filled outline. */
const line = (points, width, round = true) =>
  strokeLine(points, width, { round });
/** Commands rotated `deg` about the box centre. */
const turn = (p, deg, cx = 50, cy = 50) =>
  new P().add(
    transform(p instanceof P ? p.c : p, {
      rot: deg,
      ox: cx,
      oy: cy,
      dx: cx,
      dy: cy,
    })
  );
/** A pointed leaf from a to b, `w` wide. */
function leaf(a, b, w) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const nx = (-dy / len) * w * 0.66;
  const ny = (dx / len) * w * 0.66;
  return path()
    .M(...a)
    .C(
      a[0] + dx * 0.2 + nx,
      a[1] + dy * 0.2 + ny,
      a[0] + dx * 0.65 + nx,
      a[1] + dy * 0.65 + ny,
      ...b
    )
    .C(
      a[0] + dx * 0.65 - nx,
      a[1] + dy * 0.65 - ny,
      a[0] + dx * 0.2 - nx,
      a[1] + dy * 0.2 - ny,
      ...a
    )
    .Z();
}
/** A drop, point up, `h` tall and `w` wide. */
function drop(cx, cy, h, w) {
  const top = cy - h / 2;
  const rr = w / 2;
  const by = cy + h / 2 - rr;
  return path()
    .M(cx, top)
    .C(cx + rr * 0.35, top + h * 0.3, cx + rr, by - rr * 0.6, cx + rr, by)
    .A(rr, rr, 0, 0, 1, cx - rr, by)
    .C(cx - rr, by - rr * 0.6, cx - rr * 0.35, top + h * 0.3, cx, top)
    .Z();
}
/** A heart `s` wide centred on (cx, cy). */
function heart(cx, cy, s) {
  const w = s / 2;
  const top = cy - s * 0.28;
  return path()
    .M(cx, cy + s * 0.42)
    .C(
      cx - w * 0.2,
      cy + s * 0.3,
      cx - w * 1.02,
      cy + s * 0.02,
      cx - w,
      top + s * 0.06
    )
    .C(
      cx - w * 0.98,
      top - s * 0.2,
      cx - w * 0.2,
      top - s * 0.24,
      cx,
      top + s * 0.02
    )
    .C(
      cx + w * 0.2,
      top - s * 0.24,
      cx + w * 0.98,
      top - s * 0.2,
      cx + w,
      top + s * 0.06
    )
    .C(
      cx + w * 1.02,
      cy + s * 0.02,
      cx + w * 0.2,
      cy + s * 0.3,
      cx,
      cy + s * 0.42
    )
    .Z();
}
const ring = (cx, cy, outer, inner) =>
  body([path().circle(cx, cy, outer)], [path().circle(cx, cy, inner)]);
/** A trapezoid between two y values, from a cone's left and right edges. */
const band = (left, right, y0, y1) =>
  path().poly([
    [left(y0), y0],
    [right(y0), y0],
    [right(y1), y1],
    [left(y1), y1],
  ]);

// ── Food and drink ──────────────────────────────────────────────────────────

def("burger", () => {
  const bun = path()
    .M(10, 40)
    .C(10, 19, 30, 10, 50, 10)
    .C(70, 10, 90, 19, 90, 40)
    .Z();
  const seeds = path();
  for (const [x, y] of [
    [34, 24],
    [50, 19],
    [66, 24],
    [42, 31],
    [58, 31],
  ])
    seeds.ellipse(x, y, 3.2, 1.9);
  const lettuce = path().M(8, 44).L(92, 44).L(92, 50);
  for (let i = 0; i < 7; i++) {
    const x = 92 - i * 12;
    lettuce.Q(x - 6, 57, x - 12, 50);
  }
  lettuce.Z();
  return parts(
    A(
      body(
        [
          bun,
          path().rrect(8, 58, 84, 13, 6.5),
          path().rrect(12, 75, 76, 15, 7.5),
        ],
        [seeds]
      )
    ),
    B(solid(lettuce))
  );
});

def("sushi", () => {
  const fish = path()
    .M(8, 48)
    .C(12, 24, 60, 16, 94, 34)
    .L(92, 44)
    .C(60, 38, 32, 42, 10, 56)
    .Z();
  const stripes = [
    line(
      [
        [28, 35],
        [33, 44],
      ],
      3.6
    ),
    line(
      [
        [48, 30],
        [53, 39],
      ],
      3.6
    ),
    line(
      [
        [67, 31],
        [71, 37],
      ],
      3.4
    ),
  ];
  return parts(A(body([path().rrect(14, 59, 72, 30, 15), fish], stripes)));
});

def("donut", () => {
  const icing = [];
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2;
    const rad = 35 + 3.5 * Math.sin(a * 9);
    icing.push([50 + Math.cos(a) * rad, 52 + Math.sin(a) * rad]);
  }
  const sprinkles = [];
  for (let i = 0; i < 8; i++) {
    const a = ((i * 45 + 12) * Math.PI) / 180;
    const cx = 50 + Math.cos(a) * 26;
    const cy = 52 + Math.sin(a) * 26;
    const t = a + (i % 2 ? 0.9 : -0.6);
    sprinkles.push(
      line(
        [
          [cx - Math.cos(t) * 3.5, cy - Math.sin(t) * 3.5],
          [cx + Math.cos(t) * 3.5, cy + Math.sin(t) * 3.5],
        ],
        3
      )
    );
  }
  return parts(
    A(
      body(
        [path().circle(50, 52, 44)],
        [path().circle(50, 52, 13), ...sprinkles]
      )
    ),
    B(body([path().poly(icing)], [path().circle(50, 52, 17), ...sprinkles]))
  );
});

def("cupcake", () => {
  const frosting = path()
    .circle(30, 50, 13)
    .circle(70, 50, 13)
    .circle(50, 44, 17)
    .ellipse(50, 28, 13, 11)
    .rrect(17, 47, 66, 11, 5.5);
  const wrapper = path().poly([
    [21, 62],
    [79, 62],
    [71, 94],
    [29, 94],
  ]);
  const grooves = [36, 50, 64].map((x) =>
    line(
      [
        [x, 67],
        [50 + (x - 50) * 0.75, 89],
      ],
      3.4
    )
  );
  const cherry = path().circle(50, 12, 6.5);
  return parts(
    A(body([frosting, wrapper], grooves)),
    B(
      solid(
        cherry,
        line(
          [
            [52, 7],
            [60, 2],
          ],
          2.6
        )
      )
    )
  );
});

def("teapot", () => {
  const pot = path().ellipse(50, 63, 30, 26);
  const spout = path()
    .M(24, 62)
    .C(14, 60, 8, 50, 5, 40)
    .L(13, 37)
    .C(16, 47, 21, 52, 27, 53)
    .Z();
  const handle = ringArc(80, 61, 9, 16, -75, 75);
  const lid = path().M(31, 34).C(33, 23, 67, 23, 69, 34).Z().circle(50, 19, 5);
  return parts(A(solid(pot, spout, handle)), B(solid(lid)));
});

def("bread", () => {
  const loaf = path()
    .M(8, 62)
    .C(8, 32, 28, 24, 50, 24)
    .C(72, 24, 92, 32, 92, 62)
    .L(92, 82)
    .Q(92, 88, 86, 88)
    .L(14, 88)
    .Q(8, 88, 8, 82)
    .Z();
  const scores = [
    line(
      [
        [29, 41],
        [37, 56],
      ],
      5.5
    ),
    line(
      [
        [46, 36],
        [54, 53],
      ],
      5.5
    ),
    line(
      [
        [63, 41],
        [71, 56],
      ],
      5.5
    ),
  ];
  return parts(A(body([loaf], scores)));
});

def("grapes", () => {
  const berries = path();
  for (const [x, y] of [
    [31, 38],
    [50, 38],
    [69, 38],
    [40.5, 55],
    [59.5, 55],
    [50, 72],
    [50, 88],
  ])
    berries.circle(x, y, 10);
  const stem = line(
    [
      [50, 27],
      [53, 8],
    ],
    4.5
  );
  const vine = path()
    .M(55, 16)
    .C(60, 4, 76, 2, 86, 9)
    .C(80, 20, 64, 23, 55, 16)
    .Z();
  return parts(A(solid(berries)), B(solid(stem, vine)));
});

def("fish", () => {
  const fish = path()
    .M(8, 50)
    .C(22, 27, 56, 25, 72, 50)
    .C(56, 75, 22, 73, 8, 50)
    .Z();
  const tail = path().poly([
    [68, 50],
    [94, 30],
    [88, 50],
    [94, 70],
  ]);
  const fin = path().M(36, 34).C(40, 22, 52, 20, 58, 30).Z();
  return parts(
    A(
      body(
        [fish, tail],
        [
          path().circle(24, 47, 4),
          line(
            [
              [38, 40],
              [42, 50],
              [38, 60],
            ],
            3
          ),
        ]
      )
    ),
    B(solid(fin))
  );
});

def("bubbleTea", () => {
  const cup = path().poly([
    [24, 37],
    [76, 37],
    [70, 94],
    [30, 94],
  ]);
  const lid = path()
    .rrect(19, 28, 62, 7, 3.5)
    .M(27, 28)
    .C(27, 13, 73, 13, 73, 28)
    .Z();
  const pearls = [
    [39, 84],
    [50, 86],
    [61, 84],
    [44, 75],
    [56, 75],
  ].map(([x, y]) => path().circle(x, y, 4.4));
  return parts(
    A(body([cup, lid], pearls)),
    B(
      solid(
        line(
          [
            [62, 2],
            [55, 62],
          ],
          7,
          false
        )
      )
    )
  );
});

def("dumpling", () => {
  const shell = path().M(8, 68).C(10, 32, 90, 32, 92, 68).Q(50, 82, 8, 68).Z();
  const pleats = [32, 50, 68].map((x) =>
    line(
      [
        [x, 49],
        [50 + (x - 50) * 1.2, 62],
      ],
      3.6
    )
  );
  const steam = [38, 62].map((x) =>
    line(
      Array.from({ length: 9 }, (_, i) => [
        x + 3.5 * Math.sin(i * 0.9),
        4 + i * 3,
      ]),
      3.4
    )
  );
  return parts(A(body([shell], pleats)), B(solid(...steam)));
});

def("carrot", () => {
  const root = path()
    .M(31, 38)
    .C(31, 31, 69, 31, 69, 38)
    .C(66, 62, 56, 86, 50, 97)
    .C(44, 86, 34, 62, 31, 38)
    .Z();
  const ridges = [
    line(
      [
        [37, 50],
        [46, 52],
      ],
      3
    ),
    line(
      [
        [55, 62],
        [62, 60],
      ],
      3
    ),
    line(
      [
        [45, 74],
        [52, 76],
      ],
      3
    ),
  ];
  const leaves = [
    leaf([50, 32], [30, 6], 12),
    leaf([50, 32], [52, 2], 12),
    leaf([50, 32], [72, 8], 12),
  ];
  return parts(A(body([root], ridges)), B(solid(...leaves)));
});

def("apple", () => {
  const fruit = path()
    .M(50, 33)
    .C(40, 23, 12, 25, 12, 53)
    .C(12, 77, 30, 95, 42, 93)
    .C(46, 92, 54, 92, 58, 93)
    .C(70, 95, 88, 77, 88, 53)
    .C(88, 25, 60, 23, 50, 33)
    .Z();
  const stem = line(
    [
      [50, 29],
      [53, 12],
    ],
    5
  );
  const appleLeaf = path()
    .M(55, 21)
    .C(59, 8, 73, 6, 82, 10)
    .C(76, 21, 63, 25, 55, 21)
    .Z();
  return parts(A(solid(fruit, stem)), B(solid(appleLeaf)));
});

def("cookie", () => {
  const edge = [];
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const rad = 44 + 1.6 * Math.sin(a * 7) + 0.8 * Math.cos(a * 11);
    edge.push([50 + Math.cos(a) * rad, 50 + Math.sin(a) * rad]);
  }
  const chips = [
    [34, 30, 5],
    [60, 26, 4.5],
    [72, 50, 5.5],
    [44, 52, 5],
    [28, 64, 4.5],
    [58, 72, 5],
    [50, 38, 3.5],
    [74, 70, 3.5],
  ].map(([x, y, rad]) => path().poly(regular(x, y, rad, 6, x)));
  return parts(A(body([path().poly(edge)], chips)));
});

def("cheese", () => {
  const side = path().poly([
    [6, 82],
    [94, 42],
    [94, 90],
    [6, 90],
  ]);
  const top = path().poly([
    [6, 78],
    [78, 32],
    [94, 38],
  ]);
  const eyes = [
    [30, 80, 4.5],
    [56, 72, 6.5],
    [80, 60, 4.5],
    [76, 80, 4],
    [46, 85, 2.5],
  ].map(([x, y, rad]) => path().circle(x, y, rad));
  return parts(A(body([side], eyes)), B(solid(top)));
});

def("friedEgg", () => {
  const white = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const rad = 41 + 5 * Math.sin(a * 3 + 0.5) + 2.5 * Math.sin(a * 5);
    white.push([50 + Math.cos(a) * rad, 52 + Math.sin(a) * rad]);
  }
  return parts(
    A(
      solid(path().poly(white))
        .add(holes(path().circle(45, 47, 17)))
        .add(solid(path().circle(45, 47, 13.5)))
    )
  );
});

def("takeaway", () => {
  const box = path().poly([
    [17, 42],
    [83, 42],
    [75, 94],
    [25, 94],
  ]);
  const flaps = path()
    .poly([
      [16, 39],
      [28, 21],
      [47, 26],
      [48, 39],
    ])
    .poly([
      [52, 39],
      [53, 26],
      [72, 21],
      [84, 39],
    ]);
  const fold = line(
    [
      [22, 52],
      [78, 52],
    ],
    3,
    false
  );
  return parts(
    A(body([box, flaps], [fold])),
    B(solid(ringArc(50, 40, 32, 36, -152, -28)))
  );
});

// ── Shops ───────────────────────────────────────────────────────────────────

def("sneaker", () => {
  const upper = path()
    .M(8, 68)
    .L(8, 52)
    .C(8, 44, 14, 40, 22, 42)
    .L(40, 46)
    .C(48, 40, 52, 30, 58, 26)
    .L(66, 24)
    .C(70, 34, 76, 46, 86, 52)
    .C(94, 56, 96, 61, 96, 68)
    .Z();
  const laces = [
    line(
      [
        [48, 47],
        [55, 40],
      ],
      3.2
    ),
    line(
      [
        [56, 52],
        [63, 45],
      ],
      3.2
    ),
    line(
      [
        [64, 56],
        [71, 50],
      ],
      3.2
    ),
  ];
  return parts(A(body([upper, path().rrect(6, 72, 92, 13, 6.5)], laces)));
});

def("sunglasses", () => {
  const lenses = path()
    .M(7, 42)
    .L(45, 42)
    .C(45, 61, 40, 71, 26, 71)
    .C(13, 71, 7, 61, 7, 42)
    .Z()
    .M(55, 42)
    .L(93, 42)
    .C(93, 61, 87, 71, 74, 71)
    .C(60, 71, 55, 61, 55, 42)
    .Z();
  const bar = path().rrect(4, 34, 92, 8, 4);
  const glare = [
    line(
      [
        [16, 50],
        [24, 58],
      ],
      3
    ),
    line(
      [
        [64, 50],
        [72, 58],
      ],
      3
    ),
  ];
  return parts(A(solid(lenses, bar)), B(solid(...glare)));
});

def("watch", () => {
  const strap = path()
    .rrect(37, 4, 26, 20, 5)
    .rrect(37, 76, 26, 20, 5)
    .rrect(78, 45, 7, 10, 2);
  const hands = [
    line(
      [
        [50, 50],
        [50, 33],
      ],
      4
    ),
    line(
      [
        [50, 50],
        [61, 57],
      ],
      4
    ),
  ];
  return parts(
    A(
      ring(50, 50, 29, 23).add(
        solid(strap, ...hands, path().circle(50, 50, 3.5))
      )
    )
  );
});

def("plantPot", () => {
  const pot = path().poly([
    [25, 62],
    [75, 62],
    [69, 95],
    [31, 95],
  ]);
  const rim = path().rrect(20, 52, 60, 8, 3);
  const leaves = [
    leaf([50, 50], [18, 22], 18),
    leaf([50, 50], [50, 4], 18),
    leaf([50, 50], [82, 22], 18),
  ];
  return parts(A(solid(pot, ...leaves)), B(solid(rim)));
});

def("sofa", () =>
  parts(
    A(
      solid(
        path().rrect(18, 26, 64, 30, 10),
        path().rrect(4, 42, 20, 38, 9),
        path().rrect(76, 42, 20, 38, 9),
        path().rrect(26, 58, 48, 18, 4),
        path().rrect(10, 80, 7, 10, 2),
        path().rrect(83, 80, 7, 10, 2)
      )
    )
  )
);

def("dress", () => {
  const dress = path()
    .M(37, 6)
    .L(44, 6)
    .L(50, 15)
    .L(56, 6)
    .L(63, 6)
    .L(65, 30)
    .C(65, 36, 61, 40, 61, 44)
    .L(86, 94)
    .L(14, 94)
    .L(39, 44)
    .C(39, 40, 35, 36, 35, 30)
    .Z();
  return parts(A(body([dress], [path().rrect(40, 43, 20, 4, 2)])));
});

def("perfume", () => {
  const bottle = path().rrect(20, 42, 60, 52, 12);
  const cap = path().rrect(38, 22, 24, 17, 3);
  const pump = path().circle(17, 20, 9);
  return parts(
    A(body([bottle, cap], [path().rrect(33, 58, 34, 22, 4)])),
    B(
      solid(
        pump,
        line(
          [
            [25, 22],
            [38, 27],
          ],
          3
        )
      )
    )
  );
});

def("truck", () => {
  const cab = path().M(63, 38).L(80, 38).L(94, 55).L(94, 76).L(63, 76).Z();
  const wheels = path().circle(24, 78, 11).circle(78, 78, 11);
  return parts(
    A(
      body(
        [path().rrect(4, 22, 57, 54, 4), cab],
        [
          path().poly([
            [68, 43],
            [78, 43],
            [87, 55],
            [68, 55],
          ]),
        ]
      )
    ),
    B(body([wheels], [path().circle(24, 78, 4.5), path().circle(78, 78, 4.5)]))
  );
});

def("spool", () => {
  const threads = [30, 40, 50, 60, 70].map((y) =>
    line(
      [
        [32, y],
        [68, y + 4],
      ],
      2.6,
      false
    )
  );
  const needle = path().M(82, 6).L(86, 8).L(70, 90).L(68, 89).Z();
  return parts(
    A(
      body(
        [
          path().rrect(20, 8, 60, 10, 3),
          path().rrect(20, 82, 60, 10, 3),
          path().rrect(27, 20, 46, 60, 2),
        ],
        threads
      )
    ),
    B(body([needle], [path().ellipse(82.4, 14, 1, 3.4)]))
  );
});

def("gamepad", () => {
  const pad = path()
    .M(27, 30)
    .L(73, 30)
    .C(89, 30, 96, 44, 96, 60)
    .C(96, 76, 88, 84, 80, 84)
    .C(72, 84, 68, 74, 64, 68)
    .L(36, 68)
    .C(32, 74, 28, 84, 20, 84)
    .C(12, 84, 4, 76, 4, 60)
    .C(4, 44, 11, 30, 27, 30)
    .Z();
  const cross = path().poly([
    [23, 41],
    [29, 41],
    [29, 47],
    [35, 47],
    [35, 53],
    [29, 53],
    [29, 59],
    [23, 59],
    [23, 53],
    [17, 53],
    [17, 47],
    [23, 47],
  ]);
  const buttons = [
    [72, 43],
    [81, 50],
    [72, 57],
    [63, 50],
  ].map(([x, y]) => path().circle(x, y, 4));
  return parts(A(body([pad], [cross, ...buttons])));
});

def("bouquet", () => {
  const tulip = (cx, cy) =>
    path()
      .M(cx - 9, cy - 8)
      .L(cx - 4, cy - 2)
      .L(cx, cy - 11)
      .L(cx + 4, cy - 2)
      .L(cx + 9, cy - 8)
      .L(cx + 9, cy + 2)
      .C(cx + 9, cy + 11, cx - 9, cy + 11, cx - 9, cy + 2)
      .Z();
  const stems = [
    line(
      [
        [30, 34],
        [48, 74],
      ],
      3.5
    ),
    line(
      [
        [50, 26],
        [50, 74],
      ],
      3.5
    ),
    line(
      [
        [70, 34],
        [52, 74],
      ],
      3.5
    ),
  ];
  const wrap = path().poly([
    [24, 54],
    [76, 54],
    [56, 97],
    [44, 97],
  ]);
  return parts(
    A(solid(tulip(29, 26), tulip(50, 16), tulip(71, 26), ...stems)),
    B(solid(wrap))
  );
});

def("basket", () => {
  const basket = path().poly([
    [10, 48],
    [90, 48],
    [80, 94],
    [20, 94],
  ]);
  const slots = [];
  for (const x of [26, 46, 66])
    for (const y of [56, 74])
      slots.push(path().rrect(x + (y > 60 ? 1 : 0), y, 10, 12, 2));
  return parts(
    A(
      body(
        [
          basket,
          path().rrect(5, 40, 90, 8, 4),
          ringArc(50, 44, 28, 34, 180, 360),
        ],
        slots
      )
    )
  );
});

def("puzzle", () => {
  const piece = path()
    .M(18, 30)
    .L(40, 30)
    .C(34, 12, 66, 12, 60, 30)
    .L(82, 30)
    .L(82, 46)
    .C(98, 40, 98, 68, 82, 62)
    .L(82, 84)
    .L(60, 84)
    .C(66, 68, 34, 68, 40, 84)
    .L(18, 84)
    .Z();
  return parts(A(solid(piece)));
});

def("returnArrow", () => {
  const pts = [
    [78, 90],
    [78, 46],
    ...arcPoints(53, 46, 25, 0, -180, 18).slice(1),
    [28, 56],
  ];
  const head = path().poly([
    [13, 54],
    [43, 54],
    [28, 74],
  ]);
  return parts(A(solid(line(pts, 11, false), head)));
});

// ── Health and learning ─────────────────────────────────────────────────────

def("stethoscope", () => {
  const tubes = [
    line(bezier([28, 8], [25, 36], [32, 50], [46, 54]), 5),
    line(bezier([64, 8], [67, 36], [60, 50], [46, 54]), 5),
    line(bezier([46, 54], [46, 84], [72, 90], [75, 74]), 5),
  ];
  return parts(
    A(
      solid(...tubes, path().circle(28, 8, 4.5), path().circle(64, 8, 4.5)).add(
        ring(75, 64, 13, 7)
      )
    ),
    B(solid(path().circle(75, 64, 4)))
  );
});

def("eye", () => {
  const lid = path()
    .M(4, 50)
    .C(24, 19, 76, 19, 96, 50)
    .C(76, 81, 24, 81, 4, 50)
    .Z();
  return parts(
    A(
      solid(lid)
        .add(holes(path().circle(50, 50, 19)))
        .add(solid(path().circle(50, 50, 10)))
    ),
    B(holes(path().circle(56, 44, 3.5)))
  );
});

def("syringe", () => {
  const ticks = [34, 42, 50, 58].map((x) => path().rrect(x, 42, 3, 8, 1));
  const p = body(
    [
      path().rrect(24, 40, 44, 20, 3),
      path().rrect(68, 46, 16, 8),
      path().rrect(84, 36, 7, 28, 2),
      path().rrect(17, 45, 7, 10, 1),
      path().rrect(4, 48.5, 14, 3, 1),
    ],
    ticks
  );
  return parts(A(turn(p, -45)));
});

def("bandage", () => {
  const dots = [];
  for (const x of [41, 50, 59])
    for (const y of [43, 50, 57])
      if ((x + y) % 2 === 1 || x === 50) dots.push(path().circle(x, y, 2.4));
  const strip = body(
    [path().rrect(4, 32, 92, 36, 18)],
    [path().circle(16, 50, 2.4), path().circle(84, 50, 2.4)]
  );
  const pad = body([path().rrect(33, 32, 34, 36, 4)], dots);
  return parts(A(turn(strip, -40)), B(turn(pad, -40)));
});

def("thermometer", () => {
  const tube = path().rrect(40, 6, 20, 64, 10).circle(50, 79, 16);
  const channel = path().rrect(46, 14, 8, 58, 4).circle(50, 79, 9.5);
  const ticks = [16, 28, 40, 52].map((y) => path().rrect(64, y, 10, 3.5, 1.5));
  return parts(
    A(body([tube], [channel]).add(solid(...ticks))),
    B(solid(path().rrect(47.5, 38, 5, 40, 2.5), path().circle(50, 79, 7)))
  );
});

def("spectacles", () =>
  parts(
    A(
      ring(28, 56, 19, 13.5)
        .add(ring(72, 56, 19, 13.5))
        .add(
          solid(
            line(arcPoints(50, 54, 9, -160, -20, 10), 5),
            line(
              [
                [9, 52],
                [4, 36],
              ],
              5
            ),
            line(
              [
                [91, 52],
                [96, 36],
              ],
              5
            )
          )
        )
    )
  )
);

def("backpack", () => {
  const pack = path().rrect(18, 24, 64, 70, 16);
  const handle = ringArc(50, 25, 8, 14, 180, 360);
  return parts(
    A(
      body(
        [pack, handle],
        [
          line(
            [
              [26, 43],
              [74, 43],
            ],
            3.5,
            false
          ),
        ]
      )
    ),
    B(
      body(
        [path().rrect(30, 56, 40, 28, 6)],
        [
          line(
            [
              [38, 66],
              [62, 66],
            ],
            3,
            false
          ),
        ]
      )
    )
  );
});

def("microscope", () => {
  const tube = path().poly([
    [29, 16],
    [41, 9],
    [60, 48],
    [48, 55],
  ]);
  const eyepiece = path().poly([
    [25, 9],
    [37, 2],
    [40, 8],
    [28, 15],
  ]);
  const arm = line(bezier([66, 84], [86, 72], [82, 42], [56, 36]), 9);
  return parts(
    A(
      solid(
        tube,
        eyepiece,
        arm,
        path().rrect(22, 62, 44, 6, 2),
        path().rrect(16, 84, 68, 10, 4)
      )
    ),
    B(solid(path().rrect(46, 54, 8, 7, 1)))
  );
});

def("calculator", () => {
  const keys = [];
  for (const x of [29, 45, 61])
    for (const y of [44, 60, 76]) keys.push(path().rrect(x, y, 10, 10, 2));
  return parts(
    A(
      body(
        [path().rrect(20, 6, 60, 88, 10)],
        [path().rrect(28, 14, 44, 22, 3), ...keys]
      )
    ),
    B(solid(path().rrect(54, 20, 13, 10, 1)))
  );
});

def("atom", () => {
  const orbit = (deg) =>
    turn(
      body(
        [path().ellipse(50, 50, 45, 16)],
        [path().ellipse(50, 50, 40, 11.5)]
      ),
      deg
    );
  return parts(
    A(join(orbit(0), orbit(60), orbit(120))),
    B(solid(path().circle(50, 50, 8)))
  );
});

def("laptop", () =>
  parts(
    A(
      body(
        [path().rrect(14, 16, 72, 50, 5)],
        [path().rrect(20, 22, 60, 38, 2)]
      ).add(solid(path().M(4, 70).L(96, 70).L(90, 82).L(10, 82).Z()))
    ),
    B(holes(path().rrect(42, 72, 16, 3, 1.5)))
  )
);

def("pawn", () => {
  const piece = path()
    .M(40, 45)
    .L(60, 45)
    .C(60, 60, 68, 72, 70, 78)
    .L(30, 78)
    .C(32, 72, 40, 60, 40, 45)
    .Z();
  return parts(
    A(
      solid(
        path().circle(50, 22, 13),
        path().rrect(35, 37, 30, 6, 3),
        piece,
        path().rrect(22, 81, 56, 12, 4)
      )
    )
  );
});

// ── Business ────────────────────────────────────────────────────────────────

def("briefcase", () =>
  parts(
    A(
      body(
        [path().rrect(6, 30, 88, 60, 8), path().rrect(34, 14, 32, 20, 6)],
        [
          path().rrect(40, 20, 20, 10, 2),
          path().rrect(9, 54, 34, 4),
          path().rrect(57, 54, 34, 4),
        ]
      )
    ),
    B(solid(path().rrect(43, 49, 14, 13, 2)))
  )
);

def("barChart", () => {
  const trend = line(
    [
      [10, 46],
      [36, 28],
      [56, 36],
      [80, 12],
    ],
    4.5
  );
  return parts(
    A(
      solid(
        path().rrect(12, 58, 16, 32, 2),
        path().rrect(38, 44, 16, 46, 2),
        path().rrect(64, 30, 16, 60, 2),
        path().rrect(6, 92, 88, 5, 2)
      )
    ),
    B(
      solid(
        trend,
        path().poly([
          [70, 10],
          [88, 4],
          [84, 22],
        ])
      )
    )
  );
});

def("padlock", () => {
  const shackle = line(
    [
      [29, 50],
      [29, 34],
      ...arcPoints(50, 34, 21, 180, 360, 16).slice(1),
      [71, 34],
      [71, 50],
    ],
    10,
    false
  );
  const keyhole = path()
    .M(45.5, 66)
    .A(7, 7, 0, 1, 1, 54.5, 66)
    .L(57, 82)
    .L(43, 82)
    .Z();
  return parts(A(body([shackle, path().rrect(14, 46, 72, 48, 10)], [keyhole])));
});

def("magnifier", () =>
  parts(
    A(
      ring(40, 40, 31, 22).add(
        solid(
          line(
            [
              [62, 62],
              [89, 89],
            ],
            13
          )
        )
      )
    ),
    B(solid(ringArc(40, 40, 14, 18, 200, 260)))
  )
);

def("documentPage", () => {
  const page = path().poly([
    [18, 6],
    [58, 6],
    [84, 32],
    [84, 94],
    [18, 94],
  ]);
  const lines = [44, 56, 68, 80].map((y, i) =>
    path().rrect(28, y, i === 3 ? 26 : 46, 5, 2.5)
  );
  return parts(
    A(body([page], [path().rrect(28, 20, 22, 5, 2.5), ...lines])),
    B(
      solid(
        path().poly([
          [58, 6],
          [58, 32],
          [84, 32],
        ])
      )
    )
  );
});

def("penNib", () => {
  const nib = path().M(30, 14).L(70, 14).L(79, 44).L(50, 97).L(21, 44).Z();
  return parts(
    A(
      body(
        [nib],
        [path().circle(50, 46, 6), path().rrect(48.4, 53, 3.2, 34, 1.6)]
      )
    ),
    B(solid(path().rrect(27, 3, 46, 9, 3)))
  );
});

def("piggyBank", () => {
  const pig = path().ellipse(47, 56, 36, 28);
  const ear = path().poly([
    [28, 34],
    [36, 18],
    [46, 31],
  ]);
  const tail = line(arcPoints(8, 46, 5, 90, 400, 14), 3.5);
  return parts(
    A(
      body(
        [
          pig,
          ear,
          path().rrect(79, 47, 14, 17, 5),
          path().rrect(24, 76, 10, 16, 3),
          path().rrect(56, 76, 10, 16, 3),
          tail,
        ],
        [path().rrect(38, 33, 20, 5, 2.5), path().circle(66, 47, 3.2)]
      )
    ),
    B(body([path().circle(48, 15, 10)], [path().rrect(46.5, 10, 3, 10, 1.5)]))
  );
});

def("wrench", () => {
  const head = path().poly([
    ...arcPoints(24, 50, 21, -158, 158, 30),
    [15, 57.5],
    [15, 42.5],
  ]);
  const p = body(
    [head, path().rrect(36, 43, 60, 14, 7)],
    [path().circle(88, 50, 3)]
  );
  return parts(A(turn(p, 40)));
});

def("hardHat", () => {
  const dome = path()
    .M(14, 62)
    .C(14, 30, 34, 16, 50, 16)
    .C(66, 16, 86, 30, 86, 62)
    .Z();
  return parts(
    A(solid(dome, path().rrect(4, 65, 92, 12, 6))),
    B(solid(path().rrect(43, 12, 14, 44, 6)))
  );
});

def("presentation", () => {
  const legs = [
    line(
      [
        [50, 66],
        [28, 96],
      ],
      5
    ),
    line(
      [
        [50, 66],
        [72, 96],
      ],
      5
    ),
    line(
      [
        [50, 62],
        [50, 90],
      ],
      5
    ),
  ];
  return parts(
    A(
      body(
        [path().rrect(8, 10, 84, 56, 4)],
        [path().rrect(15, 17, 70, 42, 2)]
      ).add(solid(...legs, path().rrect(46, 4, 8, 8, 2)))
    ),
    B(
      solid(
        path().rrect(24, 40, 9, 14, 1),
        path().rrect(38, 32, 9, 22, 1),
        path().rrect(52, 26, 9, 28, 1),
        path().rrect(66, 34, 9, 20, 1)
      )
    )
  );
});

def("idCard", () => {
  const person = [
    path().circle(50, 44, 10),
    path().M(32, 72).C(32, 56, 68, 56, 68, 72).Z(),
    path().rrect(32, 80, 36, 4, 2),
  ];
  return parts(
    A(
      body(
        [path().rrect(16, 14, 68, 80, 8)],
        [path().rrect(40, 21, 20, 5, 2.5), ...person]
      )
    ),
    B(
      solid(
        line(
          [
            [32, 0],
            [46, 14],
          ],
          4,
          false
        ),
        line(
          [
            [68, 0],
            [54, 14],
          ],
          4,
          false
        )
      )
    )
  );
});

def("rocket", () => {
  const hull = path()
    .M(50, 4)
    .C(66, 16, 72, 38, 70, 64)
    .L(30, 64)
    .C(28, 38, 34, 16, 50, 4)
    .Z();
  const fins = path()
    .poly([
      [31, 46],
      [31, 70],
      [14, 80],
      [14, 66],
    ])
    .poly([
      [69, 46],
      [86, 66],
      [86, 80],
      [69, 70],
    ]);
  const flame = path()
    .M(40, 72)
    .C(40, 84, 46, 90, 50, 98)
    .C(54, 90, 60, 84, 60, 72)
    .Z();
  return parts(
    A(body([hull, fins], [path().circle(50, 32, 8)])),
    B(solid(flame))
  );
});

def("storefront", () => {
  const awning = path().M(6, 18).L(94, 18).L(94, 32);
  const w = 88 / 5;
  for (let i = 0; i < 5; i++) {
    const x = 94 - i * w;
    awning.A(w / 2, w / 2.4, 0, 0, 1, x - w, 32);
  }
  awning.Z();
  return parts(
    A(
      solid(awning, path().rrect(4, 10, 92, 8, 3)).add(
        body(
          [path().rrect(10, 45, 80, 49, 2)],
          [
            path().rrect(42, 62, 16, 32, 1),
            path().rrect(18, 55, 18, 18, 2),
            path().rrect(64, 55, 18, 18, 2),
          ]
        )
      )
    ),
    B(solid(path().rrect(23.6, 18, 17.6, 14), path().rrect(58.8, 18, 17.6, 14)))
  );
});

def("shieldCheck", () => {
  const shield = path()
    .M(50, 4)
    .L(88, 16)
    .L(88, 44)
    .C(88, 70, 70, 86, 50, 96)
    .C(30, 86, 12, 70, 12, 44)
    .L(12, 16)
    .Z();
  return parts(
    A(
      body(
        [shield],
        [
          line(
            [
              [31, 50],
              [45, 64],
              [70, 36],
            ],
            9
          ),
        ]
      )
    )
  );
});

// ── Calls to action ─────────────────────────────────────────────────────────

def("handPointer", () => {
  const hand = solid(
    path().rrect(27, 24, 15, 52, 7.5),
    path().rrect(27, 52, 52, 42, 14),
    path().rrect(43, 46, 11, 20, 5.5),
    path().rrect(55, 48, 11, 20, 5.5),
    path().rrect(67, 52, 11, 18, 5.5),
    path().rrect(13, 62, 18, 26, 9)
  ).add(
    holes(
      path().rrect(53.5, 56, 2.5, 12, 1.25),
      path().rrect(65.5, 58, 2.5, 12, 1.25)
    )
  );
  return parts(
    A(hand),
    B(
      solid(
        ringArc(34.5, 26, 12, 16, -160, -20),
        ringArc(34.5, 26, 20, 24, -155, -25)
      )
    )
  );
});

def("question", () => {
  const hook = line(
    [
      ...arcPoints(50, 30, 19, 180, 360, 18),
      [69, 34],
      [66, 42],
      [52, 52],
      [50, 58],
      [50, 66],
    ],
    11
  );
  return parts(A(solid(hook, path().circle(50, 84, 7.5))));
});

def("bookmark", () => {
  const ribbon = path().poly([
    [24, 6],
    [76, 6],
    [76, 95],
    [50, 74],
    [24, 95],
  ]);
  return parts(A(body([ribbon], [path().poly(starPoints(50, 36, 14, 6, 5))])));
});

def("flag", () => {
  const cloth = path()
    .M(25, 10)
    .C(44, 2, 60, 20, 88, 10)
    .L(88, 54)
    .C(60, 64, 44, 46, 25, 54)
    .Z();
  return parts(A(solid(path().rrect(14, 6, 7, 90, 3.5), cloth)));
});

def("mapFolded", () => {
  const pin = path()
    .M(50, 66)
    .C(43, 56, 39, 50, 39, 44)
    .A(11, 11, 0, 1, 1, 61, 44)
    .C(61, 50, 57, 56, 50, 66)
    .Z();
  return parts(
    A(
      body(
        [
          path().poly([
            [6, 22],
            [34, 12],
            [34, 84],
            [6, 94],
          ]),
          path().poly([
            [36, 12],
            [64, 22],
            [64, 94],
            [36, 84],
          ]),
          path().poly([
            [66, 22],
            [94, 12],
            [94, 84],
            [66, 94],
          ]),
        ],
        [pin]
      ).add(solid(path().circle(50, 44, 4.5)))
    )
  );
});

// ── Real estate ─────────────────────────────────────────────────────────────

def("floorPlan", () => {
  const walls = body(
    [path().rrect(8, 8, 84, 84, 2)],
    [path().rrect(14, 14, 72, 72)]
  );
  return parts(
    A(
      walls.add(
        solid(
          path().rrect(44, 12, 6, 34),
          path().rrect(12, 54, 26, 6),
          path().rrect(60, 56, 28, 6),
          path().rrect(44, 72, 6, 16)
        )
      )
    ),
    B(solid(ringArc(38, 60, 14, 17, -90, 0), ringArc(60, 62, 15, 18, 180, 270)))
  );
});

def("keyRing", () => {
  const key = (cx, deg) =>
    turn(
      body(
        [
          path().circle(cx, 46, 11),
          path().rrect(cx - 3.5, 54, 7, 38, 2),
          path().rrect(cx + 3.5, 76, 8, 5, 1),
          path().rrect(cx + 3.5, 85, 6, 5, 1),
        ],
        [path().circle(cx, 44, 4)]
      ),
      deg,
      cx,
      30
    );
  return parts(A(join(ring(50, 18, 14, 9.5), key(38, 16), key(62, -16))));
});

def("tree", () => {
  const crown = path()
    .circle(50, 32, 26)
    .circle(30, 46, 18)
    .circle(70, 46, 18)
    .circle(50, 52, 18);
  return parts(
    A(solid(crown, path().rrect(45, 56, 10, 36, 3))),
    B(solid(path().rrect(22, 91, 56, 5, 2.5)))
  );
});

def("window4", () =>
  parts(
    A(
      body(
        [path().rrect(14, 6, 72, 82, 6)],
        [
          path().rrect(20, 12, 28, 34, 2),
          path().rrect(52, 12, 28, 34, 2),
          path().rrect(20, 50, 28, 32, 2),
          path().rrect(52, 50, 28, 32, 2),
        ]
      )
    ),
    B(solid(path().rrect(8, 88, 84, 7, 2)))
  )
);

def("hammer", () => {
  const head = path()
    .M(14, 14)
    .L(64, 14)
    .L(74, 18)
    .L(74, 30)
    .L(64, 34)
    .L(14, 34)
    .C(8, 34, 6, 26, 10, 22)
    .Z();
  return parts(A(turn(solid(head, path().rrect(40, 32, 12, 62, 6)), 28)));
});

def("paintRoller", () =>
  parts(
    A(
      solid(
        path().rrect(10, 10, 64, 26, 9),
        line(
          [
            [74, 23],
            [87, 23],
            [87, 46],
            [50, 52],
            [50, 64],
          ],
          5,
          false
        ),
        path().rrect(43, 62, 14, 34, 7)
      )
    ),
    B(holes(path().rrect(18, 18, 48, 3, 1.5)))
  )
);

def("bathtub", () => {
  const tub = path()
    .M(6, 52)
    .L(94, 52)
    .L(94, 60)
    .C(94, 76, 82, 84, 66, 84)
    .L(34, 84)
    .C(18, 84, 6, 76, 6, 60)
    .Z();
  const tap = line(
    [
      [15, 52],
      [15, 24],
      ...arcPoints(23, 24, 8, 180, 360, 8).slice(1),
      [31, 30],
    ],
    5
  );
  return parts(
    A(
      solid(
        tub,
        tap,
        path().rrect(20, 84, 8, 10, 2),
        path().rrect(72, 84, 8, 10, 2)
      )
    ),
    B(
      solid(
        path().circle(46, 42, 6),
        path().circle(60, 36, 8),
        path().circle(76, 43, 6)
      )
    )
  );
});

// ── Sports and fitness ──────────────────────────────────────────────────────

def("soccerBall", () => {
  const rad = (deg) => (deg * Math.PI) / 180;
  const at = (r, deg) => [
    50 + r * Math.cos(rad(deg)),
    50 + r * Math.sin(rad(deg)),
  ];
  const pieces = [path().poly(regular(50, 50, 17, 5))];
  for (let i = 0; i < 5; i++) {
    const a = -90 + i * 72;
    pieces.push(line([at(16, a), at(31, a)], 3.6, false));
    pieces.push(
      path().poly([
        at(42, a - 17),
        at(34, a - 11),
        at(29.5, a),
        at(34, a + 11),
        at(42, a + 17),
      ])
    );
  }
  return parts(A(join(ring(50, 50, 46, 41), solid(...pieces))));
});

def("basketball", () => {
  const seams = [
    line(
      [
        [50, 8],
        [50, 48.2],
      ],
      3.6,
      false
    ),
    line(
      [
        [50, 51.8],
        [50, 92],
      ],
      3.6,
      false
    ),
    line(
      [
        [8, 50],
        [92, 50],
      ],
      3.6,
      false
    ),
    line(arcPoints(4, 50, 38, -50, -3, 12), 3.6, false),
    line(arcPoints(4, 50, 38, 3, 50, 12), 3.6, false),
    line(arcPoints(96, 50, 38, 183, 230, 12), 3.6, false),
    line(arcPoints(96, 50, 38, 130, 177, 12), 3.6, false),
  ];
  return parts(A(body([path().circle(50, 50, 46)], seams)));
});

def("tennis", () => {
  const strings = [];
  for (const x of [30, 38, 46, 54])
    strings.push(path().rrect(x - 1, 14, 2, 46));
  for (const y of [22, 30, 38, 46, 54])
    strings.push(path().rrect(22, y - 1, 40, 2));
  const head = body(
    [path().ellipse(42, 37, 26, 32)],
    [path().ellipse(42, 37, 21, 27)]
  );
  const p = join(
    head,
    solid(
      ...strings,
      path().poly([
        [36, 66],
        [48, 66],
        [46, 76],
        [38, 76],
      ]),
      path().rrect(37, 74, 10, 24, 4)
    )
  );
  return parts(
    A(turn(p, -30, 42, 50)),
    B(
      body(
        [path().circle(78, 78, 12)],
        [line(arcPoints(64, 78, 11, -50, 50, 10), 2.4)]
      )
    )
  );
});

def("golfFlag", () => {
  const cloth = path().poly([
    [37, 8],
    [78, 22],
    [37, 36],
  ]);
  return parts(
    A(solid(path().rrect(31, 6, 6, 82, 3), cloth, path().circle(68, 80, 6))),
    B(body([path().ellipse(50, 92, 42, 6)], [path().ellipse(34, 92, 7, 2.5)]))
  );
});

def("bicycle", () => {
  const frame = [
    line(
      [
        [22, 66],
        [48, 66],
      ],
      4.5
    ),
    line(
      [
        [48, 66],
        [40, 38],
      ],
      4.5
    ),
    line(
      [
        [40, 38],
        [22, 66],
      ],
      4.5
    ),
    line(
      [
        [40, 38],
        [72, 40],
      ],
      4.5
    ),
    line(
      [
        [72, 40],
        [48, 66],
      ],
      4.5
    ),
    line(
      [
        [72, 40],
        [78, 66],
      ],
      4.5
    ),
    line(
      [
        [72, 40],
        [68, 28],
        [78, 26],
      ],
      4.5
    ),
  ];
  return parts(
    A(
      ring(22, 66, 18, 13.5)
        .add(ring(78, 66, 18, 13.5))
        .add(solid(...frame, path().rrect(31, 32, 18, 5, 2.5)))
    ),
    B(solid(path().circle(48, 66, 5)))
  );
});

def("whistle", () => {
  const chamber = path().circle(42, 60, 26);
  const mouth = path().rrect(42, 34, 52, 18, 4);
  return parts(
    A(
      body(
        [chamber, mouth],
        [path().circle(42, 60, 9), path().rrect(54, 39, 10, 8, 1)]
      )
    ),
    B(ring(14, 30, 9, 5))
  );
});

def("boxingGlove", () => {
  const mitt = path()
    .M(24, 54)
    .C(20, 22, 40, 8, 58, 10)
    .C(80, 12, 92, 30, 90, 50)
    .C(88, 66, 78, 72, 66, 72)
    .L(30, 72)
    .C(26, 66, 24, 60, 24, 54)
    .Z();
  return parts(
    A(
      body(
        [mitt, path().rrect(28, 75, 42, 20, 4)],
        [line(bezier([28, 44], [36, 36], [48, 40], [52, 54]), 3.4)]
      )
    ),
    B(holes(path().rrect(32, 82, 34, 4, 2)))
  );
});

def("baseball", () => {
  const seam = (cx, a0, a1) =>
    line(arcPoints(cx, 50, 32, a0, a1, 14), 3, false);
  const stitches = [];
  for (const [cx, base] of [
    [6, 0],
    [94, 180],
  ]) {
    for (let a = -45; a <= 45; a += 15) {
      const t = ((base + a) * Math.PI) / 180;
      stitches.push(
        line(
          [
            [cx + 35 * Math.cos(t), 50 + 35 * Math.sin(t)],
            [cx + 39.5 * Math.cos(t), 50 + 39.5 * Math.sin(t)],
          ],
          2.6,
          false
        )
      );
    }
  }
  return parts(
    A(
      body(
        [path().circle(50, 50, 46)],
        [seam(6, -58, 58), seam(94, 122, 238), ...stitches]
      )
    )
  );
});

def("cricket", () => {
  const bat = solid(
    path().rrect(39, 32, 22, 62, 7),
    path().rrect(46, 6, 8, 28, 3)
  );
  return parts(
    A(turn(bat, 28)),
    B(
      body(
        [path().circle(80, 80, 11)],
        [
          line(
            [
              [71, 74],
              [89, 86],
            ],
            2.4,
            false
          ),
        ]
      )
    )
  );
});

def("pingPong", () => {
  const paddle = solid(
    path().circle(42, 40, 32),
    path().rrect(37, 70, 10, 28, 4)
  );
  return parts(
    A(turn(paddle, -38, 42, 50)),
    B(solid(path().circle(82, 18, 8)))
  );
});

def("skateboard", () => {
  const deck = path()
    .M(4, 44)
    .Q(6, 54, 16, 54)
    .L(84, 54)
    .Q(94, 54, 96, 44)
    .L(92, 42)
    .Q(90, 48, 84, 48)
    .L(16, 48)
    .Q(10, 48, 8, 42)
    .Z();
  return parts(
    A(
      solid(
        deck,
        path().rrect(20, 54, 14, 6, 2),
        path().rrect(66, 54, 14, 6, 2)
      )
    ),
    B(solid(path().circle(23, 66, 7), path().circle(77, 66, 7)))
  );
});

def("shuttlecock", () => {
  const skirt = path().poly([
    [36, 62],
    [64, 62],
    [88, 8],
    [12, 8],
  ]);
  const slits = [26, 38, 50, 62, 74].map((x) =>
    line(
      [
        [50 + (x - 50) * 0.2, 58],
        [x, 14],
      ],
      2.6,
      false
    )
  );
  const cork = path().M(36, 70).A(14, 14, 0, 0, 0, 64, 70).Z();
  return parts(
    A(body([skirt], slits).add(solid(cork))),
    B(solid(path().rrect(35, 63, 30, 5, 1)))
  );
});

def("target", () => {
  const rings = solid(path().circle(50, 50, 46))
    .add(holes(path().circle(50, 50, 37)))
    .add(solid(path().circle(50, 50, 28)))
    .add(holes(path().circle(50, 50, 19)))
    .add(solid(path().circle(50, 50, 10)));
  const dart = solid(
    line(
      [
        [52, 48],
        [86, 14],
      ],
      4,
      false
    ),
    path().poly([
      [82, 10],
      [96, 2],
      [90, 18],
    ])
  );
  return parts(A(rings), B(dart));
});

// ── Cars and parking ────────────────────────────────────────────────────────

def("car", () => {
  const shell = path()
    .M(6, 64)
    .L(6, 52)
    .C(6, 46, 10, 44, 16, 43)
    .L(28, 41)
    .L(38, 28)
    .C(40, 26, 42, 25, 46, 25)
    .L(68, 25)
    .C(72, 25, 74, 26, 76, 29)
    .L(84, 41)
    .L(90, 43)
    .C(94, 44, 96, 48, 96, 52)
    .L(96, 64)
    .L(87, 64)
    .A(13, 13, 0, 0, 0, 61, 64)
    .L(39, 64)
    .A(13, 13, 0, 0, 0, 13, 64)
    .Z();
  const windows = [
    path().poly([
      [42, 30],
      [55, 30],
      [55, 40],
      [33, 40],
    ]),
    path().poly([
      [59, 30],
      [70, 30],
      [77, 40],
      [59, 40],
    ]),
  ];
  return parts(
    A(
      body([shell], windows)
        .add(ring(74, 66, 10.5, 4))
        .add(ring(26, 66, 10.5, 4))
    ),
    B(solid(path().rrect(88, 47, 6, 4, 1.5)))
  );
});

def("carFront", () => {
  const shell = path()
    .M(20, 30)
    .C(22, 23, 26, 20, 32, 20)
    .L(68, 20)
    .C(74, 20, 78, 23, 80, 30)
    .L(86, 46)
    .L(93, 45)
    .L(93, 53)
    .L(88, 54)
    .L(90, 58)
    .L(90, 78)
    .L(10, 78)
    .L(10, 58)
    .L(12, 54)
    .L(7, 53)
    .L(7, 45)
    .L(14, 46)
    .Z();
  const windshield = path().poly([
    [28, 26],
    [72, 26],
    [78, 44],
    [22, 44],
  ]);
  return parts(
    A(
      body(
        [
          shell,
          path().rrect(14, 76, 16, 14, 3),
          path().rrect(70, 76, 16, 14, 3),
        ],
        [
          windshield,
          path().circle(23, 61, 6),
          path().circle(77, 61, 6),
          path().rrect(37, 58, 26, 9, 2),
        ]
      )
    )
  );
});

def("wheel", () => {
  const spokes = [];
  for (let i = 0; i < 5; i++) {
    const a = ((-90 + i * 72) * Math.PI) / 180;
    spokes.push(
      line(
        [
          [50 + 8 * Math.cos(a), 50 + 8 * Math.sin(a)],
          [50 + 27 * Math.cos(a), 50 + 27 * Math.sin(a)],
        ],
        6,
        false
      )
    );
  }
  return parts(
    A(
      ring(50, 50, 46, 37)
        .add(ring(50, 50, 30, 24))
        .add(solid(...spokes, path().circle(50, 50, 9)))
    )
  );
});

def("evPlug", () => {
  const bolt = path().poly([
    [54, 35],
    [40, 52],
    [49, 52],
    [45, 64],
    [60, 46],
    [51, 46],
    [56, 35],
  ]);
  return parts(
    A(
      body(
        [
          path().rrect(28, 30, 44, 38, 10),
          path().rrect(36, 8, 8, 24, 3),
          path().rrect(56, 8, 8, 24, 3),
        ],
        [bolt]
      ).add(
        solid(line(bezier([50, 66], [50, 86], [70, 80], [76, 96]), 6, false))
      )
    )
  );
});

def("fuelPump", () => {
  const hose = line(
    [
      [60, 34],
      [74, 34],
      [84, 44],
      [84, 72],
      [78, 80],
    ],
    5
  );
  return parts(
    A(
      body(
        [path().rrect(14, 12, 46, 80, 6), path().rrect(8, 88, 58, 8, 3)],
        [path().rrect(22, 20, 30, 20, 3)]
      ).add(solid(hose))
    ),
    B(solid(path().rrect(26, 52, 22, 6, 3)))
  );
});

def("steering", () => {
  const spokes = [
    line(
      [
        [10, 52],
        [40, 52],
      ],
      9,
      false
    ),
    line(
      [
        [60, 52],
        [90, 52],
      ],
      9,
      false
    ),
    line(
      [
        [50, 60],
        [50, 90],
      ],
      9,
      false
    ),
  ];
  return parts(
    A(ring(50, 50, 45, 36).add(solid(...spokes, path().circle(50, 52, 12))))
  );
});

def("parkingP", () => {
  const letter = path()
    .M(34, 22)
    .L(56, 22)
    .C(70, 22, 77, 32, 77, 41)
    .C(77, 51, 70, 60, 56, 60)
    .L(47, 60)
    .L(47, 78)
    .L(34, 78)
    .Z();
  const counter = path()
    .M(47, 33)
    .L(55, 33)
    .C(61, 33, 64, 37, 64, 41)
    .C(64, 46, 61, 49, 55, 49)
    .L(47, 49)
    .Z();
  return parts(
    A(body([path().rrect(8, 8, 84, 84, 16)], [letter]).add(solid(counter)))
  );
});

def("drops", () =>
  parts(
    A(solid(drop(34, 42, 46, 30), drop(68, 30, 32, 21))),
    B(solid(drop(64, 74, 30, 20)))
  )
);

def("carKey", () => {
  const blade = path().poly([
    [52, 58],
    [88, 58],
    [94, 64],
    [88, 70],
    [80, 70],
    [77, 66],
    [72, 70],
    [64, 70],
    [61, 66],
    [56, 70],
    [52, 70],
  ]);
  return parts(
    A(
      body(
        [path().rrect(12, 38, 42, 54, 14), blade],
        [path().circle(33, 54, 6), path().circle(33, 75, 6)]
      ).add(ring(33, 22, 14, 9))
    ),
    B(solid(path().rrect(28, 86, 10, 2, 1)))
  );
});

def("gauge", () => {
  const ticks = [];
  for (let a = 150; a <= 390; a += 40) {
    const t = (a * Math.PI) / 180;
    ticks.push(
      line(
        [
          [50 + 34.5 * Math.cos(t), 60 + 34.5 * Math.sin(t)],
          [50 + 39.5 * Math.cos(t), 60 + 39.5 * Math.sin(t)],
        ],
        3.4,
        false
      )
    );
  }
  return parts(
    A(
      body([ringArc(50, 60, 32, 42, 150, 390)], ticks).add(
        solid(path().circle(50, 60, 8))
      )
    ),
    B(
      solid(
        line(
          [
            [50, 60],
            [72, 36],
          ],
          5
        )
      )
    )
  );
});

def("cone", () => {
  const left = (y) => 41 - (19 * (y - 8)) / 72;
  const right = (y) => 59 + (19 * (y - 8)) / 72;
  return parts(
    A(
      solid(
        band(left, right, 8, 28),
        band(left, right, 38, 54),
        band(left, right, 64, 80),
        path().rrect(10, 82, 80, 10, 3)
      )
    ),
    B(solid(band(left, right, 30, 36.5), band(left, right, 56, 62.5)))
  );
});

def("battery", () =>
  parts(
    A(
      body(
        [path().rrect(8, 26, 76, 48, 8)],
        [path().rrect(15, 33, 62, 34, 4)]
      ).add(
        solid(path().rrect(84, 40, 8, 20, 3), path().rrect(20, 38, 32, 24, 2))
      )
    )
  )
);

// ── Beauty and wellness ─────────────────────────────────────────────────────

def("comb", () => {
  const teeth = [];
  for (let i = 0; i < 11; i++)
    teeth.push(path().rrect(12 + i * 7, 38, 4, i < 5 ? 46 : 36, 2));
  return parts(A(solid(path().rrect(8, 20, 84, 20, 7), ...teeth)));
});

def("lipstick", () => {
  const bullet = path().M(38, 40).L(38, 18).L(61, 6).L(62, 40).Z();
  return parts(
    A(solid(bullet, path().rrect(31, 59, 38, 36, 4))),
    B(solid(path().rrect(35, 43, 30, 13, 2)))
  );
});

def("nailPolish", () =>
  parts(
    A(
      body(
        [
          path().rrect(39, 4, 22, 30, 4),
          path().rrect(34, 37, 32, 8, 3),
          path().rrect(21, 48, 58, 46, 14),
        ],
        [path().rrect(33, 62, 34, 4, 2)]
      )
    ),
    B(holes(path().rrect(30, 72, 10, 14, 4)))
  )
);

def("handMirror", () =>
  parts(
    A(
      body(
        [path().ellipse(50, 37, 31, 33)],
        [path().ellipse(50, 37, 24, 26)]
      ).add(solid(path().rrect(43, 66, 14, 30, 6)))
    ),
    B(
      solid(path().ellipse(50, 37, 21, 23)).add(
        holes(
          line(
            [
              [38, 30],
              [50, 18],
            ],
            3.4
          ),
          line(
            [
              [40, 40],
              [58, 22],
            ],
            3.4
          )
        )
      )
    )
  )
);

def("razor", () => {
  const grips = [48, 56, 64, 72, 80].map((y) => path().rrect(46, y, 8, 3, 1.5));
  return parts(
    A(
      body(
        [path().rrect(12, 8, 76, 18, 4), path().rrect(43, 28, 14, 66, 7)],
        grips
      )
    ),
    B(holes(path().rrect(18, 15, 64, 4, 2)))
  );
});

def("dropper", () =>
  parts(
    A(
      body(
        [path().rrect(25, 44, 50, 50, 10), path().rrect(37, 34, 26, 8, 2)],
        [path().rrect(34, 58, 32, 22, 3)]
      )
    ),
    B(solid(path().rrect(42, 6, 16, 26, 8)))
  )
);

def("stones", () =>
  parts(
    A(
      solid(
        path().ellipse(50, 84, 40, 11),
        path().ellipse(50, 62, 30, 9),
        path().ellipse(50, 44, 21, 7)
      )
    ),
    B(solid(path().ellipse(50, 30, 13, 5.5), leaf([54, 24], [78, 6], 10)))
  )
);

def("makeupBrush", () => {
  const bristles = path()
    .M(38, 30)
    .C(36, 14, 44, 4, 50, 4)
    .C(56, 4, 64, 14, 62, 30)
    .Z();
  const handle = path().poly([
    [42, 49],
    [58, 49],
    [54, 96],
    [46, 96],
  ]);
  return parts(
    A(turn(solid(bristles, handle), 32)),
    B(turn(solid(path().rrect(40, 32, 20, 15, 2)), 32))
  );
});

def("lash", () => {
  const lid = line(arcPoints(50, 22, 40, 155, 25, 24), 6);
  const lashes = [140, 115, 90, 65, 40].map((deg) => {
    const t = (deg * Math.PI) / 180;
    return line(
      [
        [50 + 40 * Math.cos(t), 22 + 40 * Math.sin(t)],
        [50 + 54 * Math.cos(t), 22 + 54 * Math.sin(t)],
      ],
      4.2
    );
  });
  return parts(A(solid(lid, ...lashes)));
});

def("barberPole", () => {
  const stripes = [];
  for (const y of [26, 44, 62]) {
    stripes.push(
      path().poly([
        [39, y + 9],
        [61, y - 2],
        [61, y + 6],
        [39, y + 17],
      ])
    );
  }
  return parts(
    A(
      body([path().rrect(39, 17, 22, 64, 2)], stripes).add(
        solid(
          path().rrect(33, 9, 34, 7, 3),
          path().circle(50, 5, 4.5),
          path().rrect(33, 82, 34, 7, 3),
          path().rrect(44, 89, 12, 8, 2)
        )
      )
    )
  );
});

// ── Nonprofits and community ────────────────────────────────────────────────

def("handHeart", () => {
  const hand = path()
    .M(6, 62)
    .C(14, 60, 24, 60, 32, 62)
    .L(54, 68)
    .C(61, 70, 60, 79, 53, 78)
    .L(41, 77)
    .L(62, 82)
    .L(86, 70)
    .C(92, 67, 97, 74, 92, 78)
    .L(66, 94)
    .C(60, 97, 54, 97, 48, 96)
    .L(6, 90)
    .Z();
  return parts(A(solid(hand, heart(54, 34, 40))));
});

def("people", () => {
  const person = (cx, headY, headR, w, top) =>
    solid(
      path().circle(cx, headY, headR),
      path()
        .M(cx - w / 2, 92)
        .C(cx - w / 2, top, cx + w / 2, top, cx + w / 2, 92)
        .Z()
    );
  return parts(
    A(person(19, 42, 9, 26, 58).add(person(81, 42, 9, 26, 58))),
    B(person(50, 30, 12, 34, 50))
  );
});

def("awarenessRibbon", () => {
  const pts = [
    ...bezier([26, 96], [42, 64], [64, 44], [60, 22], 18),
    ...arcPoints(50, 22, 10, 0, -180, 12).slice(1),
    ...bezier([40, 22], [36, 44], [58, 64], [74, 96], 18).slice(1),
  ];
  return parts(A(solid(line(pts, 11, false))));
});

def("ballot", () =>
  parts(
    A(
      body(
        [path().rrect(10, 50, 80, 44, 4)],
        [path().rrect(28, 57, 44, 5, 2.5)]
      )
    ),
    B(
      body(
        [path().rrect(34, 10, 32, 42, 2)],
        [
          line(
            [
              [41, 31],
              [48, 38],
              [59, 24],
            ],
            4
          ),
        ]
      )
    )
  )
);

def("cannedFood", () =>
  parts(
    A(
      body(
        [path().rrect(22, 14, 56, 80, 6)],
        [path().rrect(26, 22, 48, 3, 1.5), path().rrect(26, 83, 48, 3, 1.5)]
      )
    ),
    B(body([path().rrect(22, 36, 56, 38, 1)], [heart(50, 55, 20)]))
  )
);

def("bloodDrop", () => {
  const plus = path().poly([
    [46, 50],
    [54, 50],
    [54, 60],
    [64, 60],
    [64, 68],
    [54, 68],
    [54, 78],
    [46, 78],
    [46, 68],
    [36, 68],
    [36, 60],
    [46, 60],
  ]);
  return parts(A(body([drop(50, 50, 92, 64)], [plus])));
});

def("handRaised", () =>
  parts(
    A(
      solid(
        path().rrect(26, 48, 50, 44, 14),
        path().rrect(27, 18, 10, 40, 5),
        path().rrect(39, 8, 10, 48, 5),
        path().rrect(51, 10, 10, 46, 5),
        path().rrect(63, 20, 10, 38, 5),
        line(
          [
            [30, 70],
            [12, 48],
          ],
          12
        )
      )
    )
  )
);

export const INDUSTRY_MOTIFS = M;
