// Shared by the site's isometric art generators (the home use-case scenes in
// this folder and the product figures in scripts/figure-art): the hero
// scene's colour tokens for each theme, the stroke and fill classes, the brand
// gradients, and real QR codes drawn by qrdx with those classes in place of
// colours.

import { QRCodeSVG } from "qrdx";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SHOWCASE_STYLES,
  type ShowcaseStyleName,
  showcaseProps,
} from "@/lib/landing/showcase-styles";

const QR_SIZE = 1000;
// Placeholder colours, swapped for theme classes after rendering.
const INK = "#010101";
const EYE = "#020202";
const DOT = "#030303";
const PAPER = "#fefefe";

export const THEMES = {
  light: {
    fill: "#ffffff",
    side: "#eef0f3",
    "side-2": "#e2e5ea",
    line: "rgba(18,18,28,.26)",
    "line-2": "rgba(18,18,28,.46)",
    text: "rgba(18,18,28,.2)",
    "text-2": "rgba(18,18,28,.5)",
    ink: "#0b0b0d",
    eye: "#0b0b0d",
    dot: "#155dfc",
    glass: "rgba(236,240,248,.55)",
    screen: "#f6f7fb",
    accent: "#155dfc",
    glow: ".42",
    shade: ".09",
  },
  dark: {
    fill: "#131317",
    side: "#0b0b0e",
    "side-2": "#08080a",
    line: "rgba(255,255,255,.24)",
    "line-2": "rgba(255,255,255,.42)",
    text: "rgba(255,255,255,.18)",
    "text-2": "rgba(255,255,255,.5)",
    ink: "#e9edff",
    eye: "#e9edff",
    dot: "#8aa9ff",
    glass: "rgba(255,255,255,.035)",
    screen: "#050507",
    accent: "#7f9dff",
    glow: ".9",
    shade: ".55",
  },
} as const;

export type Theme = keyof typeof THEMES;

export const STYLE = `
*{vector-effect:non-scaling-stroke}
.f{fill:var(--fill);stroke:var(--line);stroke-width:1.1;stroke-linejoin:round}
.s{fill:var(--side);stroke:var(--line);stroke-width:1.1;stroke-linejoin:round}
.s2{fill:var(--side-2);stroke:var(--line);stroke-width:1.1;stroke-linejoin:round}
.l{fill:none;stroke:var(--line);stroke-width:1.1;stroke-linecap:round;stroke-linejoin:round}
.l2{fill:none;stroke:var(--line-2);stroke-width:1.1;stroke-linecap:round;stroke-linejoin:round}
.tx{fill:none;stroke:var(--text);stroke-width:2;stroke-linecap:round}
.tx2{fill:none;stroke:var(--text-2);stroke-width:2.2;stroke-linecap:round}
.ic{fill:none;stroke:var(--line-2);stroke-width:1.3;stroke-linecap:round;stroke-linejoin:round}
.dot{fill:var(--line-2)}
.acc{fill:url(#hue)}
.rim{fill:none;stroke:url(#hue);stroke-width:1.5;stroke-linejoin:round}
.glass{fill:var(--glass);stroke:var(--line);stroke-width:1.1;stroke-linejoin:round}
.wall{fill:var(--glass);stroke:var(--text);stroke-width:1.1;stroke-linejoin:round}
.tube-o{fill:none;stroke:var(--line);stroke-linecap:round}
.tube{fill:none;stroke:var(--fill);stroke-linecap:round}
.scr{fill:var(--screen);stroke:var(--line);stroke-width:1}
.vf{fill:none;stroke:var(--accent);stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}
.tick{fill:none;stroke:#fff;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}
.glow{fill:url(#bloom);opacity:var(--glow)}
.shade{fill:url(#shade);opacity:var(--shade)}
.q1{fill:var(--ink)}.q2{fill:var(--eye)}.q3{fill:var(--dot)}.qp{fill:var(--fill)}
`;

export const DEFS = `<linearGradient id="hue" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#155dfc"/><stop offset="1" stop-color="#7c5cff"/></linearGradient><radialGradient id="bloom"><stop offset="0" stop-color="#155dfc" stop-opacity=".5"/><stop offset=".55" stop-color="#7c5cff" stop-opacity=".14"/><stop offset="1" stop-color="#7c5cff" stop-opacity="0"/></radialGradient><radialGradient id="shade"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>`;

/** `<style>` for one theme: its colour variables, then the shared classes. */
export function themeStyle(theme: Theme, extra = "") {
  const vars = Object.entries(THEMES[theme])
    .map(([name, value]) => `--${name}:${value}`)
    .join(";");
  return `<style>svg{${vars}}${STYLE.replace(/\n/g, "")}${extra}</style>`;
}

/**
 * A real code as qrdx draws it in a showcase style, with the theme classes
 * in place of colours: q1 = body modules (and frame), q2 = corner eyes,
 * q3 = eye centres (brand blue on accent styles), qp = paper.
 */
export function qrMarkup(value: string, style: ShowcaseStyleName) {
  const look = SHOWCASE_STYLES[style];
  const svg = renderToStaticMarkup(
    createElement(
      QRCodeSVG,
      showcaseProps(
        style,
        { value, size: QR_SIZE },
        {
          // Level L keeps the modules big enough to read as a QR code at
          // card size; the look (shapes, frame, accent) is the style's.
          level: "L",
          fgColor: INK,
          eyeColor: EYE,
          dotColor: look.accent ? DOT : EYE,
          bgColor: PAPER,
          ...(look.frame && { frame: { ...look.frame, color: INK } }),
        },
      ),
    ),
  );
  const viewBox =
    svg.match(/^<svg[^>]*viewBox="([^"]+)"/)?.[1] ??
    `0 0 ${QR_SIZE} ${QR_SIZE}`;
  const inner = svg
    .replace(/^<svg[^>]*>/, "")
    .replace(/<\/svg>$/, "")
    .replace(/<defs><\/defs>/g, "")
    // The code's own white square: the face it's printed on shows instead.
    .replace(
      new RegExp(
        `<rect fill="${PAPER}" height="${QR_SIZE}" width="${QR_SIZE}" x="0" y="0"></rect>`,
        "gi",
      ),
      "",
    )
    .replace(/ (data-[a-z-]+|xmlns)="[^"]*"/g, "")
    .replace(/ transform="rotate\(0,[^"]*\)"/g, "")
    .replace(new RegExp(`fill="${INK}"`, "gi"), 'class="q1"')
    .replace(new RegExp(`fill="${EYE}"`, "gi"), 'class="q2"')
    .replace(new RegExp(`fill="${DOT}"`, "gi"), 'class="q3"')
    .replace(new RegExp(`fill="(${PAPER}|#ffffff)"`, "gi"), 'class="qp"')
    .replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n))))
    .replace(/<(\w+)([^>]*)><\/\1>/g, "<$1$2/>");
  return { viewBox, inner };
}

/** The code as a `<symbol>`, drawn with `<use href="#id">`. */
export function qrSymbol(id: string, value: string, style: ShowcaseStyleName) {
  const { viewBox, inner } = qrMarkup(value, style);
  return `<symbol id="${id}" viewBox="${viewBox}">${inner}</symbol>`;
}
