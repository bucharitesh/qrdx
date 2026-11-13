// @vitest-environment jsdom
// <qrdx-code> (qrdx/element) in a DOM: it draws the core's markup into its
// shadow root for every kind of option, maps attributes and properties,
// batches changes into one redraw, labels the code without ever reading the
// value out, exports, survives being moved and upgraded late, and takes over
// a server-rendered shadow root. The built files are checked the same way.
import { existsSync } from "node:fs";
import { fileURLToPath, URL as NodeURL, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, it as test, vi } from "vitest";
import { getOfficialFrame, h, toSVGString } from "../src/core";
import * as source from "../src/element";
import type { QRSVGOptions } from "../types";
import { decodeQR, rasterizeSvg } from "./support/raster";

type ElementModule = typeof source;

const VALUE = "https://qrdx.dev/q/Ab3dE9x";
const GRADIENT = {
  type: "linear" as const,
  angle: 45,
  stops: [
    { color: "#1d4ed8", offset: 0 },
    { color: "#0f172a", offset: 100 },
  ],
};

/** The options the shadow root's <svg> is drawn with. */
const drawn = (options: QRSVGOptions, label?: string): QRSVGOptions => ({
  ...options,
  part: "svg",
  role: "img",
  "aria-label": label ?? options["aria-label"] ?? "QR code",
});

/** Markup as the browser serializes it, for comparing with the DOM. */
function asParsed(markup: string): string {
  const holder = document.createElement("div");
  holder.innerHTML = markup;
  return holder.innerHTML;
}

/** The shadow root's drawn code, serialized. */
function shadowSVG(element: Element): string {
  const svg = element.shadowRoot?.querySelector("svg[part]");
  return svg ? svg.outerHTML : "";
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Counts the redraws of a shadow root (each replaces or adds its <svg>). */
function countRedraws(element: Element) {
  const records: MutationRecord[] = [];
  const observer = new MutationObserver((batch) => records.push(...batch));
  observer.observe(element.shadowRoot as ShadowRoot, { childList: true });
  return () => {
    records.push(...observer.takeRecords());
    observer.disconnect();
    return records.filter((record) =>
      [...record.addedNodes].some((node) => node.nodeName === "svg")
    ).length;
  };
}

let tagCount = 0;
/** Registers the module's element under a fresh tag name. */
function defineFresh(api: ElementModule) {
  tagCount += 1;
  const tag = `qrdx-test-${tagCount}`;
  api.defineQRdxCode(tag);
  return tag;
}

function create(tag: string, attributes: Record<string, string> = {}) {
  const element = document.createElement(tag) as source.QRdxCodeElement;
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  return element;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

const built = (file: string) =>
  fileURLToPath(new NodeURL(`../dist/${file}`, import.meta.url));
const load = (file: string) => async () =>
  existsSync(built(file))
    ? ((await import(
        /* @vite-ignore */ pathToFileURL(built(file)).href
      )) as ElementModule)
    : null;

describe.each([
  ["source", async () => source as ElementModule | null],
  ["dist/element.mjs", load("element.mjs")],
  ["dist/element.browser.mjs", load("element.browser.mjs")],
] as const)("<qrdx-code> (%s)", (label, loadModule) => {
  test("loads", async () => {
    // The engine is built before the tests in CI and before pushing
    if (label !== "source" && !existsSync(built(label.slice(5)))) return;
    expect(await loadModule()).not.toBeNull();
  });

  test("draws the core's markup from attributes and properties, and it decodes", async () => {
    const api = await loadModule();
    if (!api) return;
    const tag = defineFresh(api);
    const element = create(tag, {
      value: VALUE,
      size: "240",
      level: "q",
      "body-pattern": "rounded",
      "corner-eye-pattern": "rounded",
      "corner-eye-dot-pattern": "square",
      "bg-color": "#fef3c7",
      margin: "2",
      label: "Menu link",
    });
    element.fgColor = GRADIENT;
    element.frame = { style: "banner-bottom", text: "Scan me" };
    document.body.append(element);

    const options: QRSVGOptions = {
      value: VALUE,
      size: 240,
      level: "Q",
      bodyPattern: "rounded",
      cornerEyePattern: "rounded",
      cornerEyeDotPattern: "square",
      bgColor: "#fef3c7",
      margin: 2,
      fgColor: GRADIENT,
      frame: { style: "banner-bottom", text: "Scan me" },
    };
    expect(element.options).toEqual(options);
    expect(element.svg?.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(shadowSVG(element)).toBe(
      asParsed(toSVGString(drawn(options, "Menu link")))
    );
    expect(element.toSVGString()).toBe(toSVGString(options));

    const image = rasterizeSvg(element.toSVGString(), { width: 720 });
    expect(decodeQR(image)).toBe(VALUE);
  });

  test("batches changes into one redraw, and skips redraws that change nothing", async () => {
    const api = await loadModule();
    if (!api) return;
    const element = create(defineFresh(api), { value: VALUE });
    document.body.append(element);
    const first = element.svg;

    const redraws = countRedraws(element);
    element.setAttribute("size", "200");
    element.setAttribute("fg-color", "#be123c");
    element.bodyPattern = "diamond";
    element.eyeColor = "#0f766e";
    element.frame = { style: "banner-top", text: "Menu" };
    await flush();
    expect(redraws()).toBe(1);
    expect(first?.isConnected).toBe(false);
    expect(element.shadowRoot?.querySelectorAll("svg[part]")).toHaveLength(1);
    expect(shadowSVG(element)).toBe(
      asParsed(
        toSVGString(
          drawn({
            value: VALUE,
            size: 200,
            fgColor: "#be123c",
            bodyPattern: "diamond",
            eyeColor: "#0f766e",
            frame: { style: "banner-top", text: "Menu" },
          })
        )
      )
    );

    const current = element.svg;
    const again = countRedraws(element);
    element.setAttribute("size", "200.0");
    element.fgColor = "#be123c";
    element.props = {};
    await flush();
    expect(again()).toBe(0);
    expect(element.svg).toBe(current);
  });

  test("exports SVG and downloads", async () => {
    const api = await loadModule();
    if (!api) return;
    const element = create(defineFresh(api), { value: VALUE, size: "180" });
    document.body.append(element);

    const uri = await element.toDataURL("svg");
    expect(decodeURIComponent(uri.slice("data:image/svg+xml,".length))).toBe(
      toSVGString({ value: VALUE, size: 180 })
    );

    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      clicks.push(this.download);
    });
    await element.download({ format: "svg" });
    await element.download({ format: "svg", filename: "menu.svg", size: 400 });
    expect(clicks).toEqual(["qr-code.svg", "menu.svg"]);
  });
});

const LOGO = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#1d4ed8"/><circle cx="32" cy="32" r="18" fill="#fbbf24"/></svg>'
)}`;

/** Props covering each part of the renderer. */
const CASES: [string, QRSVGOptions][] = [
  ["defaults", { value: VALUE }],
  [
    "body pattern, eyes and eye dots",
    {
      value: VALUE,
      size: 256,
      bodyPattern: "diamond",
      cornerEyePattern: "rounded",
      cornerEyeDotPattern: "square",
    },
  ],
  [
    "linear gradient, radial background",
    {
      value: VALUE,
      fgColor: GRADIENT,
      bgColor: {
        type: "radial",
        stops: [
          { color: "#ffffff", offset: 0 },
          { color: "#e2e8f0", offset: 100 },
        ],
      },
    },
  ],
  [
    "per-eye colors",
    {
      value: VALUE,
      eyeColor: "#be123c",
      dotColor: "#0f766e",
      eyeColors: {
        topRight: { outer: GRADIENT },
        bottomLeft: { inner: "#2563eb" },
      },
    },
  ],
  [
    "image fill",
    {
      value: VALUE,
      level: "H",
      fgColor: { type: "image", src: LOGO, opacity: 0.85, underlay: "#1f2937" },
    },
  ],
  [
    "logo",
    {
      value: VALUE,
      level: "H",
      imageSettings: {
        src: LOGO,
        width: 30,
        height: 30,
        excavate: true,
        shape: "circle",
        plate: "#ffffff",
      },
    },
  ],
  [
    "frame style",
    { value: VALUE, frame: { style: "banner-bottom", text: "Scan me" } },
  ],
  [
    "official frame spec",
    {
      value: VALUE,
      size: 240,
      frame: {
        style: "custom",
        spec: getOfficialFrame("wifi-card")?.spec as never,
      },
    },
  ],
  ["built-in template", { value: VALUE, templateId: "DotRing" }],
  [
    "custom template written with h",
    {
      value: VALUE,
      customTemplate: {
        id: "Labelled",
        name: "Labelled",
        wrapper: (children, props) =>
          h(
            "svg",
            { viewBox: "0 0 300 340", xmlns: "http://www.w3.org/2000/svg" },
            h("g", { transform: "translate(20, 20) scale(0.87)" }, children),
            h(
              "text",
              { x: "150", y: "325", textAnchor: "middle" },
              props?.label
            )
          ),
      },
      customProps: { label: "Scan me" },
    },
  ],
  ["circle shape", { value: VALUE, shape: "circle", margin: 3 }],
  ["module scale, level L", { value: VALUE, level: "L", moduleScale: 0.7 }],
  [
    "markup in the value, root attributes",
    {
      value: "Grüße <script>&'\"",
      className: "qr",
      style: { maxWidth: 200 },
      "data-id": "7",
      "aria-label": "Greeting",
    },
  ],
];

describe("<qrdx-code> renders like the core", () => {
  const tag = defineFresh(source);

  it.each(CASES)("%s", (_name, props) => {
    const element = create(tag);
    element.props = props;
    document.body.append(element);
    expect(shadowSVG(element)).toBe(asParsed(toSVGString(drawn(props))));
    expect(element.toSVGString()).toBe(toSVGString(props));
  });

  it("an official frame's code decodes", () => {
    const element = create(tag);
    element.props = CASES[7]?.[1];
    document.body.append(element);
    const image = rasterizeSvg(element.toSVGString(), { width: 900 });
    expect(decodeQR(image)).toBe(VALUE);
  });
});

describe("attributes and properties", () => {
  const tag = defineFresh(source);

  it("maps every attribute to its option", () => {
    const element = create(tag, {
      value: VALUE,
      size: "300",
      level: "h",
      "fg-color": "#111827",
      "bg-color": "#f9fafb",
      "eye-color": "#1d4ed8",
      "dot-color": "#be123c",
      "body-pattern": "circle",
      "corner-eye-pattern": "gear",
      "corner-eye-dot-pattern": "circle",
      margin: "4",
      "template-id": "DotRing",
      "module-scale": "0.8",
      "auto-level": "",
      shape: "circle",
    });
    expect(element.options).toEqual({
      value: VALUE,
      size: 300,
      level: "H",
      fgColor: "#111827",
      bgColor: "#f9fafb",
      eyeColor: "#1d4ed8",
      dotColor: "#be123c",
      bodyPattern: "circle",
      cornerEyePattern: "gear",
      cornerEyeDotPattern: "circle",
      margin: 4,
      templateId: "DotRing",
      moduleScale: 0.8,
      autoLevel: true,
      shape: "circle",
    });
    expect(element.size).toBe(300);
    expect(element.level).toBe("H");
  });

  it("ignores values it can't read, and drops removed attributes", () => {
    const element = create(tag, {
      value: VALUE,
      size: "big",
      level: "X",
      margin: "",
      "auto-level": "false",
    });
    expect(element.options).toEqual({ value: VALUE, autoLevel: false });
    element.setAttribute("size", "256");
    element.removeAttribute("auto-level");
    expect(element.options).toEqual({ value: VALUE, size: 256 });
    element.removeAttribute("size");
    expect(element.options).toEqual({ value: VALUE });
  });

  it("lets attributes and named properties win over props, last write first", () => {
    const element = create(tag, { size: "200" });
    element.props = { value: "from props", size: 120, fgColor: "#000000" };
    expect(element.options).toEqual({
      value: "from props",
      size: 200,
      fgColor: "#000000",
    });
    element.size = 320;
    expect(element.options.size).toBe(320);
    element.setAttribute("size", "160");
    expect(element.size).toBe(160);
    element.size = undefined;
    expect(element.options.size).toBe(120);
  });

  it("reads props as JSON from the attribute, and reports bad JSON", () => {
    const element = create(tag, {
      value: VALUE,
      props: JSON.stringify({ frame: { style: "banner-bottom", text: "Hi" } }),
    });
    document.body.append(element);
    expect(element.props).toEqual({
      frame: { style: "banner-bottom", text: "Hi" },
    });
    expect(shadowSVG(element)).toContain("Hi</text>");

    const errors: unknown[] = [];
    element.addEventListener("qrdx-error", (event) => {
      event.preventDefault();
      errors.push((event as CustomEvent<source.QRdxCodeErrorDetail>).detail);
    });
    element.setAttribute("props", "{not json");
    element.setAttribute("props", "[1]");
    expect(errors).toHaveLength(2);
    expect(element.props).toEqual({
      frame: { style: "banner-bottom", text: "Hi" },
    });

    // React 19 and Vue set a string prop as a property
    element.props = '{"fgColor":"#0f766e"}';
    expect(element.props).toEqual({ fgColor: "#0f766e" });
  });
});

describe("accessibility", () => {
  const tag = defineFresh(source);

  it("is an image labelled by `label`, or 'QR code', never by its value", () => {
    const wifi = "WIFI:T:WPA;S:Home;P:correct-horse-battery;;";
    const element = create(tag, { value: wifi });
    document.body.append(element);
    const svg = element.svg;
    expect(svg?.getAttribute("role")).toBe("img");
    expect(svg?.getAttribute("aria-label")).toBe("QR code");
    expect(svg?.getAttribute("part")).toBe("svg");
    expect(element.shadowRoot?.innerHTML).not.toContain("correct-horse");

    element.label = "Wi-Fi for guests";
    expect(element.svg?.getAttribute("aria-label")).toBe("Wi-Fi for guests");
    element.setAttribute("label", "  ");
    expect(element.svg?.getAttribute("aria-label")).toBe("QR code");
    element.removeAttribute("label");
    element.props = { "aria-label": "Guest network" };
    expect(element.svg?.getAttribute("aria-label")).toBe("Guest network");
  });

  it("puts the part and the label on a frame's outer <svg>", () => {
    const element = create(tag, { value: VALUE, label: "Scan for the menu" });
    element.frame = { style: "banner-bottom", text: "Menu" };
    document.body.append(element);
    const svg = element.shadowRoot?.querySelector("svg");
    expect(svg?.getAttribute("part")).toBe("svg");
    expect(svg?.getAttribute("aria-label")).toBe("Scan for the menu");
    expect(svg?.querySelector("[data-qrdx-frame]")).not.toBeNull();
  });
});

describe("lifecycle", () => {
  const tag = defineFresh(source);

  it("draws nothing without a value, and refuses to export", async () => {
    const element = create(tag);
    document.body.append(element);
    expect(element.svg).toBeNull();
    expect(element.shadowRoot?.querySelector("style")).not.toBeNull();
    expect(() => element.toSVGString()).toThrow(/has no value/);
    await expect(element.toDataURL("svg")).rejects.toThrow(/has no value/);

    element.value = VALUE;
    await flush();
    expect(element.svg).not.toBeNull();
    element.setAttribute("value", "");
    await flush();
    expect(element.shadowRoot?.querySelector("svg")).toBeNull();
  });

  it("reports a value too long to encode with a qrdx-error event", async () => {
    const element = create(tag, { value: VALUE });
    document.body.append(element);
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    element.value = "x".repeat(5000);
    await flush();
    expect(element.svg).toBeNull();
    expect(logged).toHaveBeenCalledTimes(1);

    const handled = vi.fn((event: Event) => event.preventDefault());
    element.addEventListener("qrdx-error", handled);
    element.size = 300;
    await flush();
    expect(handled).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledTimes(1);

    element.value = VALUE;
    await flush();
    expect(element.svg).not.toBeNull();
  });

  it("waits while disconnected, keeps its code when moved, and has nothing left to run after removal", async () => {
    const element = create(tag, { value: VALUE });
    document.body.append(element);
    const svg = element.svg;
    element.remove();

    const redraws = countRedraws(element);
    element.size = 222;
    await flush();
    expect(redraws()).toBe(0);
    expect(element.shadowRoot?.querySelector("svg")).toBe(svg);

    const holder = document.createElement("section");
    document.body.append(holder);
    holder.append(element);
    expect(element.svg?.getAttribute("width")).toBe("222");

    element.remove();
    element.fgColor = "#be123c";
    await flush();
    expect(element.isConnected).toBe(false);
  });

  it("applies properties set before the element was defined", () => {
    const tag = "qrdx-late-1";
    const element = document.createElement(tag) as source.QRdxCodeElement & {
      [key: string]: unknown;
    };
    element.value = VALUE;
    element.frame = { style: "banner-bottom", text: "Early" };
    element.props = { size: 210 };
    document.body.append(element);
    expect(element.shadowRoot).toBeNull();

    source.defineQRdxCode(tag);
    expect(element).toBeInstanceOf(source.QRdxCodeElement);
    expect(Object.hasOwn(element, "frame")).toBe(false);
    expect(element.options).toEqual({
      size: 210,
      value: VALUE,
      frame: { style: "banner-bottom", text: "Early" },
    });
    expect(shadowSVG(element)).toContain("Early</text>");
  });

  it("takes over a server-rendered shadow root", () => {
    const options = { value: VALUE, size: 200 };
    const html = source.toQRdxCodeHTML(options, { tagName: "qrdx-late-2" });
    // jsdom doesn't attach declarative shadow roots, so attach one by hand
    const element = document.createElement("qrdx-late-2");
    const shadow = element.attachShadow({ mode: "open" });
    shadow.innerHTML = html.slice(
      html.indexOf(">", html.indexOf("<template")) + 1,
      html.lastIndexOf("</template>")
    );
    element.setAttribute("value", VALUE);
    element.setAttribute("size", "200");
    document.body.append(element);
    const ssr = shadow.querySelector("svg");

    source.defineQRdxCode("qrdx-late-2");
    expect(element.shadowRoot).toBe(shadow);
    expect(shadow.children).toHaveLength(2);
    expect(shadow.querySelectorAll("style")).toHaveLength(1);
    expect(ssr?.isConnected).toBe(false);
    expect(shadowSVG(element)).toBe(asParsed(toSVGString(drawn(options))));
  });
});

describe("defineQRdxCode", () => {
  it("registers once, gives other names a subclass, and refuses a taken name", () => {
    class Other extends HTMLElement {}
    customElements.define("qrdx-taken", Other);
    const first = source.defineQRdxCode("qrdx-one");
    expect(source.defineQRdxCode("qrdx-one")).toBe(first);
    const second = source.defineQRdxCode("qrdx-two");
    expect(second.prototype).toBeInstanceOf(source.QRdxCodeElement);
    expect(customElements.get("qrdx-two")).toBe(second);
    expect(() => source.defineQRdxCode("qrdx-taken")).toThrow(
      /already defined by another element/
    );
  });

  it("qrdx/element/define registers <qrdx-code>", async () => {
    expect(customElements.get("qrdx-code")).toBeUndefined();
    const api = await import("../src/element-define");
    expect(customElements.get("qrdx-code")).toBeDefined();
    const element = document.createElement("qrdx-code");
    expect(element).toBeInstanceOf(api.QRdxCodeElement);
  });
});

describe("toQRdxCodeHTML", () => {
  it("round-trips: the element reads back the options it was written with", () => {
    const options: QRSVGOptions = {
      value: 'Tom & "Jerry" <3',
      size: 220,
      level: "H",
      bodyPattern: "rounded",
      autoLevel: true,
      fgColor: GRADIENT,
      frame: { style: "banner-bottom", text: "Scan & go" },
      imageSettings: {
        src: "data:image/png;base64,AAAA",
        width: 40,
        height: 40,
        excavate: true,
      },
    };
    const html = source.toQRdxCodeHTML(options, {
      tagName: "qrdx-roundtrip",
      label: "Ticket",
    });
    source.defineQRdxCode("qrdx-roundtrip");
    const holder = document.createElement("div");
    holder.innerHTML = html;
    const element = holder.firstElementChild as source.QRdxCodeElement;
    expect(element.options).toEqual(options);
    expect(element.label).toBe("Ticket");
  });
});
