// Writes the QRdx figure set as inline-SVG components in the design system
// (packages/design-system/components/hairline): figures/<name>.tsx (one per
// figure, so each is its own chunk) and figures/index.ts (the code-split map
// that hairline.tsx renders from). The scenes come from figures.ts, the real
// codes from codes.ts, rendered by qrdx.
//
// Run from apps/docs: bun x tsx scripts/figure-art/generate.ts
// A contact sheet of the whole set, both themes, with the live CSS:
//   bun x tsx scripts/figure-art/generate.ts --preview <file.html>
//
// The markup carries classes only; colours, strokes and motion come from
// hairline.module.css next to them, so one drawing serves both themes.
// Ids are prefixed per figure so several figures can share a page.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  FIGURE_NAMES,
  figureSlug,
  type HairlineFigureName,
} from "@repo/design-system/components/hairline/hairline-figures";
import { DEFS, qrMarkup } from "../use-case-art/kit";
import { FIGURE_CODES } from "./codes";
import { figureMarkup } from "./figures";

const HAIRLINE = join(
  import.meta.dirname,
  "../../../../packages/design-system/components/hairline",
);
const OUT = join(HAIRLINE, "figures");

const NUMBER = /-?(?:\d+\.?\d*|\.\d+)/g;
const r1 = (n: number) => Math.round(n * 10) / 10;
/** Numbers joined as tightly as SVG path syntax allows. */
const nums = (list: number[]) =>
  list.reduce(
    (out, n, i) => out + (i > 0 && n >= 0 ? " " : "") + String(r1(n)),
    "",
  );

/** The same path in relative commands, which are shorter for small shapes. */
export function relativePath(d: string) {
  let [x, y, sx, sy] = [0, 0, 0, 0];
  let out = "";
  for (const part of d.match(/[a-zA-Z][^a-zA-Z]*/g) ?? []) {
    const op = part[0] ?? "";
    const OP = op.toUpperCase();
    const abs = op === OP;
    const n = (part.slice(1).match(NUMBER) ?? []).map(Number);
    const at = (i: number) => n[i] ?? 0;
    if (OP === "Z") {
      out += "z";
      [x, y] = [sx, sy];
    } else if (OP === "H" || OP === "V") {
      for (const v of n) {
        const dv = abs ? v - (OP === "H" ? x : y) : v;
        out += OP.toLowerCase() + nums([dv]);
        if (OP === "H") x += dv;
        else y += dv;
      }
    } else if (OP === "A") {
      for (let i = 0; i + 6 < n.length; i += 7) {
        const dx = abs ? at(i + 5) - x : at(i + 5);
        const dy = abs ? at(i + 6) - y : at(i + 6);
        out += `a${nums([at(i), at(i + 1), at(i + 2), at(i + 3), at(i + 4), dx, dy])}`;
        x += dx;
        y += dy;
      }
    } else {
      // M/L/T take one point, Q/S two, C three; every point is relative to
      // the segment's start, and the last one moves the pen.
      const size = { M: 2, L: 2, T: 2, Q: 4, S: 4, C: 6 }[OP] ?? 2;
      for (let i = 0; i + size - 1 < n.length; i += size) {
        const pts: number[] = [];
        for (let j = 0; j < size; j += 2) {
          pts.push(
            abs ? at(i + j) - x : at(i + j),
            abs ? at(i + j + 1) - y : at(i + j + 1),
          );
        }
        const cmd = OP === "M" && i > 0 ? "l" : OP.toLowerCase();
        out += cmd + nums(pts);
        x += pts[size - 2] ?? 0;
        y += pts[size - 1] ?? 0;
        if (OP === "M" && i === 0) [sx, sy] = [x, y];
      }
    }
  }
  return out;
}

/**
 * The code's colours as inline styles: a <use> instance inherits custom
 * properties from the page, but class rules scoped under .figure don't reach
 * inside it. 1 = body modules, 2 = corner eyes, 3 = eye centres.
 */
const TONES: Record<string, string> = {
  1: "var(--hf-ink)",
  2: "var(--hf-eye)",
  3: "var(--hf-dot)",
};

/**
 * A code group in fewer bytes, same geometry: runs of square modules as one
 * path, equal round dots as zero-length round-capped strokes, and every path
 * in relative commands. Colours inline (see TONES).
 */
function compact(group: string) {
  const tone = group.match(/^<g class="q(\d)">/)?.[1] ?? "1";
  const rects: string[] = [];
  let rest = group.replace(
    /<rect height="(\d+)" width="(\d+)" x="(\d+)" y="(\d+)"\/>/g,
    (_, h, w, x, y) => {
      rects.push(`M${x} ${y}h${w}v${h}h-${w}z`);
      return "";
    },
  );
  const dots = new Map<string, string[]>();
  rest = rest.replace(
    /<circle cx="(\d+)" cy="(\d+)" r="(\d+)"\/>/g,
    (_, cx, cy, r) => {
      dots.set(r, [...(dots.get(r) ?? []), `M${cx} ${cy}h0`]);
      return "";
    },
  );
  const extra =
    (rects.length ? `<path d="${rects.join("")}"/>` : "") +
    [...dots]
      .map(
        ([r, list]) =>
          `<path fill="none" stroke-linecap="round" stroke-width="${Number(r) * 2}" style="stroke:${TONES[tone] ?? TONES[1]}" d="${relativePath(list.join(""))}"/>`,
      )
      .join("");
  return rest
    .replace(
      /^<g class="q\d">/,
      `<g style="fill:${TONES[tone] ?? TONES[1]}">${extra}`,
    )
    .replace(/class="qp"/g, 'style="fill:var(--hf-fill)"')
    .replace(/ d="([^"]+)"/g, (_, d: string) => ` d="${relativePath(d)}"`);
}

/** The code symbols a figure uses: the whole code, its body or its eyes. */
function symbols(name: HairlineFigureName, markup: string) {
  const look = FIGURE_CODES[name];
  if (!look) {
    if (markup.includes('href="#code')) {
      throw new Error(`${name} draws a code but has none in codes.ts`);
    }
    return "";
  }
  const { viewBox, inner } = qrMarkup(look.value, look.style);
  const groups = inner.match(/<g class="q\d">[\s\S]*?<\/g>/g) ?? [];
  if (groups.join("") !== inner) {
    throw new Error(`${name}: unexpected code markup; can't split it`);
  }
  const part = (keep: RegExp) =>
    groups
      .filter((x) => keep.test(x))
      .map(compact)
      .join("");
  const all: [string, string][] = [
    ["code", part(/^<g class="q/)],
    ["code-body", part(/^<g class="q1"/)],
    ["code-eyes", part(/^<g class="q[23]"/)],
  ];
  return all
    .filter(([id]) => markup.includes(`href="#${id}"`))
    .map(
      ([id, body]) =>
        `<symbol id="${id}" viewBox="${viewBox}">${body}</symbol>`,
    )
    .join("");
}

/** The figure's inline markup (the content of its <svg>). */
export function renderFigure(name: HairlineFigureName) {
  const body = figureMarkup(name);
  const p = `hf-${figureSlug(name)}-`;
  let svg = `<defs>${DEFS}${symbols(name, body)}</defs>${body}`;
  // Brand paints as attributes, pointing at this figure's own gradients.
  svg = svg
    .replace(/class="acc"/g, `class="acc" fill="url(#hue)"`)
    .replace(/class="rim"/g, `class="rim" stroke="url(#hue)"`)
    .replace(/class="glow"/g, `class="glow" fill="url(#bloom)"`)
    .replace(/class="shade"/g, `class="shade" fill="url(#shade)"`);
  const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1] ?? "");
  for (const id of ids.sort((a, b) => b.length - a.length)) {
    svg = svg
      .replaceAll(` id="${id}"`, ` id="${p}${id}"`)
      .replaceAll(`"#${id}"`, `"#${p}${id}"`)
      .replaceAll(`url(#${id})`, `url(#${p}${id})`);
  }
  return svg;
}

/** The markup as a single-quoted literal, the way biome formats it. */
function literal(markup: string) {
  if (/['\\\n]/.test(markup)) throw new Error("markup needs escaping");
  return `'${markup}'`;
}

const component = (
  name: HairlineFigureName,
) => `// Generated by apps/docs/scripts/figure-art/generate.ts. Do not edit.
import { FigureSvg } from "../figure-svg";

const MARKUP =
  ${literal(renderFigure(name))};

export default function ${name}Figure() {
  return <FigureSvg markup={MARKUP} />;
}
`;

const index = `// Generated by apps/docs/scripts/figure-art/generate.ts. Do not edit.
import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { HairlineFigureName } from "../hairline-figures";

/** Each figure in its own chunk: a page only loads the figures it shows. */
export const FIGURE_COMPONENTS: Record<HairlineFigureName, ComponentType> = {
${FIGURE_NAMES.map((name) => `  ${name}: dynamic(() => import("./${figureSlug(name)}")),`).join("\n")}
};
`;

/** Standalone HTML: every figure in both themes, styled by the module CSS. */
function preview() {
  let css = readFileSync(join(HAIRLINE, "hairline.module.css"), "utf8");
  // Unwrap :global(...) (balanced parentheses) into plain selectors.
  for (
    let at = css.indexOf(":global(");
    at >= 0;
    at = css.indexOf(":global(")
  ) {
    let depth = 0;
    let end = at + 7;
    for (; end < css.length; end++) {
      if (css[end] === "(") depth++;
      else if (css[end] === ")" && --depth === 0) break;
    }
    css = css.slice(0, at) + css.slice(at + 8, end) + css.slice(end + 1);
  }
  const cells = FIGURE_NAMES.map(
    (name) =>
      `<figure><div class="figure"><svg viewBox="0 0 320 256">${renderFigure(name)}</svg></div><figcaption>${name}</figcaption></figure>`,
  ).join("");
  const sheet = (theme: string) =>
    `<section class="${theme}">${cells}</section>`;
  return `<!doctype html><meta charset="utf-8"><title>QRdx figures</title><style>${css}
body{margin:0;font:12px ui-monospace,monospace}section{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;padding:16px;background:#fdfdfd;color:#666}section.dark{background:#18181c;color:#999}figure{margin:0}.figure{position:relative;aspect-ratio:5/4}figcaption{padding:2px 4px}</style>${sheet("light")}${sheet("dark")}`;
}

const previewAt = process.argv.indexOf("--preview");
if (previewAt > 0) {
  const file = process.argv[previewAt + 1] ?? "figures.html";
  writeFileSync(file, preview());
  console.log(file);
} else if (process.argv[1] === import.meta.filename) {
  mkdirSync(OUT, { recursive: true });
  for (const name of FIGURE_NAMES) {
    const file = join(OUT, `${figureSlug(name)}.tsx`);
    writeFileSync(file, component(name));
    console.log(file);
  }
  writeFileSync(join(OUT, "index.ts"), index);
}
