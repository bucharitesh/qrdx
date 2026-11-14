// The Get code dialog's Frameworks tab (components/editor/action-bar/
// code-snippets.ts): every snippet is evaluated the way its framework reads
// it, and what it draws must be what the editor's preview draws, byte for
// byte. React snippets render with React; Preact, Solid, Vue and Angular
// snippets give their props to resolveQRCodeProps and toSVGString from the
// built core, which is how those components draw (qrdx's parity tests hold
// them to it). tests/editor/framework-snippets-browser.test.ts runs the web
// component and vanilla JS snippets against the CDN files themselves.
// Nothing here reaches a database or the network.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OFFICIAL_FRAMES, QRCode, qrPropsSchema } from "qrdx";
import { resolveQRCodeProps, toSVGString } from "qrdx/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it, it as test } from "vitest";
import {
  angularSnippet,
  CODE_TABS,
  CODE_TARGETS,
  codeTargetTab,
  FRAMEWORK_LABELS,
  FRAMEWORKS,
  formatJs,
  frameworkSnippet,
  jsxSnippet,
  LEFT_OUT,
  QRDX_NPM_VERSION,
  SAMPLE_VALUE,
  type SnippetInput,
  shadcnSnippet,
  vanillaSnippet,
  vueSnippet,
  webComponentSnippet,
} from "@/components/editor/action-bar/code-snippets";
import { CODE_LANGS } from "@/lib/playground-links";
import { logoIconDataUrl } from "@/lib/qr-design/logo";
import { editorCodeProps } from "@/lib/qr-design/props";
import { type ThemeStyles, themeStylePropsSchema } from "@/types/theme";

const qrdx = join(import.meta.dirname, "../../../../packages/qrdx");

// ─── Designs ─────────────────────────────────────────────────────────────────

const frameSpec = OFFICIAL_FRAMES[0]?.spec;
if (!frameSpec) throw new Error("qrdx ships no official frames");

/** Designs every framework must draw exactly, nothing left out. */
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
  },
  noBorder: { templateId: "default", margin: 0, showLogo: false },
  cssColors: { fgColor: "rgb(30, 58, 138)", bgColor: "hsl(40 60% 96%)" },
  gradients: {
    fgColor: {
      type: "linear",
      angle: 135,
      stops: [
        { color: "#1d4ed8", offset: 0 },
        { color: "#6d28d9", offset: 50 },
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
    eyeColor: {
      type: "angular",
      angle: 30,
      stops: [
        { color: "#0f172a", offset: 0 },
        { color: "#334155", offset: 100 },
      ],
    },
    margin: 4,
  },
  eyes: {
    level: "H",
    eyeColors: {
      topLeft: { outer: "#b91c1c", inner: "#1d4ed8" },
      bottomLeft: { outer: "#15803d" },
    },
    moduleScale: 0.85,
  },
  frameLabel: {
    frame: { style: "banner-bottom", text: `It's "free" & <b> {{x}}` },
  },
  frameColors: {
    frame: {
      style: "rounded-border",
      text: "Menu",
      color: "#1e3a8a",
      textColor: "#ffffff",
    },
  },
  customFrame: { frame: { style: "custom", spec: frameSpec, text: "Join" } },
  border: { templateId: "StandardBox", margin: 2 },
  qrdxLogo: { level: "H", showLogo: true },
  logoLayout: {
    level: "Q",
    showLogo: true,
    customLogo: "https://cdn.example.com/brand.png",
    autoLevel: true,
    logoOptions: { size: 0.2, padding: 1, shape: "circle", plate: "#ffffff" },
  },
  circle: { shape: "circle", bodyPattern: "rounded", margin: 4 },
  heart: { shape: "heart", fgColor: "#be123c" },
  newerShapes: {
    bodyPattern: "liquid",
    cornerEyePattern: "squircle",
    cornerEyeDotPattern: "flower",
  },
  retiredShapes: { cornerEyePattern: "curly", cornerEyeDotPattern: "star" },
} satisfies Record<string, ThemeStyles>;

const LOGO_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const ART_DATA = Buffer.from(new Uint8Array(16).fill(7)).toString("base64");

/**
 * Designs with a part no snippet carries: each says so, and draws the
 * design without that part (`without`).
 */
const LEFT_OUT_DESIGNS: Record<
  string,
  { style: ThemeStyles; note: string; without: ThemeStyles }
> = {
  uploadedLogo: {
    style: {
      ...DESIGNS.plain,
      level: "H",
      showLogo: true,
      customLogo: LOGO_DATA_URL,
    },
    note: LEFT_OUT.uploadedLogo,
    without: { ...DESIGNS.plain, level: "H", showLogo: false },
  },
  quickIcon: {
    style: { level: "H", showLogo: true, customLogo: logoIconDataUrl("wifi") },
    note: LEFT_OUT.uploadedLogo,
    without: { level: "H", showLogo: false },
  },
  art: {
    style: {
      ...DESIGNS.plain,
      art: {
        mode: "halftone",
        image: { width: 2, height: 2, data: ART_DATA },
        intensity: 0.6,
      },
    },
    note: LEFT_OUT.art,
    without: DESIGNS.plain,
  },
  imageFill: {
    style: {
      ...DESIGNS.plain,
      fgColor: {
        type: "image",
        src: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ",
        fit: "cover",
        scale: 1,
        position: "center",
        opacity: 0.6,
        underlay: "#111827",
      },
    },
    note: LEFT_OUT.imageFills,
    without: { ...DESIGNS.plain, fgColor: "#111827" },
  },
};

const URL_VALUE = "https://example.org/menu?table=4&lang=en";
/** Every character a template, an attribute or a string literal can trip on. */
const TRICKY_VALUE = [
  'BEGIN:VCARD\r\nFN:Ana "A" & B <x> {{y}} $',
  "{z} `q` \\ 's @if\nEND:VCARD",
].join("");

const input = (style: ThemeStyles, value = URL_VALUE): SnippetInput => ({
  style,
  value,
  contentType: "url",
  content: { type: "url", url: value },
});

// ─── What the editor draws ───────────────────────────────────────────────────

const reactMarkup = (props: object) =>
  renderToStaticMarkup(createElement(QRCode, props as never));

/** The editor's preview of `style`, as React renders it. */
const editorMarkup = (style: ThemeStyles, value: string) =>
  reactMarkup(editorCodeProps(style, value));

/** What `<QRCode>` in Preact, Solid, Vue or Angular draws for `props`. */
const coreMarkup = (props: Record<string, unknown>) =>
  toSVGString(resolveQRCodeProps(props as never));

// ─── Reading snippets as their frameworks do ─────────────────────────────────

const QRCODE = Symbol("QRCode");

/** Runs a snippet module (TypeScript, JSX) with stand-in imports. */
function runModule(
  code: string,
  modules: Record<string, unknown>,
  fileName: string,
): Record<string, unknown> {
  const { outputText } = ts.transpileModule(code, {
    fileName,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const module = { exports: {} as Record<string, unknown> };
  const load = (id: string) => {
    if (!(id in modules)) throw new Error(`The snippet imports ${id}`);
    return modules[id];
  };
  new Function("require", "module", "exports", outputText)(
    load,
    module,
    module.exports,
  );
  return module.exports;
}

const jsxRuntime = {
  jsx: (type: unknown, props: Record<string, unknown>) => ({ type, props }),
  jsxs: (type: unknown, props: Record<string, unknown>) => ({ type, props }),
};

/** A JSX snippet's `<QRCode>` props. */
function jsxProps(code: string, entry: string): Record<string, unknown> {
  const exports = runModule(
    code,
    { [entry]: { QRCode: QRCODE }, "react/jsx-runtime": jsxRuntime },
    "my-qr-code.tsx",
  );
  const element = (
    exports.MyQRCode as () => {
      type: unknown;
      props: Record<string, unknown>;
    }
  )();
  expect(element.type).toBe(QRCODE);
  return element.props;
}

/** The attributes of the one `<tag … />` in a template, in order. */
function templateAttributes(template: string, tag: string) {
  const start = template.indexOf(`<${tag}`);
  const end = template.indexOf("/>", start);
  expect(start).toBeGreaterThanOrEqual(0);
  const body = template.slice(start + tag.length + 1, end);
  const attributes: { name: string; value: string | null }[] = [];
  for (const match of body.matchAll(/\s+([^\s="]+)(?:="([^"]*)")?/g)) {
    attributes.push({ name: match[1] as string, value: match[2] ?? null });
  }
  // Every character of the tag is accounted for
  expect(body.replace(/\s+([^\s="]+)(?:="([^"]*)")?/g, "").trim()).toBe("");
  return attributes;
}

/** A bound expression: a name in scope, or a literal. */
function bound(expression: string, scope: Record<string, unknown>) {
  if (Object.hasOwn(scope, expression)) return scope[expression];
  return JSON.parse(expression);
}

const camel = (name: string) =>
  name.replace(/-([a-z])/g, (_match, char: string) => char.toUpperCase());

/**
 * A Vue SFC's `<QRCode>` props, read as Vue does: static attributes are
 * strings, `:name` binds an expression of `<script setup>`, a bare boolean
 * prop is true, and kebab-case names are the camelCase props.
 */
function vueProps(code: string): Record<string, unknown> {
  const script = /<script setup lang="ts">\n([\s\S]*?)\n<\/script>/.exec(
    code,
  )?.[1];
  const template = /<template>\n([\s\S]*)\n<\/template>$/.exec(code)?.[1];
  if (script === undefined || template === undefined) {
    throw new Error(`Not an SFC:\n${code}`);
  }
  const names = [...script.matchAll(/^const (\w+)/gm)].map((m) => m[1]);
  const scope = runModule(
    `${script}\nmodule.exports = { ${names.join(", ")} };`,
    { "qrdx/vue": { QRCode: QRCODE } },
    "MyQRCode.ts",
  );
  const props: Record<string, unknown> = {};
  for (const { name, value } of templateAttributes(template, "QRCode")) {
    if (name.startsWith(":")) {
      props[camel(name.slice(1))] = bound(value as string, scope);
    } else {
      // Only Boolean props can be bare; a string attribute needs no escapes
      if (value === null) expect(VUE_BOOLEAN_PROPS).toContain(camel(name));
      else expect(value).not.toMatch(/[&"<>]/);
      props[camel(name)] = value ?? true;
    }
    expect(name, "kebab-case").toBe(name.toLowerCase());
  }
  return props;
}

interface AngularMetadata {
  template: string;
  imports: unknown[];
}
let angularMetadata: AngularMetadata | undefined;
/** @angular/core for a snippet: its decorator keeps the component's metadata. */
const angularCore = {
  Component: (metadata: AngularMetadata) => {
    angularMetadata = metadata;
    return () => undefined;
  },
};

/**
 * An Angular component's `<qrdx-qr-code>` inputs, read as Angular does:
 * static attributes are strings and `[name]` binds a field or a literal.
 */
function angularProps(code: string): Record<string, unknown> {
  angularMetadata = undefined;
  const exports = runModule(
    code,
    { "@angular/core": angularCore, "qrdx/angular": { QRCode: QRCODE } },
    "my-qr-code.ts",
  );
  const { template, imports } = angularMetadata ?? {
    template: "",
    imports: [],
  };
  expect(imports).toEqual([QRCODE]);
  const component = new (
    exports.MyQRCode as new () => Record<string, unknown>
  )();
  const props: Record<string, unknown> = {};
  for (const { name, value } of templateAttributes(template, "qrdx-qr-code")) {
    if (value === null) throw new Error(`A bare attribute: ${name}`);
    const binding = /^\[(\w+)\]$/.exec(name)?.[1];
    if (binding) props[binding] = bound(value, component);
    else {
      expect(value).not.toMatch(/[&"<>]|\{\{/);
      props[name] = value;
    }
  }
  return props;
}

// ─── The components' own prop lists ──────────────────────────────────────────

const source = (file: string) => readFileSync(join(qrdx, "src", file), "utf8");

/** QRCode's props in React, Preact and Solid: QRProps plus the logo API. */
const JSX_PROPS = new Set([
  ...Object.keys(qrPropsSchema.shape),
  "style",
  "customTemplate",
  "frameLabelMarkers",
  "partMarkers",
  "logo",
  "logoOptions",
  "hideLogo",
  "scale",
]);

/** The props qrdx/vue's QRCode declares (src/vue.ts). */
const vueSource = source("vue.ts");
const vueBlock = (name: string) =>
  new RegExp(`const ${name} = \\{([\\s\\S]*?)\\} as const;`).exec(
    vueSource,
  )?.[1] ?? "";
const VUE_PROPS = new Set(
  [
    ...`${vueBlock("svgProps")}${vueBlock("codeProps")}`.matchAll(
      /^\s+(\w+):/gm,
    ),
  ].map((m) => m[1]),
);
const VUE_BOOLEAN_PROPS = [...vueSource.matchAll(/^\s+(\w+): flag,/gm)].map(
  (m) => m[1],
);

/** qrdx/angular's inputs (src/angular.ts). */
const ANGULAR_INPUTS = new Set(
  [...source("angular.ts").matchAll(/readonly (\w+): Prop<"\w+">/g)].map(
    (m) => m[1],
  ),
);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("the Frameworks tab", () => {
  it("offers every framework, and links open each one", () => {
    expect(FRAMEWORKS).toEqual([
      "react",
      "vue",
      "angular",
      "preact",
      "solid",
      "web-component",
      "vanilla",
      "shadcn",
    ]);
    expect(Object.keys(FRAMEWORK_LABELS).sort()).toEqual(
      [...FRAMEWORKS].sort(),
    );
    expect(CODE_TABS).toEqual(["frameworks", "image", "api", "mcp", "cli"]);
    expect([...CODE_TARGETS]).toEqual([...CODE_LANGS]);
    expect(codeTargetTab("vue")).toEqual({
      tab: "frameworks",
      framework: "vue",
    });
    expect(codeTargetTab("shadcn")).toEqual({
      tab: "frameworks",
      framework: "shadcn",
    });
    expect(codeTargetTab("mcp")).toEqual({ tab: "mcp" });
  });

  it("writes for the qrdx on npm", () => {
    const pkg = JSON.parse(readFileSync(join(qrdx, "package.json"), "utf8"));
    // The engine in the repo is the one on npm, or newer
    const [, , patch] = QRDX_NPM_VERSION.split(".").map(Number);
    expect(Number(pkg.version.split(".")[2])).toBeGreaterThanOrEqual(
      patch as number,
    );
    for (const entry of [
      "./vanilla",
      "./vue",
      "./element",
      "./element/define",
      "./preact",
      "./solid",
      "./angular",
    ]) {
      expect(pkg.exports[entry], entry).toBeDefined();
    }
  });

  it("uses fixtures the editor itself would accept", () => {
    const all = {
      ...DESIGNS,
      ...Object.fromEntries(
        Object.entries(LEFT_OUT_DESIGNS).map(([name, { style }]) => [
          name,
          style,
        ]),
      ),
    };
    for (const [name, style] of Object.entries(all)) {
      const result = themeStylePropsSchema.safeParse(style);
      expect(result.success, `${name}: ${result.error?.message}`).toBe(true);
    }
  });
});

const JSX_FRAMEWORKS = [
  ["react", "qrdx"],
  ["preact", "qrdx/preact"],
  ["solid", "qrdx/solid"],
] as const;

describe.each(
  Object.entries(DESIGNS).flatMap(([name, style]) => [
    [`${name} (link)`, style, URL_VALUE] as const,
    ...(name === "plain" || name === "logoLayout"
      ? [[`${name} (vCard)`, style, TRICKY_VALUE] as const]
      : []),
  ]),
)("%s", (_name, style, value) => {
  const expected = editorMarkup(style, value);

  test.each(JSX_FRAMEWORKS)("%s draws the design", (framework, entry) => {
    const { code, omitted } = jsxSnippet(input(style, value), framework);
    expect(omitted).toEqual([]);
    expect(code).toContain(`import { QRCode } from "${entry}";`);
    const props = jsxProps(code, entry);
    for (const name of Object.keys(props)) {
      expect(JSX_PROPS.has(name), name).toBe(true);
    }
    expect(framework === "react" ? reactMarkup(props) : coreMarkup(props)).toBe(
      expected,
    );
  });

  test("Vue draws the design", () => {
    const { code, omitted } = vueSnippet(input(style, value));
    expect(omitted).toEqual([]);
    const props = vueProps(code);
    for (const name of Object.keys(props)) {
      expect(VUE_PROPS.has(name), name).toBe(true);
    }
    expect(coreMarkup(props)).toBe(expected);
  });

  test("Angular draws the design", () => {
    const { code, omitted } = angularSnippet(input(style, value));
    expect(omitted).toEqual([]);
    const props = angularProps(code);
    for (const name of Object.keys(props)) {
      expect(ANGULAR_INPUTS.has(name), name).toBe(true);
    }
    expect(coreMarkup(props)).toBe(expected);
  });
});

describe("the shadcn item", () => {
  // Designs the item's props can say in full (no frame or engine options)
  const whole = Object.entries(DESIGNS).filter(
    ([, style]) => shadcnSnippet(input(style)).omitted.length === 0,
  );

  it("can say most designs in full", () => {
    expect(whole.length).toBeGreaterThanOrEqual(8);
  });

  it.each(whole)("%s draws the design", (_name, style) => {
    const { code } = shadcnSnippet(input(style));
    const exports = runModule(
      code,
      {
        "@/components/qr-code": { QrCode: QRCODE },
        "react/jsx-runtime": jsxRuntime,
      },
      "my-qr-code.tsx",
    );
    const element = (
      exports.MyQRCode as () => {
        type: unknown;
        props: Record<string, unknown>;
      }
    )();
    expect(element.type).toBe(QRCODE);
    // The item draws qrdx's QRCode with these props at its size, 200
    // (registry/qrdx/qr-code.tsx)
    expect(reactMarkup({ ...element.props, size: 200 })).toBe(
      reactMarkup({ ...editorCodeProps(style, URL_VALUE), size: 200 }),
    );
  });
});

describe("what a snippet can't carry", () => {
  const frameworks = FRAMEWORKS.filter((framework) => framework !== "shadcn");

  it.each(Object.entries(LEFT_OUT_DESIGNS))(
    "%s: says so, and draws the rest",
    (_name, { style, note, without }) => {
      const expected = editorMarkup(without, URL_VALUE);
      for (const framework of frameworks) {
        const snippet = frameworkSnippet(framework, input(style));
        expect(snippet.omitted, framework).toEqual([note]);
        expect(snippet.code, framework).not.toContain("data:");
        expect(snippet.code, framework).not.toContain(ART_DATA);
      }
      expect(coreMarkup(vueProps(vueSnippet(input(style)).code))).toBe(
        expected,
      );
      expect(reactMarkup(jsxProps(jsxSnippet(input(style)).code, "qrdx"))).toBe(
        expected,
      );
    },
  );

  it("uses the sample link when there is no content yet", () => {
    for (const framework of frameworks) {
      const { code } = frameworkSnippet(framework, {
        style: DESIGNS.plain,
        value: " ",
        contentType: "url",
      });
      expect(code, framework).toContain(SAMPLE_VALUE);
    }
  });
});

describe("each framework's syntax", () => {
  it("React, Preact and Solid: strings as attributes, flags bare", () => {
    const { code } = jsxSnippet(input(DESIGNS.logoLayout, "https://qrdx.dev"));
    expect(code).toContain('value="https://qrdx.dev"');
    expect(code).toContain('level="Q"');
    expect(code).toMatch(/^ {6}autoLevel$/m);
    expect(code).toContain(
      '      logoOptions={{\n        size: 0.2,\n        padding: 1,\n        shape: "circle",\n        plate: "#ffffff",\n      }}',
    );
    expect(jsxSnippet(input(DESIGNS.frameColors)).code).toContain(
      '      frame={{\n        style: "rounded-border",\n',
    );
    expect(jsxSnippet(input(DESIGNS.eyes)).code).toContain(
      '        topLeft: { outer: "#b91c1c", inner: "#1d4ed8" },',
    );
    // An & would read as an entity in a JSX string
    expect(jsxSnippet(input(DESIGNS.plain)).code).toContain(
      `value={${JSON.stringify(URL_VALUE)}}`,
    );
  });

  it("Vue: kebab-case attributes, bound numbers, typed constants", () => {
    const { code } = vueSnippet(input(DESIGNS.gradients, "https://qrdx.dev"));
    expect(code).toMatch(
      /^<script setup lang="ts">\nimport \{ QRCode, type QRCodeProps \} from "qrdx\/vue";/,
    );
    expect(code).toContain('const fgColor: QRCodeProps["fgColor"] = {');
    expect(code).toContain(':fg-color="fgColor"');
    expect(code).toContain(':margin="4"');
    expect(code).toContain('value="https://qrdx.dev"');
    // A value with & or line breaks is a constant, not an attribute
    expect(vueSnippet(input(DESIGNS.plain)).code).toContain(
      `const value = ${JSON.stringify(URL_VALUE)};`,
    );
    const plainOnly = vueSnippet(input(DESIGNS.plain, "https://qrdx.dev")).code;
    expect(plainOnly).toContain(
      'import { QRCode } from "qrdx/vue";\n</script>',
    );
    expect(vueSnippet(input(DESIGNS.logoLayout)).code).toMatch(
      /^ {4}auto-level$/m,
    );
  });

  it("Angular: a standalone component, inputs bound with []", () => {
    const { code } = angularSnippet(input(DESIGNS.logoLayout));
    expect(code).toContain('import { Component } from "@angular/core";');
    expect(code).toContain(
      'import { QRCode, type QRCodeProps } from "qrdx/angular";',
    );
    expect(code).toContain("imports: [QRCode],");
    expect(code).toContain("<qrdx-qr-code");
    expect(code).toContain('[autoLevel]="true"');
    expect(code).toContain('[logoOptions]="logoOptions"');
    expect(code).toContain(
      'protected readonly logoOptions: QRCodeProps["logoOptions"] =',
    );
    expect(code).toContain('logo="https://cdn.example.com/brand.png"');
    expect(angularSnippet(input({}, "https://qrdx.dev")).code).toMatch(
      /export class MyQRCode \{\}$/,
    );
  });

  it("vanilla JS: createQRCode, with resolveQRCodeProps for a logo", () => {
    const plain = vanillaSnippet(input(DESIGNS.plain));
    expect(plain.code).toContain(
      'import { createQRCode } from "qrdx/vanilla";',
    );
    expect(plain.code).toContain('createQRCode("#qr", {');
    expect(plain.cdnUrl).toBe(
      `https://cdn.jsdelivr.net/npm/qrdx@${QRDX_NPM_VERSION}/dist/vanilla.browser.mjs`,
    );
    const logo = vanillaSnippet(input(DESIGNS.qrdxLogo));
    expect(logo.code).toContain(
      'import { createQRCode, resolveQRCodeProps } from "qrdx/vanilla";',
    );
    expect(logo.code).toContain('logo: "https://qrdx.dev/logo.png",');
  });

  it("web component: attributes, the rest as JSON in props", () => {
    const { code } = webComponentSnippet(input(DESIGNS.gradients));
    expect(code).toContain(
      `src="https://cdn.jsdelivr.net/npm/qrdx@${QRDX_NPM_VERSION}/dist/element-define.browser.mjs"`,
    );
    expect(code).toContain(
      'value="https://example.org/menu?table=4&amp;lang=en"',
    );
    expect(code).toContain('margin="4"');
    expect(code).toContain("props='{");
    expect(code).not.toContain("fg-color");
    const frame = webComponentSnippet(input(DESIGNS.frameLabel)).code;
    expect(frame).toContain("It&#39;s");
    expect(frame).toContain("&amp; <b>");
  });

  it("formats literals as Biome would", () => {
    expect(formatJs({ color: "#000000", offset: 0 })).toBe(
      '{ color: "#000000", offset: 0 }',
    );
    expect(formatJs({ "data-x": 1, y: [1, 2] })).toBe(
      '{\n  "data-x": 1,\n  y: [1, 2],\n}',
    );
    expect(formatJs("a\nb")).toBe('"a\\nb"');
    const long = { text: "x".repeat(80) };
    expect(formatJs(long)).toBe(`{\n  text: "${"x".repeat(80)}",\n}`);
  });
});
