// Drawing kit for the blog's cover and inline illustrations, in the site's
// isometric line style: the hero camera (../use-case-art/iso.ts), the hero
// colour tokens and stroke classes (../use-case-art/kit.ts), and real QR
// codes drawn by qrdx in a showcase style (lib/landing/showcase-styles.ts).
//
// The blog renders one image per post, so each file carries both palettes:
// light by default and dark under `prefers-color-scheme: dark`.

import { QRCodeSVG } from "qrdx";
import type { ErrorLevel } from "qrdx/types";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SHOWCASE_STYLES,
  type ShowcaseStyleName,
  showcaseProps,
} from "@/lib/landing/showcase-styles";
import { type Camera, roundRect, type V3 } from "../use-case-art/iso";
import { DEFS, STYLE, THEMES } from "../use-case-art/kit";

export { camera, roundRect } from "../use-case-art/iso";
export type { Camera, V3 };

// --- Colours ---------------------------------------------------------------

/** The illustration's own backdrop, so it reads as a card in either theme. */
const BACKDROP = {
  light: { bg: "#f7f7f8", grid: "rgba(18,18,28,.07)" },
  dark: { bg: "#09090b", grid: "rgba(255,255,255,.07)" },
} as const;

const EXTRA = `
.bg{fill:var(--bg)}
.grid{fill:var(--grid)}
.qh{display:none}
.beam{fill:none;stroke:var(--accent);stroke-width:1.6;stroke-linecap:round}
.dash{fill:none;stroke:var(--line-2);stroke-width:1.1;stroke-dasharray:3 3;stroke-linecap:round}
.ghost{fill:var(--glass);stroke:var(--text);stroke-width:1.1;stroke-dasharray:3 2.5;stroke-linejoin:round}
.lbl{fill:var(--text-2);font:600 7px ui-sans-serif,system-ui,sans-serif;letter-spacing:.02em}
.mono{fill:var(--text-2);font:500 5.2px ui-monospace,SFMono-Regular,Menlo,monospace}
.mono-a{fill:var(--accent);font:600 5.2px ui-monospace,SFMono-Regular,Menlo,monospace}
`;

function vars(theme: keyof typeof THEMES) {
  return Object.entries({ ...THEMES[theme], ...BACKDROP[theme] })
    .map(([name, value]) => `--${name}:${value}`)
    .join(";");
}

/** Light tokens, dark tokens under the media query, then the shared classes. */
export function styleBlock(theme: "auto" | "light" | "dark" = "auto") {
  const base = theme === "dark" ? vars("dark") : vars("light");
  const dark =
    theme === "auto"
      ? `@media (prefers-color-scheme:dark){svg{${vars("dark")}}}`
      : "";
  return `<style>svg{${base}}${dark}${STYLE.replace(/\n/g, "")}${EXTRA.replace(/\n/g, "")}</style>`;
}

export const GRADIENTS = DEFS;

// --- Real QR codes ---------------------------------------------------------

const QR_SIZE = 1000;
const INK = "#010101";
const EYE = "#020202";
const DOT = "#030303";
const PAPER = "#fefefe";

/**
 * A real code as qrdx draws it in a showcase style, with theme classes in
 * place of colours: q1 = body modules, q2 = corner eyes, q3 = eye centres,
 * qp = paper. Level L by default keeps modules big at illustration size.
 */
export function qrMarkup(
  value: string,
  style: ShowcaseStyleName,
  level: ErrorLevel = "L",
  ring?: ArtRing,
) {
  const look = SHOWCASE_STYLES[style];
  const frame = ring
    ? {
        style: "circle" as const,
        text: ring.text,
        ...(ring.secondaryText && { secondaryText: ring.secondaryText }),
        color: INK,
        textColor: PAPER,
      }
    : look.frame && { ...look.frame, color: INK };
  const svg = renderToStaticMarkup(
    createElement(
      QRCodeSVG,
      showcaseProps(
        style,
        { value, size: QR_SIZE },
        {
          level,
          fgColor: INK,
          eyeColor: EYE,
          dotColor: look.accent ? DOT : EYE,
          bgColor: PAPER,
          ...(frame && { frame }),
          ...(ring && { shape: "circle" as const }),
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

/**
 * A round code: the style's modules in qrdx's circle shape (decorative dots
 * seeded by the value fill the disc), inside the circle frame with `text` on
 * its top arc and `secondaryText` on the bottom one.
 */
export interface ArtRing {
  text: string;
  secondaryText?: string;
}

export interface ArtCode {
  /** Symbol id, drawn with `code(x, y, w, h, id)`. */
  id: string;
  value: string;
  style: ShowcaseStyleName;
  level?: ErrorLevel;
  ring?: ArtRing;
}

/**
 * The code as `<symbol>`s: `#id` (whole code), `#id-body` (modules only)
 * and `#id-eyes` (corner eyes only), for scenes that pull a code apart.
 * Only the ones the scene uses are written.
 */
export function qrSymbols(
  { id, value, style, level, ring }: ArtCode,
  used: { whole: boolean; body: boolean; eyes: boolean },
) {
  const { viewBox, inner } = qrMarkup(value, style, level, ring);
  const only = (keep: RegExp) =>
    inner.replace(/class="(q[123])"/g, (match, cls: string) =>
      keep.test(cls) ? match : 'class="qh"',
    );
  return (
    (used.whole
      ? `<symbol id="${id}" viewBox="${viewBox}">${inner}</symbol>`
      : "") +
    (used.body
      ? `<symbol id="${id}-body" viewBox="${viewBox}">${only(/q1/)}</symbol>`
      : "") +
    (used.eyes
      ? `<symbol id="${id}-eyes" viewBox="${viewBox}">${only(/q[23]/)}</symbol>`
      : "")
  );
}

// --- Markup helpers ----------------------------------------------------------

export const r1 = (n: number) => Math.round(n * 10) / 10;

export const path = (d: string, cls: string, style = "") =>
  `<path class="${cls}" d="${d}"${style ? ` style="${style}"` : ""}/>`;
export const g = (transform: string, inner: string) =>
  `<g transform="${transform}">${inner}</g>`;
export const ellipse = (
  e: { cx: number; cy: number; rx: number; ry: number },
  cls: string,
) =>
  `<ellipse class="${cls}" cx="${e.cx}" cy="${e.cy}" rx="${e.rx}" ry="${e.ry}"/>`;
export const circle = (cx: number, cy: number, r: number, cls: string) =>
  `<circle class="${cls}" cx="${r1(cx)}" cy="${r1(cy)}" r="${r}"/>`;
/** A code symbol fitted into a w × h box at (x, y) in the current plane. */
export const code = (x: number, y: number, w: number, h = w, id = "code") =>
  `<use href="#${id}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
/** A short text-like line in a plane. */
export const line = (x0: number, x1: number, y: number, cls = "tx") =>
  `<path class="${cls}" d="M${r1(x0)} ${r1(y)}H${r1(x1)}"/>`;
export const text = (x: number, y: number, body: string, cls = "lbl") =>
  `<text class="${cls}" x="${x}" y="${y}">${body}</text>`;
export const shade = (cx: number, cy: number, rx: number, ry: number) =>
  `<ellipse class="shade" cx="${r1(cx)}" cy="${r1(cy)}" rx="${rx}" ry="${ry}"/>`;
export const bloom = (cx: number, cy: number, rx: number, ry: number) =>
  `<ellipse class="glow" cx="${r1(cx)}" cy="${r1(cy)}" rx="${rx}" ry="${ry}"/>`;
export const rr = roundRect;

/** Brand bloom behind world point `at`, sized in world units. */
export const glow = (cam: Camera, at: V3, rx: number, ry: number) =>
  bloom(...cam.p(...at), r1(rx * cam.k), r1(ry * cam.k));

/** A screen-space polyline through world points. */
export const wire = (cam: Camera, pts: V3[], cls = "l2") =>
  path(
    `M${pts
      .map((p) =>
        cam
          .p(...p)
          .map(r1)
          .join(" "),
      )
      .join("L")}`,
    cls,
  );

/** A rounded slab (plinth, desk, tile): side band, then top. */
export function slab(
  cam: Camera,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z0: number,
  z1: number,
  r: number,
  top = "f",
) {
  const p = cam.prism(x0, y0, x1, y1, z0, z1, r);
  return path(p.side, "s") + path(p.top, top);
}

/** The plinth a scene stands on, with its soft ground shadow. */
export function plinth(
  cam: Camera,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  { r = 14, h = 8 } = {},
) {
  const [cx, cy] = cam.p((x0 + x1) / 2, (y0 + y1) / 2, -h);
  const rx = ((x1 - x0 + (y1 - y0)) * 0.866 * cam.k) / 2;
  return (
    shade(cx, cy + 10 * cam.k, r1(rx * 0.92), r1(15 * cam.k)) +
    slab(cam, x0, y0, x1, y1, -h, 0, r)
  );
}

/** A sharp box: both visible sides, then the top. */
export function block(
  cam: Camera,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  top = "f",
) {
  const b = cam.box(x0, y0, z0, x1, y1, z1);
  return path(b.left, "s") + path(b.right, "s2") + path(b.top, top);
}

/** A tube in screen space: an outline stroke under a face-coloured stroke. */
export function tube(d: string, width: number) {
  return `<path class="tube-o" d="${d}" style="stroke-width:${width + 2.2}"/><path class="tube" d="${d}" style="stroke-width:${width}"/>`;
}

/** A tube through world points with rounded joints. */
export const pipe = (cam: Camera, pts: V3[], width = 3) =>
  tube(
    `M${pts
      .map((p) =>
        cam
          .p(...p)
          .map(r1)
          .join(" "),
      )
      .join("L")}`,
    width,
  );

/**
 * An upright panel facing the viewer's left: world box x0..x1, y..y+t,
 * z0..z1. `inner` is drawn on its face in face units (w = x1 - x0 wide,
 * h = z1 - z0 tall, origin top-left). `rim` adds the brand edge.
 */
export function panelLeft(
  cam: Camera,
  [x0, y, z0]: V3,
  w: number,
  h: number,
  inner: string,
  { t = 4, rim = false, face = "f" } = {},
) {
  const b = cam.box(x0, y, z0, x0 + w, y + t, z0 + h);
  const m = cam.onLeft(x0, y + t, z0 + h);
  return (
    path(b.right, "s2") +
    path(b.top, "s") +
    path(b.left, face) +
    g(m, inner) +
    (rim ? path(b.left, "rim") : "")
  );
}

/**
 * An upright panel facing the viewer's right: world box x..x+t, y0..y0+w,
 * z0..z0+h. Face units run from the face's left edge (largest y).
 */
export function panelRight(
  cam: Camera,
  [x, y0, z0]: V3,
  w: number,
  h: number,
  inner: string,
  { t = 4, rim = false, face = "f" } = {},
) {
  const b = cam.box(x, y0, z0, x + t, y0 + w, z0 + h);
  const m = cam.onRight(x + t, y0 + w, z0 + h);
  return (
    path(b.left, "s") +
    path(b.top, "s") +
    path(b.right, face) +
    g(m, inner) +
    (rim ? path(b.right, "rim") : "")
  );
}

/** A flat tile lying at height z: world x0..x0+w, y0..y0+d, `t` thick. */
export function tile(
  cam: Camera,
  [x0, y0, z]: V3,
  w: number,
  d: number,
  inner: string,
  { t = 3, r = 4, rim = false, face = "f" } = {},
) {
  const p = cam.prism(x0, y0, x0 + w, y0 + d, z - t, z, r);
  const m = cam.onTop(x0, y0, z);
  return (
    path(p.side, "s") +
    path(p.top, face) +
    g(m, inner) +
    (rim ? path(p.top, "rim") : "")
  );
}

/** A code card on a small foot, facing left; the code fills the upper face. */
export function signLeft(
  cam: Camera,
  [x0, y, z0]: V3,
  w: number,
  h: number,
  { id = "code", rim = true, caption = true, t = 4 } = {},
) {
  const pad = w * 0.12;
  const size = w - 2 * pad;
  const foot = slab(cam, x0 - 4, y - 6, x0 + w + 4, y + t + 6, z0, z0 + 5, 3);
  const inner =
    code(pad, pad, size, size, id) +
    (caption
      ? line(
          pad,
          pad + size * 0.7,
          pad + size + (h - size - pad) * 0.42,
          "tx2",
        ) +
        line(pad, pad + size * 0.45, pad + size + (h - size - pad) * 0.42 + 6)
      : "");
  return foot + panelLeft(cam, [x0, y, z0 + 5], w, h, inner, { t, rim });
}

/** As signLeft, facing the viewer's right. */
export function signRight(
  cam: Camera,
  [x, y0, z0]: V3,
  w: number,
  h: number,
  { id = "code", rim = true, caption = true, t = 4 } = {},
) {
  const pad = w * 0.12;
  const size = w - 2 * pad;
  const foot = slab(cam, x - 6, y0 - 4, x + t + 6, y0 + w + 4, z0, z0 + 5, 3);
  const inner =
    code(pad, pad, size, size, id) +
    (caption
      ? line(
          pad,
          pad + size * 0.7,
          pad + size + (h - size - pad) * 0.42,
          "tx2",
        ) +
        line(pad, pad + size * 0.45, pad + size + (h - size - pad) * 0.42 + 6)
      : "");
  return foot + panelRight(cam, [x, y0, z0 + 5], w, h, inner, { t, rim });
}

/** A phone standing on its edge facing left, screen showing `screen`. */
export function phoneLeft(cam: Camera, at: V3, screen: string, s = 1) {
  const [w, h] = [36 * s, 70 * s];
  const body = rr(0, 0, w, h, 7 * s);
  const m = cam.onLeft(...at);
  const [tx, ty] = cam.dir([0, -4 * s, 0]);
  return (
    g(`translate(${r1(tx)} ${r1(ty)})`, g(m, path(body, "s"))) +
    g(
      m,
      path(body, "f") +
        path(rr(3 * s, 3 * s, w - 6 * s, h - 6 * s, 4.5 * s), "scr") +
        g(`scale(${s})`, screen),
    )
  );
}

/** Viewfinder corners around a w × h box at (x, y). */
export const finder = (x: number, y: number, w: number, h: number, c = 4) =>
  `<path class="vf" d="M${x} ${y + c}V${y}H${x + c}M${x + w - c} ${y}H${x + w}V${y + c}M${x + w} ${y + h - c}V${y + h}H${x + w - c}M${x + c} ${y + h}H${x}V${y + h - c}"/>`;

/** A white tick on a brand disc, centred at (x, y) in the current plane. */
export const badge = (x: number, y: number, r = 6) =>
  `${circle(x, y, r, "acc")}<path class="tick" d="M${r1(x - r * 0.42)} ${r1(y + r * 0.02)}l${r1(r * 0.3)} ${r1(r * 0.32)} ${r1(r * 0.58)}-${r1(r * 0.62)}"/>`;

/** A four-point sparkle centred at (x, y), radius r. */
export function sparkle(x: number, y: number, r: number, cls = "acc") {
  const q = r * 0.22;
  return path(
    `M${r1(x)} ${r1(y - r)}Q${r1(x + q)} ${r1(y - q)} ${r1(x + r)} ${r1(y)}Q${r1(x + q)} ${r1(y + q)} ${r1(x)} ${r1(y + r)}Q${r1(x - q)} ${r1(y + q)} ${r1(x - r)} ${r1(y)}Q${r1(x - q)} ${r1(y - q)} ${r1(x)} ${r1(y - r)}Z`,
    cls,
  );
}

/** A padlock outline centred at (x, y), body w wide. */
export function padlock(x: number, y: number, w = 14, cls = "f") {
  const h = w * 0.78;
  const r = w * 0.32;
  return (
    path(
      `M${r1(x - r)} ${r1(y - h / 2)}v${r1(-r * 0.6)}a${r1(r)} ${r1(r)} 0 0 1 ${r1(2 * r)} 0v${r1(r * 0.6)}`,
      "l2",
    ) +
    path(rr(x - w / 2, y - h / 2, w, h, 2.2), cls) +
    circle(x, y - h * 0.05, w * 0.07, "dot")
  );
}

/** An hourglass in screen space, standing on (x, y), h tall. */
export function hourglass(x: number, y: number, h = 40) {
  const w = h * 0.55;
  const cap = (cy: number) =>
    path(rr(x - w / 2 - 2, cy - 2, w + 4, 4, 1.6), "s");
  const glass = `M${r1(x - w / 2)} ${r1(y - h + 3)}C${r1(x - w / 2)} ${r1(y - h * 0.62)} ${r1(x - 1.6)} ${r1(y - h * 0.56)} ${r1(x - 1.6)} ${r1(y - h / 2)}C${r1(x - 1.6)} ${r1(y - h * 0.44)} ${r1(x - w / 2)} ${r1(y - h * 0.38)} ${r1(x - w / 2)} ${r1(y - 3)}H${r1(x + w / 2)}C${r1(x + w / 2)} ${r1(y - h * 0.38)} ${r1(x + 1.6)} ${r1(y - h * 0.44)} ${r1(x + 1.6)} ${r1(y - h / 2)}C${r1(x + 1.6)} ${r1(y - h * 0.56)} ${r1(x + w / 2)} ${r1(y - h * 0.62)} ${r1(x + w / 2)} ${r1(y - h + 3)}Z`;
  const sand = `M${r1(x - w * 0.36)} ${r1(y - 3)}Q${r1(x)} ${r1(y - h * 0.22)} ${r1(x + w * 0.36)} ${r1(y - 3)}Z`;
  return (
    path(glass, "glass") +
    path(sand, "acc") +
    path(`M${x} ${r1(y - h / 2)}V${r1(y - h * 0.2)}`, "beam") +
    cap(y - h + 2) +
    cap(y - 1)
  );
}

/** A faint isometric dot grid across the backdrop. */
export function backdrop(w: number, h: number, step = 16) {
  let dots = "";
  for (let y = step / 2; y < h; y += step * 0.5) {
    const odd = Math.round((y - step / 2) / (step * 0.5)) % 2 === 1;
    for (let x = odd ? step : step / 2; x < w; x += step) {
      dots += `M${r1(x)} ${r1(y)}h.01`;
    }
  }
  return `<rect class="bg" width="${w}" height="${h}"/><path d="${dots}" style="stroke:var(--grid);stroke-width:1.6;stroke-linecap:round"/>`;
}
