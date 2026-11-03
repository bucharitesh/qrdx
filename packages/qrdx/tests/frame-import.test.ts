// The SVG importer (src/frame-import.ts) turns an uploaded SVG into a frame
// spec. These fixtures are hostile on purpose: XSS payloads, external
// references, entity expansion, huge or deeply nested markup and inputs
// built to make regular expressions backtrack. The importer must never
// throw, never let markup, URLs or script through, and always say what it
// dropped.
import { describe, expect, it } from "vitest";
import { getQRAsEPS } from "../src/eps";
import { getFrameLayout } from "../src/frame";
import {
  FRAME_IMPORT_LIMITS,
  type FrameImportResult,
  importFrameSvg,
} from "../src/frame-import";
import { getQRAsPrintPDFBuffer } from "../src/print";
import type { FrameSpec } from "../types";
import { frameSpecSchema } from "../types/frame-spec";
import { renderSvg } from "./support/qr";

const FRAME = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="720" viewBox="0 0 600 720">
  <rect x="0" y="0" width="600" height="720" rx="40" fill="#1E3A8A"/>
  <rect x="40" y="40" width="520" height="520" rx="16" fill="#FFFFFF"/>
  <rect id="qr" x="70" y="70" width="460" height="460" fill="#CCCCCC"/>
  <rect x="60" y="590" width="480" height="90" rx="45" fill="none" stroke="#F59E0B" stroke-width="8"/>
  <path d="M280 600 L320 600 L300 630 Z" fill="#F59E0B"/>
</svg>`;

function expectOk(result: FrameImportResult): FrameSpec {
  if (!result.ok) {
    throw new Error(`Import failed: ${result.error}`);
  }
  return result.spec;
}

function codes(result: FrameImportResult) {
  return result.warnings.map((warning) => warning.code).sort();
}

/**
 * Everything that ends up in output for this spec, as text: the spec and
 * the SVG the engine draws from it (minus the engine's own SVG namespace).
 */
function outputs(spec: FrameSpec): string {
  return [
    JSON.stringify(spec),
    renderSvg({
      value: "qrdx",
      size: 200,
      frame: { style: "custom", spec },
    }).replaceAll(' xmlns="http://www.w3.org/2000/svg"', ""),
  ].join("\n");
}

const FORBIDDEN =
  /<script|javascript:|alert\(|onload|onclick|onerror|https?:|url\(|href|xlink|foreignObject|<image|<use|data:/i;

describe("importing a frame", () => {
  it("converts shapes, strokes, colors and the QR placeholder", () => {
    const result = importFrameSvg(FRAME);
    const spec = expectOk(result);
    expect(result.warnings).toEqual([]);
    // The longer side becomes 1000 units
    expect(spec.artboard).toEqual({ width: 833.3, height: 1000 });
    // The placeholder sets the QR box and isn't drawn
    expect(spec.qr.x).toBeCloseTo(97.2, 0);
    expect(spec.qr.size).toBeCloseTo(638.8, 0);
    expect(spec.shapes.length).toBeLessThan(5);
    expect(spec.shapes.every((shape) => shape.type === "path")).toBe(true);
    expect(JSON.stringify(spec)).not.toContain("cccccc");
    // The biggest color is themeable as the frame color, the next as accent
    expect(spec.colors).toEqual({ frame: "#1e3a8a", accent: "#f59e0b" });
    expect(result.palette.map((entry) => entry.ref)).toEqual([
      "frame",
      "accent",
      "fixed",
    ]);
    // The stroked pill became an even-odd ring
    expect(
      spec.shapes.some(
        (shape) => "fillRule" in shape && shape.fillRule === "evenodd"
      )
    ).toBe(true);
    expect(frameSpecSchema.safeParse(spec).success).toBe(true);
    const layout = getFrameLayout(300, { style: "custom", spec });
    expect(layout.qrSize).toBe(300);
  });

  it("writes path data only from parsed numbers", () => {
    const spec = expectOk(importFrameSvg(FRAME));
    for (const shape of spec.shapes) {
      if (shape.type === "path") {
        expect(shape.d).toMatch(/^[mlhvcz0-9 .-]+$/);
      }
    }
  });

  it("renders the imported frame in SVG, PDF and EPS", async () => {
    const spec = expectOk(importFrameSvg(FRAME));
    const props = {
      value: "https://qrdx.dev",
      size: 256,
      frame: { style: "custom", spec } as const,
    };
    expect(renderSvg(props)).toContain('data-qrdx-frame="custom"');
    const eps = await getQRAsEPS(props, { sizeMm: 30 });
    expect(eps).not.toMatch(/NaN|Infinity/);
    const pdf = await getQRAsPrintPDFBuffer(props, { size: 30 });
    expect(
      new TextDecoder().decode(new Uint8Array(pdf)).startsWith("%PDF-")
    ).toBe(true);
  });

  it("centers the code when there is no placeholder, and says so", () => {
    const result = importFrameSvg(FRAME.replace(' id="qr"', ""));
    const spec = expectOk(result);
    expect(codes(result)).toContain("qr-placed");
    expect(spec.qr.size).toBeCloseTo(0.6 * 833.3, 0);
  });

  it("takes the QR box from the options", () => {
    const spec = expectOk(
      importFrameSvg(FRAME.replace(' id="qr"', ""), {
        qr: { x: 70, y: 70, size: 460 },
      })
    );
    expect(spec.qr.x).toBeCloseTo(97.2, 0);
  });

  it("refuses a QR area under half the shorter side", () => {
    const result = importFrameSvg(FRAME, { qr: { x: 10, y: 10, size: 100 } });
    // The placeholder wins over the option; without it the option applies
    expect(result.ok).toBe(true);
    const small = importFrameSvg(FRAME.replace(' id="qr"', ""), {
      qr: { x: 100, y: 100, size: 100 },
    });
    expect(small.ok).toBe(false);
  });

  it("flattens gradients to their first stop and says so", () => {
    const result =
      importFrameSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <defs><linearGradient id="g"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient></defs>
      <rect width="100" height="100" fill="url(#g)"/></svg>`);
    const spec = expectOk(result);
    expect(spec.colors.frame).toBe("#ff0000");
    expect(codes(result)).toContain("gradient");
  });

  it("drops shapes outside the artboard and cuts the ones across its edge", () => {
    const result =
      importFrameSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <rect x="-50" y="-50" width="100" height="100" fill="#000"/>
      <rect x="200" y="200" width="10" height="10" fill="#000"/></svg>`);
    const spec = expectOk(result);
    expect(codes(result)).toEqual(["clipped", "outside", "qr-placed"]);
    expect(frameSpecSchema.safeParse(spec).success).toBe(true);
  });

  it("merges colors past the limit", () => {
    const rects = Array.from(
      { length: 12 },
      (_, i) =>
        `<rect x="${i * 8}" y="0" width="8" height="8" fill="#${(i * 20).toString(16).padStart(2, "0")}0000"/>`
    ).join("");
    const result = importFrameSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${rects}</svg>`
    );
    expectOk(result);
    if (result.ok) {
      expect(result.palette.length).toBe(FRAME_IMPORT_LIMITS.maxColors);
    }
    expect(codes(result)).toContain("colors");
  });
});

describe("hostile SVG", () => {
  it("strips script, handlers, links and foreign content (XSS)", () => {
    const result =
      importFrameSvg(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100" onload="alert(1)">
      <script>alert(document.cookie)</script>
      <script xlink:href="https://evil.example/x.js"/>
      <style>@import url(https://evil.example/x.css); rect { fill: url(javascript:alert(1)) }</style>
      <rect width="100" height="100" fill="#111111" onclick="alert(2)" onmouseover="alert(3)"/>
      <a href="javascript:alert(4)"><rect x="10" y="10" width="10" height="10" fill="#ff0000"/></a>
      <a xlink:href="https://evil.example"><circle cx="90" cy="90" r="5" fill="#00ff00"/></a>
      <foreignObject width="100" height="100"><iframe xmlns="http://www.w3.org/1999/xhtml" src="https://evil.example"></iframe></foreignObject>
      <text x="0" y="10">&lt;script&gt;alert(5)&lt;/script&gt;</text>
      <animate attributeName="href" values="javascript:alert(6)"/>
      <set attributeName="onmouseover" to="alert(7)"/>
    </svg>`);
    const spec = expectOk(result);
    expect(codes(result)).toEqual(
      expect.arrayContaining([
        "animation",
        "foreign-object",
        "handlers",
        "links",
        "script",
        "style",
        "text",
      ])
    );
    expect(outputs(spec)).not.toMatch(FORBIDDEN);
  });

  it("drops images, <use>, external paint and filters (no external references)", () => {
    const result =
      importFrameSvg(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100">
      <image xlink:href="https://tracker.example/pixel.png" width="1" height="1"/>
      <image href="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" width="10" height="10"/>
      <use xlink:href="https://evil.example/sprite.svg#icon"/>
      <use href="#local"/>
      <filter id="f"><feImage href="https://evil.example/f.png"/></filter>
      <rect width="100" height="100" fill="#222222" filter="url(#f)"/>
      <rect x="10" y="10" width="20" height="20" fill="url(https://evil.example/p.svg#g)"/>
      <rect x="40" y="40" width="20" height="20" style="fill: url('http://evil.example/x')"/>
      <rect x="70" y="70" width="20" height="20" mask="url(https://evil.example/m)" fill="#333333"/>
    </svg>`);
    const spec = expectOk(result);
    expect(codes(result)).toEqual(
      expect.arrayContaining(["effects", "external-paint", "image", "use"])
    );
    expect(outputs(spec)).not.toMatch(FORBIDDEN);
  });

  it("refuses DOCTYPE and entity declarations (billion laughs, XXE)", () => {
    const laughs = `<?xml version="1.0"?>
<!DOCTYPE svg [
  <!ENTITY lol "lol">
  <!ENTITY lol1 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
  <!ENTITY lol2 "&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;">
]>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#000"/><text>&lol2;</text></svg>`;
    const xxe = `<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg viewBox="0 0 10 10"><text>&xxe;</text></svg>`;
    const bare = `<svg viewBox="0 0 10 10"><!ENTITY x "y"><rect width="10" height="10"/></svg>`;
    for (const svg of [laughs, xxe, bare]) {
      const result = importFrameSvg(svg);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/DOCTYPE|declaration/i);
    }
  });

  it("refuses processing instructions such as xml-stylesheet", () => {
    const result = importFrameSvg(
      `<?xml version="1.0"?><?xml-stylesheet href="https://evil.example/x.css"?><svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>`
    );
    expect(result.ok).toBe(false);
  });

  it("survives invalid character references", () => {
    const result = importFrameSvg(
      `<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="&#x110000;&#xD800;&#0;"/><rect width="10" height="10" fill="&#x23;000000"/></svg>`
    );
    expect(result.ok).toBe(true);
  });

  it("can't smuggle markup through a quoted attribute", () => {
    for (const svg of [
      `<svg viewBox="0 0 10 10"><path d='M0 0L10 10"/><script>alert(1)</script>'/></svg>`,
      `<svg viewBox="0 0 10 10"><path d="M0 0L10 10'/><script>alert(1)</script>"/></svg>`,
      `<svg viewBox="0 0 10 10"><rect width="10" height="10" fill=#000/></svg>`,
    ]) {
      expect(importFrameSvg(svg).ok).toBe(false);
    }
    const tail = importFrameSvg(
      `<svg viewBox="0 0 10 10"><path d="M0 0L10 0L10 10Z javascript:alert(1)" fill="#000"/></svg>`
    );
    expect(outputs(expectOk(tail))).not.toMatch(FORBIDDEN);
  });

  it("caps size, element count, depth and path segments", () => {
    const big = `<svg viewBox="0 0 10 10"><!--${"x".repeat(FRAME_IMPORT_LIMITS.maxBytes)}--></svg>`;
    const many = `<svg viewBox="0 0 10 10">${'<rect width="1" height="1"/>'.repeat(600)}</svg>`;
    const deep = `<svg viewBox="0 0 10 10">${"<g>".repeat(20)}<rect width="1" height="1"/>${"</g>".repeat(20)}</svg>`;
    const long = `<svg viewBox="0 0 10 10"><path d="M0 0${" L1 1 L2 2".repeat(2100)}"/></svg>`;
    const cases: [string, RegExp][] = [
      [big, /KB/],
      [many, /elements/],
      [deep, /deep/],
      [long, /segments/],
    ];
    for (const [svg, message] of cases) {
      const result = importFrameSvg(svg);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(message);
    }
  });

  it("answers fast on inputs built to make the parser backtrack", () => {
    const inputs = [
      "<a ".repeat(60_000),
      `<svg ${"a".repeat(150_000)}>`,
      `<svg a="${"x".repeat(150_000)}`,
      `<svg ${"a=b ".repeat(40_000)}>`,
      `<svg><!--${"-".repeat(150_000)}`,
      `<svg>${"<".repeat(150_000)}`,
      `<svg><![CDATA[${"]".repeat(150_000)}`,
      `<svg>${"<g ".repeat(50_000)}`,
    ];
    for (const svg of inputs) {
      const start = performance.now();
      const result = importFrameSvg(svg);
      expect(result.ok).toBe(false);
      expect(performance.now() - start).toBeLessThan(250);
    }
  });

  it("rejects non-strings, missing roots and unclosed tags", () => {
    expect(importFrameSvg(42 as unknown as string).ok).toBe(false);
    expect(importFrameSvg("").ok).toBe(false);
    expect(importFrameSvg("<html><svg/></html>").ok).toBe(false);
    expect(importFrameSvg('<svg viewBox="0 0 1 1"><g>').ok).toBe(false);
    expect(importFrameSvg('<svg viewBox="0 0 1 1"><g></svg></g>').ok).toBe(
      false
    );
    expect(importFrameSvg('<svg viewBox="0 0 1 1"></svg>').ok).toBe(false);
  });

  it("never throws on mutated markup, and every success validates", () => {
    // Deterministic fuzzing: insert, delete and duplicate characters that
    // matter to XML and path data.
    let seed = 7;
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    const alphabet = `<>"'&;=/!?-[]#() \n0123456789.MLCZAmlcza`;
    let successes = 0;
    for (let round = 0; round < 300; round++) {
      let svg = FRAME;
      const edits = 1 + Math.floor(random() * 6);
      for (let e = 0; e < edits; e++) {
        const at = Math.floor(random() * svg.length);
        const kind = random();
        if (kind < 0.5) {
          svg =
            svg.slice(0, at) +
            (alphabet[Math.floor(random() * alphabet.length)] as string) +
            svg.slice(at);
        } else if (kind < 0.8) {
          svg = svg.slice(0, at) + svg.slice(at + 1 + Math.floor(random() * 8));
        } else {
          svg = svg.slice(0, at) + svg.slice(at, at + 20) + svg.slice(at);
        }
      }
      let result: FrameImportResult | undefined;
      expect(() => {
        result = importFrameSvg(svg);
      }).not.toThrow();
      if (result?.ok) {
        successes++;
        expect(frameSpecSchema.safeParse(result.spec).success).toBe(true);
        expect(outputs(result.spec)).not.toMatch(/NaN|Infinity|<script/);
        expect(() =>
          getFrameLayout(128, {
            style: "custom",
            spec: result?.ok ? result.spec : (undefined as never),
          })
        ).not.toThrow();
      }
    }
    expect(successes).toBeGreaterThan(30);
  });
});
