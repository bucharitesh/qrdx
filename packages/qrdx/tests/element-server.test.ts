// qrdx/element on a server (no DOM): importing it and calling
// defineQRdxCode are safe, and toQRdxCodeHTML writes the element with the
// core's markup in a declarative shadow root.
import { existsSync } from "node:fs";
import { describe, expect, it as test } from "vitest";
import { toSVGString } from "../src/core";
import * as source from "../src/element";
import { getOfficialFrame } from "../src/frames/official";
import type { QRSVGOptions } from "../types";
import { decodeQR, rasterizeSvg } from "./support/raster";

const VALUE = "https://qrdx.dev/q/Ab3dE9x";
const built = new URL("../dist/element.mjs", import.meta.url);

describe.each([
  ["source", async () => source],
  [
    "dist/element.mjs",
    async () =>
      existsSync(built)
        ? ((await import(/* @vite-ignore */ built.href)) as typeof source)
        : null,
  ],
] as const)("qrdx/element without a DOM (%s)", (_label, load) => {
  test("loads, and defineQRdxCode does nothing", async () => {
    const api = await load();
    if (!api) return;
    expect(typeof HTMLElement).toBe("undefined");
    expect(api.defineQRdxCode()).toBe(api.QRdxCodeElement);
  });

  test("writes the element with the drawn code in a declarative shadow root", async () => {
    const api = await load();
    if (!api) return;
    const spec = getOfficialFrame("wifi-card")?.spec;
    expect(spec).toBeDefined();
    const options: QRSVGOptions = {
      value: VALUE,
      size: 256,
      level: "Q",
      bodyPattern: "rounded",
      fgColor: "#0f172a",
      frame: { style: "custom", spec: spec as never },
    };
    const html = api.toQRdxCodeHTML(options, { label: "Guest Wi-Fi" });
    const svg = toSVGString({
      ...options,
      part: "svg",
      role: "img",
      "aria-label": "Guest Wi-Fi",
    });
    const props = JSON.stringify({ frame: options.frame }).replace(
      /"/g,
      "&quot;"
    );
    expect(html).toBe(
      `<qrdx-code value="${VALUE}" size="256" level="Q" fg-color="#0f172a" body-pattern="rounded" label="Guest Wi-Fi" props="${props}"><template shadowrootmode="open"><style>${api.QRDX_CODE_STYLES}</style>${svg}</template></qrdx-code>`
    );

    const image = rasterizeSvg(svg, { width: 900 });
    expect(decodeQR(image)).toBe(VALUE);
  });

  test("escapes attributes, leaves out customTemplate and checks the tag name", async () => {
    const api = await load();
    if (!api) return;
    const html = api.toQRdxCodeHTML(
      {
        value: 'a"b<c>&d',
        autoLevel: false,
        customTemplate: {
          id: "Mine",
          name: "Mine",
          wrapper: (children) => children,
        },
      },
      { tagName: "my-qr" }
    );
    expect(html.startsWith('<my-qr value="a&quot;b&lt;c&gt;&amp;d">')).toBe(
      true
    );
    expect(html).not.toContain("props=");
    expect(html).not.toContain("auto-level");
    expect(html).toContain('aria-label="QR code"');
    expect(() =>
      api.toQRdxCodeHTML({ value: VALUE }, { tagName: "qr" })
    ).toThrow(/not a custom element name/);
    expect(
      api.toQRdxCodeHTML({ value: "" }, { tagName: "my-qr" })
    ).not.toContain("<svg");
  });
});
