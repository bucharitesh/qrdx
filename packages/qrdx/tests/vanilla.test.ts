// @vitest-environment jsdom
// qrdx/vanilla in a DOM: createQRCode draws the code into an element, keeps
// it up to date, exports it and cleans up after itself. The built no-bundler
// file (dist/vanilla.browser.mjs) is checked the same way when it exists.
import { existsSync } from "node:fs";
import { afterEach, describe, expect, it, it as test, vi } from "vitest";
import * as vanilla from "../src/vanilla";
import type { QRSVGOptions } from "../types";
import { decodeQR, rasterizeSvg } from "./support/raster";

const VALUE = "https://qrdx.dev/q/Ab3dE9x";
const OPTIONS: QRSVGOptions = {
  value: VALUE,
  size: 200,
  level: "Q",
  bodyPattern: "rounded",
  fgColor: {
    type: "linear",
    angle: 45,
    stops: [
      { color: "#1d4ed8", offset: 0 },
      { color: "#0f172a", offset: 100 },
    ],
  },
  frame: { style: "banner-bottom", text: "Scan me" },
  className: "qr",
  "aria-label": "QR code",
};

/** Markup as the browser serializes it, for comparing with the DOM. */
function asParsed(markup: string): string {
  const holder = document.createElement("div");
  holder.innerHTML = markup;
  return holder.innerHTML;
}

function mount() {
  const container = document.createElement("div");
  container.id = "qr";
  document.body.append(container);
  return container;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

// Through a variable, so Vite leaves the URL alone under jsdom (it rewrites
// `new URL("…", import.meta.url)` into a served asset URL there, which
// existsSync never finds)
const HERE = import.meta.url;
const builtFile = new URL("../dist/vanilla.browser.mjs", HERE);

describe.each([
  ["source", async () => vanilla],
  [
    "dist/vanilla.browser.mjs",
    async () =>
      existsSync(builtFile)
        ? ((await import(/* @vite-ignore */ builtFile.href)) as typeof vanilla)
        : null,
  ],
] as const)("createQRCode (%s)", (_label, load) => {
  test("draws the core's markup into the element, and it decodes", async () => {
    const api = await load();
    if (!api) return;
    const container = mount();
    const qr = api.createQRCode(container, OPTIONS);

    expect(container.children).toHaveLength(1);
    expect(qr.svg).toBe(container.firstElementChild);
    expect(qr.svg?.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(container.innerHTML).toBe(asParsed(vanilla.toSVGString(OPTIONS)));
    expect(qr.toSVGString()).toBe(vanilla.toSVGString(OPTIONS));
    expect(qr.svg?.getAttribute("class")).toBe("qr");

    const image = rasterizeSvg(qr.toSVGString(), { width: 600 });
    expect(decodeQR(image)).toBe(VALUE);
  });

  test("updates in place, and leaves the page alone when nothing changes", async () => {
    const api = await load();
    if (!api) return;
    const container = mount();
    const qr = api.createQRCode("#qr", { value: VALUE, size: 160 });
    const first = qr.svg;

    qr.update({ size: 160 });
    expect(qr.svg).toBe(first);

    qr.update({ fgColor: "#be123c", bodyPattern: "diamond" });
    expect(qr.svg).not.toBe(first);
    expect(first?.isConnected).toBe(false);
    expect(container.children).toHaveLength(1);
    expect(qr.options).toMatchObject({
      value: VALUE,
      size: 160,
      fgColor: "#be123c",
    });
    expect(container.innerHTML).toBe(
      asParsed(
        vanilla.toSVGString({
          value: VALUE,
          size: 160,
          fgColor: "#be123c",
          bodyPattern: "diamond",
        })
      )
    );

    // undefined drops an option
    qr.update({ fgColor: undefined, bodyPattern: undefined });
    expect(container.innerHTML).toBe(
      asParsed(vanilla.toSVGString({ value: VALUE, size: 160 }))
    );
  });

  test("exports SVG and downloads", async () => {
    const api = await load();
    if (!api) return;
    const qr = api.createQRCode(mount(), { value: VALUE, size: 180 });

    const uri = await qr.toDataURL("svg");
    expect(uri.startsWith("data:image/svg+xml,")).toBe(true);
    expect(decodeURIComponent(uri.slice("data:image/svg+xml,".length))).toBe(
      qr.toSVGString()
    );

    const clicks: { href: string; download: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      clicks.push({ href: this.href, download: this.download });
    });
    await qr.download({ format: "svg" });
    await qr.download({ format: "svg", filename: "menu.svg", size: 400 });
    expect(clicks.map((click) => click.download)).toEqual([
      "qr-code.svg",
      "menu.svg",
    ]);
    expect(clicks[0]?.href).toBe(uri);
    expect(decodeURIComponent(clicks[1]?.href ?? "")).toContain('width="400"');
  });

  test("destroys cleanly", async () => {
    const api = await load();
    if (!api) return;
    const container = mount();
    const qr = api.createQRCode(container, { value: VALUE });
    const markup = qr.toSVGString();

    qr.destroy();
    expect(container.children).toHaveLength(0);
    expect(qr.svg).toBeNull();
    expect(() => qr.update({ size: 300 })).toThrow(/destroyed/);
    expect(() => qr.destroy()).not.toThrow();
    // The last markup stays readable
    expect(qr.toSVGString()).toBe(markup);
  });

  test("refuses a selector that matches nothing", async () => {
    const api = await load();
    if (!api) return;
    expect(() => api.createQRCode("#missing", { value: VALUE })).toThrow(
      /no element matches #missing/
    );
  });
});

describe("toSVGElement", () => {
  it("builds the same SVG as the markup, in the SVG namespace", () => {
    const element = vanilla.toSVGElement(OPTIONS);
    expect(element.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(element.querySelector("text")?.textContent).toBe("Scan me");
    const holder = document.createElement("div");
    holder.append(element);
    expect(holder.innerHTML).toBe(asParsed(vanilla.toSVGString(OPTIONS)));
  });
});
