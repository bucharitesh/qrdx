// @vitest-environment jsdom
// qrdx/preact draws what the core draws: on the page (the same DOM as
// toSVGElement), on a server with preact-render-to-string (toSVGString's
// markup), and through hydration, updates and unmounting. Covers the parity
// matrix: every pattern, eye and dot, gradients, image fills, logos, frames,
// official frames, shapes, art, templates and root attributes.
import { h, hydrate, render } from "preact";
import { renderToString } from "preact-render-to-string";
import { afterEach, describe, expect, it } from "vitest";
import {
  type QRSVGOptions,
  resolveQRCodeProps,
  toSVGElement,
  toSVGString,
} from "../src/core";
import { QRCode, QRCodeSVG } from "../src/preact";
import type { QRCodeProps } from "../src/qr-code-props";
import type { TemplateDefinition } from "../types";
import { domSnapshot } from "./support/dom-snapshot";
import { type ParityCase, parityCases } from "./support/parity-cases";
import { decodeQR, rasterizeSvg } from "./support/raster";

const cases = parityCases();

/** What the core draws for a case: `QRCodeSVG`'s props, or `QRCode`'s. */
const coreProps = (c: ParityCase): QRSVGOptions =>
  c.component === "code" ? resolveQRCodeProps(c.props as QRCodeProps) : c.props;

const element = (c: ParityCase) =>
  c.component === "code"
    ? h(QRCode, c.props as QRCodeProps)
    : h(QRCodeSVG, c.props);

function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  return container;
}

/** The core's own DOM for these props, as a snapshot. */
function coreSnapshot(props: QRSVGOptions): string {
  const holder = document.createElement("div");
  holder.append(toSVGElement(props));
  return domSnapshot(holder);
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("qrdx/preact", () => {
  it("covers a wide matrix", () => {
    const names = cases.map((c) => c.name);
    expect(cases.length).toBeGreaterThan(100);
    for (const part of ["frame", "official", "template", "art", "logo"]) {
      expect(names.some((name) => name.includes(part))).toBe(true);
    }
  });

  it.each(cases.map((c) => [c.name, c] as const))(
    "%s: renders the core's DOM",
    (_name, c) => {
      const container = mount();
      render(element(c), container);
      expect(domSnapshot(container)).toBe(coreSnapshot(coreProps(c)));
    }
  );

  it.each(cases.map((c) => [c.name, c] as const))(
    "%s: preact-render-to-string writes toSVGString's markup",
    (_name, c) => {
      // Byte for byte, except that React escapes > and ' and Preact needn't
      const expected = toSVGString(coreProps(c))
        .replaceAll("&gt;", ">")
        .replaceAll("&#x27;", "'");
      expect(renderToString(element(c))).toBe(expected);
    }
  );

  it("draws a code that decodes", () => {
    const value = "https://qrdx.dev/q/Ab3dE9x";
    const container = mount();
    render(
      h(QRCodeSVG, {
        value,
        size: 240,
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
      }),
      container
    );
    const image = rasterizeSvg(container.innerHTML, { width: 600 });
    expect(decodeQR(image)).toBe(value);
  });

  it("updates when props change, and skips renders when none did", () => {
    const container = mount();
    let draws = 0;
    // A template's wrapper runs once each time the tree is built
    const counted: TemplateDefinition = {
      id: "Counted",
      name: "Counted",
      wrapper: (children) => {
        draws++;
        return children;
      },
    };
    const props: QRSVGOptions = {
      value: "https://qrdx.dev",
      size: 160,
      customTemplate: counted,
    };
    render(h(QRCodeSVG, props), container);
    const svg = container.firstElementChild;
    expect(draws).toBe(1);

    // The same props in a new object: nothing is rebuilt
    render(h(QRCodeSVG, { ...props }), container);
    expect(draws).toBe(1);
    expect(container.firstElementChild).toBe(svg);

    const next: QRSVGOptions = {
      ...props,
      fgColor: "#be123c",
      bodyPattern: "diamond",
      className: "qr",
    };
    render(h(QRCodeSVG, next), container);
    expect(container.children).toHaveLength(1);
    expect(domSnapshot(container)).toBe(coreSnapshot(next));

    // A frame changes the root; Preact keeps up
    const framed: QRSVGOptions = {
      ...next,
      frame: { style: "banner-top", text: "Menu" },
    };
    render(h(QRCodeSVG, framed), container);
    expect(domSnapshot(container)).toBe(coreSnapshot(framed));

    render(h(QRCodeSVG, props), container);
    expect(domSnapshot(container)).toBe(coreSnapshot(props));
  });

  it("QRCode takes the logo API", () => {
    const container = mount();
    const props: QRCodeProps = {
      value: "https://qrdx.dev",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E",
      level: "H",
    };
    render(h(QRCode, props), container);
    expect(container.querySelector("image")).not.toBeNull();
    render(h(QRCode, { ...props, hideLogo: true }), container);
    expect(container.querySelector("image")).toBeNull();
    expect(domSnapshot(container)).toBe(
      coreSnapshot(resolveQRCodeProps({ ...props, hideLogo: true }))
    );
  });

  it("unmounts cleanly", () => {
    const container = mount();
    render(h(QRCodeSVG, { value: "https://qrdx.dev" }), container);
    expect(container.children).toHaveLength(1);
    render(null, container);
    expect(container.innerHTML).toBe("");
  });

  it("hydrates server markup without redrawing it", () => {
    for (const c of cases.filter((x) =>
      [
        "defaults",
        "linear gradient",
        "logo API",
        "frame banner-bottom",
        "template with frame and attributes",
        "root attributes with frame",
      ].includes(x.name)
    )) {
      const container = mount();
      container.innerHTML = renderToString(element(c));
      const before = domSnapshot(container);
      const nodes = [...container.querySelectorAll("*")];

      hydrate(element(c), container);
      expect(domSnapshot(container)).toBe(before);
      // Every element the server wrote is still the one on the page
      const after = [...container.querySelectorAll("*")];
      expect(after).toHaveLength(nodes.length);
      expect(after.every((node, index) => node === nodes[index])).toBe(true);
    }
    expect(document.body.children.length).toBe(6);
  });
});
