// The Get code dialog's serializers (components/editor/action-bar/
// code-snippets.ts) against the real contracts: the image API's query
// schema, POST /v1/codes's createCodeSchema and OpenAPI CodeInput, the MCP
// design_qr input schema, the shadcn item's props and the CLI's flags.
// Nothing here reaches a database or the network.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OFFICIAL_FRAMES } from "qrdx";
import { colorConfigSchema } from "qrdx/types";
import { describe, expect, it } from "vitest";
import { designQrInputSchema } from "@/app/api/mcp/design";
import { qrImageQuerySchema } from "@/app/api/v1/qr/_lib/query";
import { createCodeSchema } from "@/app/dashboard/codes/_lib/qr-codes";
import {
  CLI_TAB_ENABLED,
  CODE_TABS,
  cliSnippet,
  formatJson,
  IMAGE_API_URL,
  imageSnippet,
  LEFT_OUT,
  mcpSnippet,
  NPM_QRDX,
  REST_UNAVAILABLE,
  reactSnippet,
  restSnippet,
  SAMPLE_VALUE,
  SHADCN_INSTALL,
  type SnippetInput,
  shadcnSnippet,
} from "@/components/editor/action-bar/code-snippets";
import { buildOpenApiDocument } from "@/lib/openapi/document";
import { CODE_LANGS } from "@/lib/playground-links";
import { validateDesignContent } from "@/lib/qr-design/content";
import { type ThemeStyles, themeStylePropsSchema } from "@/types/theme";

const root = join(import.meta.dirname, "..", "..");

// ─── Fixtures ────────────────────────────────────────────────────────────────

const LOGO_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
// 2 × 2 RGBA pixels: 16 bytes, 24 base64 characters.
const ART_DATA = Buffer.from(new Uint8Array(16).fill(7)).toString("base64");

const plain: ThemeStyles = {
  bgColor: "#ffffff",
  fgColor: "#1e3a8a",
  eyeColor: "#111111",
  dotColor: "#e11d48",
  bodyPattern: "rounded",
  cornerEyePattern: "extra-rounded",
  cornerEyeDotPattern: "circle",
  level: "M",
  margin: 2,
};

const gradient: ThemeStyles = {
  ...plain,
  fgColor: {
    type: "linear",
    stops: [
      { color: "#6366f1", offset: 0 },
      { color: "#a855f7", offset: 50 },
      { color: "#ec4899", offset: 100 },
    ],
    angle: 135,
  },
  bgColor: {
    type: "radial",
    stops: [
      { color: "#ffffff", offset: 0 },
      { color: "#eef2ff", offset: 100 },
    ],
  },
};

const uploadedLogo: ThemeStyles = {
  ...plain,
  level: "H",
  showLogo: true,
  customLogo: LOGO_DATA_URL,
};

const qrdxLogo: ThemeStyles = { ...plain, showLogo: true };

const builtInFrame: ThemeStyles = {
  ...plain,
  frame: {
    style: "banner-bottom",
    text: "Scan for the menu",
    color: "#1e3a8a",
    textColor: "#ffffff",
  },
};

const officialFrame = OFFICIAL_FRAMES[0];
if (!officialFrame) throw new Error("qrdx ships no official frames");
const customFrame: ThemeStyles = {
  ...plain,
  frame: { style: "custom", spec: officialFrame.spec, text: "Free Wi-Fi" },
};

const art: ThemeStyles = {
  ...plain,
  art: {
    mode: "halftone",
    image: { width: 2, height: 2, data: ART_DATA },
    intensity: 0.6,
  },
};

/** Shapes and a border added to packages/qrdx after npm 0.0.46. */
const newerShapes: ThemeStyles = {
  ...plain,
  bodyPattern: "liquid",
  cornerEyePattern: "squircle",
  cornerEyeDotPattern: "flower",
};

/** Shapes that still render but aren't offered any more. */
const retiredShapes: ThemeStyles = {
  ...plain,
  cornerEyePattern: "curly",
  cornerEyeDotPattern: "star",
};

const FIXTURES = {
  plain,
  gradient,
  uploadedLogo,
  qrdxLogo,
  builtInFrame,
  customFrame,
  art,
  newerShapes,
  retiredShapes,
  empty: {},
} satisfies Record<string, ThemeStyles>;

const URL_VALUE = "https://example.org/menu?table=4&lang=en";

const urlInput = (style: ThemeStyles, value = URL_VALUE): SnippetInput => ({
  style,
  value,
  contentType: "url",
  content: { type: "url", url: value },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** The prop names of a generated JSX element (6-space indented lines). */
const propNames = (code: string) =>
  [...code.matchAll(/^ {6}([A-Za-z]+)(?:=|$)/gm)].map((match) => match[1]);

/** The JSON body of a generated curl command. */
function restBody(code: string): Record<string, unknown> {
  const quoted = /-d '([\s\S]*)'$/.exec(code)?.[1];
  if (quoted === undefined) throw new Error(`No body in:\n${code}`);
  return JSON.parse(quoted.replace(/'\\''/g, "'"));
}

/** Splits a generated shell command into its words (single quotes only). */
function shellWords(command: string): string[] {
  const words: string[] = [];
  let word = "";
  let inWord = false;
  const text = command.replace(/ \\\n {2}/g, " ");
  for (let i = 0; i < text.length; i++) {
    const char = text[i] as string;
    if (char === "'") {
      const end = text.indexOf("'", i + 1);
      word += text.slice(i + 1, end);
      i = end;
      inWord = true;
    } else if (char === "\\" && text[i + 1] === "'") {
      word += "'";
      i++;
      inWord = true;
    } else if (char === " ") {
      if (inWord) words.push(word);
      word = "";
      inWord = false;
    } else {
      word += char;
      inWord = true;
    }
  }
  if (inWord) words.push(word);
  return words;
}

/** --flag value pairs (and bare flags) after `generate <data>`. */
function cliFlags(words: string[]): Map<string, string | true> {
  const flags = new Map<string, string | true>();
  const rest = words.slice(4);
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i] as string;
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags.set(flag, next);
      i++;
    } else {
      flags.set(flag, true);
    }
  }
  return flags;
}

const ALL_SERIALIZERS = {
  react: reactSnippet,
  shadcn: shadcnSnippet,
  image: imageSnippet,
  api: restSnippet,
  mcp: mcpSnippet,
  cli: cliSnippet,
};

// ─── Tabs ────────────────────────────────────────────────────────────────────

describe("tabs", () => {
  it("ship exactly the link ids, in tab order", () => {
    expect(CODE_TABS).toEqual(["react", "shadcn", "image", "api", "mcp"]);
    expect([...CODE_TABS]).toEqual([...CODE_LANGS]);
  });

  it("keep the CLI hidden until a working @qrdx/cli is on npm", () => {
    expect(CLI_TAB_ENABLED).toBe(false);
    expect(CODE_TABS).not.toContain("cli");
  });

  it("use fixtures the editor itself would accept", () => {
    for (const [name, style] of Object.entries(FIXTURES)) {
      const result = themeStylePropsSchema.safeParse(style);
      expect(result.success, name).toBe(true);
    }
  });
});

describe("every serializer", () => {
  it("never puts an uploaded logo or art pixels in a snippet", () => {
    for (const [tab, serialize] of Object.entries(ALL_SERIALIZERS)) {
      for (const [name, style] of Object.entries(FIXTURES)) {
        const snippet = serialize(urlInput(style));
        const text = JSON.stringify(snippet);
        expect(text, `${tab}/${name}`).not.toContain("data:");
        expect(text, `${tab}/${name}`).not.toContain("base64");
        expect(text, `${tab}/${name}`).not.toContain(ART_DATA);
        expect(text, `${tab}/${name}`).not.toContain(LOGO_DATA_URL.slice(30));
      }
    }
  });

  it("lists art and the uploaded logo as left out everywhere", () => {
    for (const [tab, serialize] of Object.entries(ALL_SERIALIZERS)) {
      expect(serialize(urlInput(art)).omitted, tab).toContain(LEFT_OUT.art);
      const logo = serialize(urlInput(uploadedLogo)).omitted.join(" | ");
      expect(logo, tab).toMatch(/Your logo|The logo/);
    }
  });

  it("uses the sample link when there is no content yet", () => {
    for (const [tab, serialize] of Object.entries(ALL_SERIALIZERS)) {
      const snippet = serialize({
        style: plain,
        value: "",
        contentType: "url",
      });
      expect(snippet.code, tab).toContain(
        tab === "image" ? encodeURIComponent(SAMPLE_VALUE) : SAMPLE_VALUE,
      );
    }
  });
});

describe("formatJson", () => {
  it("is plain JSON with short flat objects on one line", () => {
    for (const style of Object.values(FIXTURES)) {
      const value = { destinationUrl: URL_VALUE, style };
      expect(JSON.parse(formatJson(value))).toEqual(
        JSON.parse(JSON.stringify(value)),
      );
    }
    expect(formatJson({ stops: [{ color: "#000000", offset: 0 }] })).toBe(
      '{\n  "stops": [\n    { "color": "#000000", "offset": 0 }\n  ]\n}',
    );
  });
});

// ─── React ───────────────────────────────────────────────────────────────────

/** QRCode's props in npm qrdx 0.0.46 (dist/src/qr-code.d.ts, types/qr.d.ts). */
const NPM_QRCODE_PROPS = new Set([
  "value",
  "size",
  "level",
  "bgColor",
  "fgColor",
  "eyeColor",
  "dotColor",
  "bodyPattern",
  "cornerEyePattern",
  "cornerEyeDotPattern",
  "margin",
  "style",
  "imageSettings",
  "isOGContext",
  "templateId",
  "customTemplate",
  "customProps",
  "hideLogo",
  "logo",
  "scale",
]);

describe("reactSnippet", () => {
  it("writes a plain style with props npm qrdx 0.0.46 has", () => {
    const { code, omitted } = reactSnippet(urlInput(plain));
    expect(code).toContain('import { QRCode } from "qrdx";');
    expect(code).toContain('fgColor="#1e3a8a"');
    expect(code).toContain('eyeColor="#111111"');
    expect(code).toContain('bodyPattern="rounded"');
    expect(code).toContain('cornerEyePattern="extra-rounded"');
    expect(code).toContain('level="M"');
    expect(code).toContain("margin={2}");
    // 0.0.46 draws the QRdx logo by default.
    expect(code).toContain("hideLogo");
    // An & in a JSX string would read as an entity.
    expect(code).toContain(`value={${JSON.stringify(URL_VALUE)}}`);
    expect(omitted).toEqual([]);
    for (const name of propNames(code)) {
      expect(NPM_QRCODE_PROPS.has(name as string), name).toBe(true);
    }
  });

  it("keeps gradients as qrdx color objects", () => {
    const { code, omitted } = reactSnippet(urlInput(gradient));
    expect(code).toContain('type: "linear"');
    expect(code).toContain('{ color: "#a855f7", offset: 50 },');
    expect(code).toContain("angle: 135,");
    expect(code).toContain('type: "radial"');
    expect(omitted).toEqual([]);
  });

  it("names the QRdx logo explicitly and leaves an upload out", () => {
    expect(reactSnippet(urlInput(qrdxLogo)).code).toContain(
      'logo="https://qrdx.dev/logo.png"',
    );
    const uploaded = reactSnippet(urlInput(uploadedLogo));
    expect(uploaded.code).toContain("hideLogo");
    expect(uploaded.code).not.toMatch(/\blogo=/);
    expect(uploaded.omitted).toEqual([LEFT_OUT.uploadedLogo]);
    const remote = reactSnippet(
      urlInput({
        ...plain,
        showLogo: true,
        customLogo: "https://a.test/l.png",
      }),
    );
    expect(remote.code).toContain('logo="https://a.test/l.png"');
    expect(remote.omitted).toEqual([]);
  });

  it("leaves out frames, art and shapes newer than 0.0.46", () => {
    expect(reactSnippet(urlInput(builtInFrame)).omitted).toEqual([
      LEFT_OUT.frame,
    ]);
    expect(reactSnippet(urlInput(builtInFrame)).code).not.toContain("frame");
    expect(reactSnippet(urlInput(customFrame)).omitted).toEqual([
      LEFT_OUT.customFrame,
    ]);
    expect(reactSnippet(urlInput(art)).omitted).toEqual([LEFT_OUT.art]);
    const newer = reactSnippet(urlInput(newerShapes));
    expect(newer.omitted).toEqual([
      'The "liquid" dot shape',
      'The "squircle" eye shape',
      'The "flower" eye center shape',
    ]);
    expect(newer.code).not.toMatch(/liquid|squircle|flower/);
    // Retired shapes are still in 0.0.46.
    expect(reactSnippet(urlInput(retiredShapes)).code).toContain(
      'cornerEyePattern="curly"',
    );
  });

  it("knows only the shapes and borders of the published package", () => {
    expect(NPM_QRDX.version).toBe("0.0.46");
    expect(NPM_QRDX.bodyPatterns).toHaveLength(9);
    expect(NPM_QRDX.templates).toContain("Halloween");
  });
});

// ─── shadcn ──────────────────────────────────────────────────────────────────

/** QrCodeProps of the registry item, read from its source. */
function shadcnItemProps(): Set<string> {
  const source = readFileSync(join(root, "registry/qrdx/qr-code.tsx"), "utf8");
  const body = /export interface QrCodeProps[^{]*\{([\s\S]*?)\n\}/.exec(
    source,
  )?.[1];
  if (!body) throw new Error("QrCodeProps not found");
  return new Set([...body.matchAll(/^ {2}(\w+)\??:/gm)].map((m) => m[1]));
}

describe("shadcnSnippet", () => {
  it("adds the registry item and uses only its props", () => {
    const snippet = shadcnSnippet(urlInput(plain));
    expect(snippet.install).toBe(SHADCN_INSTALL);
    expect(SHADCN_INSTALL).toBe(
      "npx shadcn@latest add https://qrdx.dev/r/qr-code.json",
    );
    expect(snippet.code).toContain(
      'import { QrCode } from "@/components/qr-code";',
    );
    const props = shadcnItemProps();
    expect(props.has("value")).toBe(true);
    for (const name of propNames(snippet.code)) {
      expect(props.has(name as string), name).toBe(true);
    }
  });

  it("always sets the quiet zone (the item defaults to 2)", () => {
    expect(shadcnSnippet(urlInput({})).code).toContain("margin={0}");
    expect(shadcnSnippet(urlInput(plain)).code).toContain("margin={2}");
  });

  it("says the logo can't be hidden or replaced by an upload", () => {
    expect(shadcnSnippet(urlInput(plain)).omitted).toEqual([
      LEFT_OUT.shadcnNoLogo,
    ]);
    expect(shadcnSnippet(urlInput(uploadedLogo)).omitted).toEqual([
      LEFT_OUT.shadcnUploadedLogo,
    ]);
    const qrdx = shadcnSnippet(urlInput(qrdxLogo));
    expect(qrdx.code).toContain('logo="https://qrdx.dev/logo.png"');
    expect(qrdx.omitted).toEqual([]);
  });

  it("leaves out frames and shapes newer than 0.0.46", () => {
    expect(shadcnSnippet(urlInput(builtInFrame)).omitted).toContain(
      LEFT_OUT.frame,
    );
    expect(shadcnSnippet(urlInput(newerShapes)).omitted).toContain(
      'The "liquid" dot shape',
    );
  });
});

// ─── Image URL ───────────────────────────────────────────────────────────────

const IMAGE_PARAMS = new Set(Object.keys(qrImageQuerySchema.shape));

function imageQuery(url: string) {
  const parsed = new URL(url);
  expect(`${parsed.origin}${parsed.pathname}`).toBe(IMAGE_API_URL);
  const query = Object.fromEntries(parsed.searchParams);
  for (const key of Object.keys(query)) {
    expect(IMAGE_PARAMS.has(key), key).toBe(true);
  }
  const result = qrImageQuerySchema.safeParse(query);
  expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  return query;
}

describe("imageSnippet", () => {
  it("never puts private content in the URL, only web addresses", () => {
    for (const [contentType, value] of [
      ["wifi", "WIFI:T:WPA;S:Cafe;P:secret123;;"],
      [
        "vcard",
        "BEGIN:VCARD\nVERSION:3.0\nFN:Jo Doe\nTEL:+15551234567\nEND:VCARD",
      ],
      ["text", "door code 4821"],
      ["url", "https://user:secret123@example.com/"],
    ] as const) {
      const { url, code, omitted } = imageSnippet({
        style: plain,
        value,
        contentType,
      });
      expect(new URL(url).searchParams.get("data")).toBe(SAMPLE_VALUE);
      for (const secret of ["secret123", "5551234567", "4821", "Jo Doe"]) {
        expect(url).not.toContain(secret);
        expect(code).not.toContain(secret);
      }
      expect(omitted).toContain(LEFT_OUT.privateContent);
    }
    const tooLong = `https://example.com/?q=${"a".repeat(2100)}`;
    const long = imageSnippet(urlInput(plain, tooLong));
    expect(new URL(long.url).searchParams.get("data")).toBe(SAMPLE_VALUE);
    expect(long.omitted).toContain(LEFT_OUT.longContent);
  });

  it("builds a URL the image API accepts", () => {
    const { url, code, omitted } = imageSnippet(urlInput(plain));
    const query = imageQuery(url);
    expect(query).toMatchObject({
      data: URL_VALUE,
      fg: "1e3a8a",
      eyeColor: "111111",
      dotColor: "e11d48",
      body: "rounded",
      eye: "extra-rounded",
      dot: "circle",
      level: "M",
      margin: "2",
    });
    // Defaults stay out of the URL.
    expect(query.bg).toBeUndefined();
    expect(code).toContain(`src="${url}"`);
    expect(code).toMatch(/^<img\n/);
    expect(omitted).toEqual([]);
  });

  it("spells out the editor's defaults where the API's differ", () => {
    const query = imageQuery(imageSnippet(urlInput({})).url);
    expect(query).toMatchObject({
      body: "circle",
      eye: "gear",
      dot: "circle",
      margin: "0",
    });
  });

  it("draws gradients in their first color and says so", () => {
    const { url, omitted } = imageSnippet(urlInput(gradient));
    expect(imageQuery(url).fg).toBe("6366f1");
    expect(omitted).toEqual([LEFT_OUT.imageGradients]);
  });

  it("leaves out the logo, frames, art and non-hex colors", () => {
    expect(imageSnippet(urlInput(qrdxLogo)).omitted).toEqual([LEFT_OUT.logo]);
    expect(imageSnippet(urlInput(uploadedLogo)).omitted).toEqual([
      LEFT_OUT.uploadedLogo,
    ]);
    expect(imageSnippet(urlInput(builtInFrame)).omitted).toEqual([
      LEFT_OUT.frame,
    ]);
    expect(imageSnippet(urlInput(customFrame)).omitted).toEqual([
      LEFT_OUT.customFrame,
    ]);
    expect(imageSnippet(urlInput(art)).omitted).toEqual([LEFT_OUT.art]);
    const rgb = imageSnippet(urlInput({ ...plain, fgColor: "rgb(0 0 0)" }));
    expect(rgb.omitted).toEqual([LEFT_OUT.nonHexColors]);
    expect(imageQuery(rgb.url).fg).toBeUndefined();
  });

  it("keeps newer and retired shapes and borders (the API draws them)", () => {
    expect(imageQuery(imageSnippet(urlInput(newerShapes)).url)).toMatchObject({
      body: "liquid",
      eye: "squircle",
      dot: "flower",
    });
    expect(imageQuery(imageSnippet(urlInput(retiredShapes)).url).eye).toBe(
      "curly",
    );
    const bordered = imageSnippet(urlInput({ ...plain, templateId: "Arrow" }));
    expect(imageQuery(bordered.url).template).toBe("Arrow");
  });
});

// ─── REST API ────────────────────────────────────────────────────────────────

const CODE_INPUT_FIELDS = (() => {
  const doc = buildOpenApiDocument() as unknown as {
    components: {
      schemas: { CodeInput: { properties: Record<string, unknown> } };
    };
  };
  return new Set(Object.keys(doc.components.schemas.CodeInput.properties));
})();

describe("restSnippet", () => {
  it("posts a body createCodeSchema and the OpenAPI document accept", () => {
    const { code, omitted } = restSnippet(urlInput(gradient));
    expect(code).toMatch(/^curl -X POST https:\/\/api\.qrdx\.dev\/v1\/codes/);
    expect(code).toContain('-H "Authorization: Bearer $QRDX_API_KEY"');
    const body = restBody(code);
    for (const key of Object.keys(body)) {
      expect(CODE_INPUT_FIELDS.has(key), key).toBe(true);
    }
    const result = createCodeSchema.safeParse(body);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    expect(body.destinationUrl).toBe(URL_VALUE);
    expect(body.style).toEqual(gradient);
    expect(omitted).toEqual([]);
  });

  it("strips an uploaded logo and turns showLogo off without it", () => {
    const { code, omitted } = restSnippet(urlInput(uploadedLogo));
    const style = restBody(code).style as ThemeStyles;
    expect(style.customLogo).toBeUndefined();
    expect(style.showLogo).toBe(false);
    expect(omitted).toEqual([LEFT_OUT.restLogo]);
    // The QRdx logo needs no image, so it stays.
    expect(
      (restBody(restSnippet(urlInput(qrdxLogo)).code).style as ThemeStyles)
        .showLogo,
    ).toBe(true);
  });

  it("strips art and keeps frames, custom ones included", () => {
    const withArt = restSnippet(urlInput(art));
    expect((restBody(withArt.code).style as ThemeStyles).art).toBeUndefined();
    expect(withArt.omitted).toEqual([LEFT_OUT.art]);
    const custom = restSnippet(urlInput(customFrame));
    const body = restBody(custom.code);
    expect(createCodeSchema.safeParse(body).success).toBe(true);
    expect((body.style as ThemeStyles).frame?.style).toBe("custom");
    expect(custom.omitted).toEqual([]);
  });

  it("uses the destination, not a dynamic short link", () => {
    const { code } = restSnippet({
      style: plain,
      value: "https://qrdx.dev/q/abc1234",
      contentType: "url",
      content: { type: "url", url: "https://example.org/real" },
    });
    expect(restBody(code).destinationUrl).toBe("https://example.org/real");
  });

  it("explains instead of sending a body for content that isn't a link", () => {
    const wifi = restSnippet({
      style: plain,
      value: "WIFI:T:WPA;S:Cafe;P:secret123;;",
      contentType: "wifi",
    });
    expect(wifi.code).toBe("");
    expect(wifi.unavailable).toBe(REST_UNAVAILABLE);
  });

  it("quotes apostrophes for the shell", () => {
    const { code } = restSnippet(
      urlInput({
        ...plain,
        frame: { style: "banner-bottom", text: "Let's eat" },
      }),
    );
    expect(code).toContain("Let'\\''s eat");
    expect(
      (restBody(code).style as ThemeStyles).frame as { text: string },
    ).toMatchObject({ text: "Let's eat" });
  });
});

// ─── MCP ─────────────────────────────────────────────────────────────────────

function mcpArgs(input: SnippetInput) {
  const snippet = mcpSnippet(input);
  const args = JSON.parse(snippet.code);
  const result = designQrInputSchema.safeParse(args);
  expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  const content = validateDesignContent(args.content);
  expect(content.ok, JSON.stringify(content)).toBe(true);
  return { args, omitted: snippet.omitted };
}

describe("mcpSnippet", () => {
  it("writes design_qr arguments for a plain style", () => {
    const { args, omitted } = mcpArgs(urlInput(plain));
    expect(args.content).toEqual({ type: "url", url: URL_VALUE });
    expect(args.style).toEqual({
      bgColor: "#FFFFFF",
      fgColor: "#1E3A8A",
      eyeColor: "#111111",
      dotColor: "#E11D48",
      bodyPattern: "rounded",
      cornerEyePattern: "extra-rounded",
      cornerEyeDotPattern: "circle",
      margin: 2,
      level: "M",
    });
    expect(omitted).toEqual([]);
  });

  it("maps gradients to two-color gradients", () => {
    const { args, omitted } = mcpArgs(urlInput(gradient));
    expect(args.style.gradients).toEqual({
      body: { type: "linear", from: "#6366F1", to: "#EC4899", angle: 135 },
      background: { type: "radial", from: "#FFFFFF", to: "#EEF2FF" },
    });
    expect(args.style.fgColor).toBe("#6366F1");
    expect(omitted).toEqual([LEFT_OUT.gradientMiddle]);
  });

  it("keeps built-in frames and leaves out custom ones", () => {
    const framed = mcpArgs(urlInput(builtInFrame));
    expect(framed.args.style.frame).toEqual({
      style: "banner-bottom",
      text: "Scan for the menu",
      color: "#1E3A8A",
      textColor: "#FFFFFF",
    });
    expect(framed.omitted).toEqual([]);
    const custom = mcpArgs(urlInput(customFrame));
    expect(custom.args.style.frame).toBeUndefined();
    expect(custom.omitted).toEqual([LEFT_OUT.customFrame]);
    const hidden = mcpArgs(
      urlInput({ ...plain, frame: { style: "banner-top", text: "" } }),
    );
    expect(hidden.omitted).toEqual([LEFT_OUT.frameLabelHidden]);
  });

  it("leaves out logos, art and retired shapes", () => {
    expect(mcpArgs(urlInput(qrdxLogo)).omitted).toEqual([LEFT_OUT.logo]);
    expect(mcpArgs(urlInput(uploadedLogo)).omitted).toEqual([LEFT_OUT.logo]);
    expect(mcpArgs(urlInput(art)).omitted).toEqual([LEFT_OUT.art]);
    const retired = mcpArgs(urlInput(retiredShapes));
    expect(retired.omitted).toEqual([
      'The "curly" eye shape',
      'The "star" eye center shape',
    ]);
    expect(retired.args.style.cornerEyePattern).toBeUndefined();
    expect(mcpArgs(urlInput(newerShapes)).args.style.bodyPattern).toBe(
      "liquid",
    );
  });

  it("passes other content types as their fields", () => {
    const { args } = mcpArgs({
      style: plain,
      value: "WIFI:T:WPA;S:Cafe;P:secret123;;",
      contentType: "wifi",
      content: {
        type: "wifi",
        ssid: "Cafe",
        password: "secret123",
        encryption: "WPA",
        hidden: false,
      },
    });
    expect(args.content).toEqual({
      type: "wifi",
      ssid: "Cafe",
      password: "secret123",
      encryption: "WPA",
    });
  });

  it("falls back to the payload as text without form fields", () => {
    const { args } = mcpArgs({
      style: plain,
      value: "MATMSG:TO:a@b.test;;",
      contentType: "email",
    });
    expect(args.content).toEqual({
      type: "text",
      text: "MATMSG:TO:a@b.test;;",
    });
  });
});

// ─── CLI ─────────────────────────────────────────────────────────────────────

/** Every option `qrdx generate` parses (packages/cli/src/commands/generate.ts). */
function cliOptions(): Set<string> {
  const source = readFileSync(
    join(root, "../../packages/cli/src/commands/generate.ts"),
    "utf8",
  );
  return new Set(
    [...source.matchAll(/case "(--?[a-z-]+)":/g)].map((m) => m[1]),
  );
}

describe("cliSnippet", () => {
  const options = cliOptions();

  it("uses only flags the CLI parses, with every option set", () => {
    const words = shellWords(cliSnippet(urlInput(plain)).code);
    expect(words.slice(0, 6)).toEqual([
      "npx",
      "@qrdx/cli",
      "generate",
      URL_VALUE,
      "-o",
      "qr.svg",
    ]);
    const flags = cliFlags(words);
    for (const flag of flags.keys()) {
      expect(options.has(flag), flag).toBe(true);
    }
    expect(Object.fromEntries(flags)).toMatchObject({
      "-o": "qr.svg",
      "--body": "rounded",
      "--eye": "extra-rounded",
      "--dot": "circle",
      "--fg": "#1e3a8a",
      "--bg": "#ffffff",
      "--eye-color": "#111111",
      "--dot-color": "#e11d48",
      "--level": "M",
      "--margin": "2",
      "--frame": "none",
      "--no-logo": true,
    });
  });

  it("passes gradients as JSON the CLI parses", () => {
    const flags = cliFlags(shellWords(cliSnippet(urlInput(gradient)).code));
    const fg = JSON.parse(flags.get("--fg") as string);
    expect(colorConfigSchema.safeParse(fg).success).toBe(true);
    expect(fg).toEqual(gradient.fgColor);
  });

  it("passes built-in frames and the logo, and leaves out uploads", () => {
    const framed = cliFlags(
      shellWords(cliSnippet(urlInput(builtInFrame)).code),
    );
    expect(Object.fromEntries(framed)).toMatchObject({
      "--frame": "banner-bottom",
      "--frame-text": "Scan for the menu",
      "--frame-color": "#1e3a8a",
      "--frame-text-color": "#ffffff",
    });
    const hiddenLabel = cliSnippet(
      urlInput({ ...plain, frame: { style: "banner-top", text: "" } }),
    ).code;
    expect(hiddenLabel).toContain("--frame-text ''");
    expect(cliSnippet(urlInput(customFrame)).omitted).toEqual([
      LEFT_OUT.customFrame,
    ]);
    expect(
      cliFlags(shellWords(cliSnippet(urlInput(qrdxLogo)).code)).get("--logo"),
    ).toBe("https://qrdx.dev/logo.png");
    const uploaded = cliSnippet(urlInput(uploadedLogo));
    expect(cliFlags(shellWords(uploaded.code)).get("--no-logo")).toBe(true);
    expect(uploaded.omitted).toEqual([LEFT_OUT.uploadedLogo]);
  });

  it("leaves out retired shapes the CLI rejects", () => {
    const { code, omitted } = cliSnippet(urlInput(retiredShapes));
    expect(code).not.toMatch(/curly|star/);
    expect(omitted).toEqual([
      'The "curly" eye shape',
      'The "star" eye center shape',
    ]);
  });

  it("quotes content for the shell", () => {
    const words = shellWords(
      cliSnippet(urlInput(plain, "it's a test & more")).code,
    );
    expect(words[3]).toBe("it's a test & more");
  });
});
