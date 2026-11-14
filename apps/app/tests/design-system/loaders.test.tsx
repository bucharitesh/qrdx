// @vitest-environment jsdom
// The QRdx loaders (packages/design-system/components/loaders): each one is
// a decorative SVG beside a visually hidden role="status" label, drawn at the
// board's sizes, shown only after a delay, and still at full opacity with
// reduced motion. Plus the toaster that uses Module orbit for loading toasts.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AssemblingCode,
  DEFAULT_LOADER_LABEL,
  LOADER_DELAY,
  type LoaderProps,
  type LoaderSize,
  ModuleOrbit,
  Scanframe,
} from "@repo/design-system/components/loaders";
import { Toaster } from "@repo/design-system/components/toaster";
import type { ComponentType, ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, it as test } from "vitest";

const DESIGN_SYSTEM = join(
  import.meta.dirname,
  "../../../../packages/design-system",
);

const LOADERS: [string, ComponentType<LoaderProps>, LoaderSize][] = [
  ["Scanframe", Scanframe, 40],
  ["ModuleOrbit", ModuleOrbit, 16],
  ["AssemblingCode", AssemblingCode, 40],
];

function render(element: ReactElement) {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(element);
  const svg = host.querySelector("svg");
  if (!svg) throw new Error("no svg");
  return { host, svg, status: host.querySelector('[role="status"]') };
}

describe.each(LOADERS)("%s", (_name, Loader, defaultSize) => {
  test("announces a visually hidden Loading… status", () => {
    const { status, svg } = render(<Loader />);
    expect(status?.textContent).toBe(DEFAULT_LOADER_LABEL);
    expect(status?.className).toBe("sr-only");
    expect(status?.tagName).toBe("SPAN");
    // The drawing itself is decorative.
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("focusable")).toBe("false");
  });

  test("takes a translated label", () => {
    const { status } = render(<Loader label="Cargando…" />);
    expect(status?.textContent).toBe("Cargando…");
  });

  test("leaves the status out when the loader is decorative", () => {
    const { host, status, svg } = render(<Loader aria-hidden />);
    expect(status).toBeNull();
    expect(host.textContent).toBe("");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
  });

  test(`is ${defaultSize} px unless told otherwise`, () => {
    const { svg } = render(<Loader />);
    expect(svg.getAttribute("width")).toBe(String(defaultSize));
    expect(svg.getAttribute("height")).toBe(String(defaultSize));
  });

  test.each([16, 24, 40, 64] as const)("draws at %i px", (size) => {
    const { svg } = render(<Loader size={size} />);
    expect(svg.getAttribute("width")).toBe(String(size));
    expect(svg.getAttribute("height")).toBe(String(size));
    // A square viewBox, so every size keeps the mark's proportions.
    const [, , w, h] = (svg.getAttribute("viewBox") ?? "").split(" ");
    expect(w).toBe(h);
  });

  test("keeps a size class and other classes from the caller", () => {
    const { svg } = render(
      <Loader className="size-3.5 text-muted-foreground" />,
    );
    expect(svg.getAttribute("class")).toContain("size-3.5");
    expect(svg.getAttribute("class")).toContain("text-muted-foreground");
    expect(svg.getAttribute("class")).toMatch(/loader/);
  });

  test(`shows after ${LOADER_DELAY} ms, or the delay it's given`, () => {
    expect(render(<Loader />).svg.getAttribute("style")).toContain(
      `--loader-delay:${LOADER_DELAY}ms`,
    );
    expect(render(<Loader delay={0} />).svg.getAttribute("style")).toContain(
      "--loader-delay:0ms",
    );
  });

  test("draws in currentColor with exactly one accent module", () => {
    const { svg } = render(<Loader />);
    expect(svg.getAttribute("fill")).toBe("currentColor");
    expect(svg.innerHTML).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    const accents = [...svg.querySelectorAll("rect")].filter((rect) =>
      /accent/.test(rect.getAttribute("class") ?? ""),
    );
    expect(accents).toHaveLength(1);
  });
});

describe("the marks", () => {
  it("Scanframe is four brackets and the X's five modules", () => {
    const { svg } = render(<Scanframe />);
    expect(svg.querySelectorAll("path")).toHaveLength(4);
    expect(svg.querySelectorAll("rect")).toHaveLength(5);
  });

  it("Module orbit circles five modules round a still centre", () => {
    const { svg } = render(<ModuleOrbit />);
    const ring = svg.querySelector("g");
    expect(ring?.getAttribute("class")).toMatch(/orbit/);
    expect(ring?.querySelectorAll("rect")).toHaveLength(5);
    // The accent centre sits outside the turning ring.
    expect(ring?.querySelector('[class*="accent"]')).toBeNull();
  });

  it("Assembling code is a 7×7 mini code with three finder eyes", () => {
    const { svg } = render(<AssemblingCode />);
    const cells = [...svg.querySelectorAll("rect")].map(
      (rect) =>
        `${(Number(rect.getAttribute("x")) - 1) / 7},${(Number(rect.getAttribute("y")) - 1) / 7}`,
    );
    expect(new Set(cells).size).toBe(cells.length);
    for (const [left, top] of [
      [0, 0],
      [4, 0],
      [0, 4],
    ]) {
      for (let row = 0; row < 3; row++) {
        for (let column = 0; column < 3; column++) {
          expect(cells).toContain(`${left + column},${top + row}`);
        }
      }
    }
    for (const cell of cells) {
      const [column, row] = cell.split(",").map(Number);
      expect(column).toBeGreaterThanOrEqual(0);
      expect(column).toBeLessThan(7);
      expect(row).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThan(7);
    }
  });
});

describe("reduced motion", () => {
  const css = readFileSync(
    join(DESIGN_SYSTEM, "components/loaders/loaders.css"),
    "utf8",
  ).replace(/\/\*[\s\S]*?\*\//g, "");

  /** The text of each `<prelude> { … }` block, matched brace by brace. */
  function blocks(source: string, prelude: RegExp) {
    const found: { start: number; end: number; body: string }[] = [];
    for (const match of source.matchAll(prelude)) {
      const open = source.indexOf("{", match.index);
      let depth = 0;
      for (let i = open; i < source.length; i++) {
        if (source[i] === "{") depth++;
        if (source[i] === "}") depth--;
        if (depth === 0) {
          found.push({
            start: match.index,
            end: i + 1,
            body: source.slice(open + 1, i),
          });
          break;
        }
      }
    }
    return found;
  }

  function without(source: string, ranges: { start: number; end: number }[]) {
    let out = source;
    for (const range of [...ranges].sort((a, b) => b.start - a.start)) {
      out = out.slice(0, range.start) + out.slice(range.end);
    }
    return out;
  }

  const motion = blocks(
    css,
    /@media \(prefers-reduced-motion: no-preference\)/g,
  );
  const keyframes = blocks(css, /@keyframes [\w-]+/g);
  const always = without(css, [...motion, ...keyframes]);

  it("moves the marks only when motion is allowed", () => {
    expect(motion).toHaveLength(1);
    const body = motion[0]?.body ?? "";
    for (const name of ["breathe-top-left", "module-pop", "orbit", "build"]) {
      expect(body).toContain(name);
    }
  });

  it("otherwise holds the static mark at full opacity", () => {
    // No mark animation, no fade, no dimmed tail and no transform outside
    // the no-preference block: everything shows at full opacity.
    expect(always).not.toMatch(/animation:/);
    expect(always).not.toMatch(/opacity/);
    expect(always).not.toMatch(/transform:/);
    expect(always).toMatch(/animation-duration:\s*0s/);
    expect(motion[0]?.body).toMatch(/\.qrdx-loader-tail-\d\s*\{\s*opacity/);
  });

  it("still waits for the delay, appearing without a fade", () => {
    expect(always).toMatch(/animation-name:\s*qrdx-loader-in/);
    expect(always).toMatch(/animation-delay:\s*var\(--loader-delay/);
    expect(always).toMatch(/animation-fill-mode:\s*both/);
  });
});

describe("the stylesheet", () => {
  it("ships in the design system's globals, which every app imports", () => {
    const globals = readFileSync(
      join(DESIGN_SYSTEM, "styles/globals.css"),
      "utf8",
    );
    expect(globals).toContain('@import "../components/loaders/loaders.css";');
  });

  it("prefixes every class and keyframe, since the sheet is global", () => {
    const css = readFileSync(
      join(DESIGN_SYSTEM, "components/loaders/loaders.css"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [, name] of css.matchAll(/\.([a-z][\w-]*)/g)) {
      expect(name).toMatch(/^qrdx-loader/);
    }
    for (const [, name] of css.matchAll(/@keyframes ([\w-]+)/g)) {
      expect(name).toMatch(/^qrdx-loader-/);
    }
  });
});

describe("the toaster", () => {
  it("shows Module orbit on loading toasts and keeps the other icons", () => {
    const element = Toaster({}) as ReactElement<{
      icons: Record<string, ReactElement>;
    }>;
    const { icons } = element.props;
    expect(icons.loading?.type).toBe(ModuleOrbit);
    expect(Object.keys(icons).sort()).toEqual(
      ["error", "info", "loading", "success", "warning"].sort(),
    );
  });
});
