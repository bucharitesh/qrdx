// qrdx/angular in an Angular app: the built dist/angular.mjs (ngc's partial
// compilation output, which Angular's JIT compiler links here as an app's
// CLI links it when it builds) rendered with TestBed. The component draws
// what React's <QRCode> draws for every case in the parity matrix, follows
// its inputs, leaves the page alone when the markup doesn't change, and goes
// away with its element. The engine is built before the tests in CI and
// before pushing; without a dist these tests are skipped.
//
// The DOM is vitest's jsdom environment, set up in beforeAll rather than
// chosen for the file: as the file's environment, it makes vite treat the
// file as browser code and rewrite `new URL("…", import.meta.url)` into a
// web address, so the parity cases' fixtures and the built file aren't
// found.
import "@angular/compiler";
import { existsSync, readFileSync } from "node:fs";
import {
  Component,
  provideZonelessChangeDetection,
  reflectComponentType,
  signal,
} from "@angular/core";
import { TestBed } from "@angular/core/testing";
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from "@angular/platform-browser/testing";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  it as test,
  vi,
} from "vitest";
import { builtinEnvironments } from "vitest/runtime";
import type * as AngularEntry from "../src/angular";
import { QRCode as ReactQRCode } from "../src/index";
import { type ParityProps, parityCases } from "./support/parity-cases";
import { decodeQR, rasterizeSvg } from "./support/raster";

const dist = new URL("../dist/", import.meta.url);
const built = new URL("angular.mjs", dist);
let ng: typeof AngularEntry;

const VALUE = "https://qrdx.dev/q/Ab3dE9x";

/** Markup as the browser serializes it, for comparing with the DOM. */
function asParsed(markup: string): string {
  const holder = document.createElement("div");
  holder.innerHTML = markup;
  return holder.innerHTML;
}

/** The component's input for a `QRCodeProps` key (`style` is `svgStyle`). */
const inputFor = (key: string) => (key === "style" ? "svgStyle" : key);

function render(props: Record<string, unknown>) {
  const fixture = TestBed.createComponent(ng.QRCode);
  const inputs = new Set(
    reflectComponentType(ng.QRCode)?.inputs.map((input) => input.templateName)
  );
  for (const [key, value] of Object.entries(props)) {
    if (inputs.has(inputFor(key))) {
      fixture.componentRef.setInput(inputFor(key), value);
    }
  }
  fixture.detectChanges();
  return fixture;
}

let dom: Awaited<ReturnType<typeof builtinEnvironments.jsdom.setup>>;

beforeAll(async () => {
  if (!existsSync(built)) return;
  dom = await builtinEnvironments.jsdom.setup(globalThis, {});
  ng = (await import(/* @vite-ignore */ built.href)) as typeof AngularEntry;
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

afterEach(() => {
  if (!ng) return;
  TestBed.resetTestingModule();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await dom?.teardown(globalThis);
});

const configure = () =>
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  });

describe.skipIf(!existsSync(built))("qrdx/angular", () => {
  test("is a standalone component with an input per QRCode prop", () => {
    const mirror = reflectComponentType(ng.QRCode);
    expect(mirror?.selector).toBe("qrdx-qr-code");
    expect(mirror?.isStandalone).toBe(true);
    expect(mirror?.inputs.every((input) => input.isSignal)).toBe(true);
    expect(mirror?.inputs.map((input) => input.templateName).sort()).toEqual(
      [
        "value",
        "size",
        "level",
        "bgColor",
        "fgColor",
        "eyeColor",
        "dotColor",
        "eyeColors",
        "bodyPattern",
        "cornerEyePattern",
        "cornerEyeDotPattern",
        "margin",
        "moduleScale",
        "shape",
        "frame",
        "art",
        "logo",
        "logoOptions",
        "hideLogo",
        "autoLevel",
        "scale",
        "templateId",
        "customTemplate",
        "customProps",
        "frameLabelMarkers",
        "partMarkers",
        "svgStyle",
      ].sort()
    );
  });

  test("ships ngc's partial declarations, as the Angular CLI looks for them", () => {
    // The CLI links a package file only when its text contains
    // "ɵɵngDeclare": an escaped "\u0275" would leave the component unlinked.
    for (const file of ["angular.mjs", "angular.js"]) {
      const code = readFileSync(new URL(file, dist), "utf8");
      expect(code).toContain("ɵɵngDeclareComponent");
      expect(code).toContain("ɵɵngDeclareFactory");
      expect(code).not.toMatch(/\\u0275/);
    }
    const types = readFileSync(new URL("src/angular.d.ts", dist), "utf8");
    expect(types).toContain(
      'static ɵcmp: i0.ɵɵComponentDeclaration<QRCode, "qrdx-qr-code"'
    );
  });

  describe("draws what React's <QRCode> draws", () => {
    const cases = parityCases();

    it("covers a wide matrix", () => {
      expect(cases.length).toBeGreaterThan(100);
    });

    it.each(cases.map((c) => [c.name, c.props] as const))(
      "%s",
      (_name, props: ParityProps) => {
        configure();
        const fixture = render(props);
        const host: HTMLElement = fixture.nativeElement;
        const react = renderToStaticMarkup(createElement(ReactQRCode, props));
        const core = ng.toSVGString(ng.resolveQRCodeProps(props));

        expect(fixture.componentInstance.markup()).toBe(core);
        expect(core).toBe(react);
        expect(host.innerHTML).toBe(asParsed(core));
        expect(host.children).toHaveLength(1);
        expect(fixture.componentInstance.svg).toBe(host.firstElementChild);
        expect(fixture.componentInstance.svg?.namespaceURI).toBe(
          "http://www.w3.org/2000/svg"
        );
      }
    );
  });

  test("draws a code that decodes", () => {
    configure();
    const fixture = render({
      value: VALUE,
      size: 240,
      level: "Q",
      bodyPattern: "rounded",
      cornerEyePattern: "rounded",
      fgColor: {
        type: "linear",
        angle: 45,
        stops: [
          { color: "#1d4ed8", offset: 0 },
          { color: "#0f172a", offset: 100 },
        ],
      },
      frame: { style: "banner-bottom", text: "Scan me" },
    });
    const svg: SVGSVGElement = fixture.nativeElement.firstElementChild;
    expect(svg.querySelector("text")?.textContent).toBe("Scan me");
    const image = rasterizeSvg(svg.outerHTML, { width: 600 });
    expect(decodeQR(image)).toBe(VALUE);
  });

  test("redraws when a bound input changes, and only then", async () => {
    const Host = Component({
      selector: "qrdx-host",
      imports: [ng.QRCode],
      template: `<qrdx-qr-code
        class="qr"
        [value]="value()"
        [size]="size()"
        [fgColor]="color()"
        [svgStyle]="{ maxWidth: '100%' }"
      />`,
    })(
      class {
        readonly value = signal(VALUE);
        readonly size = signal(160);
        readonly color = signal("#111111");
      }
    );
    configure();
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const host: HTMLElement =
      fixture.nativeElement.querySelector("qrdx-qr-code");
    const first = host.firstElementChild;
    const markup = (props: Record<string, unknown>) =>
      asParsed(
        ng.toSVGString(
          ng.resolveQRCodeProps({
            value: VALUE,
            style: { maxWidth: "100%" },
            ...props,
          })
        )
      );

    // Attributes on the element stay on it; svgStyle styles the <svg>
    expect(host.getAttribute("class")).toBe("qr");
    expect(host.innerHTML).toBe(markup({ size: 160, fgColor: "#111111" }));
    expect(first?.getAttribute("style")).toBe("max-width:100%");

    // Same markup: the <svg> stays
    fixture.componentInstance.color.set("#111111");
    await fixture.whenStable();
    expect(host.firstElementChild).toBe(first);

    fixture.componentInstance.color.set("#be123c");
    fixture.componentInstance.size.set(200);
    await fixture.whenStable();
    expect(host.firstElementChild).not.toBe(first);
    expect(first?.isConnected).toBe(false);
    expect(host.children).toHaveLength(1);
    expect(host.innerHTML).toBe(markup({ size: 200, fgColor: "#be123c" }));

    fixture.componentInstance.value.set("https://qrdx.dev/docs");
    await fixture.whenStable();
    const image = rasterizeSvg(host.innerHTML, { width: 600 });
    expect(decodeQR(image)).toBe("https://qrdx.dev/docs");
  });

  test("goes away with its element", async () => {
    const Host = Component({
      selector: "qrdx-host",
      imports: [ng.QRCode],
      template: `@if (shown()) { <qrdx-qr-code [value]="value" /> }`,
    })(
      class {
        readonly shown = signal(true);
        readonly value = VALUE;
      }
    );
    configure();
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const svg = root.querySelector("svg");
    expect(svg).not.toBeNull();

    fixture.componentInstance.shown.set(false);
    await fixture.whenStable();
    expect(root.querySelector("qrdx-qr-code")).toBeNull();
    expect(svg?.isConnected).toBe(false);
  });

  test("lets go of its <svg> when destroyed", () => {
    configure();
    const own = render({ value: VALUE });
    const instance = own.componentInstance;
    expect(instance.svg).not.toBeNull();
    own.destroy();
    expect(instance.svg).toBeNull();
  });

  test("exports the code it draws", async () => {
    configure();
    const fixture = render({ value: VALUE, size: 180, scale: 1.5 });
    const qr = fixture.componentInstance;
    expect(qr.options()).toMatchObject({ value: VALUE, size: 270 });

    const uri = await qr.toDataURL("svg");
    expect(uri).toBe(await ng.getQRAsSVGDataUri(qr.options()));
    expect(decodeURIComponent(uri.slice("data:image/svg+xml,".length))).toBe(
      qr.markup()
    );

    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      clicks.push(this.download);
    });
    await qr.download({ format: "svg" });
    await qr.download({ format: "svg", filename: "menu.svg", size: 400 });
    expect(clicks).toEqual(["qr-code.svg", "menu.svg"]);
  });

  test("needs a value", () => {
    configure();
    const fixture = TestBed.createComponent(ng.QRCode);
    expect(() => fixture.detectChanges()).toThrow(/NG0950/);
  });
});
