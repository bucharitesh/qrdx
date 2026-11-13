// @vitest-environment jsdom
// qrdx/vue: the QRCode and QRCodeSVG components draw the core's markup with
// Vue's own elements, on the server (vue/server-renderer) and in the
// browser, hydrate without a mismatch, follow their props and clean up on
// unmount; useQRCode returns the same markup as a composable. The built
// dist/vue.mjs is checked the same way when it exists.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, it as test, vi } from "vitest";
import {
  type Component,
  createApp,
  createSSRApp,
  h,
  nextTick,
  reactive,
  ref,
} from "vue";
import { renderToString as renderVue } from "vue/server-renderer";
import { resolveQRCodeProps, toSVGString } from "../src/core";
import { getOfficialFrame } from "../src/frames/official";
import * as source from "../src/vue";
import type { QRSVGOptions } from "../types";
import { type ParityCase, parityCases } from "./support/parity-cases";
import { decodeQR, rasterizeSvg } from "./support/raster";

type VueEntry = typeof source;

const VALUE = "https://qrdx.dev/q/Ab3dE9x";
const LOGO = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#1d4ed8"/><circle cx="32" cy="32" r="18" fill="#fbbf24"/></svg>'
)}`;

// Every pattern, eye and dot, gradients, image fills, logos (both APIs),
// every frame style, built-in and official frame specs, shapes, art,
// templates (built-in and custom), markers and root attributes.
const CASES = parityCases();

// A path, not `new URL(…, import.meta.url)`, which Vite rewrites to an
// http:// asset URL under the jsdom environment
const builtFile = join(
  dirname(fileURLToPath(import.meta.url)),
  "../dist/vue.mjs"
);
// The engine is built before the tests in CI and before pushing; without a
// dist, the built file's suite is skipped
const built = existsSync(builtFile)
  ? ((await import(
      /* @vite-ignore */ pathToFileURL(builtFile).href
    )) as VueEntry)
  : undefined;
const ENTRIES = [
  ["source", source],
  ["dist/vue.mjs", built],
] as const;

/** The core's markup for a parity case: what React renders for it. */
const expected = (c: ParityCase) =>
  toSVGString(c.component === "code" ? resolveQRCodeProps(c.props) : c.props);

/**
 * The core's markup in Vue's server renderer's spelling. The two write the
 * same document and differ in two conventions only: Vue escapes ' as &#39;
 * (React: &#x27;) and closes a void element with > (React: />).
 */
const inVueSpelling = (markup: string) =>
  markup
    .replaceAll("&#x27;", "&#39;")
    .replace(/<(img|br|hr|input|source|wbr)\b([^>]*)\/>/g, "<$1$2>");

const componentFor = (api: VueEntry, c: ParityCase): Component =>
  c.component === "code" ? api.QRCode : api.QRCodeSVG;

const cssText = (css: string) => {
  const probe = document.createElement("div");
  probe.style.cssText = css;
  return probe.style.cssText;
};

/**
 * Markup as the browser serializes it, with inline styles in the browser's
 * own form: Vue sets `style` through the CSSOM, which rewrites the text.
 */
function asDOM(markup: string): string {
  const holder = document.createElement("div");
  holder.innerHTML = markup;
  for (const element of holder.querySelectorAll("[style]")) {
    element.setAttribute("style", cssText(element.getAttribute("style") ?? ""));
  }
  return holder.innerHTML;
}

function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  return container;
}

/** Vue's hydration warnings and errors, while `run` runs. */
async function vueWarnings(run: () => unknown) {
  const messages: string[] = [];
  const record = (...args: unknown[]) => {
    messages.push(args.map(String).join(" "));
  };
  const warn = vi.spyOn(console, "warn").mockImplementation(record);
  const error = vi.spyOn(console, "error").mockImplementation(record);
  try {
    await run();
  } finally {
    warn.mockRestore();
    error.mockRestore();
  }
  return messages;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

test("covers a wide set of props", () => {
  expect(CASES.length).toBeGreaterThan(100);
  const names = CASES.map((c) => c.name);
  for (const part of [
    "body ",
    "eye ",
    "linear gradient",
    "logo API",
    "logo imageSettings",
    "official frame",
    "built-in spec",
    "template ",
    "React custom template",
    "art ",
    "root attributes",
  ]) {
    expect(names.some((name) => name.startsWith(part))).toBe(true);
  }
});

for (const [label, entry] of ENTRIES) {
  describe.skipIf(!entry)(`qrdx/vue (${label})`, () => {
    const api = entry as VueEntry;

    test("renders the core's markup on the server, byte for byte or as the same DOM", async () => {
      let identical = 0;
      for (const c of CASES) {
        const html = await renderVue(
          createSSRApp({ render: () => h(componentFor(api, c), c.props) })
        );
        const markup = expected(c);
        identical += html === markup ? 1 : 0;
        expect(html, c.name).toBe(inVueSpelling(markup));
        expect(asDOM(html), c.name).toBe(asDOM(markup));
      }
      // Only a value with a quote, a label with one and the OG logo's <img>
      expect(identical).toBeGreaterThanOrEqual(CASES.length - 3);
    });

    test("renders the same DOM in the browser", () => {
      for (const c of CASES) {
        const container = mount();
        const app = createApp({
          render: () => h(componentFor(api, c), c.props),
        });
        app.mount(container);
        expect(asDOM(container.innerHTML), c.name).toBe(asDOM(expected(c)));
        expect(container.firstElementChild?.namespaceURI).toBe(
          "http://www.w3.org/2000/svg"
        );
        app.unmount();
      }
    });

    test("hydrates server markup without a mismatch", async () => {
      for (const c of CASES) {
        // isOGContext draws an HTML <img> for OG image renderers. An HTML
        // parser moves an <img> out of an <svg>, so that markup can't
        // hydrate as written in any framework.
        if (c.props.isOGContext) {
          continue;
        }
        const root = () => h(componentFor(api, c), c.props);
        const html = await renderVue(createSSRApp({ render: root }));
        const container = mount();
        container.innerHTML = html;
        const svg = container.firstElementChild;
        let app: ReturnType<typeof createSSRApp> | undefined;
        const warnings = await vueWarnings(() => {
          app = createSSRApp({ render: root });
          app.mount(container);
        });
        expect(warnings, c.name).toEqual([]);
        // The server's elements are kept, not drawn again
        expect(container.firstElementChild, c.name).toBe(svg);
        app?.unmount();
        container.remove();
      }
    });

    test("follows prop and attribute changes, and cleans up on unmount", async () => {
      const props = reactive<Record<string, unknown>>({
        value: VALUE,
        size: 160,
        bodyPattern: "rounded",
      });
      const className = ref("qr");
      const onClick = vi.fn();
      const container = mount();
      const app = createApp({
        render: () =>
          h(api.QRCode, { ...props, class: className.value, onClick }),
      });
      app.mount(container);
      const current = () =>
        toSVGString({
          ...resolveQRCodeProps({ ...(props as { value: string }) }),
          class: className.value,
        });
      const svg = container.firstElementChild;
      expect(asDOM(container.innerHTML)).toBe(asDOM(current()));

      // A color: Vue patches the same <svg>
      props.fgColor = {
        type: "linear",
        angle: 45,
        stops: [
          { color: "#1d4ed8", offset: 0 },
          { color: "#0f172a", offset: 100 },
        ],
      };
      await nextTick();
      expect(asDOM(container.innerHTML)).toBe(asDOM(current()));
      expect(container.firstElementChild).toBe(svg);

      // A logo, a frame, then without them again
      props.logo = LOGO;
      props.level = "H";
      props.frame = { style: "banner-bottom", text: "Scan me" };
      await nextTick();
      expect(asDOM(container.innerHTML)).toBe(asDOM(current()));
      expect(container.querySelector("text")?.textContent).toBe("Scan me");
      props.frame = undefined;
      props.logo = undefined;
      await nextTick();
      expect(asDOM(container.innerHTML)).toBe(asDOM(current()));

      // Attributes and listeners go on the <svg>
      className.value = "qr large";
      await nextTick();
      expect(container.firstElementChild?.getAttribute("class")).toBe(
        "qr large"
      );
      container.firstElementChild?.dispatchEvent(new Event("click"));
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(container.innerHTML).not.toContain("onclick");

      app.unmount();
      expect(container.childNodes).toHaveLength(0);
    });

    test("reads boolean props the way Vue templates write them", async () => {
      const logo = { value: VALUE, logo: LOGO, level: "L" as const };
      // `<QRCode auto-level />` passes "", which Vue reads as true
      const html = await renderVue(
        createSSRApp({
          render: () => h(api.QRCode, { ...logo, "auto-level": "" }),
        })
      );
      expect(html).toBe(
        toSVGString(resolveQRCodeProps({ ...logo, autoLevel: true }))
      );
      // Left out, a flag is undefined, not false: the core's own default
      const plain = await renderVue(
        createSSRApp({ render: () => h(api.QRCodeSVG, { value: VALUE }) })
      );
      expect(plain).toBe(toSVGString({ value: VALUE }));
    });

    test("draws a code that decodes, on the server and in the browser", async () => {
      const wifi = getOfficialFrame("wifi-card");
      const props = {
        value: VALUE,
        size: 240,
        level: "Q" as const,
        bodyPattern: "rounded" as const,
        cornerEyePattern: "rounded" as const,
        fgColor: {
          type: "linear" as const,
          angle: 45,
          stops: [
            { color: "#1d4ed8", offset: 0 },
            { color: "#0f172a", offset: 100 },
          ],
        },
        logo: LOGO,
        frame: { style: "custom" as const, spec: wifi?.spec },
      };
      const html = await renderVue(
        createSSRApp({ render: () => h(api.QRCode, props) })
      );
      expect(decodeQR(rasterizeSvg(html, { width: 720 }))).toBe(VALUE);

      const container = mount();
      createApp({ render: () => h(api.QRCode, props) }).mount(container);
      expect(decodeQR(rasterizeSvg(container.innerHTML, { width: 720 }))).toBe(
        VALUE
      );
    });

    describe("useQRCode", () => {
      it("returns the markup <QRCode> draws, and follows the props", () => {
        const value = ref(VALUE);
        const { svg, options } = api.useQRCode(() => ({
          value: value.value,
          size: 200,
          logo: LOGO,
          level: "H",
        }));
        const markup = (text: string) =>
          toSVGString(
            resolveQRCodeProps({
              value: text,
              size: 200,
              logo: LOGO,
              level: "H",
            })
          );
        expect(svg.value).toBe(markup(VALUE));
        expect(options.value.imageSettings?.src).toBe(LOGO);
        value.value = "https://qrdx.dev/other";
        expect(svg.value).toBe(markup("https://qrdx.dev/other"));
        expect(decodeQR(rasterizeSvg(svg.value, { width: 600 }))).toBe(
          "https://qrdx.dev/other"
        );

        // A ref, and a reactive object
        const fromRef = ref({ value: VALUE, size: 120 });
        const byRef = api.useQRCode(fromRef);
        fromRef.value = { value: VALUE, size: 140 };
        expect(byRef.svg.value).toBe(toSVGString({ value: VALUE, size: 140 }));
        const state = reactive({
          value: VALUE,
          bodyPattern: "diamond" as const,
        });
        const byState = api.useQRCode(state);
        state.value = "https://qrdx.dev/state";
        expect(byState.svg.value).toBe(
          toSVGString({
            value: "https://qrdx.dev/state",
            bodyPattern: "diamond",
          })
        );
      });

      it("renders in SSR inside a component", async () => {
        const html = await renderVue(
          createSSRApp({
            setup() {
              // biome-ignore lint/correctness/useHookAtTopLevel: a Vue composable belongs in setup(); React's hook rule doesn't apply
              const { svg } = api.useQRCode({ value: VALUE, size: 128 });
              return () => h("div", { class: "qr", innerHTML: svg.value });
            },
          })
        );
        expect(html).toBe(
          `<div class="qr">${toSVGString({ value: VALUE, size: 128 })}</div>`
        );
      });

      it("exports SVG and downloads", async () => {
        const qr = api.useQRCode({ value: VALUE, size: 180 });
        const uri = await qr.toDataURL("svg");
        expect(uri.startsWith("data:image/svg+xml,")).toBe(true);
        expect(
          decodeURIComponent(uri.slice("data:image/svg+xml,".length))
        ).toBe(qr.svg.value);

        const clicks: { href: string; download: string }[] = [];
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
          function (this: HTMLAnchorElement) {
            clicks.push({ href: this.href, download: this.download });
          }
        );
        await qr.download({ format: "svg" });
        await qr.download({ format: "svg", filename: "menu.svg", size: 400 });
        expect(clicks.map((click) => click.download)).toEqual([
          "qr-code.svg",
          "menu.svg",
        ]);
        expect(clicks[0]?.href).toBe(uri);
        expect(decodeURIComponent(clicks[1]?.href ?? "")).toContain(
          'width="400"'
        );
      });
    });

    test("re-exports the core", () => {
      const options: QRSVGOptions = { value: VALUE, size: 96 };
      expect(api.toSVGString(options)).toBe(toSVGString(options));
      expect(typeof api.downloadQRCode).toBe("function");
      expect(typeof api.getQRAsSVGNode).toBe("function");
    });

    test("draws a custom template written with its h (the core's)", async () => {
      const labelled = {
        id: "Labelled",
        name: "Labelled",
        wrapper: (children: unknown, props?: { label?: string }) =>
          api.h(
            "svg",
            { viewBox: "0 0 300 340", xmlns: "http://www.w3.org/2000/svg" },
            api.h(
              "g",
              { transform: "translate(20, 20) scale(0.87)" },
              children
            ),
            api.h(
              "text",
              { x: "150", y: "325", textAnchor: "middle" },
              props?.label
            )
          ),
      };
      const props = {
        value: VALUE,
        customTemplate: labelled,
        customProps: { label: "Scan & go" },
      };
      const html = await renderVue(
        createSSRApp({ render: () => h(api.QRCode, props) })
      );
      expect(html).toBe(toSVGString(resolveQRCodeProps(props)));
      expect(html).toContain('text-anchor="middle"');
      expect(html).toContain("Scan &amp; go");
    });
  });
}
