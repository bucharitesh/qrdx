// Motifs for the world collections (holidays, seasons, events and places):
// festivals and national days from around the world, seasons, and the
// things events and public places are known by. Same rules as motifs.mjs:
// filled glyphs in a 100 × 100 box (centre 50, 50), one or two parts ("a"
// in the motif's main color, "b" in its second). motifs.mjs registers them
// with defineWorldMotifs(), passing its def() and shape helpers.
import {
  arcPoints,
  bezier,
  path,
  regular,
  ringArc,
  starPoints,
  transform,
} from "./lib.mjs";

const parts = (...list) => list.filter(Boolean);
const A = (p, rule) => ({ p, role: "a", rule });
const B = (p, rule) => ({ p, role: "b", rule });

/** Signed area of a closed polyline (positive: clockwise on screen). */
const area = (pts) => {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
};

/** Points, turned clockwise so overlapping pieces of one paint union. */
const cw = (pts) => (area(pts) < 0 ? [...pts].reverse() : pts);

/**
 * A polyline `width` wide as a clockwise outline with butt ends, so pieces
 * that cross each other (spars, frames, seams) still fill as one shape.
 */
function band(points, width) {
  const half = width / 2;
  const n = points.length;
  const normal = (i) => {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
  };
  const left = [];
  const right = [];
  for (let i = 0; i < n; i++) {
    const [nx, ny] = normal(i);
    left.push([points[i][0] + nx * half, points[i][1] + ny * half]);
    right.push([points[i][0] - nx * half, points[i][1] - ny * half]);
  }
  return cw([...left, ...right.reverse()]);
}

/** A band whose width runs from w0 to w1 along the points. */
function taperBand(points, w0, w1) {
  const n = points.length;
  const left = [];
  const right = [];
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / len;
    const ny = (b[0] - a[0]) / len;
    const half = (w0 + ((w1 - w0) * i) / (n - 1)) / 2;
    left.push([points[i][0] + nx * half, points[i][1] + ny * half]);
    right.push([points[i][0] - nx * half, points[i][1] - ny * half]);
  }
  return cw([...left, ...right.reverse()]);
}

/** A closed polygon from a function sampled round a full turn. */
const sampled = (fn, n = 72) =>
  cw(Array.from({ length: n }, (_, i) => fn((i / n) * Math.PI * 2)));

/** `piece` (path commands) moved to (x, y) and turned `rot` degrees. */
const place = (piece, x, y, rot = 0) => transform(piece, { rot, dx: x, dy: y });

// Every world motif: [name, words for the descriptions, draw(h)]. `h`
// carries motifs.mjs's shape helpers: leaf(p, a, b, w, bend),
// teardrop(p, cx, cy, h, w), ring(p, cx, cy, outer, inner), heart(p, cx, cy, s).
const LIST = [];
const add = (name, words, draw) => LIST.push([name, words, draw]);

// ── Holidays ────────────────────────────────────────────────────────────────

// South Asia
add("kite", "a kite", ({ A, B, parts, band }) => {
  const body = path().poly([
    [50, 4],
    [80, 38],
    [50, 76],
    [20, 38],
  ]);
  const halves = path()
    .poly([
      [50, 4],
      [80, 38],
      [50, 38],
    ])
    .poly([
      [50, 38],
      [50, 76],
      [20, 38],
    ]);
  const tail = path().poly(
    band(bezier([50, 74], [42, 84], [62, 88], [54, 98], 16), 2.6)
  );
  const bows = path()
    .poly([
      [44, 84],
      [52, 86],
      [44, 90],
    ])
    .poly([
      [60, 90],
      [52, 92],
      [60, 96],
    ]);
  return parts(A(body), B(halves), A(tail), B(bows));
});

add("bonfire", "a bonfire", ({ A, B, parts, teardrop, band }) => {
  const flame = path()
    .M(50, 6)
    .C(62, 22, 78, 34, 76, 56)
    .C(75, 70, 64, 80, 50, 80)
    .C(36, 80, 25, 70, 24, 56)
    .C(23, 42, 34, 34, 38, 22)
    .C(42, 32, 44, 38, 48, 40)
    .C(52, 30, 52, 18, 50, 6)
    .Z();
  const inner = path();
  teardrop(inner, 50, 64, 30, 20);
  const logs = path()
    .poly(
      band(
        [
          [14, 94],
          [86, 74],
        ],
        10
      )
    )
    .poly(
      band(
        [
          [14, 74],
          [86, 94],
        ],
        10
      )
    );
  return parts(A(flame), B(inner), B(logs));
});

add("pongalPot", "a pot boiling over", ({ A, B, parts }) => {
  const pot = path().circle(50, 66, 26).rrect(34, 38, 32, 10, 3);
  const foam = path()
    .circle(36, 38, 9)
    .circle(50, 31, 12)
    .circle(64, 38, 9)
    .circle(43, 27, 7)
    .circle(57, 26, 7);
  const bandP = path()
    .M(25, 60)
    .C(40, 66, 60, 66, 75, 60)
    .L(75.8, 67)
    .C(60, 73, 40, 73, 24.2, 67)
    .Z();
  return parts(A(pot), B(foam), B(bandP));
});

add("dhol", "a dhol drum", ({ A, B, parts, band }) => {
  const body = path()
    .M(22, 30)
    .C(16, 42, 16, 58, 22, 70)
    .L(78, 70)
    .C(84, 58, 84, 42, 78, 30)
    .Z();
  const heads = path().ellipse(20, 50, 7, 21).ellipse(80, 50, 7, 21);
  const rope = path().poly(
    band(
      [
        [28, 33],
        [36, 67],
        [44, 33],
        [52, 67],
        [60, 33],
        [68, 67],
        [74, 40],
      ],
      3
    )
  );
  const strap = path().poly(
    band(bezier([20, 30], [30, 8], [70, 8], [80, 30], 20), 3.5)
  );
  return parts(A(body), B(heads), B(rope), A(strap));
});

add("pookalam", "a pookalam flower carpet", ({ A, B, parts }) => {
  const outer = path().circle(50, 50, 40);
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI * 2) / 16;
    outer.circle(50 + 40 * Math.cos(a), 50 + 40 * Math.sin(a), 6.5);
  }
  const star = path()
    .poly(starPoints(50, 50, 33, 15, 8))
    .circle(50, 50, 9, true);
  const dots = path();
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) * Math.PI * 2) / 8;
    dots.circle(50 + 28 * Math.cos(a), 50 + 28 * Math.sin(a), 3.2);
  }
  return parts(A(outer), B(star), B(dots));
});

add("snakeBoat", "a snake boat", ({ A, B, parts, band }) => {
  const hull = path()
    .M(4, 60)
    .L(70, 60)
    .C(80, 60, 87, 50, 90, 20)
    .L(96, 20)
    .C(95, 52, 86, 72, 66, 72)
    .L(14, 72)
    .C(8, 72, 4, 67, 4, 60)
    .Z();
  const crew = path();
  for (let i = 0; i < 6; i++) {
    const x = 14 + i * 10.5;
    crew.circle(x, 47, 3.6);
    crew.poly(
      band(
        [
          [x + 2, 52],
          [x - 5, 84],
        ],
        2.4
      )
    );
  }
  return parts(A(hull), B(crew));
});

add("dandiya", "a pair of dandiya sticks", ({ A, B, parts, band, place }) => {
  const sticks = path()
    .poly(
      band(
        [
          [20, 92],
          [80, 8],
        ],
        8
      )
    )
    .poly(
      band(
        [
          [80, 92],
          [20, 8],
        ],
        8
      )
    );
  const rings = path();
  const piece = path().rrect(-8, -3, 16, 6, 1.5).c;
  for (const t of [0.18, 0.34, 0.66, 0.82]) {
    rings.add(place(piece, 20 + 60 * t, 92 - 84 * t, -54.5));
    rings.add(place(piece, 80 - 60 * t, 92 - 84 * t, 54.5));
  }
  return parts(A(sticks), B(rings));
});

add("rakhi", "a rakhi", ({ A, B, parts, band }) => {
  const thread = path()
    .poly(band(bezier([2, 44], [12, 50], [22, 50], [32, 50], 12), 4.5))
    .poly(band(bezier([68, 50], [78, 50], [88, 50], [98, 44], 12), 4.5));
  const petals = path();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI * 2) / 10;
    petals.circle(50 + 17 * Math.cos(a), 50 + 17 * Math.sin(a), 8.5);
  }
  const centre = path().circle(50, 50, 11);
  const tassels = path()
    .poly([
      [2, 44],
      [6, 60],
      [-2, 60],
    ])
    .poly([
      [98, 44],
      [102, 60],
      [94, 60],
    ]);
  return parts(A(thread), A(petals), B(centre), B(tassels));
});

add("peacockFeather", "a peacock feather", ({ A, B, parts, leaf, band }) => {
  const vane = path();
  leaf(vane, [40, 96], [58, 4], 40, 0);
  const quill = path().poly(
    band(
      [
        [34, 99],
        [44, 76],
      ],
      3
    )
  );
  const eye = path().ellipse(55, 26, 13, 16).ellipse(55, 28, 6.5, 8.5, true);
  const barbs = path();
  for (const y of [52, 62, 72]) {
    const x = 40 + (96 - y) * 0.2;
    barbs.poly(
      band(
        [
          [x, y + 4],
          [x - 12, y - 6],
        ],
        2
      )
    );
    barbs.poly(
      band(
        [
          [x, y + 4],
          [x + 12, y - 8],
        ],
        2
      )
    );
  }
  return parts(A(vane), A(quill), B(eye, "evenodd"), B(barbs));
});

add("modak", "a modak", ({ A, B, parts, band }) => {
  const body = path()
    .M(50, 6)
    .C(56, 20, 84, 40, 84, 62)
    .C(84, 80, 68, 90, 50, 90)
    .C(32, 90, 16, 80, 16, 62)
    .C(16, 40, 44, 20, 50, 6)
    .Z();
  const pleats = path();
  for (const x of [26, 38, 50, 62, 74]) {
    pleats.poly(band(bezier([50, 14], [50, 30], [x, 50], [x, 86], 14), 3));
  }
  return parts(A(body), B(pleats));
});

add("gudi", "a gudi", ({ A, B, parts, band }) => {
  const pole = path().poly(
    band(
      [
        [50, 24],
        [50, 98],
      ],
      5
    )
  );
  const pot = path().M(36, 22).C(36, 6, 64, 6, 64, 22).L(60, 26).L(40, 26).Z();
  const cloth = path()
    .M(38, 26)
    .L(62, 26)
    .L(72, 66)
    .C(62, 60, 56, 68, 50, 62)
    .C(44, 68, 38, 60, 28, 66)
    .Z();
  const garland = path();
  for (let i = 0; i < 5; i++) garland.circle(36 + i * 7, 30 + (i % 2) * 2, 3.4);
  return parts(A(pole), A(pot), B(cloth), A(garland));
});

add("flute", "a flute", ({ A, B, parts, band, place }) => {
  const pipe = path().poly(
    band(
      [
        [8, 84],
        [92, 20],
      ],
      9
    )
  );
  const holes = path();
  for (const t of [0.42, 0.52, 0.62, 0.72]) {
    holes.circle(8 + 84 * t, 84 - 64 * t, 2.2);
  }
  const wraps = path();
  const piece = path().rrect(-2.5, -6.5, 5, 13, 1).c;
  for (const t of [0.1, 0.16, 0.9]) {
    wraps.add(place(piece, 8 + 84 * t, 84 - 64 * t, 53));
  }
  const tassel = path()
    .poly(
      band(
        [
          [18, 76],
          [20, 96],
        ],
        2.4
      )
    )
    .poly(
      band(
        [
          [18, 76],
          [12, 94],
        ],
        2.4
      )
    );
  return parts(A(pipe), B(holes), B(wraps), B(tassel));
});

// Southeast Asia
add("waterBowl", "a bowl of water", ({ A, B, parts, teardrop }) => {
  const bowl = path()
    .M(12, 50)
    .L(88, 50)
    .C(86, 72, 70, 84, 50, 84)
    .C(30, 84, 14, 72, 12, 50)
    .Z()
    .rrect(38, 82, 24, 8, 2);
  const water = path().ellipse(50, 50, 36, 5);
  teardrop(water, 30, 30, 18, 11);
  teardrop(water, 50, 18, 22, 13);
  teardrop(water, 70, 30, 18, 11);
  return parts(A(bowl), B(water));
});

add("krathong", "a krathong", ({ A, B, parts, leaf, teardrop }) => {
  const base = path().M(8, 70).C(18, 88, 82, 88, 92, 70).Z();
  const petals = path();
  for (const [x, y] of [
    [16, 50],
    [30, 40],
    [70, 40],
    [84, 50],
  ]) {
    leaf(petals, [50, 72], [x, y], 18);
  }
  leaf(petals, [40, 72], [40, 34], 14);
  leaf(petals, [60, 72], [60, 34], 14);
  const candle = path().rrect(46, 30, 8, 30, 2);
  teardrop(candle, 50, 20, 16, 9);
  return parts(A(base), A(petals), B(candle));
});

add("vesakLantern", "a star lantern", ({ A, B, parts, band }) => {
  const star = path().poly(starPoints(50, 42, 38, 25, 8, -90));
  const hub = path().poly(regular(50, 42, 11, 8, -67.5));
  const tassels = path()
    .poly(
      band(
        [
          [50, 6],
          [50, 0],
        ],
        3
      )
    )
    .poly(
      band(
        [
          [40, 72],
          [38, 98],
        ],
        3
      )
    )
    .poly(
      band(
        [
          [50, 80],
          [50, 100],
        ],
        3
      )
    )
    .poly(
      band(
        [
          [60, 72],
          [62, 98],
        ],
        3
      )
    );
  return parts(A(star), B(hub), B(tassels));
});

add("ketupat", "a ketupat", ({ A, B, parts, band }) => {
  const top = [50, 16];
  const right = [84, 50];
  const left = [16, 50];
  const at = (i, j) => [
    top[0] + ((right[0] - top[0]) * i) / 3 + ((left[0] - top[0]) * j) / 3,
    top[1] + ((right[1] - top[1]) * i) / 3 + ((left[1] - top[1]) * j) / 3,
  ];
  const body = path().poly([at(0, 0), at(3, 0), at(3, 3), at(0, 3)]);
  const weave = path();
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if ((i + j) % 2 === 0) {
        weave.poly([at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]);
      }
    }
  }
  const tails = path()
    .poly(
      band(
        [
          [50, 18],
          [40, 2],
        ],
        4
      )
    )
    .poly(
      band(
        [
          [50, 18],
          [60, 2],
        ],
        4
      )
    );
  return parts(A(body), B(weave), A(tails));
});

add("dates", "a bowl of dates", ({ A, B, parts, place }) => {
  const fruit = path();
  const date = path().ellipse(0, 0, 8.5, 15).c;
  fruit.add(place(date, 30, 46, -38));
  fruit.add(place(date, 43, 38, -12));
  fruit.add(place(date, 57, 38, 12));
  fruit.add(place(date, 70, 46, 38));
  const bowl = path()
    .M(12, 54)
    .L(88, 54)
    .C(86, 76, 70, 86, 50, 86)
    .C(30, 86, 14, 76, 12, 54)
    .Z()
    .rrect(36, 84, 28, 6, 2);
  return parts(A(fruit), B(bowl));
});

// East Asia
add("mooncake", "a mooncake", ({ A, B, parts }) => {
  const cake = path().circle(50, 50, 36);
  for (let i = 0; i < 14; i++) {
    const a = (i * Math.PI * 2) / 14;
    cake.circle(50 + 36 * Math.cos(a), 50 + 36 * Math.sin(a), 8);
  }
  const ringP = path().circle(50, 50, 25).circle(50, 50, 21, true);
  const flower = path()
    .poly(starPoints(50, 50, 15, 6, 4, -45))
    .circle(50, 50, 4.5, true);
  return parts(A(cake), B(ringP), B(flower));
});

add("rabbit", "a rabbit", ({ A, B, parts, leaf }) => {
  const body = path()
    .ellipse(58, 68, 26, 22)
    .circle(34, 46, 15)
    .circle(84, 72, 7)
    .ellipse(36, 88, 11, 5);
  leaf(body, [30, 38], [22, 4], 12, -2);
  leaf(body, [38, 36], [44, 4], 12, 2);
  const inner = path();
  leaf(inner, [30, 30], [24, 10], 5, -1);
  leaf(inner, [39, 28], [43, 10], 5, 1);
  inner.circle(28, 44, 2.6);
  return parts(A(body), B(inner));
});

add("songpyeon", "a plate of songpyeon", ({ A, B, parts }) => {
  const plate = path().ellipse(50, 74, 46, 13);
  const cake = (x, y) =>
    path()
      .M(x - 17, y)
      .C(x - 17, y - 20, x + 17, y - 20, x + 17, y)
      .Z();
  const cakes = path().add(cake(32, 70)).add(cake(68, 70)).add(cake(50, 58));
  return parts(A(plate), B(cakes));
});

add("dragonBoat", "a dragon boat", ({ A, B, parts, band }) => {
  const hull = path()
    .M(10, 58)
    .L(88, 58)
    .C(92, 52, 94, 44, 92, 36)
    .C(98, 42, 100, 56, 92, 66)
    .C(80, 74, 30, 74, 18, 68)
    .Z();
  const head = path()
    .M(10, 60)
    .C(4, 46, 6, 34, 12, 26)
    .L(24, 22)
    .L(19, 30)
    .L(28, 32)
    .L(17, 37)
    .C(15, 46, 17, 52, 20, 60)
    .Z();
  const crew = path();
  for (let i = 0; i < 6; i++) {
    const x = 30 + i * 10;
    crew.circle(x, 44, 3.6);
    crew.poly(
      band(
        [
          [x - 3, 48],
          [x + 6, 82],
        ],
        2.6
      )
    );
  }
  return parts(A(hull), A(head), B(crew));
});

add("zongzi", "a zongzi", ({ A, B, parts, band }) => {
  const body = path()
    .M(50, 10)
    .C(54, 10, 88, 72, 88, 78)
    .C(88, 84, 84, 86, 80, 86)
    .L(20, 86)
    .C(16, 86, 12, 84, 12, 78)
    .C(12, 72, 46, 10, 50, 10)
    .Z();
  const ties = path()
    .poly(
      band(
        [
          [28, 56],
          [72, 56],
        ],
        5
      )
    )
    .poly(
      band(
        [
          [50, 14],
          [50, 86],
        ],
        4
      )
    );
  return parts(A(body), B(ties));
});

add("koinobori", "carp streamers", ({ A, B, parts, band }) => {
  const pole = path()
    .poly(
      band(
        [
          [10, 4],
          [10, 98],
        ],
        4.5
      )
    )
    .circle(10, 4, 4.5);
  const carp = (y, s) =>
    transform(
      path()
        .M(0, 0)
        .C(30, -10, 56, -6, 64, 2)
        .L(78, -8)
        .L(72, 10)
        .L(78, 28)
        .L(64, 18)
        .C(56, 26, 30, 30, 0, 20)
        .Z().c,
      { s, dx: 14, dy: y }
    );
  const fish = path().add(carp(10, 1)).add(carp(54, 0.82));
  const marks = path()
    .ellipse(14, 20, 3, 10)
    .circle(24, 15, 3.5)
    .ellipse(14 * 1, 62.2, 2.5, 8)
    .circle(22, 58.5, 3);
  return parts(A(fish), B(pole), B(marks));
});

add(
  "tanzaku",
  "a bamboo branch with paper wishes",
  ({ A, B, parts, band, leaf, place }) => {
    const bamboo = path().poly(
      band(bezier([28, 98], [30, 60], [34, 30], [44, 2], 16), 5.5)
    );
    leaf(bamboo, [33, 34], [60, 20], 10, 2);
    leaf(bamboo, [31, 56], [10, 44], 10, -2);
    leaf(bamboo, [30, 70], [60, 64], 10, 2);
    const strip = path().rrect(-5, 0, 10, 24, 1).c;
    const strips = path()
      .add(place(strip, 56, 26, 6))
      .add(place(strip, 72, 40, -4))
      .add(place(strip, 14, 50, -6))
      .add(place(strip, 64, 66, 4));
    return parts(A(bamboo), B(strips));
  }
);

add("kadomatsu", "a kadomatsu", ({ A, B, parts, leaf }) => {
  const stalks = path()
    .poly([
      [30, 32],
      [42, 24],
      [42, 76],
      [30, 76],
    ])
    .poly([
      [44, 16],
      [56, 6],
      [56, 76],
      [44, 76],
    ])
    .poly([
      [58, 28],
      [70, 20],
      [70, 76],
      [58, 76],
    ]);
  const base = path().rrect(22, 70, 56, 26, 5);
  const pine = path();
  leaf(pine, [24, 72], [8, 56], 10, -2);
  leaf(pine, [76, 72], [92, 56], 10, 2);
  return parts(A(stalks), B(base), A(pine));
});

add("paperLantern", "a paper lantern", ({ A, B, parts, band }) => {
  const body = path().ellipse(50, 50, 27, 34);
  const ribs = path();
  for (const y of [32, 41, 50, 59, 68]) {
    const half = 27 * Math.sqrt(1 - ((y - 50) / 34) ** 2) - 1.5;
    ribs.poly(
      band(
        [
          [50 - half, y],
          [50 + half, y],
        ],
        2.4
      )
    );
  }
  const caps = path()
    .rrect(34, 12, 32, 8, 2)
    .rrect(34, 80, 32, 8, 2)
    .poly(
      band(
        [
          [50, 2],
          [50, 12],
        ],
        3
      )
    );
  return parts(A(body), B(ribs), B(caps));
});

add(
  "banhChung",
  "a square rice cake tied with string",
  ({ A, B, parts, band }) => {
    const cake = path().rrect(16, 16, 68, 68, 5);
    const ties = path()
      .poly(
        band(
          [
            [38, 16],
            [38, 84],
          ],
          4.5
        )
      )
      .poly(
        band(
          [
            [62, 16],
            [62, 84],
          ],
          4.5
        )
      )
      .poly(
        band(
          [
            [16, 38],
            [84, 38],
          ],
          4.5
        )
      )
      .poly(
        band(
          [
            [16, 62],
            [84, 62],
          ],
          4.5
        )
      );
    const knot = path()
      .poly([
        [50, 12],
        [38, 2],
        [40, 14],
      ])
      .poly([
        [50, 12],
        [60, 14],
        [62, 2],
      ]);
    return parts(A(cake), B(ties), B(knot));
  }
);

// Middle East and Central Asia
add("goldfish", "a goldfish", ({ A, B, parts }) => {
  const body = path()
    .M(12, 50)
    .C(22, 30, 50, 26, 64, 40)
    .L(90, 22)
    .C(84, 38, 84, 62, 90, 78)
    .L(64, 60)
    .C(50, 74, 22, 70, 12, 50)
    .Z();
  const fins = path()
    .poly([
      [36, 34],
      [48, 20],
      [54, 34],
    ])
    .circle(26, 46, 3.6);
  const bubbles = path().circle(10, 30, 3.6).circle(16, 18, 2.6);
  return parts(A(body), B(fins), B(bubbles));
});

add("sabzeh", "a dish of sprouted wheat", ({ A, B, parts, leaf }) => {
  const grass = path();
  for (let i = 0; i < 11; i++) {
    const x = 20 + i * 6;
    const top = 10 + Math.abs(i - 5) * 3.5;
    leaf(grass, [x, 74], [x + (i - 5) * 1.6, top], 6.5);
  }
  const dish = path()
    .M(12, 70)
    .L(88, 70)
    .C(86, 84, 72, 92, 50, 92)
    .C(28, 92, 14, 84, 12, 70)
    .Z();
  const ribbon = path()
    .rrect(26, 50, 48, 7, 2)
    .poly([
      [74, 53],
      [88, 44],
      [86, 60],
    ]);
  return parts(A(grass), B(dish), B(ribbon));
});

add("pomegranate", "a pomegranate", ({ A, B, parts, leaf }) => {
  const fruit = path()
    .circle(50, 58, 34)
    .poly([
      [38, 28],
      [40, 14],
      [45, 22],
      [50, 10],
      [55, 22],
      [60, 14],
      [62, 28],
    ]);
  const leaves = path();
  leaf(leaves, [56, 20], [82, 8], 13, -2);
  const seeds = path();
  for (const [x, y] of [
    [36, 56],
    [46, 50],
    [40, 68],
    [52, 62],
  ]) {
    seeds.ellipse(x, y, 3.6, 4.6);
  }
  return parts(A(fruit), B(leaves), B(seeds));
});

// Jewish holidays
add("apple", "an apple", ({ A, B, parts, leaf, band }) => {
  const body = path()
    .M(50, 30)
    .C(40, 20, 14, 22, 14, 50)
    .C(14, 74, 32, 92, 42, 90)
    .C(46, 89, 54, 89, 58, 90)
    .C(68, 92, 86, 74, 86, 50)
    .C(86, 22, 60, 20, 50, 30)
    .Z();
  const top = path().poly(
    band(
      [
        [50, 32],
        [53, 10],
      ],
      4
    )
  );
  leaf(top, [54, 20], [78, 8], 14, -2);
  return parts(A(body), B(top));
});

add("honeyJar", "a jar of honey", ({ A, B, parts, teardrop }) => {
  const jar = path().rrect(22, 34, 56, 56, 14).rrect(28, 22, 44, 12, 3);
  const label = path().rrect(22, 52, 56, 20);
  const drip = path().rrect(28, 32, 44, 6, 2);
  teardrop(drip, 38, 42, 12, 7);
  teardrop(drip, 62, 44, 14, 7);
  return parts(A(jar), B(label), B(drip));
});

add("shofar", "a shofar", ({ A, B, parts, taperBand }) => {
  const horn = path().poly(
    taperBand(bezier([10, 82], [44, 96], [70, 70], [80, 22], 30), 7, 26)
  );
  const rim = path().ellipse(80, 20, 14, 5);
  const bands = path()
    .poly(
      taperBand(bezier([10, 82], [14, 84], [18, 85.5], [22, 86.6], 4), 9, 10)
    )
    .poly(taperBand(bezier([70, 62], [72, 56], [73, 52], [74, 48], 4), 24, 24));
  return parts(A(horn), B(rim), B(bands));
});

add("hamantasch", "a filled triangle pastry", ({ A, B, parts }) => {
  const dough = path()
    .M(50, 8)
    .Q(56, 8, 90, 74)
    .Q(92, 84, 82, 84)
    .L(18, 84)
    .Q(8, 84, 10, 74)
    .Q(44, 8, 50, 8)
    .Z();
  const filling = path().poly(regular(50, 60, 16, 3, 90));
  return parts(A(dough), B(filling));
});

// Africa and the diaspora
add("kinara", "a kinara", ({ A, B, parts, teardrop }) => {
  const holder = path()
    .rrect(8, 64, 84, 10, 3)
    .poly([
      [34, 74],
      [66, 74],
      [72, 92],
      [28, 92],
    ]);
  const flames = path();
  for (let i = 0; i < 7; i++) {
    const x = 14 + i * 12;
    const top = i === 3 ? 26 : 34;
    holder.rrect(x - 3.5, top, 7, 64 - top, 1);
    teardrop(flames, x, top - 9, 13, 7);
  }
  return parts(A(holder), B(flames));
});

add("nova", "a star in a starburst", ({ A, B, parts }) => {
  const burst = path()
    .poly(starPoints(50, 50, 47, 36, 12))
    .poly(starPoints(50, 50, 39, 30, 12), true);
  const star = path().poly(starPoints(50, 52, 24, 10, 5));
  return parts(A(burst), B(star));
});

// Latin America
add("panDeMuerto", "a pan de muerto", ({ A, B, parts, band }) => {
  const bread = path()
    .M(10, 80)
    .C(10, 40, 30, 28, 50, 28)
    .C(70, 28, 90, 40, 90, 80)
    .Z();
  const bones = path()
    .poly(
      band(
        [
          [24, 70],
          [76, 44],
        ],
        7
      )
    )
    .poly(
      band(
        [
          [24, 44],
          [76, 70],
        ],
        7
      )
    );
  for (const [x, y] of [
    [22, 66],
    [26, 74],
    [74, 40],
    [78, 48],
    [22, 48],
    [26, 40],
    [74, 74],
    [78, 66],
  ]) {
    bones.circle(x, y, 5);
  }
  bones.circle(50, 24, 8);
  return parts(A(bread), B(bones));
});

add("papelPicado", "papel picado banners", ({ A, B, parts, band }) => {
  const line = path().poly(
    band(bezier([2, 14], [30, 22], [70, 22], [98, 14], 20), 2.6)
  );
  const flags = path();
  for (const [x, y] of [
    [6, 17],
    [37, 20],
    [68, 17],
  ]) {
    const zig = [];
    for (let i = 0; i <= 6; i++)
      zig.push([x + 26 - i * (26 / 6), y + 52 + (i % 2) * 6]);
    flags.poly([[x, y], [x + 26, y], ...zig]);
    flags.circle(x + 13, y + 16, 5, true);
    flags.poly(
      [
        [x + 6, y + 32],
        [x + 9, y + 28],
        [x + 12, y + 32],
        [x + 9, y + 36],
      ],
      true
    );
    flags.poly(
      [
        [x + 14, y + 32],
        [x + 17, y + 28],
        [x + 20, y + 32],
        [x + 17, y + 36],
      ],
      true
    );
  }
  return parts(A(flags), B(line));
});

add("pinata", "a star piñata", ({ A, B, parts }) => {
  const body = path().circle(50, 52, 19);
  const tips = path();
  for (let i = 0; i < 7; i++) {
    const a = ((-90 + (i * 360) / 7) * Math.PI) / 180;
    const along = (r) => [50 + r * Math.cos(a), 52 + r * Math.sin(a)];
    const side = (r, w) => [
      50 + r * Math.cos(a) - w * Math.sin(a),
      52 + r * Math.sin(a) + w * Math.cos(a),
    ];
    body.poly(cw([side(14, -8), side(14, 8), along(40)]));
    tips.poly(cw([side(34, -2.6), side(34, 2.6), along(46)]));
  }
  return parts(A(body), B(tips));
});

add("rosca", "a rosca de reyes", ({ A, B, parts, place }) => {
  const ringP = path().ellipse(50, 54, 44, 30).ellipse(50, 54, 22, 11, true);
  const fruit = path();
  const piece = path().rrect(-6, -2.6, 12, 5.2, 2).c;
  for (let i = 0; i < 9; i++) {
    const a = (i * Math.PI * 2) / 9 + 0.3;
    fruit.add(
      place(
        piece,
        50 + 33 * Math.cos(a),
        54 + 20.5 * Math.sin(a),
        (a * 180) / Math.PI + 90
      )
    );
  }
  return parts(A(ringP, "evenodd"), B(fruit));
});

add("plume", "a fan of carnival feathers", ({ A, B, parts, leaf, band }) => {
  const feathers = path();
  const spines = path();
  for (const deg of [-160, -128, -90, -52, -20]) {
    const a = (deg * Math.PI) / 180;
    const tip = [50 + 46 * Math.cos(a), 84 + 76 * Math.sin(a)];
    leaf(feathers, [50, 84], tip, 20);
    spines.poly(
      band(
        [
          [50, 84],
          [50 + (tip[0] - 50) * 0.8, 84 + (tip[1] - 84) * 0.8],
        ],
        2
      )
    );
  }
  spines.circle(50, 84, 10);
  return parts(A(feathers), B(spines));
});

add("corn", "an ear of corn", ({ A, B, parts, leaf }) => {
  const cob = path();
  leaf(cob, [50, 90], [50, 6], 34);
  for (let row = 0; row < 7; row++) {
    const y = 20 + row * 9;
    const half = 13 * Math.sin((Math.PI * (y - 6)) / 84) - 3;
    for (let x = 50 - half + 3; x <= 50 + half - 3; x += 7.5) {
      cob.ellipse(x, y, 2.6, 3.2, true);
    }
  }
  const husk = path();
  leaf(husk, [50, 96], [18, 30], 22, -8);
  leaf(husk, [50, 96], [82, 30], 22, 8);
  return parts(A(cob, "evenodd"), B(husk));
});

// Eastern Europe
add("pysanka", "a decorated egg", ({ A, B, parts, sampled }) => {
  const egg = (t) => {
    const y = 52 - 40 * Math.cos(t);
    const w = 33 * Math.sin(t) * (1 - 0.14 * Math.cos(t));
    return [50 + w, y];
  };
  const eggPts = sampled(egg, 96);
  const half = (y) => {
    // width of the egg at height y
    const c = (52 - y) / 40;
    const t = Math.acos(Math.max(-1, Math.min(1, c)));
    return 33 * Math.sin(t) * (1 - 0.14 * Math.cos(t));
  };
  const bandP = path();
  const top = 44;
  const bottom = 62;
  const rows = [];
  for (let y = top; y <= bottom; y += 2) rows.push([50 + half(y), y]);
  const left = rows.map(([x, y]) => [100 - x, y]).reverse();
  bandP.poly(cw([...rows, ...left]));
  for (let i = 0; i < 6; i++) {
    const x = 24 + i * 10.4;
    bandP.poly(
      [
        [x - 4, top + 3],
        [x, bottom - 3],
        [x + 4, top + 3],
      ],
      true
    );
  }
  const cap = path().poly(starPoints(50, 26, 9, 4, 8));
  const dots = path().circle(36, 76, 3).circle(50, 80, 3).circle(64, 76, 3);
  return parts(A(path().poly(eggPts)), B(bandP, "evenodd"), B(cap), B(dots));
});

add("pancakes", "a stack of pancakes", ({ A, B, parts, teardrop }) => {
  const stack = path();
  for (const y of [80, 70, 60, 50]) stack.ellipse(50, y, 38, 9);
  const top = path().rrect(40, 36, 20, 10, 2).ellipse(50, 48, 30, 5);
  teardrop(top, 24, 58, 14, 7);
  teardrop(top, 74, 62, 16, 7);
  return parts(A(stack), B(top));
});

// Awareness days
add("ribbonLoop", "an awareness ribbon", ({ A, parts, band }) => {
  const r = path()
    .poly(
      band(
        [
          [28, 92],
          [57, 40],
        ],
        12
      )
    )
    .poly(band(bezier([57, 40], [74, 10], [26, 10], [43, 40], 24), 12))
    .poly(
      band(
        [
          [43, 40],
          [72, 92],
        ],
        12
      )
    );
  return parts(A(r));
});

add("waterDrop", "a water drop", ({ A, B, parts, teardrop, leaf }) => {
  const drop = path();
  teardrop(drop, 50, 52, 88, 60);
  const shine = path();
  leaf(shine, [34, 74], [30, 52], 7, -3);
  return parts(A(drop), B(shine));
});

add("donorDrop", "a drop with a cross", ({ A, B, parts, teardrop }) => {
  const drop = path();
  teardrop(drop, 50, 52, 88, 60);
  const cross = path().rrect(44, 52, 12, 30, 2).rrect(35, 61, 30, 12, 2);
  return parts(A(drop), B(cross));
});

add("mimosa", "a mimosa sprig", ({ A, B, parts, band, leaf }) => {
  const stem = path().poly(
    band(bezier([20, 96], [30, 70], [50, 40], [80, 14], 20), 3.5)
  );
  leaf(stem, [34, 66], [12, 52], 10, -2);
  leaf(stem, [48, 48], [32, 28], 10, -2);
  leaf(stem, [44, 56], [66, 62], 10, 2);
  const blooms = path();
  for (const [x, y, r] of [
    [80, 14, 7],
    [70, 20, 6],
    [76, 28, 6.5],
    [62, 30, 6],
    [56, 22, 5.5],
    [86, 24, 5.5],
    [66, 40, 5.5],
    [52, 38, 5],
  ]) {
    blooms.circle(x, y, r);
  }
  return parts(A(stem), B(blooms));
});

// ── Seasons ─────────────────────────────────────────────────────────────────

add(
  "rainUmbrella",
  "an umbrella in the rain",
  ({ A, B, parts, band, teardrop }) => {
    const canopy = path()
      .M(8, 50)
      .C(8, 24, 28, 10, 50, 10)
      .C(72, 10, 92, 24, 92, 50)
      .C(86, 44, 78, 44, 71, 50)
      .C(65, 44, 57, 44, 50, 50)
      .C(43, 44, 35, 44, 29, 50)
      .C(22, 44, 14, 44, 8, 50)
      .Z()
      .poly(
        band(
          [
            [50, 4],
            [50, 12],
          ],
          3.5
        )
      );
    const handle = path().poly(
      band(
        [
          [50, 48],
          [50, 84],
          ...bezier([50, 84], [50, 94], [38, 94], [38, 84], 10).slice(1),
        ],
        5
      )
    );
    const drops = path();
    teardrop(drops, 14, 70, 12, 7);
    teardrop(drops, 84, 66, 12, 7);
    teardrop(drops, 72, 86, 10, 6);
    return parts(A(canopy), A(handle), B(drops));
  }
);

add("rainCloud", "a rain cloud", ({ A, B, parts, band }) => {
  const cloud = path()
    .circle(32, 46, 16)
    .circle(54, 36, 21)
    .circle(72, 48, 14)
    .rrect(16, 44, 70, 18, 9);
  const rain = path();
  for (const [x, y, l] of [
    [28, 72, 12],
    [44, 72, 18],
    [60, 72, 12],
    [74, 70, 16],
    [36, 90, 8],
    [58, 90, 8],
  ]) {
    rain.poly(
      band(
        [
          [x, y],
          [x - l * 0.3, y + l],
        ],
        4
      )
    );
  }
  return parts(A(cloud), B(rain));
});

add("paperBoat", "a paper boat", ({ A, B, parts, band }) => {
  const hull = path()
    .poly([
      [6, 58],
      [94, 58],
      [78, 80],
      [22, 80],
    ])
    .poly([
      [28, 58],
      [50, 14],
      [50, 58],
    ]);
  const sail = path().poly([
    [50, 22],
    [72, 58],
    [50, 58],
  ]);
  const water = path()
    .poly(band(bezier([4, 90], [20, 84], [32, 96], [48, 90], 12), 4))
    .poly(band(bezier([52, 90], [68, 84], [80, 96], [96, 90], 12), 4));
  return parts(A(hull), B(sail), B(water));
});

add("rainBoots", "a pair of rain boots", ({ A, B, parts }) => {
  const boot = (dx) =>
    path()
      .M(dx + 4, 14)
      .L(dx + 28, 14)
      .L(dx + 28, 64)
      .C(dx + 40, 64, dx + 50, 70, dx + 50, 80)
      .L(dx + 50, 88)
      .L(dx + 4, 88)
      .Z();
  const soles = path().rrect(4, 84, 46, 6, 2).rrect(44, 88, 46, 6, 2);
  return parts(
    A(boot(0)),
    B(boot(40).add(path().rrect(44, 18, 24, 6).c)),
    A(soles)
  );
});

add("sakura", "a cherry blossom", ({ A, B, parts, place }) => {
  const petal = path()
    .M(0, 0)
    .C(-12, -10, -15, -28, -7, -38)
    .L(0, -32)
    .L(7, -38)
    .C(15, -28, 12, -10, 0, 0)
    .Z().c;
  const flower = path();
  for (let i = 0; i < 5; i++) flower.add(place(petal, 50, 52, i * 72));
  const centre = path().circle(50, 52, 7);
  for (let i = 0; i < 5; i++) {
    const a = ((i * 72 + 36 - 90) * Math.PI) / 180;
    centre.circle(50 + 13 * Math.cos(a), 52 + 13 * Math.sin(a), 2.4);
  }
  return parts(A(flower), B(centre));
});

add("skis", "skis and poles", ({ A, B, parts, band }) => {
  const skis = path()
    .poly(
      band(
        [
          [22, 96],
          [70, 10],
          [78, 8],
        ],
        8
      )
    )
    .poly(
      band(
        [
          [78, 96],
          [30, 10],
          [22, 8],
        ],
        8
      )
    );
  const poles = path()
    .poly(
      band(
        [
          [40, 98],
          [44, 14],
        ],
        3
      )
    )
    .poly(
      band(
        [
          [60, 98],
          [56, 14],
        ],
        3
      )
    )
    .circle(40.6, 86, 5)
    .circle(59.4, 86, 5);
  return parts(A(skis), B(poles));
});

add("iceSkate", "an ice skate", ({ A, B, parts }) => {
  const boot = path()
    .M(22, 10)
    .L(50, 10)
    .L(52, 42)
    .C(68, 44, 82, 52, 84, 64)
    .L(84, 72)
    .L(20, 72)
    .Z();
  const blade = path()
    .rrect(14, 82, 76, 6, 3)
    .rrect(28, 70, 6, 14)
    .rrect(70, 70, 6, 14);
  const laces = path()
    .rrect(28, 22, 18, 3.5, 1.5)
    .rrect(28, 30, 20, 3.5, 1.5)
    .rrect(28, 38, 22, 3.5, 1.5);
  return parts(A(boot), B(blade), B(laces));
});

add("snowman", "a snowman", ({ A, B, parts }) => {
  const body = path().circle(50, 74, 22).circle(50, 44, 15).circle(50, 22, 11);
  const hat = path().rrect(40, 2, 20, 12, 1).rrect(35, 12, 30, 4, 1.5);
  const scarf = path().rrect(37, 30, 26, 6, 3).rrect(54, 33, 6, 16, 2);
  return parts(A(body), B(hat), B(scarf));
});

add("sunglasses", "a pair of sunglasses", ({ A, B, parts, band }) => {
  const frame = path()
    .rrect(6, 36, 38, 28, 12)
    .rrect(56, 36, 38, 28, 12)
    .poly(
      band(
        [
          [42, 42],
          [58, 42],
        ],
        4
      )
    )
    .poly(
      band(
        [
          [8, 40],
          [2, 30],
        ],
        3.5
      )
    )
    .poly(
      band(
        [
          [92, 40],
          [98, 30],
        ],
        3.5
      )
    );
  const shine = path()
    .poly(
      band(
        [
          [16, 56],
          [26, 44],
        ],
        3.5
      )
    )
    .poly(
      band(
        [
          [66, 56],
          [76, 44],
        ],
        3.5
      )
    );
  return parts(A(frame), B(shine));
});

add("watermelon", "a slice of watermelon", ({ A, B, parts, teardrop }) => {
  const rind = path().M(4, 36).A(46, 46, 0, 0, 0, 96, 36).Z();
  const flesh = path().M(13, 36).A(37, 37, 0, 0, 0, 87, 36).Z();
  for (const [x, y] of [
    [30, 48],
    [44, 56],
    [58, 56],
    [72, 48],
    [50, 44],
  ]) {
    teardrop(flesh, x, y, 7, 4.4);
  }
  return parts(A(rind), B(flesh, "evenodd"));
});

add("wateringCan", "a watering can", ({ A, B, parts, band, teardrop }) => {
  const can = path()
    .rrect(22, 40, 46, 44, 7)
    .poly(
      band(
        [
          [66, 56],
          [90, 32],
        ],
        7
      )
    )
    .add(ringArc(40, 42, 12, 18, 180, 360).c);
  const head = path().rrect(84, 22, 12, 16, 3);
  teardrop(head, 92, 50, 9, 5);
  teardrop(head, 98, 58, 9, 5);
  teardrop(head, 86, 58, 9, 5);
  const bandP = path().rrect(22, 60, 46, 8);
  return parts(A(can), B(head), B(bandP));
});

add("backpack", "a backpack", ({ A, B, parts }) => {
  const bag = path()
    .rrect(18, 22, 64, 70, 18)
    .add(ringArc(50, 22, 8, 14, 180, 360).c);
  const pocket = path().rrect(30, 58, 40, 26, 7).rrect(30, 40, 40, 6, 3);
  return parts(A(bag), B(pocket));
});

add("schoolBus", "a school bus", ({ A, B, parts }) => {
  const bus = path()
    .M(10, 72)
    .L(10, 30)
    .C(10, 24, 14, 22, 20, 22)
    .L(76, 22)
    .L(90, 46)
    .L(92, 72)
    .Z();
  const windows = path();
  for (const x of [16, 31, 46, 61]) windows.rrect(x, 30, 11, 14, 2);
  windows.poly([
    [76, 30],
    [84, 46],
    [76, 46],
  ]);
  windows.rrect(10, 52, 82, 4);
  const wheels = path().circle(28, 76, 9).circle(74, 76, 9);
  return parts(A(bus), B(windows), B(wheels));
});

add("mushroom", "a mushroom", ({ A, B, parts }) => {
  const cap = path()
    .M(8, 54)
    .C(8, 26, 28, 12, 50, 12)
    .C(72, 12, 92, 26, 92, 54)
    .Z()
    .circle(32, 34, 6, true)
    .circle(56, 26, 7, true)
    .circle(74, 42, 5, true);
  const stem = path()
    .M(38, 52)
    .L(62, 52)
    .L(66, 86)
    .C(60, 92, 40, 92, 34, 86)
    .Z();
  return parts(A(cap, "evenodd"), B(stem));
});

add("harvestBasket", "a basket of produce", ({ A, B, parts, leaf }) => {
  const produce = path()
    .circle(32, 48, 13)
    .circle(52, 40, 15)
    .circle(70, 50, 12);
  leaf(produce, [52, 26], [64, 14], 9, 2);
  const basket = path()
    .poly([
      [10, 52],
      [90, 52],
      [80, 92],
      [20, 92],
    ])
    .rrect(16, 66, 68, 4, 1, true)
    .rrect(19, 78, 62, 4, 1, true);
  const handle = path().add(ringArc(50, 54, 34, 40, 180, 360).c);
  return parts(A(produce), B(basket, "evenodd"), B(handle));
});

add("hayBale", "a round hay bale", ({ A, B, parts }) => {
  const bale = path().rrect(6, 30, 64, 54, 8);
  const face = path()
    .circle(70, 57, 27)
    .circle(70, 57, 19, true)
    .circle(70, 57, 11)
    .circle(70, 57, 4, true);
  const ties = path().rrect(22, 30, 4, 54).rrect(38, 30, 4, 54);
  return parts(A(bale), B(face, "evenodd"), B(ties));
});

// ── Events and places ───────────────────────────────────────────────────────
//
// Most of these show in one color on monochrome frames (both parts the same
// ink), so the details that make them readable are holes: subpaths wound
// counter-clockwise inside a clockwise outline, which nonzero filling leaves
// empty.

/** Points wound counter-clockwise: a hole inside a clockwise outline. */
const hole = (h, pts) => [...h.cw(pts)].reverse();

/** Path commands turned `rot` degrees about (ox, oy). */
const turn = (cmds, rot, ox = 50, oy = 50) =>
  transform(cmds, { rot, ox, oy, dx: ox, dy: oy });

// Places

add("tent", "a tent", (h) => {
  const body = path()
    .poly(
      h.cw([
        [50, 12],
        [94, 86],
        [6, 86],
      ])
    )
    .poly(
      hole(h, [
        [50, 44],
        [64, 86],
        [36, 86],
      ])
    );
  const flag = path()
    .poly(
      h.band(
        [
          [50, 2],
          [50, 14],
        ],
        3
      )
    )
    .poly(
      h.cw([
        [51, 2],
        [66, 6.5],
        [51, 11],
      ])
    )
    .rrect(2, 86, 96, 5, 2.5);
  return h.parts(h.A(body), h.B(flag));
});

add("bus", "a city bus", (h) => {
  const body = path()
    .rrect(16, 6, 68, 78, 12)
    .rrect(24, 18, 52, 30, 5, true)
    .rrect(32, 9, 36, 5, 2.5, true)
    .circle(29, 66, 5, true)
    .circle(71, 66, 5, true)
    .rrect(40, 70, 20, 5, 2.5, true);
  const rest = path()
    .rrect(22, 84, 13, 11, 3)
    .rrect(65, 84, 13, 11, 3)
    .rrect(7, 22, 6, 16, 3)
    .rrect(87, 22, 6, 16, 3);
  return h.parts(h.A(body), h.B(rest));
});

add("train", "a train", (h) => {
  const body = path()
    .M(20, 84)
    .L(20, 30)
    .C(20, 10, 80, 10, 80, 30)
    .L(80, 84)
    .Z()
    .rrect(28, 24, 44, 24, 6, true)
    .circle(31, 67, 5, true)
    .circle(69, 67, 5, true);
  const rails = path()
    .poly(
      h.band(
        [
          [36, 86],
          [24, 99],
        ],
        6
      )
    )
    .poly(
      h.band(
        [
          [64, 86],
          [76, 99],
        ],
        6
      )
    )
    .rrect(24, 80, 52, 7, 3);
  return h.parts(h.A(body), h.B(rails));
});

add("bicycle", "a bicycle", (h) => {
  const wheels = path();
  h.ring(wheels, 24, 64, 21, 15);
  h.ring(wheels, 76, 64, 21, 15);
  const frame = path()
    .poly(
      h.band(
        [
          [24, 64],
          [48, 64],
        ],
        5
      )
    )
    .poly(
      h.band(
        [
          [24, 64],
          [42, 36],
        ],
        5
      )
    )
    .poly(
      h.band(
        [
          [48, 64],
          [40, 28],
        ],
        5
      )
    )
    .poly(
      h.band(
        [
          [41, 36],
          [68, 36],
        ],
        5
      )
    )
    .poly(
      h.band(
        [
          [48, 64],
          [68, 36],
        ],
        5
      )
    )
    .poly(
      h.band(
        [
          [68, 34],
          [76, 64],
        ],
        5
      )
    )
    .poly(
      h.band(
        [
          [68, 36],
          [66, 24],
        ],
        5
      )
    )
    .poly(
      h.band(
        [
          [60, 23],
          [74, 23],
        ],
        5
      )
    )
    .rrect(30, 24, 18, 6, 3)
    .circle(48, 64, 5);
  return h.parts(h.A(wheels), h.B(frame));
});

add("parking", "a parking sign", (h) => {
  const sign = path()
    .rrect(10, 8, 80, 80, 16)
    .M(36, 24)
    .L(36, 74)
    .L(48, 74)
    .L(48, 59)
    .L(56, 59)
    .C(68, 59, 75, 51, 75, 41.5)
    .C(75, 32, 68, 24, 56, 24)
    .Z()
    .M(48, 35)
    .L(55, 35)
    .C(60.5, 35, 63.5, 38, 63.5, 41.5)
    .C(63.5, 45, 60.5, 48, 55, 48)
    .L(48, 48)
    .Z();
  const post = path().rrect(45, 88, 10, 12, 2);
  return h.parts(h.A(sign), h.B(post));
});

add("amphora", "an amphora", (h) => {
  const body = path()
    .M(40, 6)
    .L(60, 6)
    .L(58, 12)
    .C(58, 18, 56, 22, 58, 27)
    .C(76, 33, 85, 50, 77, 70)
    .C(71, 83, 61, 89, 57, 91)
    .L(61, 97)
    .L(39, 97)
    .L(43, 91)
    .C(39, 89, 29, 83, 23, 70)
    .C(15, 50, 24, 33, 42, 27)
    .C(44, 22, 42, 18, 42, 12)
    .Z()
    .poly(
      hole(h, [
        [24, 44],
        [76, 44],
        [77.5, 49],
        [22.5, 49],
      ])
    )
    .poly(
      hole(h, [
        [22.5, 58],
        [77.5, 58],
        [76.5, 63],
        [23.5, 63],
      ])
    );
  const handles = path()
    .poly(h.band(bezier([42, 13], [22, 8], [18, 28], [37, 33], 16), 5))
    .poly(h.band(bezier([58, 13], [78, 8], [82, 28], [63, 33], 16), 5));
  return h.parts(h.A(body), h.A(handles), h.B(path().rrect(36, 4, 28, 5, 2)));
});

add("pictureFrame", "a framed picture", (h) => {
  const frame = path()
    .rrect(8, 22, 84, 66, 3)
    .rrect(17, 31, 66, 48, 1, true)
    .poly(
      h.band(
        [
          [28, 23],
          [50, 8],
          [72, 23],
        ],
        3.5
      )
    )
    .circle(50, 8, 3.5);
  const picture = path()
    .poly(
      h.cw([
        [21, 75],
        [40, 50],
        [51, 63],
        [61, 54],
        [79, 75],
      ])
    )
    .circle(66, 43, 6);
  return h.parts(h.A(frame), h.B(picture));
});

add("books", "a row of books", (h) => {
  const books = path()
    .rrect(10, 26, 17, 62, 2)
    .rrect(10, 36, 17, 4, 1, true)
    .rrect(10, 74, 17, 4, 1, true)
    .rrect(30, 14, 20, 74, 2)
    .rrect(30, 24, 20, 5, 1, true)
    .rrect(30, 76, 20, 5, 1, true)
    .rrect(53, 32, 15, 56, 2)
    .rrect(53, 42, 15, 4, 1, true)
    .add(turn(path().rrect(70, 26, 15, 62, 2).c, 16, 70, 88));
  const shelf = path().rrect(4, 88, 92, 7, 2);
  return h.parts(h.A(books), h.B(shelf));
});

add("parkTree", "a leafy tree", (h) => {
  const canopy = path()
    .circle(50, 30, 24)
    .circle(30, 46, 18)
    .circle(70, 46, 18)
    .circle(50, 52, 20);
  const trunk = path()
    .poly(
      h.cw([
        [45, 58],
        [55, 58],
        [58, 94],
        [42, 94],
      ])
    )
    .poly(
      h.band(
        [
          [50, 74],
          [64, 60],
        ],
        5
      )
    )
    .rrect(26, 93, 48, 5, 2.5);
  return h.parts(h.A(canopy), h.B(trunk));
});

add("bench", "a park bench", (h) => {
  const p = path()
    .rrect(10, 22, 80, 10, 3)
    .rrect(10, 36, 80, 10, 3)
    .rrect(6, 54, 88, 10, 3)
    .rrect(18, 20, 7, 38, 2)
    .rrect(75, 20, 7, 38, 2)
    .poly(
      h.band(
        [
          [20, 62],
          [16, 90],
        ],
        7
      )
    )
    .poly(
      h.band(
        [
          [80, 62],
          [84, 90],
        ],
        7
      )
    );
  return h.A(p);
});

add("binoculars", "binoculars", (h) => {
  const p = path()
    .rrect(10, 36, 34, 52, 13)
    .circle(27, 72, 9, true)
    .rrect(56, 36, 34, 52, 13)
    .circle(73, 72, 9, true)
    .rrect(40, 42, 20, 18, 4)
    .rrect(16, 16, 22, 22, 5)
    .rrect(62, 16, 22, 22, 5);
  const strap = path().rrect(44, 30, 12, 8, 3);
  return h.parts(h.A(p), h.B(strap));
});

add("signpost", "a signpost", (h) => {
  const p = path()
    .rrect(45, 6, 10, 90, 3)
    .poly(
      h.cw([
        [18, 14],
        [78, 14],
        [92, 26],
        [78, 38],
        [18, 38],
      ])
    )
    .circle(30, 26, 3, true)
    .poly(
      h.cw([
        [82, 46],
        [22, 46],
        [8, 58],
        [22, 70],
        [82, 70],
      ])
    )
    .circle(70, 58, 3, true);
  const ground = path().rrect(30, 94, 40, 5, 2.5);
  return h.parts(h.A(p), h.B(ground));
});

add("foldedMap", "a folded map", (h) => {
  const panels = path()
    .poly(
      h.cw([
        [8, 22],
        [34.5, 12],
        [34.5, 82],
        [8, 92],
      ])
    )
    .poly(
      h.cw([
        [37.5, 12],
        [62.5, 22],
        [62.5, 92],
        [37.5, 82],
      ])
    )
    .poly(
      h.cw([
        [65.5, 22],
        [92, 12],
        [92, 82],
        [65.5, 92],
      ])
    );
  const pin = path()
    .M(78, 26)
    .C(70, 26, 67, 36, 78, 50)
    .C(89, 36, 86, 26, 78, 26)
    .Z()
    .circle(78, 34, 3, true)
    .poly(
      h.band(
        [
          [18, 74],
          [28, 56],
          [44, 62],
          [54, 44],
        ],
        3
      )
    );
  return h.parts(h.A(panels), h.B(pin));
});

add("bunkBed", "a bunk bed", (h) => {
  const p = path()
    .rrect(10, 8, 8, 88, 3)
    .rrect(82, 8, 8, 88, 3)
    .rrect(10, 34, 80, 8, 2)
    .rrect(10, 78, 80, 8, 2)
    .rrect(18, 24, 64, 10, 4)
    .rrect(18, 68, 64, 10, 4);
  const pillows = path()
    .rrect(21, 15, 18, 10, 4)
    .rrect(21, 59, 18, 10, 4)
    .poly(
      h.band(
        [
          [70, 42],
          [70, 68],
        ],
        4
      )
    )
    .poly(
      h.band(
        [
          [66, 50],
          [76, 50],
        ],
        3
      )
    )
    .poly(
      h.band(
        [
          [66, 59],
          [76, 59],
        ],
        3
      )
    );
  return h.parts(h.A(p), h.B(pillows));
});

add("laptop", "a laptop", (h) => {
  const p = path()
    .rrect(18, 14, 64, 48, 5)
    .rrect(24, 20, 52, 36, 2, true)
    .rrect(14, 62, 72, 6, 2)
    .poly(
      h.cw([
        [6, 70],
        [94, 70],
        [86, 82],
        [14, 82],
      ])
    )
    .rrect(42, 72, 16, 3, 1.5, true);
  const code = path()
    .poly(
      h.band(
        [
          [42, 30],
          [34, 38],
          [42, 46],
        ],
        4
      )
    )
    .poly(
      h.band(
        [
          [58, 30],
          [66, 38],
          [58, 46],
        ],
        4
      )
    );
  return h.parts(h.A(p), h.B(code));
});

add("anchor", "an anchor", (h) => {
  const p = path();
  h.ring(p, 50, 13, 9, 4.5);
  p.rrect(46, 21, 8, 62, 2)
    .rrect(28, 30, 44, 7, 3.5)
    .poly(h.band(arcPoints(50, 52, 34, 18, 162), 8))
    .poly(
      h.cw([
        [8, 50],
        [24, 52],
        [14, 66],
      ])
    )
    .poly(
      h.cw([
        [92, 50],
        [76, 52],
        [86, 66],
      ])
    );
  return h.A(p);
});

add("ferry", "a ferry", (h) => {
  const p = path()
    .poly(
      h.cw([
        [6, 58],
        [94, 58],
        [84, 80],
        [16, 80],
      ])
    )
    .rrect(22, 38, 56, 22, 4)
    .rrect(28, 44, 9, 8, 2, true)
    .rrect(41, 44, 9, 8, 2, true)
    .rrect(54, 44, 9, 8, 2, true)
    .rrect(36, 26, 30, 14, 3)
    .rrect(58, 14, 9, 14, 2);
  const pts = [];
  for (let x = 4; x <= 96; x += 2)
    pts.push([x, 90 + Math.sin((x / 92) * Math.PI * 4) * 3]);
  const water = path().poly(h.band(pts, 4));
  return h.parts(h.A(p), h.B(water));
});

add("lifebuoy", "a life ring", (h) => {
  const p = path();
  h.ring(p, 50, 50, 44, 24);
  const bands = path();
  for (const a of [-70, 20, 110, 200]) {
    const seg = arcPoints(50, 50, 44, a, a + 40, 10);
    const inner = arcPoints(50, 50, 24, a + 40, a, 10);
    bands.poly(h.cw([...seg, ...inner]));
  }
  return h.parts(h.A(p), h.B(bands));
});

add("cactus", "a potted cactus", (h) => {
  const plant = path()
    .rrect(40, 12, 20, 58, 10)
    .poly(
      h.band(
        [
          [41, 50],
          [27, 50],
          [27, 34],
        ],
        10
      )
    )
    .circle(27, 34, 5)
    .poly(
      h.band(
        [
          [59, 42],
          [73, 42],
          [73, 26],
        ],
        10
      )
    )
    .circle(73, 26, 5);
  const pot = path()
    .rrect(26, 66, 48, 9, 3)
    .poly(
      h.cw([
        [30, 75],
        [70, 75],
        [66, 95],
        [34, 95],
      ])
    );
  return h.parts(h.A(plant), h.B(pot));
});

add("angelfish", "a tropical fish", (h) => {
  const p = path()
    .M(10, 50)
    .C(20, 32, 40, 24, 56, 30)
    .L(66, 6)
    .L(70, 38)
    .C(76, 42, 78, 46, 78, 50)
    .C(78, 54, 76, 58, 70, 62)
    .L(66, 94)
    .L(56, 70)
    .C(40, 76, 20, 68, 10, 50)
    .Z()
    .circle(22, 46, 3.5, true)
    .poly(
      hole(
        h,
        h.band(
          [
            [38, 31],
            [36, 69],
          ],
          4
        )
      )
    )
    .poly(
      hole(
        h,
        h.band(
          [
            [52, 31],
            [52, 69],
          ],
          4
        )
      )
    );
  const tail = path().poly(
    h.cw([
      [76, 50],
      [96, 34],
      [92, 50],
      [96, 66],
    ])
  );
  return h.parts(h.A(p), h.B(tail));
});

add("elephant", "an elephant", (h) => {
  const p = path()
    .ellipse(58, 48, 31, 24)
    .circle(28, 40, 17)
    .poly(h.taperBand(bezier([18, 46], [8, 60], [9, 76], [17, 86], 18), 11, 6))
    .rrect(34, 60, 11, 30, 3)
    .rrect(49, 62, 11, 28, 3)
    .rrect(65, 62, 11, 28, 3)
    .rrect(78, 58, 10, 32, 3)
    .poly(
      h.band(
        [
          [88, 42],
          [95, 58],
        ],
        3.5
      )
    )
    .circle(22, 36, 2.5, true);
  const ear = path()
    .M(32, 26)
    .C(46, 22, 52, 36, 48, 52)
    .C(42, 60, 32, 56, 31, 46)
    .Z();
  return h.parts(h.A(p), h.B(ear));
});

add("column", "a classical column", (h) => {
  const p = path()
    .rrect(20, 8, 60, 7, 2)
    .circle(24, 19, 6)
    .circle(76, 19, 6)
    .rrect(26, 14, 48, 9, 2)
    .rrect(32, 23, 36, 59, 1)
    .rrect(37.5, 27, 3.5, 51, 1.7, true)
    .rrect(45, 27, 3.5, 51, 1.7, true)
    .rrect(52.5, 27, 3.5, 51, 1.7, true)
    .rrect(60, 27, 3.5, 51, 1.7, true)
    .rrect(26, 82, 48, 6, 2)
    .rrect(18, 90, 64, 7, 2);
  return h.A(p);
});

add("swing", "a swing set", (h) => {
  const p = path()
    .poly(
      h.band(
        [
          [12, 96],
          [30, 10],
        ],
        6
      )
    )
    .poly(
      h.band(
        [
          [88, 96],
          [70, 10],
        ],
        6
      )
    )
    .rrect(20, 6, 60, 8, 4)
    .poly(
      h.band(
        [
          [41, 14],
          [41, 66],
        ],
        2.5
      )
    )
    .poly(
      h.band(
        [
          [59, 14],
          [59, 66],
        ],
        2.5
      )
    )
    .rrect(34, 65, 32, 7, 3);
  return h.A(p);
});

// Events

add("guitar", "a guitar", (h) => {
  const body = path()
    .circle(50, 70, 24)
    .circle(50, 44, 18)
    .rrect(34, 44, 32, 26, 4)
    .circle(50, 55, 8, true)
    .rrect(46, 4, 8, 34, 2)
    .rrect(43, -4, 14, 11, 3);
  const bridge = path().rrect(40, 76, 20, 5, 2.5);
  const s = (cmds) =>
    transform(cmds, { rot: 40, ox: 50, oy: 50, dx: 50, dy: 52, s: 0.92 });
  return h.parts(h.A(path().add(s(body.c))), h.B(path().add(s(bridge.c))));
});

add("pram", "a baby carriage", (h) => {
  const p = path()
    .M(16, 50)
    .L(86, 50)
    .C(86, 68, 70, 76, 51, 76)
    .C(32, 76, 16, 68, 16, 50)
    .Z()
    .poly(
      h.band(
        [
          [86, 50],
          [90, 30],
          [98, 26],
        ],
        4.5
      )
    );
  h.ring(p, 30, 86, 9, 4);
  h.ring(p, 72, 86, 9, 4);
  const hood = path().M(16, 47).A(31, 31, 0, 0, 1, 47, 16).L(47, 47).Z();
  return h.parts(h.A(p), h.B(hood));
});

add("onesie", "a baby bodysuit", (h) => {
  const p = path()
    .M(30, 10)
    .L(42, 10)
    .C(44, 17, 56, 17, 58, 10)
    .L(70, 10)
    .L(90, 26)
    .L(81, 40)
    .L(72, 34)
    .L(72, 64)
    .C(72, 76, 64, 84, 58, 86)
    .L(56, 94)
    .L(44, 94)
    .L(42, 86)
    .C(36, 84, 28, 76, 28, 64)
    .L(28, 34)
    .L(19, 40)
    .L(10, 26)
    .Z()
    .circle(45, 89, 1.8, true)
    .circle(55, 89, 1.8, true);
  const heart = path();
  h.heart(heart, 50, 50, 20);
  return h.parts(h.A(p), h.B(heart));
});

add("soccerBall", "a soccer ball", (h) => {
  const p = path();
  h.ring(p, 50, 50, 45, 40);
  const center = regular(50, 50, 14, 5);
  p.poly(h.cw(center));
  for (let i = 0; i < 5; i++) {
    const a = ((-90 + i * 72) * Math.PI) / 180;
    const at = (r) => [50 + Math.cos(a) * r, 50 + Math.sin(a) * r];
    p.poly(h.band([center[i], at(31)], 3.5));
    // A patch where the seam meets the rim, cut off by the rim
    const patch = regular(...at(39), 11, 5, (a * 180) / Math.PI + 180).map(
      ([x, y]) => {
        const d = Math.hypot(x - 50, y - 50);
        return d > 41
          ? [50 + ((x - 50) * 41) / d, 50 + ((y - 50) * 41) / d]
          : [x, y];
      }
    );
    p.poly(h.cw(patch));
  }
  return h.A(p);
});

add("basketball", "a basketball", (h) => {
  const p = path().circle(50, 50, 45);
  const w = 3.5;
  const inside = (pts) =>
    pts.filter(([x, y]) => Math.hypot(x - 50, y - 50) < 43);
  p.poly(
    hole(
      h,
      h.band(
        [
          [50, 5.5],
          [50, 94.5],
        ],
        w
      )
    )
  );
  p.poly(hole(h, h.band(inside(arcPoints(-30, 50, 52, -70, 70, 40)), w)));
  p.poly(hole(h, h.band(inside(arcPoints(130, 50, 52, 110, 250, 40)), w)));
  for (const [x0, x1] of [
    [5.5, 20.2],
    [23.8, 48.2],
    [51.8, 76.2],
    [79.8, 94.5],
  ]) {
    p.poly(
      hole(h, [
        [x0, 48.2],
        [x1, 48.2],
        [x1, 51.8],
        [x0, 51.8],
      ])
    );
  }
  return h.A(p);
});

add("whistle", "a whistle", (h) => {
  const p = path()
    .circle(40, 58, 26)
    .rrect(40, 32, 54, 18, 4)
    .rrect(30, 36, 14, 6, 2, true)
    .circle(40, 58, 9, true);
  const cord = path();
  h.ring(cord, 14, 30, 9, 4.5);
  return h.parts(h.A(p), h.B(cord));
});

add("sneaker", "a running shoe", (h) => {
  const p = path()
    .M(8, 72)
    .L(8, 40)
    .C(8, 30, 18, 28, 24, 32)
    .C(30, 38, 38, 42, 46, 42)
    .L(50, 34)
    .C(60, 42, 72, 50, 84, 54)
    .C(94, 57, 97, 66, 93, 72)
    .Z()
    .rrect(5, 72, 92, 11, 5);
  const laces = path()
    .poly(
      h.band(
        [
          [48, 44],
          [56, 38],
        ],
        3.5
      )
    )
    .poly(
      h.band(
        [
          [56, 49],
          [64, 43],
        ],
        3.5
      )
    )
    .poly(
      h.band(
        [
          [64, 54],
          [72, 48],
        ],
        3.5
      )
    )
    .rrect(10, 76, 84, 3, 1.5);
  return h.parts(h.A(p), h.B(laces));
});

add("cupcake", "a cupcake", (h) => {
  const icing = path()
    .circle(30, 46, 13)
    .circle(70, 46, 13)
    .circle(50, 36, 18)
    .rrect(22, 44, 56, 12, 6);
  h.teardrop(icing, 50, 16, 16, 12);
  const top = [22, 56];
  const wrapper = path().poly(
    h.cw([
      [top[0], top[1]],
      [78, 56],
      [70, 94],
      [30, 94],
    ])
  );
  for (const u of [1 / 5, 2 / 5, 3 / 5, 4 / 5]) {
    const xt = 22 + 56 * u;
    const xb = 30 + 40 * u;
    wrapper.poly(
      hole(h, [
        [xt - 1.5, 60],
        [xt + 1.5, 60],
        [xb + 1.5, 90],
        [xb - 1.5, 90],
      ])
    );
  }
  return h.parts(h.A(icing), h.B(wrapper));
});

add("partyHat", "a party hat", (h) => {
  const x = (y, side) => 50 + side * 30 * ((y - 10) / 78);
  const p = path().poly(
    h.cw([
      [50, 10],
      [80, 88],
      [20, 88],
    ])
  );
  for (const [y0, y1] of [
    [36, 44],
    [58, 66],
  ]) {
    p.poly(
      hole(h, [
        [x(y0, -1) + 1.5, y0],
        [x(y0, 1) - 1.5, y0],
        [x(y1, 1) - 1.5, y1],
        [x(y1, -1) + 1.5, y1],
      ])
    );
  }
  const pom = path().circle(50, 9, 8).rrect(16, 86, 68, 7, 3.5);
  return h.parts(h.A(p), h.B(pom));
});

add("quiz", "a question in a speech bubble", (h) => {
  const centre = [...arcPoints(50, 31, 11, 185, 400, 24), [50, 48], [50, 53]];
  const bubble = path()
    .rrect(8, 8, 84, 66, 18)
    .poly(hole(h, h.band(centre, 8)))
    .circle(50, 63, 5, true);
  const tail = path().poly(
    h.cw([
      [22, 66],
      [42, 66],
      [18, 92],
    ])
  );
  return h.parts(h.A(bubble), h.A(tail));
});

add("popcorn", "a box of popcorn", (h) => {
  const puffs = path()
    .circle(30, 30, 11)
    .circle(43, 21, 12)
    .circle(58, 21, 12)
    .circle(70, 30, 11)
    .circle(36, 40, 11)
    .circle(50, 33, 12)
    .circle(64, 40, 11);
  const box = path().poly(
    h.cw([
      [20, 42],
      [80, 42],
      [71, 95],
      [29, 95],
    ])
  );
  for (const i of [1, 3]) {
    const u0 = i / 5;
    const u1 = (i + 1) / 5;
    box.poly(
      hole(h, [
        [20 + 60 * u0, 46],
        [20 + 60 * u1, 46],
        [29 + 42 * u1, 91],
        [29 + 42 * u0, 91],
      ])
    );
  }
  return h.parts(h.A(puffs), h.B(box));
});

add("dice", "a pair of dice", (h) => {
  const one = path()
    .rrect(6, 44, 46, 46, 9)
    .circle(17, 55, 4.2, true)
    .circle(41, 55, 4.2, true)
    .circle(29, 67, 4.2, true)
    .circle(17, 79, 4.2, true)
    .circle(41, 79, 4.2, true);
  const two = path()
    .rrect(52, 12, 40, 40, 8)
    .circle(62, 22, 3.8, true)
    .circle(72, 32, 3.8, true)
    .circle(82, 42, 3.8, true);
  return h.parts(h.A(one), h.B(path().add(turn(two.c, 16, 72, 32))));
});

add("lectern", "a lectern with a microphone", (h) => {
  const p = path()
    .poly(
      h.cw([
        [16, 34],
        [84, 34],
        [78, 46],
        [22, 46],
      ])
    )
    .rrect(40, 46, 20, 40, 2)
    .rrect(26, 86, 48, 8, 3);
  const mic = path()
    .poly(
      h.band(
        [
          [56, 35],
          [66, 14],
        ],
        3.5
      )
    )
    .ellipse(68, 10, 5, 6);
  return h.parts(h.A(p), h.B(mic));
});

add("diploma", "a rolled diploma", (h) => {
  const scroll = path()
    .rrect(6, 38, 88, 22, 11)
    .circle(83, 49, 5, true)
    .rrect(42, 37, 3, 24, 1, true)
    .rrect(55, 37, 3, 24, 1, true);
  const ribbon = path()
    .rrect(45, 36, 10, 26, 2)
    .poly(
      h.cw([
        [46, 60],
        [50, 60],
        [44, 84],
        [40, 78],
      ])
    )
    .poly(
      h.cw([
        [50, 60],
        [54, 60],
        [60, 78],
        [56, 84],
      ])
    );
  const t = (cmds) => turn(cmds, -14);
  return h.parts(h.A(path().add(t(scroll.c))), h.B(path().add(t(ribbon.c))));
});

add("discoBall", "a mirror ball", (h) => {
  const p = path().circle(50, 58, 36);
  for (let y = 31; y <= 82; y += 9) {
    const half = Math.sqrt(Math.max(0, 33 ** 2 - (y + 3 - 58) ** 2));
    for (let x = 50 - 36; x <= 50 + 36; x += 9) {
      if (x - 3 < 50 - half + 1 || x + 6 > 50 + half - 1) continue;
      p.rrect(x - 3, y - 3, 6, 6, 1, true);
    }
  }
  p.rrect(45, 16, 10, 7, 2).poly(
    h.band(
      [
        [50, 4],
        [50, 17],
      ],
      3
    )
  );
  const sparks = path()
    .poly(h.cw(starPointsLocal(86, 20, 10, 2.5, 4)))
    .poly(h.cw(starPointsLocal(14, 26, 7, 2, 4)));
  return h.parts(h.A(p), h.B(sparks));
});

add("engagementRing", "an engagement ring", (h) => {
  const ringP = path();
  h.ring(ringP, 50, 64, 30, 23);
  ringP.poly(
    h.cw([
      [40, 38],
      [60, 38],
      [56, 46],
      [44, 46],
    ])
  );
  const gem = path().poly(
    h.cw([
      [38, 12],
      [62, 12],
      [72, 22],
      [50, 42],
      [28, 22],
    ])
  );
  return h.parts(h.A(ringP), h.B(gem));
});

add("tiara", "a tiara", (h) => {
  const p = path()
    .poly(
      h.cw([
        [8, 84],
        [12, 60],
        [22, 70],
        [32, 46],
        [42, 62],
        [50, 26],
        [58, 62],
        [68, 46],
        [78, 70],
        [88, 60],
        [92, 84],
        [72, 78],
        [50, 76],
        [28, 78],
      ])
    )
    .circle(50, 62, 5, true)
    .circle(30, 70, 3, true)
    .circle(70, 70, 3, true);
  const gems = path().circle(50, 22, 6).circle(32, 42, 4.5).circle(68, 42, 4.5);
  return h.parts(h.A(p), h.B(gems));
});

add("yarn", "a ball of yarn and needles", (h) => {
  const ball = path().circle(44, 58, 32);
  for (const r of [34, 44, 54]) {
    const pts = arcPoints(16, 92, r, -100, 10, 30).filter(
      ([x, y]) => Math.hypot(x - 44, y - 58) < 28
    );
    if (pts.length > 2) ball.poly(hole(h, h.band(pts, 3.5)));
  }
  const needles = path()
    .poly(
      h.band(
        [
          [56, 42],
          [88, 8],
        ],
        4
      )
    )
    .circle(89, 7, 4.5)
    .poly(
      h.band(
        [
          [62, 50],
          [96, 24],
        ],
        4
      )
    )
    .circle(96, 23, 4.5)
    .poly(h.band(bezier([18, 80], [10, 86], [10, 94], [2, 96], 12), 3));
  return h.parts(h.A(ball), h.B(needles));
});

add("stringLights", "a string of lights", (h) => {
  const wire = [];
  for (let x = 2; x <= 98; x += 2) {
    const t = (x - 2) / 96;
    wire.push([x, 26 + Math.sin(t * Math.PI) * 18]);
  }
  const caps = path().poly(h.band(wire, 3));
  const bulbs = path();
  for (const x of [14, 32, 50, 68, 86]) {
    const t = (x - 2) / 96;
    const y = 26 + Math.sin(t * Math.PI) * 18;
    caps.rrect(x - 4, y, 8, 8, 2);
    const bulb = path();
    h.teardrop(bulb, x, y + 21, 26, 17);
    bulbs.add(
      transform(bulb.c, { rot: 180, ox: x, oy: y + 21, dx: x, dy: y + 21 })
    );
  }
  return h.parts(h.A(bulbs), h.B(caps));
});

add("clapper", "a film clapperboard", (h) => {
  const board = path().rrect(10, 42, 80, 48, 4).rrect(10, 42, 80, 10, 2, true);
  for (const x of [22, 46, 70])
    board.poly(
      h.cw([
        [x, 42],
        [x + 12, 42],
        [x + 6, 52],
        [x - 6, 52],
      ])
    );
  const arm = path().rrect(10, 22, 80, 12, 2);
  for (const x of [28, 52, 76])
    arm.poly(
      hole(h, [
        [x, 22],
        [x + 10, 22],
        [x + 4, 34],
        [x - 6, 34],
      ])
    );
  return h.parts(h.A(board), h.B(path().add(turn(arm.c, -12, 10, 36))));
});

add("scoreboard", "a scoreboard", (h) => {
  const p = path()
    .rrect(8, 14, 84, 62, 8)
    .rrect(16, 28, 28, 36, 4, true)
    .rrect(56, 28, 28, 36, 4, true)
    .circle(50, 40, 2.6, true)
    .circle(50, 52, 2.6, true)
    .rrect(22, 76, 8, 18, 2)
    .rrect(70, 76, 8, 18, 2)
    .rrect(30, 18, 40, 5, 2.5, true);
  const digits = path()
    .rrect(27.5, 34, 6, 24, 1.5)
    .rrect(63, 34, 14, 24, 5)
    .rrect(67.5, 38.5, 5, 15, 2.5, true);
  return h.parts(h.A(p), h.B(digits));
});

add("babyBottle", "a baby bottle", (h) => {
  const p = path()
    .rrect(32, 36, 36, 58, 10)
    .rrect(36, 50, 12, 3, 1.5, true)
    .rrect(36, 60, 17, 3, 1.5, true)
    .rrect(36, 70, 12, 3, 1.5, true)
    .rrect(29, 27, 42, 11, 3)
    .M(43, 27)
    .C(43, 15, 46, 8, 50, 6)
    .C(54, 8, 57, 15, 57, 27)
    .Z();
  return h.A(p);
});

/** starPoints from lib, local so this file needs one import fewer. */
function starPointsLocal(cx, cy, outer, inner, n) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const rad = i % 2 === 0 ? outer : inner;
    const a = ((-90 + (180 / n) * i) * Math.PI) / 180;
    pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
  }
  return pts;
}

// ── Registration ────────────────────────────────────────────────────────────

/**
 * Words for each world motif, for the generated descriptions, plus words for
 * motifs.mjs motifs that no frame used before (catalogue.mjs has none).
 */
export const WORLD_MOTIF_WORDS = {
  moonFull: "a full moon",
  dove: "a dove",
  flame: "a flame",
  ...Object.fromEntries(LIST.map(([name, words]) => [name, words])),
};

/** Registers the world motifs with motifs.mjs's def(), passing its helpers. */
export function defineWorldMotifs(def, helpers) {
  const h = {
    ...helpers,
    A,
    B,
    parts,
    band,
    taperBand,
    sampled,
    place,
    cw,
  };
  for (const [name, , draw] of LIST) def(name, () => draw(h));
}
