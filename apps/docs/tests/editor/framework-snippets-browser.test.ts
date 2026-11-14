// @vitest-environment jsdom
// The Frameworks tab's vanilla JS and web component snippets (components/
// editor/action-bar/code-snippets.ts), run in a page against the files their
// CDN links load: dist/vanilla.browser.mjs (the same API as qrdx/vanilla)
// and dist/element-define.browser.mjs, which registers <qrdx-code>. Each
// must draw what the editor's preview draws, byte for byte.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { OFFICIAL_FRAMES, QRCode } from "qrdx";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { afterEach, beforeAll, describe, expect, it, it as test } from "vitest";
import {
  ELEMENT_CDN_URL,
  QRDX_NPM_VERSION,
  type SnippetInput,
  VANILLA_CDN_URL,
  vanillaSnippet,
  webComponentSnippet,
} from "@/components/editor/action-bar/code-snippets";
import { editorCodeProps } from "@/lib/qr-design/props";
import type { ThemeStyles } from "@/types/theme";

const dist = join(import.meta.dirname, "../../../../packages/qrdx/dist");
const CDN = `https://cdn.jsdelivr.net/npm/qrdx@${QRDX_NPM_VERSION}/dist/`;

/** The built file a CDN link of the snippets points at. */
function builtFile(url: string): string {
  expect(url.startsWith(CDN), url).toBe(true);
  const file = join(dist, url.slice(CDN.length));
  expect(
    existsSync(file),
    `${file} (run bun run --filter qrdx build:inplace)`,
  ).toBe(true);
  return file;
}

interface VanillaModule {
  createQRCode: (
    container: string,
    options: object,
  ) => { svg: SVGSVGElement | null; toSVGString(): string };
  resolveQRCodeProps: (props: object) => object;
}

interface QRdxCode extends HTMLElement {
  readonly svg: SVGSVGElement | null;
  toSVGString(): string;
}

let vanilla: VanillaModule;

beforeAll(async () => {
  vanilla = await import(
    /* @vite-ignore */ pathToFileURL(builtFile(VANILLA_CDN_URL)).href
  );
  // Registers <qrdx-code>, as the snippet's script tag does
  await import(
    /* @vite-ignore */ pathToFileURL(builtFile(ELEMENT_CDN_URL)).href
  );
});

afterEach(() => {
  document.body.innerHTML = "";
});

const frameSpec = OFFICIAL_FRAMES[0]?.spec;
if (!frameSpec) throw new Error("qrdx ships no official frames");

const DESIGNS = {
  editorDefaults: {},
  plain: {
    bgColor: "#ffffff",
    fgColor: "#1e3a8a",
    eyeColor: "#111111",
    dotColor: "#e11d48",
    bodyPattern: "rounded",
    cornerEyePattern: "extra-rounded",
    cornerEyeDotPattern: "circle",
    level: "M",
    margin: 2,
    templateId: "default",
  },
  gradients: {
    fgColor: {
      type: "linear",
      angle: 135,
      stops: [
        { color: "#1d4ed8", offset: 0 },
        { color: "#9d174d", offset: 100 },
      ],
    },
    bgColor: {
      type: "radial",
      stops: [
        { color: "#ffffff", offset: 0 },
        { color: "#eef2ff", offset: 100 },
      ],
    },
    eyeColors: { topLeft: { outer: "#b91c1c", inner: "#1d4ed8" } },
    moduleScale: 0.85,
  },
  frameLabel: {
    frame: { style: "banner-bottom", text: `It's "free" & <b> {{x}}` },
  },
  customFrame: { frame: { style: "custom", spec: frameSpec, text: "Join" } },
  border: { templateId: "StandardBox", margin: 2 },
  qrdxLogo: { level: "H", showLogo: true },
  logoLayout: {
    showLogo: true,
    customLogo: "https://cdn.example.com/brand.png",
    autoLevel: true,
    logoOptions: { size: 0.2, padding: 1, shape: "circle", plate: "#ffffff" },
  },
  heart: { shape: "heart", fgColor: "#be123c" },
} satisfies Record<string, ThemeStyles>;

const VALUES = {
  link: "https://example.org/menu?table=4&lang=en",
  vCard: [
    'BEGIN:VCARD\r\nFN:Ana "A" & B <x> {{y}} $',
    "{z} `q` \\ 's\nEND:VCARD",
  ].join(""),
};

const input = (style: ThemeStyles, value: string): SnippetInput => ({
  style,
  value,
  contentType: "url",
});

const editorMarkup = (style: ThemeStyles, value: string) =>
  renderToStaticMarkup(
    createElement(QRCode, editorCodeProps(style, value) as never),
  );

/** Runs the vanilla snippet with qrdx/vanilla as the CDN file. */
function runVanilla(code: string) {
  const { outputText } = ts.transpileModule(code, {
    fileName: "main.js",
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  let drawn: ReturnType<VanillaModule["createQRCode"]> | undefined;
  const qrdxVanilla = {
    ...vanilla,
    createQRCode: (container: string, options: object) => {
      drawn = vanilla.createQRCode(container, options);
      return drawn;
    },
  };
  const load = (id: string) => {
    if (id !== "qrdx/vanilla") throw new Error(`The snippet imports ${id}`);
    return qrdxVanilla;
  };
  new Function("require", "module", "exports", outputText)(load, {}, {});
  if (!drawn) throw new Error("The snippet drew nothing");
  return drawn;
}

describe.each(
  Object.entries(DESIGNS).flatMap(([name, style]) =>
    Object.entries(VALUES).map(
      ([kind, value]) => [`${name} (${kind})`, style, value] as const,
    ),
  ),
)("%s", (_name, style, value) => {
  test("vanilla JS draws the design into #qr", () => {
    const { code, omitted } = vanillaSnippet(input(style, value));
    expect(omitted).toEqual([]);
    document.body.innerHTML = '<div id="qr"></div>';
    const qr = runVanilla(code);
    expect(qr.svg?.parentElement?.id).toBe("qr");
    expect(qr.toSVGString()).toBe(editorMarkup(style, value));
  });

  test("the web component draws the design", async () => {
    const { code, omitted } = webComponentSnippet(input(style, value));
    expect(omitted).toEqual([]);
    // The page: the snippet as pasted (innerHTML never runs its script tag;
    // the element is already defined, as the script defines it)
    document.body.innerHTML = code;
    const element = document.querySelector<QRdxCode>("qrdx-code");
    expect(element).not.toBeNull();
    expect(customElements.get("qrdx-code")).toBeDefined();
    expect(element?.toSVGString()).toBe(editorMarkup(style, value));
    // It draws into its shadow root
    await Promise.resolve();
    expect(element?.svg?.getAttribute("role")).toBe("img");
  });
});

describe("the CDN links", () => {
  it("pin the qrdx on npm and point at files the package ships", () => {
    expect(VANILLA_CDN_URL).toBe(`${CDN}vanilla.browser.mjs`);
    expect(ELEMENT_CDN_URL).toBe(`${CDN}element-define.browser.mjs`);
    expect(typeof vanilla.createQRCode).toBe("function");
    expect(typeof vanilla.resolveQRCodeProps).toBe("function");
  });
});
