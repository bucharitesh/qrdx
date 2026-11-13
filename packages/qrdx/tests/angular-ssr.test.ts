// qrdx/angular with Angular's server rendering: platform-server renders an
// app that uses <qrdx-qr-code> to HTML, the HTML carries the core's markup,
// and the same app then hydrates that HTML in a DOM (vitest's jsdom
// environment, loaded with the server's HTML) without errors or skipped
// components, keeping the server's elements and following later changes.
// Like tests/angular.test.ts, it runs the built dist/angular.mjs and is
// skipped without a dist.
import "@angular/compiler";
import { existsSync } from "node:fs";
import {
  type ApplicationRef,
  Component,
  provideZonelessChangeDetection,
  signal,
  type Type,
  type WritableSignal,
} from "@angular/core";
import {
  bootstrapApplication,
  provideClientHydration,
} from "@angular/platform-browser";
import {
  provideServerRendering,
  renderApplication,
} from "@angular/platform-server";
import { afterAll, beforeAll, describe, expect, it as test, vi } from "vitest";
import { builtinEnvironments } from "vitest/runtime";
import type * as AngularEntry from "../src/angular";
import type { QRCodeProps } from "../types";
import { decodeQR, rasterizeSvg } from "./support/raster";

const built = new URL("../dist/angular.mjs", import.meta.url);

const VALUE = "https://qrdx.dev/q/Ab3dE9x";
const PROPS: QRCodeProps = {
  value: VALUE,
  size: 220,
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
};

interface App {
  value: WritableSignal<string>;
}

let ng: typeof AngularEntry;
let AppComponent: Type<App>;
let html = "";
let dom: Awaited<ReturnType<typeof builtinEnvironments.jsdom.setup>>;

beforeAll(async () => {
  if (!existsSync(built)) return;
  ng = (await import(/* @vite-ignore */ built.href)) as typeof AngularEntry;
  AppComponent = Component({
    selector: "app-root",
    imports: [ng.QRCode],
    template: `<main>
      <qrdx-qr-code
        [value]="value()"
        [size]="props.size"
        [level]="props.level"
        [bodyPattern]="props.bodyPattern"
        [cornerEyePattern]="props.cornerEyePattern"
        [fgColor]="props.fgColor"
        [frame]="props.frame"
      />
    </main>`,
  })(
    class {
      readonly props = PROPS;
      readonly value = signal(VALUE);
    }
  );

  html = await renderApplication(
    (context) =>
      bootstrapApplication(
        AppComponent,
        {
          providers: [
            provideServerRendering(),
            provideClientHydration(),
            provideZonelessChangeDetection(),
          ],
        },
        context
      ),
    {
      document:
        "<!doctype html><html><head></head><body><app-root></app-root></body></html>",
      url: "http://localhost/",
      allowedHosts: ["localhost"],
    }
  );
});

afterAll(async () => {
  await dom?.teardown(globalThis);
});

describe.skipIf(!existsSync(built))("qrdx/angular on the server", () => {
  test("renders the core's markup into the HTML", () => {
    const markup = ng.toSVGString(ng.resolveQRCodeProps(PROPS));
    const host = html.match(/<qrdx-qr-code([^>]*)>([\s\S]*?)<\/qrdx-qr-code>/);
    expect(host).not.toBeNull();
    // Annotated for hydration
    expect(host?.[1]).toMatch(/\bngh="\d+"/);
    const svg = host?.[2] ?? "";
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain(">Scan me</text>");
    // The server's DOM serializes as the core writes it (empty elements
    // closed in full), so the markup is the core's, byte for byte.
    expect(svg).toBe(markup);
    expect(decodeQR(rasterizeSvg(svg, { width: 600 }))).toBe(VALUE);
  });

  test("hydrates without errors, keeps the server's elements and follows changes", async () => {
    // Server mode ends with the server platform; the browser app runs in a
    // DOM loaded with the server's HTML.
    expect(globalThis.ngServerMode).toBeUndefined();
    dom = await builtinEnvironments.jsdom.setup(globalThis, {
      jsdom: { html, url: "http://localhost/" },
    });
    const errors = vi.spyOn(console, "error");
    const warnings = vi.spyOn(console, "warn");
    const logs = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const serverHost = document.querySelector("qrdx-qr-code");
    const serverMarkup = serverHost?.innerHTML;
    expect(serverHost?.children).toHaveLength(1);

    const app: ApplicationRef = await bootstrapApplication(AppComponent, {
      providers: [provideClientHydration(), provideZonelessChangeDetection()],
    });
    await app.whenStable();

    expect(errors).not.toHaveBeenCalled();
    expect(warnings).not.toHaveBeenCalled();
    const hydrated = logs.mock.calls.map((call) => String(call[0]));
    expect(hydrated.join("\n")).toMatch(
      /Angular hydrated 2 component\(s\) and \d+ node\(s\), 0 component\(s\) were skipped/
    );

    // The server's element is kept, with one code in it, the same markup
    const host = document.querySelector("qrdx-qr-code");
    expect(host).toBe(serverHost);
    expect(host?.children).toHaveLength(1);
    expect(host?.innerHTML).toBe(serverMarkup);

    // And the browser app follows changes
    const root = app.components[0]?.instance as App;
    root.value.set("https://qrdx.dev/docs");
    await app.whenStable();
    expect(host?.children).toHaveLength(1);
    const svg = host?.innerHTML ?? "";
    expect(decodeQR(rasterizeSvg(svg, { width: 600 }))).toBe(
      "https://qrdx.dev/docs"
    );
    app.destroy();
  });
});
