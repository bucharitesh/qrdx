// Motifs: small filled glyphs drawn in a 100 × 100 box (centre 50, 50),
// placed into frames as path shapes. Each motif is one or two parts: "a" is
// painted with the motif's main color, "b" with its second color.
import {
  arcPoints,
  bezier,
  P,
  path,
  quad,
  regular,
  ringArc,
  shape,
  starPoints,
  strokeLine,
  transform,
} from "./lib.mjs";

const M = {};
const def = (name, fn) => {
  M[name] = fn;
};

// ── Primitives ──────────────────────────────────────────────────────────────

/** A pointed leaf from a to b, `w` wide, added to p. */
function leaf(p, a, b, w, bend = 0) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const nx = -dy / len;
  const ny = dx / len;
  const k = w * 0.66;
  const bx = nx * bend;
  const by = ny * bend;
  return p
    .M(...a)
    .C(
      a[0] + dx * 0.2 + nx * k + bx,
      a[1] + dy * 0.2 + ny * k + by,
      a[0] + dx * 0.65 + nx * k + bx,
      a[1] + dy * 0.65 + ny * k + by,
      ...b
    )
    .C(
      a[0] + dx * 0.65 - nx * k + bx,
      a[1] + dy * 0.65 - ny * k + by,
      a[0] + dx * 0.2 - nx * k + bx,
      a[1] + dy * 0.2 - ny * k + by,
      ...a
    )
    .Z();
}

/** Spiky holly leaf from a to b. */
function hollyLeaf(p, a, b, w) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const nx = -dy / len;
  const ny = dx / len;
  const side = (sign) => {
    const pts = [];
    const n = 8;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const half =
        Math.sin(Math.PI * t) * (w / 2) * (i % 2 === 1 ? 1.22 : 0.78);
      pts.push([
        a[0] + dx * t + nx * half * sign,
        a[1] + dy * t + ny * half * sign,
      ]);
    }
    return pts;
  };
  const left = side(1);
  const right = side(-1).reverse();
  return p.poly([a, ...left, b, ...right]);
}

function heart(p, cx, cy, s, ccw = false) {
  // s: width
  const w = s / 2;
  const top = cy - s * 0.28;
  const pts = new P()
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
  if (ccw) {
    return p.add(transform(pts.c, { flipX: true, ox: cx, dx: cx }));
  }
  return p.add(pts);
}

function teardrop(p, cx, cy, h, w) {
  // point up, round bottom
  const top = cy - h / 2;
  const rr = w / 2;
  const by = cy + h / 2 - rr;
  return p
    .M(cx, top)
    .C(cx + rr * 0.35, top + h * 0.3, cx + rr, by - rr * 0.6, cx + rr, by)
    .A(rr, rr, 0, 0, 1, cx - rr, by)
    .C(cx - rr, by - rr * 0.6, cx - rr * 0.35, top + h * 0.3, cx, top)
    .Z();
}

const ring = (p, cx, cy, outer, inner) =>
  p.circle(cx, cy, outer).circle(cx, cy, inner, true);

const parts = (...list) => list.filter(Boolean);
const A = (p, rule) => ({ p, role: "a", rule });
const B = (p, rule) => ({ p, role: "b", rule });

// ── Winter and Christmas ────────────────────────────────────────────────────

def("holly", () => {
  const leaves = path();
  hollyLeaf(leaves, [50, 56], [4, 30], 32);
  hollyLeaf(leaves, [50, 56], [96, 30], 32);
  const berries = path().circle(50, 58, 10).circle(37, 70, 9).circle(63, 70, 9);
  return parts(A(leaves), B(berries));
});

def("bauble", () => {
  const body = path().circle(50, 60, 32);
  const cap = path()
    .rrect(41, 18, 18, 12, 2)
    .add(ringArc(50, 14, 4, 7.5, 180, 360))
    .add(path().rrect(42.5, 13.5, 3, 5).c)
    .add(path().rrect(54.5, 13.5, 3, 5).c);
  const stripe = path()
    .M(19, 54)
    .C(35, 60, 65, 60, 81, 54)
    .L(81.7, 62)
    .C(65, 68, 35, 68, 18.3, 62)
    .Z();
  return parts(A(body), B(cap), B(stripe));
});

def("northStar", () => {
  const big = path().poly(starPoints(50, 50, 48, 9, 4));
  const small = path().poly(starPoints(50, 50, 26, 9, 4, -45));
  return parts(A(big), A(small));
});

def("star5", () => A(path().poly(starPoints(50, 53, 46, 19, 5))));

def("starRound", () => A(path().poly(starPoints(50, 52, 44, 24, 5))));

def("burst", () => A(path().poly(starPoints(50, 50, 48, 38, 16))));

def("tiers", () => {
  const tree = path().poly([
    [50, 6],
    [72, 34],
    [62, 34],
    [80, 58],
    [66, 58],
    [88, 84],
    [12, 84],
    [34, 58],
    [20, 58],
    [38, 34],
    [28, 34],
  ]);
  const trunk = path().rrect(44, 84, 12, 12, 1);
  return parts(A(tree), B(trunk));
});

def("wreath", () => {
  const ringP = path();
  ring(ringP, 50, 46, 38, 25);
  const bow = path()
    .poly([
      [50, 80],
      [30, 70],
      [30, 92],
    ])
    .poly([
      [50, 80],
      [70, 92],
      [70, 70],
    ])
    .circle(50, 80, 6);
  return parts(A(ringP, "evenodd"), B(bow));
});

def("crystal", () => {
  const p = path();
  for (let i = 0; i < 6; i++) {
    const rot = i * 60;
    const arm = strokeLine(
      [
        [50, 50],
        [50, 8],
      ],
      6,
      { round: true }
    );
    const twigL = strokeLine(
      [
        [50, 26],
        [38, 16],
      ],
      5,
      { round: true }
    );
    const twigR = strokeLine(
      [
        [50, 26],
        [62, 16],
      ],
      5,
      { round: true }
    );
    for (const piece of [arm, twigL, twigR])
      p.add(transform(piece.c, { rot, ox: 50, oy: 50, dx: 50, dy: 50 }));
  }
  return A(p);
});

def("mountain", () => {
  const back = path().poly([
    [4, 86],
    [36, 34],
    [52, 58],
    [66, 40],
    [96, 86],
  ]);
  const snow = path()
    .poly([
      [36, 34],
      [45.5, 49.5],
      [40, 46],
      [35, 52],
      [30, 44],
      [26.2, 49.9],
    ])
    .poly([
      [66, 40],
      [74.5, 53.7],
      [70, 51],
      [66, 56],
      [62, 50],
      [58.8, 52.7],
    ]);
  return parts(A(back), B(snow));
});

def("mitten", () => {
  const p = path()
    .M(34, 82)
    .L(34, 40)
    .C(34, 20, 70, 18, 70, 42)
    .L(70, 54)
    .C(76, 46, 86, 50, 82, 58)
    .L(70, 76)
    .L(70, 82)
    .Z();
  const cuff = path().rrect(30, 78, 44, 16, 4);
  return parts(A(p), B(cuff));
});

def("candle", () => {
  const body = path().rrect(38, 40, 24, 54, 3);
  const flame = path();
  teardrop(flame, 50, 22, 26, 14);
  return parts(A(body), B(flame));
});

def("bellPair", () => {
  // Two bells joined at a bow: one glyph
  const bell = (cx, tilt) => {
    const b = path()
      .M(cx - 16, 70)
      .C(cx - 16, 50, cx - 14, 34, cx, 34)
      .C(cx + 14, 34, cx + 16, 50, cx + 16, 70)
      .L(cx + 20, 76)
      .L(cx - 20, 76)
      .Z()
      .circle(cx, 80, 5);
    return transform(b.c, { rot: tilt, ox: cx, oy: 34, dx: cx, dy: 34 });
  };
  const bells = path().add(bell(36, 14)).add(bell(64, -14));
  const bow = path()
    .poly([
      [50, 26],
      [36, 16],
      [38, 32],
    ])
    .poly([
      [50, 26],
      [62, 32],
      [64, 16],
    ])
    .circle(50, 26, 5);
  return parts(A(bells), B(bow));
});

// ── Moon, lanterns, lamps (Ramadan, Eid, Diwali, Lunar New Year) ────────────

function crescent(p, cx, cy, rOuter, offset, rInner) {
  // Outer circle minus a circle shifted right by `offset`
  const d = offset;
  const x = (d * d + rOuter * rOuter - rInner * rInner) / (2 * d);
  const y = Math.sqrt(Math.max(0, rOuter * rOuter - x * x));
  const top = [cx + x, cy - y];
  const bottom = [cx + x, cy + y];
  return p
    .M(...top)
    .A(rOuter, rOuter, 0, 1, 0, ...bottom)
    .A(rInner, rInner, 0, 0, 1, ...top)
    .Z();
}

def("crescent", () => A(crescent(path(), 46, 50, 40, 22, 34)));

def("crescentStar", () => {
  const moon = crescent(path(), 40, 50, 38, 20, 32);
  const star = path().poly(starPoints(76, 40, 14, 5.6, 5));
  return parts(A(moon), B(star));
});

def("lantern", () => {
  const hook = path().add(ringArc(50, 12, 4, 8, 180, 360));
  const top = path().poly([
    [50, 14],
    [66, 30],
    [34, 30],
  ]);
  const body = path()
    .poly([
      [34, 32],
      [66, 32],
      [70, 44],
      [70, 72],
      [62, 82],
      [38, 82],
      [30, 72],
      [30, 44],
    ])
    .M(50, 42)
    .C(58, 46, 60, 52, 60, 58)
    .L(60, 72)
    .L(40, 72)
    .L(40, 58)
    .C(40, 52, 42, 46, 50, 42)
    .Z();
  const base = path()
    .rrect(40, 84, 20, 6, 2)
    .poly([
      [46, 90],
      [54, 90],
      [50, 97],
    ]);
  const glow = path()
    .M(50, 46)
    .C(56, 49, 57, 54, 57, 58)
    .L(57, 69)
    .L(43, 69)
    .L(43, 58)
    .C(43, 54, 44, 49, 50, 46)
    .Z();
  return parts(A(hook), A(top), A(body, "evenodd"), A(base), B(glow));
});

def("lanternRound", () => {
  const string = path().rrect(48.5, 2, 3, 12);
  const caps = path().rrect(38, 12, 24, 8, 2).rrect(38, 80, 24, 8, 2);
  const body = path().ellipse(50, 50, 36, 31);
  const ribs = path()
    .ellipse(50, 50, 18, 31)
    .ellipse(50, 50, 15, 29, true)
    .rrect(48.5, 19, 3, 62);
  const tassel = path()
    .rrect(48, 88, 4, 10, 1)
    .poly([
      [44, 92],
      [56, 92],
      [58, 100],
      [42, 100],
    ]);
  return parts(B(string), B(caps), A(body), B(ribs, "evenodd"), B(tassel));
});

def("diya", () => {
  const bowl = path()
    .M(12, 62)
    .L(88, 62)
    .C(86, 80, 70, 90, 50, 90)
    .C(30, 90, 14, 80, 12, 62)
    .Z()
    .M(12, 62)
    .L(6, 56)
    .L(22, 60)
    .Z();
  const flame = path();
  teardrop(flame, 52, 36, 40, 20);
  const inner = path();
  teardrop(inner, 52, 42, 20, 9);
  return parts(A(bowl), B(flame, "evenodd"), A(inner));
});

def("flame", () => {
  const p = path();
  teardrop(p, 50, 50, 84, 44);
  return A(p);
});

def("rangoli", () => {
  const petals = path();
  for (let i = 0; i < 8; i++) {
    const a = (i * 45 * Math.PI) / 180;
    leaf(
      petals,
      [50 + Math.cos(a) * 10, 50 + Math.sin(a) * 10],
      [50 + Math.cos(a) * 47, 50 + Math.sin(a) * 47],
      20
    );
  }
  const inner = path();
  for (let i = 0; i < 8; i++) {
    const a = ((i * 45 + 22.5) * Math.PI) / 180;
    inner.circle(50 + Math.cos(a) * 30, 50 + Math.sin(a) * 30, 4);
  }
  inner.circle(50, 50, 10);
  return parts(A(petals), B(inner));
});

def("lotus", () => {
  const p = path();
  leaf(p, [50, 80], [50, 14], 26);
  leaf(p, [48, 82], [22, 30], 22, -4);
  leaf(p, [52, 82], [78, 30], 22, 4);
  leaf(p, [46, 84], [6, 58], 18, -3);
  leaf(p, [54, 84], [94, 58], 18, 3);
  const base = path()
    .M(18, 86)
    .C(36, 92, 64, 92, 82, 86)
    .L(80, 92)
    .C(62, 98, 38, 98, 20, 92)
    .Z();
  return parts(A(p), B(base));
});

def("marigold", () => {
  const outer = path().poly(
    Array.from({ length: 48 }, (_, i) => {
      const a = (i / 48) * Math.PI * 2;
      const rad = 44 + (i % 2 === 0 ? 4 : -2);
      return [50 + Math.cos(a) * rad, 50 + Math.sin(a) * rad];
    })
  );
  const mid = path().poly(
    Array.from({ length: 32 }, (_, i) => {
      const a = (i / 32) * Math.PI * 2 + 0.1;
      const rad = 28 + (i % 2 === 0 ? 4 : -2);
      return [50 + Math.cos(a) * rad, 50 + Math.sin(a) * rad];
    })
  );
  return parts(A(outer), B(mid), A(path().circle(50, 50, 10)));
});

def("splash", () => {
  const pts = [];
  const radii = [40, 34, 44, 30, 41, 36, 46, 31, 39, 35, 43, 32];
  for (let i = 0; i < radii.length; i++) {
    const a = (i / radii.length) * Math.PI * 2;
    pts.push([46 + Math.cos(a) * radii[i], 48 + Math.sin(a) * radii[i]]);
  }
  // Smooth closed curve through pts (Catmull-Rom to Bezier)
  const p = path().M(...pts[0]);
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[(i - 1 + pts.length) % pts.length];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    const p3 = pts[(i + 2) % pts.length];
    p.C(
      p1[0] + (p2[0] - p0[0]) / 6,
      p1[1] + (p2[1] - p0[1]) / 6,
      p2[0] - (p3[0] - p1[0]) / 6,
      p2[1] - (p3[1] - p1[1]) / 6,
      ...p2
    );
  }
  p.Z();
  const drops = path().circle(90, 22, 6).circle(84, 84, 4).circle(10, 86, 5);
  return parts(A(p), B(drops));
});

def("blossom", () => {
  const petals = path();
  for (let i = 0; i < 5; i++) {
    const a = ((-90 + i * 72) * Math.PI) / 180;
    petals.circle(50 + Math.cos(a) * 24, 50 + Math.sin(a) * 24, 20);
  }
  const center = path().circle(50, 50, 10);
  return parts(A(petals), B(center));
});

def("coin", () => {
  const p = path().circle(50, 50, 44).rrect(39, 39, 22, 22, 2, true);
  const rim = path();
  ring(rim, 50, 50, 37, 33);
  return parts(A(p), B(rim, "evenodd"));
});

def("knot", () => {
  // A diamond lattice knot: rotated square ring with tassel
  const knot = path().add(
    transform(
      path().rrect(26, 16, 48, 48, 6).rrect(36, 26, 28, 28, 3, true).c,
      { rot: 45, ox: 50, oy: 40, dx: 50, dy: 40 }
    )
  );
  const tassel = path()
    .rrect(47, 72, 6, 8, 1)
    .poly([
      [42, 80],
      [58, 80],
      [62, 98],
      [38, 98],
    ]);
  return parts(A(knot), B(tassel));
});

def("menorah", () => {
  const arms = path();
  for (const rad of [12, 22, 32, 42])
    arms.add(ringArc(50, 50, rad - 2.5, rad + 2.5, 0, 180));
  const stem = path()
    .rrect(47.5, 34, 5, 50)
    .rrect(30, 84, 40, 6, 2)
    .rrect(38, 80, 24, 6, 2);
  const cups = path();
  for (const x of [8, 18, 28, 38, 62, 72, 82, 92])
    cups.rrect(x - 3, 40, 6, 10, 1);
  cups.rrect(47, 28, 6, 10, 1);
  const flames = path();
  for (const x of [8, 18, 28, 38, 62, 72, 82, 92])
    teardrop(flames, x, 32, 12, 6);
  teardrop(flames, 50, 20, 12, 6);
  return parts(A(arms), A(stem), A(cups), B(flames));
});

def("hexagram", () => {
  const p = path()
    .poly(starPoints(50, 50, 46, 46 / Math.sqrt(3), 6))
    .poly(regular(50, 50, 22, 6, -90), true);
  return A(p);
});

def("cup", () => {
  const bowl = path()
    .M(24, 14)
    .L(76, 14)
    .C(76, 46, 64, 58, 50, 58)
    .C(36, 58, 24, 46, 24, 14)
    .Z();
  const stem = path()
    .rrect(46, 56, 8, 26)
    .M(28, 92)
    .C(32, 82, 44, 80, 50, 80)
    .C(56, 80, 68, 82, 72, 92)
    .Z();
  const band = path().rrect(24, 22, 52, 6);
  return parts(A(bowl), A(stem), B(band));
});

def("matzah", () => {
  const p = path().rrect(10, 18, 80, 64, 6);
  for (let y = 30; y <= 70; y += 10)
    for (let x = 22; x <= 78; x += 10)
      p.circle(x + (((y - 30) / 10) % 2) * 5 - 2.5, y, 2, true);
  return A(p);
});

def("egg", () => {
  const egg = path()
    .M(50, 6)
    .C(74, 6, 88, 50, 88, 64)
    .C(88, 84, 72, 96, 50, 96)
    .C(28, 96, 12, 84, 12, 64)
    .C(12, 50, 26, 6, 50, 6)
    .Z();
  const band = path().poly([
    [13.5, 52],
    [24, 44],
    [37, 52],
    [50, 44],
    [63, 52],
    [76, 44],
    [86.5, 52],
    [87.6, 60],
    [76, 52],
    [63, 60],
    [50, 52],
    [37, 60],
    [24, 52],
    [12.4, 60],
  ]);
  return parts(A(egg), B(band));
});

def("tulip", () => {
  const flower = path()
    .M(26, 18)
    .L(38, 30)
    .L(50, 12)
    .L(62, 30)
    .L(74, 18)
    .C(78, 40, 70, 54, 50, 56)
    .C(30, 54, 22, 40, 26, 18)
    .Z();
  const stem = path().rrect(48, 54, 4, 42, 2);
  const leafP = path();
  leaf(leafP, [50, 92], [24, 60], 16, -2);
  leaf(leafP, [50, 94], [78, 68], 14, 2);
  return parts(B(flower), A(stem), A(leafP));
});

def("daisy", () => {
  const petals = path();
  for (let i = 0; i < 12; i++) {
    const a = (i * 30 * Math.PI) / 180;
    leaf(
      petals,
      [50 + Math.cos(a) * 8, 50 + Math.sin(a) * 8],
      [50 + Math.cos(a) * 47, 50 + Math.sin(a) * 47],
      15
    );
  }
  return parts(A(petals), B(path().circle(50, 50, 13)));
});

def("butterfly", () => {
  const wings = path()
    .add(
      transform(path().ellipse(30, 34, 22, 17).c, {
        rot: -25,
        ox: 30,
        oy: 34,
        dx: 30,
        dy: 34,
      })
    )
    .add(
      transform(path().ellipse(70, 34, 22, 17).c, {
        rot: 25,
        ox: 70,
        oy: 34,
        dx: 70,
        dy: 34,
      })
    )
    .add(
      transform(path().ellipse(34, 66, 15, 12).c, {
        rot: 30,
        ox: 34,
        oy: 66,
        dx: 34,
        dy: 66,
      })
    )
    .add(
      transform(path().ellipse(66, 66, 15, 12).c, {
        rot: -30,
        ox: 66,
        oy: 66,
        dx: 66,
        dy: 66,
      })
    );
  const body = path()
    .rrect(46.5, 30, 7, 50, 3.5)
    .add(strokeLine(quad([48, 32], [44, 18], [36, 12]), 2.6, { round: true }))
    .add(strokeLine(quad([52, 32], [56, 18], [64, 12]), 2.6, { round: true }));
  return parts(A(wings), B(body));
});

def("sprout", () => {
  const stem = path().add(
    strokeLine(quad([50, 94], [50, 70], [50, 48]), 6, { round: true })
  );
  const leaves = path();
  leaf(leaves, [50, 52], [14, 28], 26, -6);
  leaf(leaves, [50, 46], [86, 18], 30, 6);
  return parts(A(stem), A(leaves));
});

def("branch", () => {
  const stem = strokeLine(
    bezier([10, 90], [30, 70], [60, 40], [90, 12], 24),
    5,
    { round: true }
  );
  const leaves = path();
  leaf(leaves, [28, 73], [14, 50], 14);
  leaf(leaves, [40, 60], [58, 74], 14);
  leaf(leaves, [52, 48], [40, 26], 14);
  leaf(leaves, [64, 37], [84, 50], 14);
  leaf(leaves, [76, 26], [70, 6], 12);
  return parts(A(stem), A(leaves));
});

def("cherryBranch", () => {
  const stem = strokeLine(
    bezier([6, 84], [30, 74], [60, 50], [94, 30], 24),
    5,
    { round: true }
  );
  const flowers = path();
  for (const [cx, cy, s] of [
    [34, 64, 11],
    [66, 38, 13],
  ]) {
    for (let i = 0; i < 5; i++) {
      const a = ((-90 + i * 72) * Math.PI) / 180;
      flowers.circle(
        cx + Math.cos(a) * s * 0.55,
        cy + Math.sin(a) * s * 0.55,
        s * 0.5
      );
    }
  }
  const buds = path().circle(86, 26, 5).circle(18, 68, 4);
  return parts(A(stem), B(flowers), B(buds));
});

def("sun", () => {
  const disc = path().circle(50, 50, 22);
  const rays = path();
  for (let i = 0; i < 12; i++) {
    const a = i * 30;
    rays.add(
      transform(
        path().poly([
          [47, 22],
          [53, 22],
          [50, 4],
        ]).c,
        { rot: a, ox: 50, oy: 50, dx: 50, dy: 50 }
      )
    );
  }
  return parts(A(disc), B(rays));
});

def("waves", () => {
  const band = (y) =>
    strokeLine(
      Array.from({ length: 33 }, (_, i) => [
        6 + i * 2.75,
        y + Math.sin((i / 32) * Math.PI * 3) * 6,
      ]),
      7,
      { round: true }
    );
  return parts(A(band(36)), B(band(60)));
});

def("parasol", () => {
  const canopy = path().M(6, 46).A(44, 40, 0, 0, 1, 94, 46);
  // scalloped bottom edge
  const xs = [94, 79.33, 64.67, 50, 35.33, 20.67, 6];
  for (let i = 0; i < 6; i++) canopy.A(7.33, 6, 0, 0, 0, xs[i + 1], 46);
  canopy.Z();
  const pole = path()
    .rrect(48, 40, 4, 54, 2)
    .add(ringArc(56, 92, 4, 8, 0, 180).c);
  return parts(A(canopy), B(pole));
});

def("popsicle", () => {
  const ice = path()
    .M(28, 30)
    .A(22, 22, 0, 0, 1, 72, 30)
    .L(72, 70)
    .Q(72, 74, 68, 74)
    .L(32, 74)
    .Q(28, 74, 28, 70)
    .Z();
  const stick = path().rrect(44, 72, 12, 24, 6);
  const bite = path().rrect(28, 46, 44, 4);
  return parts(A(ice), B(stick), B(bite));
});

def("shell", () => {
  const p = path()
    .M(50, 92)
    .L(14, 52)
    .C(12, 26, 30, 10, 50, 10)
    .C(70, 10, 88, 26, 86, 52)
    .Z();
  const ribs = path();
  for (const x of [-26, -13, 0, 13, 26])
    ribs.add(
      strokeLine(quad([50, 88], [50 + x * 0.6, 50], [50 + x, 16]), 3, {
        round: true,
      })
    );
  return parts(A(p), B(ribs));
});

def("maple", () => {
  const p = path().poly([
    [50, 4],
    [58, 22],
    [68, 16],
    [64, 38],
    [80, 26],
    [84, 34],
    [96, 32],
    [88, 48],
    [94, 52],
    [72, 66],
    [76, 74],
    [54, 70],
    [54, 96],
    [46, 96],
    [46, 70],
    [24, 74],
    [28, 66],
    [6, 52],
    [12, 48],
    [4, 32],
    [16, 34],
    [20, 26],
    [36, 38],
    [32, 16],
    [42, 22],
  ]);
  return A(p);
});

def("oak", () => {
  const p = path();
  const pts = [];
  const lobes = 5;
  for (const side of [1, -1]) {
    const arr = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const y = 10 + t * 74;
      const width =
        Math.sin(Math.PI * t) *
        30 *
        (0.75 + 0.25 * Math.cos(t * Math.PI * 2 * lobes));
      arr.push([50 + side * width, y]);
    }
    pts.push(side === 1 ? arr : arr.reverse());
  }
  p.poly([...pts[0], ...pts[1]]);
  p.rrect(48, 82, 4, 14, 2);
  const vein = path().rrect(49, 18, 2, 64, 1);
  return parts(A(p), B(vein));
});

def("acorn", () => {
  const nut = path()
    .M(24, 44)
    .L(76, 44)
    .C(76, 72, 62, 94, 50, 96)
    .C(38, 94, 24, 72, 24, 44)
    .Z();
  const cap = path()
    .M(18, 46)
    .C(18, 26, 34, 20, 50, 20)
    .C(66, 20, 82, 26, 82, 46)
    .Z()
    .rrect(47, 8, 6, 14, 3);
  return parts(B(nut), A(cap));
});

def("wheat", () => {
  const stem = strokeLine(quad([50, 96], [50, 60], [50, 14]), 4, {
    round: true,
  });
  const grains = path();
  for (let i = 0; i < 4; i++) {
    const y = 26 + i * 14;
    leaf(grains, [50, y + 10], [34, y - 4], 11);
    leaf(grains, [50, y + 10], [66, y - 4], 11);
  }
  leaf(grains, [50, 24], [50, 4], 11);
  return parts(A(stem), A(grains));
});

def("bat", () => {
  const p = path().poly([
    [50, 36],
    [44, 28],
    [42, 38],
    [30, 30],
    [4, 34],
    [14, 44],
    [12, 56],
    [24, 52],
    [32, 64],
    [40, 54],
    [50, 70],
    [60, 54],
    [68, 64],
    [76, 52],
    [88, 56],
    [86, 44],
    [96, 34],
    [70, 30],
    [58, 38],
    [56, 28],
  ]);
  return A(p);
});

def("web", () => {
  const p = path();
  for (const a of [0, 22.5, 45, 67.5, 90]) {
    const rad = (a * Math.PI) / 180;
    p.add(
      strokeLine(
        [
          [4, 4],
          [4 + Math.cos(rad) * 96, 4 + Math.sin(rad) * 96],
        ],
        2.4
      )
    );
  }
  for (const rad of [30, 55, 80]) {
    const pts = [];
    for (let i = 0; i <= 4; i++) {
      const a0 = (i * 22.5 * Math.PI) / 180;
      pts.push([4 + Math.cos(a0) * rad, 4 + Math.sin(a0) * rad]);
    }
    // Sag between spokes
    const sag = [];
    for (let i = 0; i < 4; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const toC = [4 - mid[0], 4 - mid[1]];
      const len = Math.hypot(...toC);
      const c = [
        mid[0] + (toC[0] / len) * rad * 0.12,
        mid[1] + (toC[1] / len) * rad * 0.12,
      ];
      sag.push(...quad(a, c, b, 8).slice(i === 0 ? 0 : 1));
    }
    p.add(strokeLine(sag, 2.4));
  }
  return A(p);
});

def("moonFull", () => {
  const p = path()
    .circle(50, 50, 40)
    .circle(36, 40, 7, true)
    .circle(60, 62, 9, true)
    .circle(64, 34, 4, true);
  return A(p);
});

def("hat", () => {
  const p = path()
    .M(50, 6)
    .C(54, 20, 62, 50, 70, 70)
    .L(30, 70)
    .C(38, 50, 46, 20, 50, 6)
    .Z()
    .ellipse(50, 74, 44, 9);
  const band = path().poly([
    [33, 62],
    [67, 62],
    [69.5, 68],
    [30.5, 68],
  ]);
  return parts(A(p), B(band));
});

def("pumpkinTall", () => {
  const body = path().ellipse(50, 60, 40, 32).ellipse(50, 60, 20, 33);
  const stem = path()
    .M(46, 30)
    .C(46, 20, 50, 12, 58, 8)
    .L(60, 14)
    .C(54, 18, 54, 24, 54, 30)
    .Z();
  return parts(A(body), B(stem));
});

def("feather", () => {
  const vane = path()
    .M(84, 8)
    .C(60, 10, 30, 30, 22, 68)
    .L(30, 70)
    .C(48, 66, 76, 46, 84, 8)
    .Z();
  const shaft = strokeLine(quad([86, 6], [50, 40], [14, 92]), 3.4, {
    round: true,
  });
  return parts(A(vane), B(shaft));
});

def("cornucopia", () => {
  const horn = path()
    .M(8, 30)
    .C(30, 26, 62, 30, 82, 42)
    .C(92, 50, 92, 74, 82, 82)
    .C(64, 76, 34, 52, 8, 30)
    .Z();
  const fruit = path().circle(76, 62, 11).circle(62, 54, 9);
  return parts(A(horn), B(fruit));
});

// ── Love and luck ───────────────────────────────────────────────────────────

def("heart", () => A(heart(path(), 50, 54, 84)));

def("heartArrow", () => {
  const h = heart(path(), 52, 54, 70);
  const shaft = path().add(
    strokeLine(
      [
        [10, 82],
        [90, 22],
      ],
      4
    )
  );
  const head = path().poly([
    [94, 19],
    [80, 22],
    [88, 31],
  ]);
  const fletch = path().poly([
    [10, 82],
    [4, 80],
    [8, 90],
    [16, 86],
  ]);
  return parts(A(h), B(shaft), B(head), B(fletch));
});

def("hearts", () => {
  const big = heart(path(), 40, 56, 62);
  const small = heart(path(), 72, 36, 36);
  return parts(A(big), B(small));
});

def("letter", () => {
  const env = path()
    .rrect(8, 22, 84, 58, 6)
    .poly(
      [
        [12, 26],
        [50, 54],
        [88, 26],
        [88, 32],
        [50, 60],
        [12, 32],
      ],
      true
    );
  const seal = heart(path(), 50, 56, 22);
  return parts(A(env, "evenodd"), B(seal));
});

def("shamrock", () => {
  const p = path();
  heart(p, 50, 30, 36);
  p.add(
    transform(heart(path(), 50, 30, 36).c, {
      rot: 120,
      ox: 50,
      oy: 46,
      dx: 50,
      dy: 46,
    })
  );
  p.add(
    transform(heart(path(), 50, 30, 36).c, {
      rot: -120,
      ox: 50,
      oy: 46,
      dx: 50,
      dy: 46,
    })
  );
  p.add(strokeLine(quad([50, 50], [52, 76], [64, 94]), 6, { round: true }));
  return A(p);
});

def("clover", () => {
  const p = path();
  for (const rot of [0, 90, 180, 270])
    p.add(
      transform(heart(path(), 50, 30, 34).c, {
        rot: rot + 45,
        ox: 50,
        oy: 48,
        dx: 50,
        dy: 48,
      })
    );
  const stem = strokeLine(quad([52, 54], [60, 78], [76, 94]), 5, {
    round: true,
  });
  return parts(A(p), B(stem));
});

def("horseshoe", () => {
  const p = path().add(ringArc(50, 46, 24, 40, 150, 390));
  for (const a of [180, 210, 330, 360]) {
    const rad = (a * Math.PI) / 180;
    p.circle(50 + Math.cos(rad) * 32, 46 + Math.sin(rad) * 32, 3, true);
  }
  return A(p, "evenodd");
});

def("pot", () => {
  const p = path()
    .M(16, 40)
    .L(84, 40)
    .C(88, 72, 74, 92, 50, 92)
    .C(26, 92, 12, 72, 16, 40)
    .Z()
    .rrect(10, 32, 80, 10, 5);
  const gold = path().circle(34, 28, 9).circle(52, 24, 10).circle(68, 29, 9);
  return parts(A(p), B(gold));
});

def("rainbow", () => {
  const p = path().add(ringArc(50, 80, 36, 46, 180, 360));
  const q = path().add(ringArc(50, 80, 22, 32, 180, 360));
  return parts(A(p), B(q));
});

// ── Celebrations ────────────────────────────────────────────────────────────

def("firework", () => {
  const p = path();
  for (let i = 0; i < 12; i++) {
    const a = (i * 30 * Math.PI) / 180;
    p.add(
      strokeLine(
        [
          [50 + Math.cos(a) * 14, 50 + Math.sin(a) * 14],
          [50 + Math.cos(a) * 38, 50 + Math.sin(a) * 38],
        ],
        4,
        { round: true }
      )
    );
  }
  const dots = path();
  for (let i = 0; i < 12; i++) {
    const a = ((i * 30 + 15) * Math.PI) / 180;
    dots.circle(50 + Math.cos(a) * 44, 50 + Math.sin(a) * 44, 3);
  }
  return parts(A(p), B(dots));
});

def("chakra", () => {
  const p = path()
    .circle(50, 50, 46)
    .circle(50, 50, 41, true)
    .circle(50, 50, 7);
  for (let i = 0; i < 24; i++) {
    const a = (i * 15 * Math.PI) / 180;
    p.add(
      strokeLine(
        [
          [50 + Math.cos(a) * 6, 50 + Math.sin(a) * 6],
          [50 + Math.cos(a) * 42, 50 + Math.sin(a) * 42],
        ],
        2.2
      )
    );
  }
  return A(p);
});

def("balloon", () => {
  const b = path()
    .M(50, 8)
    .C(74, 8, 84, 28, 82, 42)
    .C(80, 58, 62, 72, 50, 74)
    .C(38, 72, 20, 58, 18, 42)
    .C(16, 28, 26, 8, 50, 8)
    .Z()
    .poly([
      [50, 72],
      [56, 80],
      [44, 80],
    ]);
  const string = strokeLine(
    bezier([50, 80], [42, 88], [58, 92], [48, 100], 16),
    2.4
  );
  return parts(A(b), B(string));
});

def("cake", () => {
  const tiers = path().rrect(14, 58, 72, 32, 4).rrect(24, 36, 52, 24, 4);
  const icing = path()
    .M(24, 44)
    .C(30, 50, 36, 44, 42, 50)
    .C(48, 44, 54, 50, 60, 44)
    .C(66, 50, 72, 44, 76, 50)
    .L(76, 42)
    .L(24, 42)
    .Z();
  const candle = path().rrect(47, 18, 6, 18, 1);
  const flame = path();
  teardrop(flame, 50, 10, 14, 8);
  return parts(A(tiers), B(icing), B(candle), B(flame));
});

def("glasses", () => {
  const flute = (dx, rot) =>
    transform(
      path()
        .M(-9, 0)
        .L(9, 0)
        .C(9, 22, 6, 34, 0, 36)
        .C(-6, 34, -9, 22, -9, 0)
        .Z()
        .rrect(-1.5, 35, 3, 22)
        .rrect(-9, 56, 18, 3.5, 1.7).c,
      { rot, dx, dy: 20 }
    );
  const pair = path().add(flute(34, -14)).add(flute(66, 14));
  const spark = path().poly(starPoints(50, 10, 9, 3, 4));
  return parts(A(pair), B(spark));
});

def("rings", () => {
  const p = path();
  ring(p, 38, 56, 26, 20);
  const q = path();
  ring(q, 62, 56, 26, 20);
  const gem = path().poly([
    [62, 22],
    [70, 28],
    [62, 38],
    [54, 28],
  ]);
  return parts(A(p, "evenodd"), A(q, "evenodd"), B(gem));
});

def("dove", () => {
  const p = path()
    .M(10, 46)
    .C(26, 40, 40, 44, 50, 52)
    .C(54, 30, 70, 14, 92, 10)
    .C(84, 30, 76, 46, 64, 58)
    .C(74, 60, 84, 66, 90, 74)
    .C(70, 78, 54, 74, 44, 66)
    .C(32, 68, 22, 62, 16, 54)
    .L(6, 54)
    .Z();
  return A(p);
});

def("bow", () => {
  const p = path()
    .M(50, 50)
    .C(40, 36, 18, 22, 12, 34)
    .C(8, 44, 16, 62, 50, 50)
    .Z()
    .M(50, 50)
    .C(84, 62, 92, 44, 88, 34)
    .C(82, 22, 60, 36, 50, 50)
    .Z()
    .poly([
      [46, 52],
      [32, 84],
      [42, 80],
      [48, 88],
    ])
    .poly([
      [54, 52],
      [52, 88],
      [58, 80],
      [68, 84],
    ]);
  const knot = path().rrect(43, 42, 14, 16, 5);
  return parts(A(p), B(knot));
});

def("ribbonBow", () => M.bow());

def("mask", () => {
  const p = path()
    .M(8, 34)
    .C(30, 28, 70, 28, 92, 34)
    .C(92, 56, 80, 70, 64, 66)
    .C(56, 64, 54, 56, 50, 56)
    .C(46, 56, 44, 64, 36, 66)
    .C(20, 70, 8, 56, 8, 34)
    .Z()
    .ellipse(31, 46, 9, 6, true)
    .ellipse(69, 46, 9, 6, true);
  return A(p);
});

def("crown", () => {
  const p = path()
    .poly([
      [12, 74],
      [8, 30],
      [30, 50],
      [50, 20],
      [70, 50],
      [92, 30],
      [88, 74],
    ])
    .rrect(12, 78, 76, 10, 3);
  const gems = path().circle(50, 60, 5).circle(30, 64, 3.6).circle(70, 64, 3.6);
  return parts(A(p), B(gems));
});

def("gem", () => {
  const p = path().poly([
    [24, 18],
    [76, 18],
    [94, 40],
    [50, 92],
    [6, 40],
  ]);
  const facets = path()
    .poly([
      [24, 18],
      [36, 40],
      [50, 18],
    ])
    .poly([
      [50, 18],
      [64, 40],
      [76, 18],
    ])
    .poly([
      [6, 40],
      [36, 40],
      [50, 92],
    ])
    .poly([
      [64, 40],
      [94, 40],
      [50, 92],
    ]);
  return parts(A(p), B(facets));
});

// ── Independence and national ───────────────────────────────────────────────

def("starBadge", () => {
  const p = path()
    .circle(50, 50, 46)
    .poly(starPoints(50, 52, 34, 14, 5), true);
  return A(p);
});

// ── Commerce ────────────────────────────────────────────────────────────────

def("bolt", () =>
  A(
    path().poly([
      [58, 4],
      [18, 56],
      [46, 56],
      [38, 96],
      [82, 40],
      [54, 40],
      [62, 4],
    ])
  )
);

def("percent", () => {
  const p = path();
  ring(p, 28, 28, 18, 9);
  ring(p, 72, 72, 18, 9);
  p.add(
    strokeLine(
      [
        [78, 14],
        [22, 86],
      ],
      10,
      { round: true }
    )
  );
  return A(p, "evenodd");
});

def("cursor", () =>
  A(
    path().poly([
      [22, 8],
      [80, 56],
      [54, 58],
      [68, 88],
      [56, 94],
      [42, 64],
      [22, 82],
    ])
  )
);

def("priceTag", () => {
  const p = path()
    .poly([
      [8, 50],
      [34, 18],
      [92, 18],
      [92, 82],
      [34, 82],
    ])
    .circle(32, 50, 7, true);
  return A(p, "evenodd");
});

def("cart", () => {
  const p = path()
    .poly([
      [4, 14],
      [20, 14],
      [26, 26],
      [94, 26],
      [84, 62],
      [32, 62],
      [36, 70],
      [86, 70],
      [86, 78],
      [30, 78],
      [14, 22],
      [4, 22],
    ])
    .circle(36, 88, 7)
    .circle(78, 88, 7);
  return A(p);
});

def("box", () => {
  const top = path().poly([
    [50, 8],
    [92, 28],
    [50, 48],
    [8, 28],
  ]);
  const left = path().poly([
    [8, 32],
    [48, 52],
    [48, 96],
    [8, 76],
  ]);
  const right = path().poly([
    [52, 52],
    [92, 32],
    [92, 76],
    [52, 96],
  ]);
  const tape = path().poly([
    [29, 18],
    [71, 38],
    [71, 46],
    [29, 26],
  ]);
  return parts(A(left), A(right), A(top), B(tape));
});

def("leafEco", () => {
  const p = path();
  leaf(p, [14, 88], [88, 12], 50, 6);
  const vein = strokeLine(quad([14, 88], [40, 56], [72, 30]), 4, {
    round: true,
  });
  return parts(A(p), B(vein));
});

def("recycle", () => {
  const p = path();
  for (const rot of [0, 120, 240]) {
    const arm = path()
      .add(strokeLine(arcPoints(50, 54, 34, 200, 270, 12), 9))
      .poly([
        [50, 10],
        [62, 21],
        [48, 28],
      ]);
    p.add(transform(arm.c, { rot, ox: 50, oy: 54, dx: 50, dy: 54 }));
  }
  return A(p);
});

def("hanger", () => {
  const hook = strokeLine(
    bezier([50, 34], [50, 24], [60, 22], [60, 14], 10).concat(
      arcPoints(52, 14, 8, 0, -180, 10)
    ),
    4.4,
    { round: true }
  );
  const body = strokeLine(
    [
      [8, 78],
      [50, 36],
      [92, 78],
      [8, 78],
    ],
    5
  );
  return A(path().add(hook).add(body));
});

def("shirt", () =>
  A(
    path().poly([
      [34, 12],
      [42, 18],
      [58, 18],
      [66, 12],
      [92, 26],
      [84, 44],
      [72, 40],
      [72, 90],
      [28, 90],
      [28, 40],
      [16, 44],
      [8, 26],
    ])
  )
);

def("wallet", () => {
  const p = path()
    .rrect(8, 26, 84, 60, 8)
    .rrect(60, 46, 32, 20, 6, true)
    .circle(70, 56, 4);
  const flap = path().poly([
    [16, 26],
    [70, 10],
    [76, 26],
  ]);
  return parts(A(p, "evenodd"), B(flap));
});

def("coins", () => {
  const p = path()
    .ellipse(50, 78, 34, 10)
    .rrect(16, 62, 68, 16)
    .ellipse(50, 62, 34, 10);
  const q = path()
    .ellipse(50, 50, 34, 10)
    .rrect(16, 34, 68, 16)
    .ellipse(50, 34, 34, 10);
  return parts(A(p), B(q));
});

def("bank", () => {
  const p = path()
    .poly([
      [50, 6],
      [94, 30],
      [6, 30],
    ])
    .rrect(6, 84, 88, 10, 2)
    .rrect(10, 76, 80, 6, 2);
  for (const x of [16, 34, 56, 74]) p.rrect(x, 36, 10, 38, 2);
  return A(p);
});

def("receipt", () => {
  const pts = [
    [16, 6],
    [84, 6],
    [84, 92],
  ];
  for (let i = 0; i < 6; i++)
    pts.push([84 - i * 11.33 - 5.67, 86], [84 - (i + 1) * 11.33, 92]);
  const p = path().poly(pts);
  for (const [y, w] of [
    [22, 44],
    [36, 36],
    [50, 44],
    [64, 26],
  ])
    p.rrect(28, y, w, 6, 3, true);
  return A(p, "evenodd");
});

def("tap", () => {
  const p = path();
  for (const [inner, outer] of [
    [14, 22],
    [30, 38],
    [46, 54],
  ])
    p.add(ringArc(14, 86, inner, outer, -80, -10));
  p.circle(14, 86, 8);
  return A(p);
});

// ── Food and drink ──────────────────────────────────────────────────────────

def("cutlery", () => {
  const fork = path()
    .rrect(22, 8, 4, 28, 2)
    .rrect(30, 8, 4, 28, 2)
    .rrect(38, 8, 4, 28, 2)
    .M(20, 34)
    .L(44, 34)
    .C(44, 44, 38, 48, 36, 50)
    .L(36, 92)
    .Q(36, 96, 32, 96)
    .Q(28, 96, 28, 92)
    .L(28, 50)
    .C(26, 48, 20, 44, 20, 34)
    .Z();
  const knife = path()
    .M(64, 8)
    .C(80, 16, 80, 40, 76, 56)
    .L(70, 56)
    .L(70, 92)
    .Q(70, 96, 66, 96)
    .Q(62, 96, 62, 92)
    .L(62, 10)
    .Q(62, 7, 64, 8)
    .Z();
  return parts(A(fork), A(knife));
});

def("cloche", () => {
  const dome = path()
    .M(10, 74)
    .C(10, 46, 28, 28, 50, 28)
    .C(72, 28, 90, 46, 90, 74)
    .Z()
    .circle(50, 22, 6);
  const base = path().rrect(4, 78, 92, 8, 4);
  const shine = path().add(
    strokeLine(arcPoints(50, 74, 32, 200, 240, 10), 4, { round: true })
  );
  return parts(A(dome), A(base), B(shine));
});

def("chefHat", () => {
  const top = path()
    .circle(30, 40, 18)
    .circle(50, 30, 22)
    .circle(70, 40, 18)
    .rrect(26, 40, 48, 26);
  const band = path().rrect(26, 70, 48, 18, 3);
  return parts(A(top), B(band));
});

def("wineGlass", () => {
  const p = path()
    .M(26, 8)
    .L(74, 8)
    .C(76, 34, 66, 52, 50, 52)
    .C(34, 52, 24, 34, 26, 8)
    .Z()
    .rrect(47, 50, 6, 34)
    .M(28, 94)
    .C(30, 86, 42, 84, 50, 84)
    .C(58, 84, 70, 86, 72, 94)
    .Z();
  const wine = path()
    .M(27.6, 26)
    .L(72.4, 26)
    .C(71, 40, 62, 46, 50, 46)
    .C(38, 46, 29, 40, 27.6, 26)
    .Z();
  return parts(A(p), B(wine));
});

def("martini", () => {
  const p = path().poly([
    [8, 12],
    [92, 12],
    [53, 54],
    [53, 86],
    [72, 92],
    [28, 92],
    [47, 86],
    [47, 54],
  ]);
  const olive = path()
    .circle(64, 30, 8)
    .add(
      strokeLine(
        [
          [64, 30],
          [86, 6],
        ],
        2.6,
        { round: true }
      )
    );
  return parts(A(p), B(olive));
});

def("mug", () => {
  const body = path()
    .rrect(16, 26, 54, 66, 6)
    .add(ringArc(70, 58, 8, 18, -90, 90).c);
  const foam = path()
    .M(12, 34)
    .C(10, 20, 22, 12, 30, 18)
    .C(34, 8, 50, 8, 54, 16)
    .C(62, 10, 76, 16, 74, 30)
    .L(74, 36)
    .L(12, 36)
    .Z();
  return parts(A(body), B(foam));
});

def("bottle", () => {
  const p = path()
    .M(42, 4)
    .L(58, 4)
    .L(58, 28)
    .C(58, 36, 70, 40, 70, 54)
    .L(70, 92)
    .Q(70, 96, 66, 96)
    .L(34, 96)
    .Q(30, 96, 30, 92)
    .L(30, 54)
    .C(30, 40, 42, 36, 42, 28)
    .Z();
  const label = path().rrect(30, 58, 40, 22);
  return parts(A(p), B(label));
});

def("bean", () => {
  const p = path().add(
    transform(path().ellipse(50, 50, 30, 44).c, {
      rot: 30,
      ox: 50,
      oy: 50,
      dx: 50,
      dy: 50,
    })
  );
  const groove = transform(
    strokeLine(bezier([50, 10], [38, 34], [62, 66], [50, 90], 24), 5).c,
    { rot: 30, ox: 50, oy: 50, dx: 50, dy: 50 }
  );
  return parts(A(p), B(path().add(groove)));
});

def("steam", () => {
  const cup = path()
    .M(14, 46)
    .L(74, 46)
    .L(70, 80)
    .Q(68, 92, 56, 92)
    .L(32, 92)
    .Q(20, 92, 18, 80)
    .Z()
    .add(ringArc(74, 62, 7, 14, -90, 90).c);
  const steam = path();
  for (const x of [32, 46, 60])
    steam.add(
      strokeLine(
        Array.from({ length: 11 }, (_, i) => [
          x + Math.sin((i / 10) * Math.PI * 2) * 4,
          38 - i * 3,
        ]),
        4,
        { round: true }
      )
    );
  return parts(A(cup), B(steam));
});

def("croissant", () => {
  const p = path()
    .M(6, 66)
    .C(10, 40, 30, 24, 50, 24)
    .C(70, 24, 90, 40, 94, 66)
    .C(84, 70, 76, 62, 74, 58)
    .C(66, 62, 58, 62, 50, 60)
    .C(42, 62, 34, 62, 26, 58)
    .C(24, 62, 16, 70, 6, 66)
    .Z();
  const lines = path();
  for (const x of [34, 50, 66])
    lines.add(
      strokeLine(
        quad([x, 26], [x + (x - 50) * 0.1, 40], [x - (x - 50) * 0.1, 58]),
        3,
        { round: true }
      )
    );
  return parts(A(p), B(lines));
});

def("pizza", () => {
  const p = path().M(50, 94).L(10, 18).C(36, 6, 64, 6, 90, 18).Z();
  const crust = path()
    .M(10, 18)
    .C(36, 6, 64, 6, 90, 18)
    .L(86, 26)
    .C(62, 16, 38, 16, 14, 26)
    .Z();
  const top = path().circle(40, 36, 6).circle(60, 46, 6).circle(48, 64, 5);
  return parts(A(p), B(crust), B(top));
});

def("iceCream", () => {
  const cone = path().poly([
    [26, 50],
    [74, 50],
    [50, 96],
  ]);
  const scoop = path()
    .M(22, 52)
    .C(16, 20, 40, 8, 50, 8)
    .C(60, 8, 84, 20, 78, 52)
    .Z();
  return parts(B(cone), A(scoop));
});

def("bowl", () => {
  const p = path()
    .M(6, 46)
    .L(94, 46)
    .C(92, 74, 74, 90, 50, 90)
    .C(26, 90, 8, 74, 6, 46)
    .Z();
  const chop = path()
    .add(
      strokeLine(
        [
          [56, 40],
          [92, 8],
        ],
        4.4,
        { round: true }
      )
    )
    .add(
      strokeLine(
        [
          [64, 42],
          [96, 18],
        ],
        4.4,
        { round: true }
      )
    );
  return parts(A(p), B(chop));
});

// ── Travel, home, places ────────────────────────────────────────────────────

def("key", () => {
  const p = path()
    .circle(28, 50, 22)
    .circle(28, 50, 9, true)
    .rrect(46, 46, 48, 8, 2)
    .rrect(78, 54, 8, 14, 1)
    .rrect(64, 54, 8, 10, 1);
  return A(p, "evenodd");
});

def("bed", () => {
  const p = path()
    .rrect(6, 24, 8, 66, 2)
    .rrect(6, 54, 88, 20, 3)
    .rrect(86, 74, 8, 16, 2)
    .rrect(6, 74, 8, 16, 2);
  const pillow = path().rrect(18, 40, 24, 12, 5).rrect(46, 44, 48, 10, 4);
  return parts(A(p), B(pillow));
});

def("suitcase", () => {
  const p = path()
    .rrect(10, 28, 80, 58, 8)
    .rrect(36, 12, 28, 18, 6)
    .rrect(42, 18, 16, 10, 3, true);
  const straps = path().rrect(28, 28, 6, 58).rrect(66, 28, 6, 58);
  return parts(A(p, "evenodd"), B(straps));
});

def("plane", () => {
  const p = path()
    .M(50, 4)
    .C(55, 4, 56, 12, 56, 20)
    .L(56, 38)
    .L(94, 58)
    .L(94, 66)
    .L(56, 56)
    .L(56, 78)
    .L(68, 88)
    .L(68, 94)
    .L(50, 88)
    .L(32, 94)
    .L(32, 88)
    .L(44, 78)
    .L(44, 56)
    .L(6, 66)
    .L(6, 58)
    .L(44, 38)
    .L(44, 20)
    .C(44, 12, 45, 4, 50, 4)
    .Z();
  return A(p);
});

def("compass", () => {
  const p = path();
  ring(p, 50, 50, 46, 40);
  const needle = path().poly([
    [50, 14],
    [60, 50],
    [50, 86],
    [40, 50],
  ]);
  const south = path().poly([
    [50, 50],
    [60, 50],
    [50, 86],
    [40, 50],
  ]);
  return parts(A(p, "evenodd"), A(needle), B(south));
});

def("houseRoof", () => {
  const p = path()
    .poly([
      [50, 8],
      [96, 48],
      [86, 48],
      [86, 92],
      [14, 92],
      [14, 48],
      [4, 48],
    ])
    .rrect(42, 62, 16, 30, 2, true)
    .rrect(64, 14, 10, 20);
  const window = path().rrect(22, 56, 14, 14, 2);
  return parts(A(p, "evenodd"), B(window));
});

def("building", () => {
  const p = path().rrect(14, 10, 44, 86, 2).rrect(62, 40, 28, 56, 2);
  const win = path();
  for (const y of [20, 34, 48, 62])
    for (const x of [22, 40]) win.rrect(x, y, 10, 8, 1);
  for (const y of [50, 64]) win.rrect(70, y, 12, 8, 1);
  return parts(A(p), B(win));
});

def("door", () => {
  const p = path().M(22, 96).L(22, 34).A(28, 28, 0, 0, 1, 78, 34).L(78, 96).Z();
  const knob = path().circle(66, 64, 5).rrect(32, 32, 36, 24, 3);
  return parts(A(p), B(knob));
});

def("palm", () => {
  const trunk = strokeLine(
    bezier([46, 96], [48, 76], [50, 56], [56, 36], 16),
    7,
    { round: false, taper: false }
  );
  const fronds = path();
  for (const [end, ctrl] of [
    [
      [10, 40],
      [30, 20],
    ],
    [
      [22, 14],
      [36, 16],
    ],
    [
      [60, 6],
      [50, 14],
    ],
    [
      [92, 22],
      [76, 16],
    ],
    [
      [92, 52],
      [80, 30],
    ],
  ]) {
    fronds.add(strokeLine(quad([56, 36], ctrl, end, 16), 9, { taper: true }));
  }
  return parts(B(path().add(trunk)), A(fronds));
});

def("ticket", () => {
  const p = path()
    .M(8, 24)
    .L(92, 24)
    .L(92, 40)
    .A(10, 10, 0, 0, 0, 92, 60)
    .L(92, 76)
    .L(8, 76)
    .L(8, 60)
    .A(10, 10, 0, 0, 0, 8, 40)
    .Z();
  const perf = path();
  for (const y of [30, 40, 50, 60, 66]) perf.rrect(66, y, 3, 5, 1);
  return parts(A(p), B(perf));
});

def("camera", () => {
  const p = path()
    .rrect(6, 28, 88, 62, 10)
    .rrect(32, 16, 36, 16, 4)
    .circle(50, 59, 22, true)
    .circle(50, 59, 14);
  const flash = path().rrect(74, 36, 10, 6, 2);
  return parts(A(p), B(flash));
});

def("music", () => {
  const p = path()
    .ellipse(26, 78, 14, 10)
    .ellipse(76, 70, 14, 10)
    .rrect(34, 18, 6, 60)
    .rrect(84, 10, 6, 60)
    .poly([
      [34, 18],
      [90, 8],
      [90, 22],
      [34, 32],
    ]);
  return A(p);
});

def("mic", () => {
  const head = path().rrect(34, 6, 32, 54, 16);
  const stand = path()
    .add(ringArc(50, 42, 22, 28, 0, 180))
    .rrect(47, 70, 6, 18)
    .rrect(30, 88, 40, 6, 3);
  return parts(A(head), B(stand));
});

def("film", () => {
  const p = path().rrect(10, 6, 80, 88, 6);
  for (let y = 12; y < 90; y += 14)
    p.rrect(14, y, 8, 8, 1.5, true).rrect(78, y, 8, 8, 1.5, true);
  p.rrect(28, 12, 44, 36, 2, true).rrect(28, 52, 44, 36, 2, true);
  return A(p, "evenodd");
});

def("megaphone", () => {
  const p = path()
    .poly([
      [10, 38],
      [30, 38],
      [80, 12],
      [80, 88],
      [30, 62],
      [10, 62],
    ])
    .rrect(26, 62, 12, 26, 4)
    .rrect(84, 40, 10, 20, 4);
  return A(p);
});

def("globe", () => {
  const p = path();
  ring(p, 50, 50, 46, 40);
  const m = path()
    .ellipse(50, 50, 18, 43)
    .ellipse(50, 50, 13, 40, true)
    .rrect(8, 47, 84, 6)
    .add(strokeLine(arcPoints(50, 140, 112, -112, -68, 16), 5))
    .add(strokeLine(arcPoints(50, -40, 112, 68, 112, 16), 5));
  return parts(A(p, "evenodd"), A(m, "evenodd"));
});

// ── Health, learning, fitness ───────────────────────────────────────────────

def("plus", () =>
  A(
    path()
      .M(38, 8)
      .L(62, 8)
      .Q(66, 8, 66, 12)
      .L(66, 34)
      .L(88, 34)
      .Q(92, 34, 92, 38)
      .L(92, 62)
      .Q(92, 66, 88, 66)
      .L(66, 66)
      .L(66, 88)
      .Q(66, 92, 62, 92)
      .L(38, 92)
      .Q(34, 92, 34, 88)
      .L(34, 66)
      .L(12, 66)
      .Q(8, 66, 8, 62)
      .L(8, 38)
      .Q(8, 34, 12, 34)
      .L(34, 34)
      .L(34, 12)
      .Q(34, 8, 38, 8)
      .Z()
  )
);

def("pill", () => {
  const whole = path().rrect(8, 34, 84, 32, 16);
  const half = path()
    .M(50, 34)
    .L(76, 34)
    .A(16, 16, 0, 0, 1, 76, 66)
    .L(50, 66)
    .Z();
  return [
    {
      p: path().add(
        transform(whole.c, { rot: -35, ox: 50, oy: 50, dx: 50, dy: 50 })
      ),
      role: "a",
    },
    {
      p: path().add(
        transform(half.c, { rot: -35, ox: 50, oy: 50, dx: 50, dy: 50 })
      ),
      role: "b",
    },
  ];
});

def("pulse", () =>
  A(
    strokeLine(
      [
        [4, 56],
        [28, 56],
        [36, 40],
        [46, 80],
        [58, 18],
        [66, 56],
        [96, 56],
      ],
      6
    )
  )
);

def("tooth", () =>
  A(
    path()
      .M(18, 16)
      .C(30, 6, 42, 14, 50, 16)
      .C(58, 14, 70, 6, 82, 16)
      .C(94, 28, 86, 48, 80, 58)
      .C(76, 70, 76, 94, 66, 94)
      .C(58, 94, 58, 68, 50, 68)
      .C(42, 68, 42, 94, 34, 94)
      .C(24, 94, 24, 70, 20, 58)
      .C(14, 48, 6, 28, 18, 16)
      .Z()
  )
);

def("mortarboard", () => {
  const top = path().poly([
    [50, 12],
    [96, 32],
    [50, 52],
    [4, 32],
  ]);
  const cap = path()
    .M(24, 44)
    .L(50, 56)
    .L(76, 44)
    .L(76, 70)
    .C(66, 78, 34, 78, 24, 70)
    .Z();
  const tassel = path()
    .add(
      strokeLine(
        [
          [50, 32],
          [86, 42],
          [86, 66],
        ],
        3
      )
    )
    .rrect(82, 64, 8, 14, 2);
  return parts(A(top), A(cap), B(tassel));
});

def("book", () => {
  const p = path()
    .M(50, 22)
    .C(38, 12, 18, 12, 6, 16)
    .L(6, 84)
    .C(18, 80, 38, 80, 50, 90)
    .C(62, 80, 82, 80, 94, 84)
    .L(94, 16)
    .C(82, 12, 62, 12, 50, 22)
    .Z();
  const spine = path().rrect(48.5, 22, 3, 66);
  return parts(A(p), B(spine));
});

def("pencil", () => {
  const p = path().poly([
    [10, 90],
    [16, 70],
    [72, 14],
    [86, 28],
    [30, 84],
  ]);
  const tip = path().poly([
    [10, 90],
    [16, 70],
    [30, 84],
  ]);
  const end = path().poly([
    [72, 14],
    [78, 8],
    [92, 22],
    [86, 28],
  ]);
  return parts(A(p), B(tip), B(end));
});

def("ruler", () => {
  const p = path().add(
    transform(path().rrect(4, 36, 92, 28, 3).c, {
      rot: -30,
      ox: 50,
      oy: 50,
      dx: 50,
      dy: 50,
    })
  );
  const ticks = path();
  for (let i = 0; i < 9; i++)
    ticks.rrect(12 + i * 9.6, 36, 2.4, i % 2 === 0 ? 12 : 7);
  return parts(
    A(p),
    B(
      path().add(
        transform(ticks.c, { rot: -30, ox: 50, oy: 50, dx: 50, dy: 50 })
      )
    )
  );
});

def("flask", () => {
  const p = path()
    .M(38, 6)
    .L(62, 6)
    .L(62, 12)
    .L(58, 12)
    .L(58, 36)
    .L(88, 84)
    .Q(92, 94, 82, 94)
    .L(18, 94)
    .Q(8, 94, 12, 84)
    .L(42, 36)
    .L(42, 12)
    .L(38, 12)
    .Z();
  const liquid = path().poly([
    [26, 62],
    [74, 62],
    [86, 84],
    [86, 88],
    [14, 88],
    [14, 84],
  ]);
  return parts(A(p), B(liquid));
});

def("palette", () => {
  const p = path()
    .M(50, 8)
    .C(80, 8, 96, 30, 94, 52)
    .C(92, 70, 74, 72, 66, 70)
    .C(56, 68, 54, 78, 58, 86)
    .C(62, 94, 50, 94, 44, 92)
    .C(20, 88, 6, 72, 6, 50)
    .C(6, 26, 24, 8, 50, 8)
    .Z()
    .circle(28, 52, 7, true)
    .circle(34, 30, 7, true)
    .circle(56, 24, 7, true)
    .circle(76, 38, 7, true);
  return A(p, "evenodd");
});

def("dumbbell", () => {
  const p = path()
    .rrect(4, 34, 10, 32, 3)
    .rrect(16, 24, 14, 52, 4)
    .rrect(30, 45, 40, 10, 2)
    .rrect(70, 24, 14, 52, 4)
    .rrect(86, 34, 10, 32, 3);
  return A(p);
});

def("kettlebell", () => {
  const p = path()
    .add(ringArc(50, 34, 16, 26, 180, 360))
    .rrect(24, 32, 52, 6)
    .circle(50, 66, 32);
  return A(p);
});

def("trophy", () => {
  const cup = path()
    .M(24, 8)
    .L(76, 8)
    .L(76, 30)
    .C(76, 50, 64, 60, 50, 60)
    .C(36, 60, 24, 50, 24, 30)
    .Z();
  const handles = path()
    .add(ringArc(24, 26, 9, 15, 90, 270))
    .add(ringArc(76, 26, 9, 15, -90, 90));
  const base = path()
    .rrect(45, 58, 10, 18)
    .rrect(30, 76, 40, 8, 2)
    .rrect(24, 84, 52, 10, 3);
  return parts(A(cup), A(handles), B(base));
});

def("medal", () => {
  const ribbon = path()
    .poly([
      [18, 4],
      [40, 4],
      [58, 44],
      [44, 50],
    ])
    .poly([
      [82, 4],
      [60, 4],
      [42, 44],
      [56, 50],
    ]);
  const disc = path()
    .circle(50, 66, 28)
    .poly(starPoints(50, 68, 16, 7, 5), true);
  return parts(B(ribbon), A(disc, "evenodd"));
});

def("stopwatch", () => {
  const p = path()
    .circle(50, 56, 38)
    .circle(50, 56, 30, true)
    .rrect(42, 6, 16, 8, 2)
    .rrect(47, 12, 6, 8)
    .add(
      strokeLine(
        [
          [50, 56],
          [50, 36],
        ],
        6,
        { round: true }
      ).c
    )
    .add(
      strokeLine(
        [
          [50, 56],
          [64, 66],
        ],
        6,
        { round: true }
      ).c
    );
  return A(p, "nonzero");
});

def("paw", () => {
  const pad = path()
    .M(50, 46)
    .C(66, 46, 80, 64, 78, 78)
    .C(76, 90, 62, 88, 50, 88)
    .C(38, 88, 24, 90, 22, 78)
    .C(20, 64, 34, 46, 50, 46)
    .Z();
  const toes = path()
    .ellipse(18, 44, 9, 12)
    .ellipse(36, 24, 10, 13)
    .ellipse(64, 24, 10, 13)
    .ellipse(82, 44, 9, 12);
  return parts(A(pad), A(toes));
});

def("scissors", () => {
  const p = path()
    .circle(22, 74, 16)
    .circle(22, 74, 9, true)
    .circle(78, 74, 16)
    .circle(78, 74, 9, true)
    .add(
      strokeLine(
        [
          [30, 62],
          [76, 6],
        ],
        8,
        { round: true }
      ).c
    )
    .add(
      strokeLine(
        [
          [70, 62],
          [24, 6],
        ],
        8,
        { round: true }
      ).c
    );
  return A(p, "evenodd");
});

def("gear", () => {
  const pts = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const rad = i % 5 < 2 ? 46 : 36;
    pts.push([50 + Math.cos(a) * rad, 50 + Math.sin(a) * rad]);
  }
  return A(path().poly(pts).circle(50, 50, 14, true));
});

def("lightbulb", () => {
  const p = path()
    .M(50, 6)
    .C(72, 6, 86, 22, 86, 40)
    .C(86, 56, 70, 62, 66, 74)
    .L(34, 74)
    .C(30, 62, 14, 56, 14, 40)
    .C(14, 22, 28, 6, 50, 6)
    .Z();
  const base = path().rrect(34, 78, 32, 6, 3).rrect(36, 87, 28, 6, 3);
  return parts(A(p), B(base));
});

def("yoga", () => M.lotus());

def("hourglass", () => {
  const p = path()
    .rrect(16, 4, 68, 8, 3)
    .rrect(16, 88, 68, 8, 3)
    .M(24, 14)
    .L(76, 14)
    .C(76, 36, 56, 44, 56, 50)
    .C(56, 56, 76, 64, 76, 86)
    .L(24, 86)
    .C(24, 64, 44, 56, 44, 50)
    .C(44, 44, 24, 36, 24, 14)
    .Z();
  return A(p);
});

// ── Digital and social ──────────────────────────────────────────────────────

def("phoneScan", () => {
  const p = path()
    .rrect(24, 4, 52, 92, 10)
    .rrect(30, 16, 40, 66, 3, true)
    .rrect(42, 86, 16, 4, 2);
  const corners = path();
  for (const [x, y, sx, sy] of [
    [36, 24, 1, 1],
    [64, 24, -1, 1],
    [36, 74, 1, -1],
    [64, 74, -1, -1],
  ]) {
    corners.poly(
      [
        [x, y],
        [x + 10 * sx, y],
        [x + 10 * sx, y + 3 * sy],
        [x + 3 * sx, y + 3 * sy],
        [x + 3 * sx, y + 10 * sy],
        [x, y + 10 * sy],
      ],
      sx * sy < 0
    );
  }
  return parts(A(p, "evenodd"), B(corners));
});

def("corners", () => {
  const p = path();
  for (const [x, y, sx, sy] of [
    [8, 8, 1, 1],
    [92, 8, -1, 1],
    [8, 92, 1, -1],
    [92, 92, -1, -1],
  ]) {
    p.poly(
      [
        [x, y],
        [x + 30 * sx, y],
        [x + 30 * sx, y + 9 * sy],
        [x + 9 * sx, y + 9 * sy],
        [x + 9 * sx, y + 30 * sy],
        [x, y + 30 * sy],
      ],
      sx * sy < 0
    );
  }
  return A(p);
});

def("play", () =>
  A(
    path()
      .circle(50, 50, 46)
      .poly(
        [
          [40, 30],
          [70, 50],
          [40, 70],
        ],
        true
      ),
    "evenodd"
  )
);

def("link", () => {
  const one = path().rrect(4, 32, 54, 36, 18).rrect(14, 42, 34, 16, 8, true);
  const two = path().rrect(42, 32, 54, 36, 18).rrect(52, 42, 34, 16, 8, true);
  return parts(
    A(
      path().add(
        transform(one.c, { rot: -35, ox: 50, oy: 50, dx: 50, dy: 50 })
      ),
      "evenodd"
    ),
    B(
      path().add(
        transform(two.c, { rot: -35, ox: 50, oy: 50, dx: 50, dy: 50 })
      ),
      "evenodd"
    )
  );
});

def("hashtag", () => {
  const p = path()
    .poly([
      [30, 6],
      [42, 6],
      [34, 94],
      [22, 94],
    ])
    .poly([
      [62, 6],
      [74, 6],
      [66, 94],
      [54, 94],
    ])
    .rrect(8, 30, 86, 12, 2)
    .rrect(6, 60, 86, 12, 2);
  return A(p);
});

def("mail", () => {
  const p = path()
    .rrect(6, 18, 88, 64, 8)
    .poly(
      [
        [12, 24],
        [50, 54],
        [88, 24],
        [88, 32],
        [50, 62],
        [12, 32],
      ],
      true
    );
  return A(p, "evenodd");
});

def("quote", () => {
  const p = path()
    .M(10, 54)
    .C(10, 30, 22, 16, 42, 12)
    .L(44, 22)
    .C(32, 26, 26, 34, 26, 44)
    .L(42, 44)
    .L(42, 82)
    .L(10, 82)
    .Z();
  const q = path()
    .M(56, 54)
    .C(56, 30, 68, 16, 88, 12)
    .L(90, 22)
    .C(78, 26, 72, 34, 72, 44)
    .L(88, 44)
    .L(88, 82)
    .L(56, 82)
    .Z();
  return parts(A(p), B(q));
});

def("thumb", () =>
  A(
    path()
      .M(30, 44)
      .L(46, 12)
      .C(54, 8, 62, 12, 60, 24)
      .L(56, 40)
      .L(84, 40)
      .C(94, 40, 96, 50, 92, 56)
      .L(82, 86)
      .C(80, 92, 74, 94, 68, 94)
      .L(30, 94)
      .Z()
      .rrect(6, 44, 18, 50, 3)
  )
);

def("smile", () => {
  const p = path()
    .circle(50, 50, 46)
    .circle(34, 40, 6, true)
    .circle(66, 40, 6, true)
    .add(
      strokeLine(arcPoints(50, 50, 26, 25, 155, 16), 7, { round: true }).c
        .length
        ? []
        : []
    );
  const mouth = path().add(ringArc(50, 52, 20, 27, 20, 160));
  return parts(A(p, "evenodd"), B(mouth));
});

def("arrowDown", () =>
  A(
    path().poly([
      [38, 6],
      [62, 6],
      [62, 56],
      [84, 56],
      [50, 94],
      [16, 56],
      [38, 56],
    ])
  )
);

def("arrowRight", () =>
  A(
    path().poly([
      [6, 38],
      [56, 38],
      [56, 16],
      [94, 50],
      [56, 84],
      [56, 62],
      [6, 62],
    ])
  )
);

def("chevronDown", () =>
  A(
    path().poly([
      [8, 30],
      [24, 22],
      [50, 52],
      [76, 22],
      [92, 30],
      [50, 78],
    ])
  )
);

def("curlArrow", () => {
  const body = strokeLine(
    bezier([10, 20], [70, 6], [92, 40], [62, 78], 24),
    7,
    { round: true }
  );
  const head = path().poly([
    [48, 70],
    [74, 92],
    [76, 62],
  ]);
  return A(path().add(body).add(head));
});

def("download", () => {
  const p = path()
    .poly([
      [42, 6],
      [58, 6],
      [58, 46],
      [74, 46],
      [50, 72],
      [26, 46],
      [42, 46],
    ])
    .rrect(10, 80, 80, 12, 4);
  return A(p);
});

def("phone", () =>
  A(
    path()
      .rrect(24, 4, 52, 92, 12)
      .rrect(30, 14, 40, 64, 3, true)
      .circle(50, 86, 4, true),
    "evenodd"
  )
);

def("card", () => {
  const p = path().rrect(6, 20, 88, 60, 8);
  const stripe = path().rrect(6, 32, 88, 12).rrect(16, 58, 30, 8, 2);
  return parts(A(p), B(stripe));
});

def("bubble", () =>
  A(
    path()
      .rrect(6, 10, 88, 62, 16)
      .poly([
        [24, 70],
        [44, 70],
        [22, 92],
      ])
  )
);

def("speaker", () =>
  A(
    path()
      .poly([
        [8, 36],
        [30, 36],
        [56, 14],
        [56, 86],
        [30, 64],
        [8, 64],
      ])
      .add(ringArc(54, 50, 16, 23, -50, 50).c)
      .add(ringArc(54, 50, 30, 37, -50, 50).c)
  )
);

def("calendarPage", () => {
  const p = path().rrect(8, 16, 84, 78, 8).rrect(16, 38, 68, 48, 3, true);
  const rings = path().rrect(26, 6, 8, 20, 4).rrect(66, 6, 8, 20, 4);
  const day = path().rrect(56, 60, 18, 18, 2);
  return parts(A(p, "evenodd"), B(rings), A(day));
});

def("bag", () => {
  const p = path().M(14, 32).L(86, 32).L(92, 94).L(8, 94).Z();
  const handle = path().add(ringArc(50, 32, 14, 21, 180, 360));
  return parts(A(p), B(handle));
});

def("tie", () => {
  const knot = path().poly([
    [38, 8],
    [62, 8],
    [58, 24],
    [42, 24],
  ]);
  const blade = path().poly([
    [42, 26],
    [58, 26],
    [70, 78],
    [50, 96],
    [30, 78],
  ]);
  const stripe = path()
    .poly([
      [44.5, 40],
      [59, 54],
      [60.5, 61],
      [41.5, 42],
    ])
    .poly([
      [37.6, 58],
      [64.5, 84],
      [61, 88],
      [34.4, 63],
    ]);
  return parts(A(knot), A(blade), B(stripe));
});

def("bowtie", () => {
  const p = path()
    .M(50, 50)
    .C(40, 36, 20, 24, 10, 30)
    .C(4, 40, 4, 60, 10, 70)
    .C(20, 76, 40, 64, 50, 50)
    .Z()
    .M(50, 50)
    .C(60, 64, 80, 76, 90, 70)
    .C(96, 60, 96, 40, 90, 30)
    .C(80, 24, 60, 36, 50, 50)
    .Z();
  return parts(A(p), B(path().rrect(41, 38, 18, 24, 6)));
});

export const ICONS = [
  "wifi",
  "star",
  "heart",
  "phone",
  "headphones",
  "calendar",
  "user",
  "chat",
  "bag",
  "bell",
  "cup",
  "card",
  "check",
  "info",
  "home",
  "pin",
  "share",
  "download",
  "clock",
  "snowflake",
  "pumpkin",
  "tree",
  "sparkle",
  "gift",
];

export const MOTIFS = M;
export const MOTIF_NAMES = Object.keys(M);

/**
 * Path shapes for motif `name` drawn `size` units wide with its centre at
 * (cx, cy). `fill` paints part "a", `fill2` part "b".
 */
export const usage = [];
export function motif(name, cx, cy, size, fill, fill2 = fill, opts = {}) {
  if (name.startsWith("icon:")) {
    const icon = name.slice(5);
    if (!ICONS.includes(icon)) throw new Error(`No icon ${icon}`);
    if (!(size > 0)) return [];
    usage.push(name);
    return [shape.icon(icon, cx - size / 2, cy - size / 2, size, fill)];
  }
  const fn = M[name];
  if (size > 0) usage.push(name);
  if (!fn) throw new Error(`No motif ${name}`);
  const out = fn();
  const list = Array.isArray(out) ? out : [out];
  const s = size / 100;
  const merged = new Map();
  for (const part of list) {
    const paint = part.role === "b" ? fill2 : fill;
    const rule = part.rule ?? "nonzero";
    const key = `${JSON.stringify(paint)}|${rule}`;
    const cmds = transform(part.p.c, {
      s,
      dx: cx,
      dy: cy,
      ox: 50,
      oy: 50,
      rot: opts.rot ?? 0,
      flipX: opts.flipX,
    });
    if (!merged.has(key)) merged.set(key, { paint, rule, cmds: [] });
    merged.get(key).cmds.push(...cmds);
  }
  // Keep part order: "a" parts first as listed, then the rest
  if (!(size > 0)) return [];
  return [...merged.values()].map(({ paint, rule, cmds }) =>
    shape.path(cmds, paint, rule)
  );
}
