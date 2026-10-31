"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useEffect, useRef } from "react";
import { EGG_QR, QRDX_QR_M } from "@/components/fx/qr-matrix";
import {
  cable,
  faceX,
  faceY,
  faceZ,
  finderPaths,
  local,
  matrixX,
  matrixY,
  matrixZLocal,
  modulesPath,
  path,
  prism,
  proj,
  TRACK,
  trackGeometry,
} from "./hero-scene-geometry";

// A QR "studio" drawn in code: one isometric SVG, crisp at any size and an
// exact loop by construction (tiles: 32 s, everything else divides it). The
// accent hue cycles through the brand family every 16 s. All motion is SMIL
// (paths, transforms, dash offsets) or CSS (stop colours), paused off screen,
// in background tabs and for reduced motion (which shows a still frame).

const LOOP = 32;
const QR = QRDX_QR_M;
const QN = QR.length;
const QUIET = 2;
const QR_MODULES = modulesPath(QR, true);
const QR_FINDERS = finderPaths(QN);
const QR_ALL = modulesPath(QR);
// The glowing card is an easter egg (lib/easter-eggs.ts); same size, same finders.
const CARD_MODULES = modulesPath(EGG_QR.hero, true);

const ICONS: Record<string, string[]> = {
  link: [
    "M3.27 12A5.46 5.46 0 0 1 2 8.5C2 5.48 4.47 3 7.5 3h5C15.52 3 18 5.48 18 8.5S15.53 14 12.5 14H10",
    "M20.73 12A5.46 5.46 0 0 1 22 15.5c0 3.02-2.47 5.5-5.5 5.5h-5C8.48 21 6 18.52 6 15.5S8.47 10 11.5 10H14",
  ],
  wifi: [
    "M4.91 11.84c4.3-3.32 9.89-3.32 14.19 0M2 8.36c6.06-4.68 13.94-4.68 20 0M6.79 15.49c3.15-2.44 7.26-2.44 10.41 0M9.4 19.15c1.58-1.22 3.63-1.22 5.21 0",
  ],
  profile: [
    "M12.16 10.87c-.1-.01-.22-.01-.33 0a4.42 4.42 0 0 1-4.27-4.43C7.56 3.99 9.54 2 12 2a4.435 4.435 0 0 1 .16 8.87ZM7.16 14.56c-2.42 1.62-2.42 4.26 0 5.87 2.75 1.84 7.26 1.84 10.01 0 2.42-1.62 2.42-4.26 0-5.87-2.74-1.83-7.25-1.83-10.01 0Z",
  ],
  sms: [
    "M17 20.5H7c-3 0-5-1.5-5-5v-7c0-3.5 2-5 5-5h10c3 0 5 1.5 5 5v7c0 3.5-2 5-5 5Z",
    "m17 9-3.13 2.5c-1.03.82-2.72.82-3.75 0L7 9",
  ],
  location: [
    "M12 13.43a3.12 3.12 0 1 0 0-6.24 3.12 3.12 0 0 0 0 6.24Z",
    "M3.62 8.49c1.97-8.66 14.8-8.65 16.76.01 1.15 5.08-2.01 9.38-4.78 12.04a5.193 5.193 0 0 1-7.21 0c-2.76-2.66-5.92-6.97-4.77-12.05Z",
  ],
  calendar: [
    "M8 2v3M16 2v3M3.5 9.09h17M21 8.5V17c0 3-1.5 5-5 5H8c-3.5 0-5-2-5-5V8.5c0-3 1.5-5 5-5h8c3.5 0 5 2 5 5Z",
  ],
  card: [
    "M2 8.505h20M6 16.505h2M10.5 16.505h4",
    "M6.44 3.505h11.11c3.56 0 4.45.88 4.45 4.39v8.21c0 3.51-.89 4.39-4.44 4.39H6.44c-3.55.01-4.44-.87-4.44-4.38v-8.22c0-3.51.89-4.39 4.44-4.39Z",
  ],
  // A tiny QR glyph in the same 24-unit box.
  qr: [
    "M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM14 14h2v2h-2zM18 14h3M14 19h2M18 18h3v3",
  ],
};
const TILE_ICONS = [
  "qr",
  "link",
  "wifi",
  "profile",
  "qr",
  "sms",
  "location",
  "calendar",
  "qr",
  "card",
  "link",
  "wifi",
  "qr",
  "profile",
  "location",
  "card",
];
const TILE = prism(-15, -15, 15, 15, 0, 9, 6, local);
const TILE_ICON = matrixZLocal(-11.5, -11.5, 9.2, 0.96);

const STYLE = `
.sc{--sc-hue-a:var(--primary);--sc-hue-b:#7c5cff;--sc-hue-c:#22c3ee}
.sc .f{fill:var(--sc-fill);stroke:var(--sc-line);stroke-width:1.5;stroke-linejoin:round}
.sc .s{fill:var(--sc-side);stroke:var(--sc-line);stroke-width:1.5;stroke-linejoin:round}
.sc .l{fill:none;stroke:var(--sc-line);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.sc .l2{fill:none;stroke:var(--sc-line-2);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.sc .scr{fill:var(--sc-screen);stroke:var(--sc-line-2);stroke-width:1.5}
.sc .ic{fill:none;stroke:var(--sc-icon);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.sc .ic-h{fill:none;stroke:url(#sc-hue);stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.sc .rim{fill:none;stroke:url(#sc-hue);stroke-width:2.6;stroke-linejoin:round}
.sc .glow{opacity:var(--sc-glow)}
.sc .lift{opacity:var(--sc-lift)}
.sc .sa{animation:sc-a 16s linear infinite}
.sc .sb{animation:sc-b 16s linear infinite}
.sc .sc2{animation:sc-c 16s linear infinite}
@keyframes sc-a{0%,100%{stop-color:var(--sc-hue-a)}33%{stop-color:var(--sc-hue-b)}66%{stop-color:var(--sc-hue-c)}}
@keyframes sc-b{0%,100%{stop-color:var(--sc-hue-b)}33%{stop-color:var(--sc-hue-c)}66%{stop-color:var(--sc-hue-a)}}
@keyframes sc-c{0%,100%{stop-color:var(--sc-hue-c)}33%{stop-color:var(--sc-hue-a)}66%{stop-color:var(--sc-hue-b)}}
.sc[data-paused] *{animation-play-state:paused!important}
@media (prefers-reduced-motion:reduce){.sc *{animation:none!important}}
`;

const track = trackGeometry();

/** The drawing's own bounds within the 1600 × 900 canvas (~10% zoom). */
const VIEWBOX = "70 18 1460 862";

/** Ground cables, drawn under the track. */
const CABLES = [
  cable([
    [-280, 360],
    [-230, 360],
    [-230, 300],
    [40, 300],
  ]),
  cable([
    [330, 200],
    [420, 200],
    [420, 186],
    [500, 186],
  ]),
  cable([
    [690, 352],
    [640, 352],
    [640, 200],
    [620, 200],
  ]),
];

/** Three cables from the studio to the analytics panel; a pulse rides the middle one. */
const BUNDLE = [-10, 0, 10].map((o) =>
  cable(
    [
      [420 + o, -236],
      [420 + o, -60 + o],
      [262 + o, -60 + o],
      [262 + o, 90],
    ],
    24,
  ),
);

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

const SCREWS = [
  [44, 74],
  [316, 74],
  [44, 306],
  [316, 306],
].map(([x = 0, y = 0]) => proj(x, y, 16));

/** Parked tiles that sit still, like spares on a bench. */
const PARKED = [
  { at: proj(640, 470, 0), icon: "wifi" },
  { at: proj(-40, -260, 0), icon: "calendar" },
];

function Icon({ name, hue = false }: { name: string; hue?: boolean }) {
  return (
    <g transform={TILE_ICON}>
      {(ICONS[name] ?? []).map((d) => (
        <path key={d} d={d} className={hue ? "ic-h" : "ic"} />
      ))}
    </g>
  );
}

function Tile({ icon, hue = false }: { icon: string; hue?: boolean }) {
  return (
    <>
      <path d={TILE.side} className="s" />
      <path d={TILE.top} className="f" />
      <Icon name={icon} hue={hue} />
    </>
  );
}

// --- Objects ---------------------------------------------------------------

/** A small server stack: two rack units with blinking LEDs and vents. */
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

/**
 * A robot arm beside the near track: it swings down onto a passing tile,
 * stamps it (a ring flashes) and lifts back, every 4 s. Drawn in screen
 * space around its base so the joints can rotate.
 */
const STAMP_AT = proj(180, TRACK.y1, TRACK.z1 + 10);
/** Arm scale; its reach (104.5, -71.8) in arm units lands on STAMP_AT. */
const ARM_SCALE = 1.25;
const ARM_PIVOT: [number, number] = [
  STAMP_AT[0] - 104.5 * ARM_SCALE,
  STAMP_AT[1] + 71.8 * ARM_SCALE,
];
const ARM_BASE = prism(152, 593, 212, 653, 0, 22, 30);

const DEVICE = {
  base: prism(30, 60, 330, 320, 0, 16, 28),
  body: prism(70, 95, 300, 265, 16, 262, 24),
  screen: faceY(265.6, 90, 40, 280, 236, 14),
  qr: matrixY(100, 266, 226, 170 / (QN + QUIET * 2)),
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

const PRINTER = {
  body: prism(-400, 240, -280, 400, 0, 118, 18),
  slot: faceX(-279.5, 270, 52, 370, 62, 3),
  panel: faceY(400.5, -380, 70, -300, 104, 6),
  roll: prism(-380, 260, -300, 300, 118, 140, 20),
  led: proj(-292, 400.5, 88),
  card: prism(-280, 280, -216, 360, 56, 58, 4),
};
// Where the printed card's QR sits (flat on top of the card).
const CARD_QR = (() => {
  const [e, f] = proj(-274, 286, 58);
  const s = 2.3;
  return `matrix(${0.866 * s} ${0.5 * s} ${-0.866 * s} ${0.5 * s} ${e} ${f})`;
})();
// Slide vector: 80 units along +x and down to the track top.
const CARD_SLIDE = (() => {
  const [ax, ay] = proj(0, 0, 58);
  const [bx, by] = proj(80, 0, TRACK.z1 + 2);
  return `${Math.round((bx - ax) * 10) / 10} ${Math.round((by - ay) * 10) / 10}`;
})();

const GATE = {
  legA: prism(500, 166, 516, 200, 0, 150, 5),
  legB: prism(604, 166, 620, 200, 0, 150, 5),
  beam: prism(494, 162, 626, 204, 150, 168, 10),
  curtain: path([
    proj(516, 183, TRACK.z1),
    proj(604, 183, TRACK.z1),
    proj(604, 183, 150),
    proj(516, 183, 150),
  ]),
  stand: prism(546, 178, 574, 194, 168, 178, 6),
  phone: prism(526, 182, 594, 193, 178, 318, 12),
  screen: faceY(193.4, 532, 186, 588, 310, 9),
  ui: matrixY(560, 193.6, 266, 1),
};

const PANEL = {
  body: prism(330, -262, 520, -240, 0, 178, 16),
  feet: [
    prism(350, -262, 370, -232, 0, 6, 4),
    prism(480, -262, 500, -232, 0, 6, 4),
  ],
  screen: faceY(-239.6, 346, 18, 504, 162, 10),
  ui: matrixY(352, -239.4, 156, 1),
};
const BARS = [
  [46, 72, 58],
  [64, 40, 86],
  [38, 92, 70],
  [80, 60, 104],
  [58, 108, 76],
  [96, 70, 118],
];

const CARD = {
  body: prism(690, 330, 900, 372, 0, 242, 26),
  face: faceY(372.6, 702, 14, 888, 230, 18),
  qr: matrixY(708, 373, 224, 174 / (QN + QUIET * 2)),
  bloom: proj(795, 372, 120),
  // The two edges that face the camera: front-top and front-right.
  edges: `${path([proj(716, 372, 242), proj(874, 372, 242)], false)}${path([proj(900, 346, 226), proj(900, 346, 16)], false)}`,
};

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

const ARC_R = 17;
const ARC = 2 * Math.PI * ARC_R;

export function HeroScene({ className }: { className?: string }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced) {
      // A composed still: tiles spread out, card on the track, ring drawn.
      svg.pauseAnimations();
      svg.setCurrentTime(7);
      svg.dataset.paused = "";
      return;
    }
    let onScreen = true;
    const update = () => {
      const run = onScreen && document.visibilityState === "visible";
      if (run) {
        svg.unpauseAnimations();
        delete svg.dataset.paused;
      } else {
        svg.pauseAnimations();
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
      aria-label="Animated drawing of a QR code studio: a device shows a scannable QR code for qrdx.dev, a printer feeds printed codes onto a conveyor of tiles, a phone on a gate scans them, an analytics panel charts the scans, and a large glowing QR card stands in front"
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
          <stop offset="0" className="sa" stopColor="var(--primary)" />
          <stop offset="1" className="sb" stopColor="#7c5cff" />
        </linearGradient>
        <linearGradient id="sc-hue-3" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="sa" stopColor="var(--primary)" />
          <stop offset="0.55" className="sb" stopColor="#7c5cff" />
          <stop offset="1" className="sc2" stopColor="#22c3ee" />
        </linearGradient>
        <filter id="sc-soft" x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
        <radialGradient id="sc-bloom">
          <stop
            offset="0"
            className="sa"
            stopColor="var(--primary)"
            stopOpacity="0.55"
          />
          <stop
            offset="0.5"
            className="sb"
            stopColor="#7c5cff"
            stopOpacity="0.16"
          />
          <stop offset="1" stopColor="#7c5cff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sc-beam" x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0"
            className="sa"
            stopColor="var(--primary)"
            stopOpacity="0.5"
          />
          <stop
            offset="1"
            className="sa"
            stopColor="var(--primary)"
            stopOpacity="0"
          />
        </linearGradient>
        {/* A light band sweeping across the big card's modules (module units). */}
        <linearGradient
          id="sc-sweep"
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2="29"
          y2="14"
          spreadMethod="reflect"
        >
          <stop offset="0" className="sa" stopColor="var(--primary)" />
          <stop offset="0.5" style={{ stopColor: "var(--sc-band)" }} />
          <stop offset="1" className="sb" stopColor="#7c5cff" />
          <animateTransform
            attributeName="gradientTransform"
            type="translate"
            values="-29 -14;29 14"
            dur="8s"
            repeatCount="indefinite"
          />
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
      </defs>

      {/* Behind the track: plant, analytics panel, cables, legs. */}
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
          {BARS.map(([a = 50, b = 80, c = 60], i) => {
            const x = 12 + i * 22;
            const values = `${a};${b};${c};${a}`;
            const ys = `${134 - a};${134 - b};${134 - c};${134 - a}`;
            return (
              <rect
                key={x}
                x={x}
                y={134 - a}
                width={12}
                height={a}
                rx={2}
                fill="url(#sc-hue-3)"
                className="glow"
              >
                <animate
                  attributeName="height"
                  dur="8s"
                  repeatCount="indefinite"
                  values={values}
                  keyTimes="0;0.35;0.7;1"
                  calcMode="spline"
                  keySplines=".4 0 .2 1;.4 0 .2 1;.4 0 .2 1"
                />
                <animate
                  attributeName="y"
                  dur="8s"
                  repeatCount="indefinite"
                  values={ys}
                  keyTimes="0;0.35;0.7;1"
                  calcMode="spline"
                  keySplines=".4 0 .2 1;.4 0 .2 1;.4 0 .2 1"
                />
              </rect>
            );
          })}
        </g>
      </g>

      <g>
        {BUNDLE.map((d) => (
          <path key={d} d={d} className="l2" />
        ))}
        <path
          d={BUNDLE[1]}
          fill="none"
          stroke="url(#sc-hue)"
          strokeWidth={3.2}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="0.07 0.93"
        >
          <animate
            attributeName="stroke-dashoffset"
            values="0;-1"
            dur="4s"
            repeatCount="indefinite"
          />
        </path>
        {CABLES.map((d) => (
          <path key={d} d={d} className="l2" />
        ))}
      </g>

      {/* Printer, left of the track. */}
      <g>
        <path d={PRINTER.body.side} className="s" />
        <path d={PRINTER.body.top} className="f" />
        <path d={PRINTER.roll.side} className="s" />
        <path d={PRINTER.roll.top} className="f" />
        <path d={PRINTER.slot} className="scr" />
        <path d={PRINTER.panel} className="l2" />
        <circle
          cx={PRINTER.led[0]}
          cy={PRINTER.led[1]}
          r={3.2}
          fill="url(#sc-hue)"
        >
          <animate
            attributeName="opacity"
            dur="2s"
            repeatCount="indefinite"
            values="1;.25;1"
          />
        </circle>
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

      {/* Tiles riding the track. */}
      <g>
        {TILE_ICONS.map((icon, i) => (
          <g key={`${icon}-${i}`}>
            <Tile icon={icon} hue={i % 3 === 0} />
            <animateMotion
              dur={`${LOOP}s`}
              repeatCount="indefinite"
              begin={`${-((i * LOOP) / TILE_ICONS.length).toFixed(3)}s`}
              path={track.motion}
            />
          </g>
        ))}
      </g>

      {/* A printed card slides out onto the track every 8 s. */}
      <g>
        <g>
          <path d={PRINTER.card.side} className="s" />
          <path d={PRINTER.card.top} className="f" />
          <g transform={CARD_QR}>
            <path d={QR_ALL} fill="var(--sc-icon)" />
          </g>
          <animateTransform
            attributeName="transform"
            type="translate"
            dur="8s"
            repeatCount="indefinite"
            values={`0 0;0 0;${CARD_SLIDE};${CARD_SLIDE}`}
            keyTimes="0;0.2;0.55;1"
            calcMode="spline"
            keySplines="0 0 1 1;.4 0 .2 1;0 0 1 1"
          />
          <animate
            attributeName="opacity"
            dur="8s"
            repeatCount="indefinite"
            values="0;1;1;1;0"
            keyTimes="0;0.1;0.6;0.85;1"
          />
        </g>
      </g>

      {/* The QR studio. */}
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
          <path d="M0 -18V-8" className="l2">
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="0;360"
              dur={`${LOOP / 2}s`}
              repeatCount="indefinite"
            />
          </path>
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
        {/* A real, scannable code for https://qrdx.dev. */}
        <g transform={DEVICE.qr}>
          <g transform={`translate(${QUIET} ${QUIET})`}>
            {/* The eyes glow in the accent; the modules stay high contrast. */}
            <path
              d={QR_FINDERS.halo}
              fill="none"
              stroke="url(#sc-hue)"
              strokeWidth={0.45}
              strokeLinejoin="round"
              className="glow"
            >
              <animate
                attributeName="opacity"
                dur="4s"
                repeatCount="indefinite"
                values="1;.35;1"
              />
            </path>
            <path d={QR_MODULES} fill="var(--sc-ink)" />
            <path d={QR_FINDERS.ring} fill="var(--sc-ink)" fillRule="evenodd" />
            <path d={QR_FINDERS.eye} fill="var(--sc-ink)" />
          </g>
          <rect
            x={0}
            y={0}
            width={QN + QUIET * 2}
            height={0.3}
            fill="url(#sc-hue)"
            opacity={0.7}
          >
            <animateTransform
              attributeName="transform"
              type="translate"
              values={`0 1;0 ${QN + QUIET * 2 - 1.5};0 1`}
              keyTimes="0;0.5;1"
              dur="4s"
              repeatCount="indefinite"
              calcMode="spline"
              keySplines=".45 0 .55 1;.45 0 .55 1"
            />
          </rect>
        </g>
        <circle cx={DEVICE.led[0]} cy={DEVICE.led[1]} r={3} fill="url(#sc-hue)">
          <animate
            attributeName="opacity"
            dur="4s"
            repeatCount="indefinite"
            values="1;.3;1"
          />
        </circle>
      </g>

      {/* Scanner gate over the track, with a phone on top. */}
      <g>
        <path d={GATE.legA.side} className="s" />
        <path d={GATE.legA.top} className="f" />
        <path d={GATE.curtain} fill="url(#sc-beam)" className="glow">
          <animate
            attributeName="opacity"
            dur="2s"
            repeatCount="indefinite"
            values=".9;.35;.9"
          />
        </path>
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
          <circle
            r={ARC_R}
            fill="none"
            stroke="url(#sc-hue)"
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={`${ARC * 0.3} ${ARC}`}
            transform="rotate(-90)"
          >
            <animate
              attributeName="stroke-dasharray"
              dur="4s"
              repeatCount="indefinite"
              values={`0 ${ARC};${ARC} ${ARC};${ARC} ${ARC};0 ${ARC}`}
              keyTimes="0;0.5;0.85;1"
            />
          </circle>
          <path
            d="M-7 0l5 5 9-10"
            fill="none"
            stroke="url(#sc-hue)"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray="1 1"
          >
            <animate
              attributeName="stroke-dashoffset"
              dur="4s"
              repeatCount="indefinite"
              values="1;1;0;0;1"
              keyTimes="0;0.5;0.62;0.9;1"
            />
          </path>
          <path d="M-16 34h32M-10 42h20" className="l2" />
        </g>
      </g>

      {/* Server stack with blinking LEDs. */}
      <g>
        {SERVER.map((u, k) => (
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
              >
                <animate
                  attributeName="opacity"
                  values="1;.15;1"
                  dur={`${[0.8, 1.6, 2][i]}s`}
                  begin={`${-k * 0.4 - i * 0.3}s`}
                  repeatCount="indefinite"
                />
              </circle>
            ))}
          </g>
        ))}
      </g>

      {/* Robot arm stamping tiles as they pass. */}
      <g>
        <path d={ARM_BASE.side} className="s" />
        <path d={ARM_BASE.top} className="f" />
        <ellipse
          cx={STAMP_AT[0]}
          cy={STAMP_AT[1] + 6}
          rx={24}
          ry={14}
          fill="none"
          stroke="url(#sc-hue)"
          strokeWidth={2}
          opacity={0}
        >
          <animate
            attributeName="opacity"
            values="0;0;1;0;0"
            keyTimes="0;0.36;0.42;0.62;1"
            dur="4s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="rx"
            values="10;10;14;30;30"
            keyTimes="0;0.36;0.42;0.62;1"
            dur="4s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="ry"
            values="6;6;8;17;17"
            keyTimes="0;0.36;0.42;0.62;1"
            dur="4s"
            repeatCount="indefinite"
          />
        </ellipse>
        <g
          transform={`translate(${ARM_PIVOT[0]} ${ARM_PIVOT[1]}) scale(${ARM_SCALE})`}
        >
          <g>
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="-100;-67;-67;-100;-100"
              keyTimes="0;0.36;0.46;0.66;1"
              calcMode="spline"
              keySplines=".4 0 .2 1;0 0 1 1;.4 0 .2 1;0 0 1 1"
              dur="4s"
              repeatCount="indefinite"
            />
            <rect
              x={-10}
              y={-10}
              width={98}
              height={20}
              rx={10}
              className="f"
            />
            <path d="M14 0H70" className="l" />
            <g transform="translate(78 0)">
              <g>
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  values="140;67;67;140;140"
                  keyTimes="0;0.36;0.46;0.66;1"
                  calcMode="spline"
                  keySplines=".4 0 .2 1;0 0 1 1;.4 0 .2 1;0 0 1 1"
                  dur="4s"
                  repeatCount="indefinite"
                />
                <rect
                  x={-8}
                  y={-8}
                  width={86}
                  height={16}
                  rx={8}
                  className="f"
                />
                <g transform="translate(74 0)">
                  <rect
                    x={-7}
                    y={-11}
                    width={22}
                    height={22}
                    rx={5}
                    className="f"
                  />
                  <path d="M15 -6v12" className="rim" strokeWidth={2.4} />
                </g>
                <circle r={6} className="f" />
                <circle r={2.4} fill="url(#sc-hue)" />
              </g>
            </g>
            <circle r={8} className="f" />
            <circle r={3} fill="url(#sc-hue)" />
          </g>
        </g>
      </g>

      {PARKED.map(({ at: [x, y], icon }) => (
        <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}>
          <Tile icon={icon} />
        </g>
      ))}

      {/* The big glowing QR card. */}
      <g>
        <ellipse
          cx={CARD.bloom[0]}
          cy={CARD.bloom[1]}
          rx={230}
          ry={200}
          fill="url(#sc-bloom)"
          className="glow"
        />
        <path d={CARD.body.side} className="s" />
        <path d={CARD.body.top} className="f" />
        <path
          d={CARD.face}
          className="rim glow"
          strokeWidth={10}
          filter="url(#sc-soft)"
        />
        <path d={CARD.face} className="scr" />
        <path d={CARD.face} fill="url(#sc-hue-3)" fillOpacity={0.1} />
        <g transform={CARD.qr}>
          <rect
            width={QN + QUIET * 2}
            height={QN + QUIET * 2}
            fill="url(#sc-cells)"
          />
          <g transform={`translate(${QUIET} ${QUIET})`}>
            <path d={CARD_MODULES} fill="url(#sc-sweep)" />
            <path d={CARD_MODULES} fill="#ffffff" className="lift" />
            <path
              d={QR_FINDERS.ring}
              fill="url(#sc-sweep)"
              fillRule="evenodd"
            />
            <path d={QR_FINDERS.eye} style={{ fill: "var(--sc-eye)" }} />
          </g>
        </g>
        <path d={CARD.face} className="rim" strokeWidth={3.2} />
        <path
          d={CARD.edges}
          className="rim glow"
          strokeWidth={6}
          filter="url(#sc-soft)"
        />
        <path
          d={CARD.edges}
          fill="none"
          stroke="var(--sc-edge)"
          strokeWidth={1.6}
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
