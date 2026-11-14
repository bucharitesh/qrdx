// The QRdx figure set (@repo/design-system/components/hairline): every figure name
// has an up-to-date generated component, every real code in a figure scans
// as its data, every call site names a figure that exists, and the colours
// stay in step with the use-case illustrations.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  FIGURE_NAMES,
  figureSlug,
} from "@repo/design-system/components/hairline/hairline-figures";
import { describe, expect, it } from "vitest";
import { FIGURE_CODES } from "@/scripts/figure-art/codes";
import { relativePath, renderFigure } from "@/scripts/figure-art/generate";
import { THEMES } from "@/scripts/use-case-art/kit";
import {
  decodeQR,
  rasterizeSvg,
  simulateCamera,
} from "../../../packages/qrdx/tests/support/raster";

const ROOT = join(import.meta.dirname, "..");
const HAIRLINE = join(ROOT, "../../packages/design-system/components/hairline");
const FIGURES_DIR = join(HAIRLINE, "figures");

/** The figure's code as a flat black-on-white SVG the test rasterizer reads. */
function bakedCode(markup: string, prefix: string) {
  const symbol = (id: string) =>
    markup.match(
      new RegExp(
        `<symbol id="${prefix}${id}" viewBox="([^"]+)">(.*?)</symbol>`,
      ),
    );
  const whole = symbol("code");
  const parts = whole ? [whole] : [symbol("code-body"), symbol("code-eyes")];
  if (parts.some((part) => !part)) throw new Error("no code symbol");
  const viewBox = parts[0]?.[1] ?? "";
  const [, , width, height] = viewBox.split(" ");
  const flat = parts
    .map((part) => part?.[2] ?? "")
    .join("")
    // Round modules are zero-length round-capped strokes; the rasterizer
    // only does butt caps, so draw them as the circles they are.
    .replace(
      /<path fill="none" stroke-linecap="round" stroke-width="(\d+)" style="[^"]*" d="([^"]+)"\/>/g,
      (_, w: string, d: string) => {
        let [x, y] = [0, 0];
        return [...d.matchAll(/m(-?\d+)[ ]?(-?\d+)h0/g)]
          .map(([, dx, dy]) => {
            x += Number(dx);
            y += Number(dy);
            return `<circle cx="${x}" cy="${y}" r="${Number(w) / 2}"/>`;
          })
          .join("");
      },
    )
    .replace(/style="fill:var\(--hf-(ink|eye|dot)\)"/g, 'fill="#000000"')
    .replace(/style="fill:var\(--hf-fill\)"/g, 'fill="#ffffff"');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}">${flat}</svg>`;
}

function sourceFiles(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

const normalize = (value: string) =>
  value.replace(/\s+/g, "").replace(/(^|[^\d])0\./g, "$1.");

describe("QRdx figures", () => {
  it.each(FIGURE_NAMES)("%s has an up-to-date generated component", (name) => {
    const file = readFileSync(
      join(FIGURES_DIR, `${figureSlug(name)}.tsx`),
      "utf8",
    );
    const markup = file.match(/const MARKUP =\s+'(.*)';/)?.[1];
    // Stale output means figures.ts or codes.ts changed without regenerating:
    // bun x tsx scripts/figure-art/generate.ts
    expect(markup).toBe(renderFigure(name));
    const index = readFileSync(join(FIGURES_DIR, "index.ts"), "utf8");
    expect(index).toContain(
      `${name}: dynamic(() => import("./${figureSlug(name)}"))`,
    );
  });

  it.each(FIGURE_NAMES.filter((name) => FIGURE_CODES[name]))(
    "%s carries a code that decodes to its data",
    (name) => {
      const svg = bakedCode(renderFigure(name), `hf-${figureSlug(name)}-`);
      const image = rasterizeSvg(svg, { width: 480, pad: 24 });
      expect(decodeQR(simulateCamera(image, 4))).toBe(
        FIGURE_CODES[name]?.value,
      );
    },
  );

  it("keeps every id unique to its figure", () => {
    const seen = new Set<string>();
    for (const name of FIGURE_NAMES) {
      const prefix = `hf-${figureSlug(name)}-`;
      for (const [, id = ""] of renderFigure(name).matchAll(/ id="([^"]+)"/g)) {
        expect(id.startsWith(prefix)).toBe(true);
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
  });

  it("every call site names a figure that exists", () => {
    const names = new Set<string>(FIGURE_NAMES);
    const used: string[] = [];
    for (const file of [
      ...sourceFiles(join(ROOT, "app")),
      ...sourceFiles(join(ROOT, "components")),
    ]) {
      if (file.startsWith(FIGURES_DIR)) continue;
      const source = readFileSync(file, "utf8");
      if (!source.includes("HairlineFigure")) continue;
      for (const [, figure = ""] of source.matchAll(
        /<HairlineFigure\b[^>]*?\bfigure="([^"]+)"/g,
      )) {
        used.push(figure);
      }
      // Data-driven call sites list names in objects.
      for (const [, figure = ""] of source.matchAll(/\bfigure: "([^"]+)"/g)) {
        used.push(figure);
      }
    }
    // A floor, so a broken scan can't pass by finding nothing. It was 20
    // until round 4 took the 7 figures out of the home features section
    // (one visual per feature: the live demo), leaving 18.
    expect(used.length).toBeGreaterThanOrEqual(15);
    expect(used.filter((figure) => !names.has(figure))).toEqual([]);
  });

  it("uses the use-case illustrations' colour tokens in both themes", () => {
    const css = readFileSync(join(HAIRLINE, "hairline.module.css"), "utf8");
    const block = (selector: string) => {
      const start = css.indexOf(`${selector} {`);
      return css.slice(start, css.indexOf("}", start));
    };
    for (const [theme, selector] of [
      ["light", "\n.figure"],
      ["dark", ":global(.dark) .figure"],
    ] as const) {
      const body = block(selector);
      for (const [token, value] of Object.entries(THEMES[theme])) {
        const found = body.match(new RegExp(`--hf-${token}: ([^;]+);`))?.[1];
        expect(found && normalize(found), `${theme} --hf-${token}`).toBe(
          normalize(value),
        );
      }
    }
  });

  it("writes code paths in relative commands", () => {
    expect(
      relativePath(
        "M340 0H360V40H340A20 20 0 0 1 320 20V20A20 20 0 0 1 340 0ZM360 0H380",
      ),
    ).toBe("m340 0h20v40h-20a20 20 0 0 1-20-20v0a20 20 0 0 1 20-20zm20 0h20");
  });

  it("no longer depends on the stock hairline package", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    expect(pkg.dependencies?.["@lucasmarkes/hairline"]).toBeUndefined();
    for (const file of [
      ...sourceFiles(join(ROOT, "app")),
      ...sourceFiles(join(ROOT, "components")),
    ]) {
      expect(readFileSync(file, "utf8")).not.toContain("@lucasmarkes/hairline");
    }
  });
});
