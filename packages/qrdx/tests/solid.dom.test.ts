// qrdx/solid in a DOM, on Solid's browser build (the "dom" project in
// vitest.config.ts): the components put the core's DOM on the page, follow
// prop changes, leave the page alone when the markup doesn't change, go away
// on unmount, and hydrate server markup by adopting its <svg>.
import {
  createComponent,
  createSignal,
  type JSX,
  mergeProps,
  Show,
} from "solid-js";
import { hydrate, isServer, render } from "solid-js/web";
import { afterEach, describe, expect, it } from "vitest";
import {
  type QRSVGOptions,
  resolveQRCodeProps,
  toSVGElement,
  toSVGString,
} from "../src/core";
import type { QRCodeProps } from "../src/qr-code-props";
import { QRCode, QRCodeSVG } from "../src/solid";
import { domSnapshot } from "./support/dom-snapshot";
import { type ParityCase, parityCases } from "./support/parity-cases";
import { decodeQR, rasterizeSvg } from "./support/raster";

const cases = parityCases();

const coreProps = (c: ParityCase): QRSVGOptions =>
  c.component === "code" ? resolveQRCodeProps(c.props as QRCodeProps) : c.props;

const component = (c: ParityCase): JSX.Element =>
  c.component === "code"
    ? createComponent(QRCode, c.props as QRCodeProps)
    : createComponent(QRCodeSVG, c.props);

type ShowWhen = (props: {
  when: boolean;
  children: JSX.Element;
}) => JSX.Element;

function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  return container;
}

function coreSnapshot(props: QRSVGOptions): string {
  const holder = document.createElement("div");
  holder.append(toSVGElement(props));
  return domSnapshot(holder);
}

const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) {
    dispose();
  }
  document.body.replaceChildren();
});

describe("qrdx/solid in the browser", () => {
  it("runs on Solid's browser build", () => {
    expect(isServer).toBe(false);
  });

  it.each(cases.map((c) => [c.name, c] as const))(
    "%s: renders the core's DOM",
    (_name, c) => {
      const container = mount();
      disposers.push(render(() => component(c), container));
      expect(domSnapshot(container)).toBe(coreSnapshot(coreProps(c)));
    }
  );

  it("draws a code that decodes", () => {
    const value = "https://qrdx.dev/q/Ab3dE9x";
    const container = mount();
    disposers.push(
      render(
        () =>
          createComponent(QRCodeSVG, {
            value,
            size: 240,
            level: "Q",
            bodyPattern: "rounded",
            fgColor: {
              type: "radial",
              stops: [
                { color: "#7c3aed", offset: 0 },
                { color: "#0f172a", offset: 100 },
              ],
            },
            frame: { style: "banner-bottom", text: "Scan me" },
          }),
        container
      )
    );
    const image = rasterizeSvg(container.innerHTML, { width: 600 });
    expect(decodeQR(image)).toBe(value);
  });

  it("follows prop changes, and keeps the element when the markup is the same", () => {
    const container = mount();
    const [options, setOptions] = createSignal<QRSVGOptions>({
      value: "https://qrdx.dev",
      size: 160,
    });
    // A spread of a signal, as <QRCodeSVG {...options()} /> compiles
    disposers.push(
      render(() => createComponent(QRCodeSVG, mergeProps(options)), container)
    );
    const first = container.firstElementChild;
    expect(domSnapshot(container)).toBe(coreSnapshot(options()));

    // New objects, same markup: the <svg> on the page stays
    setOptions({ value: "https://qrdx.dev", size: 160 });
    expect(container.firstElementChild).toBe(first);

    const next: QRSVGOptions = {
      value: "https://qrdx.dev",
      size: 160,
      fgColor: "#be123c",
      bodyPattern: "diamond",
      class: "qr",
    };
    setOptions(next);
    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild).not.toBe(first);
    expect(first?.isConnected).toBe(false);
    expect(domSnapshot(container)).toBe(coreSnapshot(next));

    // A frame changes the root element
    const framed: QRSVGOptions = {
      ...next,
      frame: { style: "banner-top", text: "Menu" },
    };
    setOptions(framed);
    expect(container.children).toHaveLength(1);
    expect(domSnapshot(container)).toBe(coreSnapshot(framed));
  });

  it("follows single reactive props, next to other nodes", () => {
    const container = mount();
    const [value, setValue] = createSignal("https://qrdx.dev/a");
    disposers.push(
      render(
        () => [
          "before",
          createComponent(QRCodeSVG, {
            get value() {
              return value();
            },
            size: 120,
          }),
          "after",
        ],
        container
      )
    );
    setValue("https://qrdx.dev/b");
    expect(container.childNodes).toHaveLength(3);
    expect(container.firstChild?.textContent).toBe("before");
    expect(container.lastChild?.textContent).toBe("after");
    const holder = document.createElement("div");
    holder.append(
      document.createTextNode("before"),
      toSVGElement({ value: "https://qrdx.dev/b", size: 120 }),
      document.createTextNode("after")
    );
    expect(domSnapshot(container)).toBe(domSnapshot(holder));
  });

  it("QRCode takes the logo API", () => {
    const container = mount();
    const [hideLogo, setHideLogo] = createSignal(false);
    const props: QRCodeProps = {
      value: "https://qrdx.dev",
      logo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E",
      level: "H",
    };
    disposers.push(
      render(
        () =>
          createComponent(
            QRCode,
            mergeProps(props, {
              get hideLogo() {
                return hideLogo();
              },
            })
          ),
        container
      )
    );
    expect(container.querySelector("image")).not.toBeNull();
    setHideLogo(true);
    expect(container.querySelector("image")).toBeNull();
    expect(domSnapshot(container)).toBe(
      coreSnapshot(resolveQRCodeProps({ ...props, hideLogo: true }))
    );
  });

  it("goes away on unmount", () => {
    const container = mount();
    const [shown, setShown] = createSignal(true);
    const dispose = render(
      () =>
        // Show is overloaded, and createComponent infers from the last overload
        createComponent(Show as ShowWhen, {
          get when() {
            return shown();
          },
          get children() {
            return createComponent(QRCodeSVG, { value: "https://qrdx.dev" });
          },
        }),
      container
    );
    expect(container.querySelector("svg")).not.toBeNull();
    setShown(false);
    expect(container.innerHTML).toBe("");
    setShown(true);
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    dispose();
    expect(container.innerHTML).toBe("");
  });

  it("hydrates server markup by adopting its <svg>", () => {
    // What renderToString writes for a code at the root of the page:
    // toSVGString's markup with data-hk="00" (asserted in solid.test.ts)
    (globalThis as Record<string, unknown>)._$HY = {
      events: [],
      completed: new WeakSet(),
      r: {},
    };
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
      container.innerHTML = toSVGString(coreProps(c)).replace(
        /^<svg/,
        '<svg data-hk="00"'
      );
      const before = domSnapshot(container);
      const nodes = [...container.querySelectorAll("*")];

      disposers.push(hydrate(() => component(c), container));
      expect(domSnapshot(container)).toBe(before);
      const after = [...container.querySelectorAll("*")];
      expect(after).toHaveLength(nodes.length);
      expect(after.every((node, index) => node === nodes[index])).toBe(true);
    }
    expect(document.body.children.length).toBe(6);
  });

  it("updates a hydrated code like any other", () => {
    (globalThis as Record<string, unknown>)._$HY = {
      events: [],
      completed: new WeakSet(),
      r: {},
    };
    const container = mount();
    const props: QRSVGOptions = { value: "https://qrdx.dev", size: 140 };
    container.innerHTML = toSVGString(props).replace(
      /^<svg/,
      '<svg data-hk="00"'
    );
    const server = container.firstElementChild;
    const [color, setColor] = createSignal("#000000");
    disposers.push(
      hydrate(
        () =>
          createComponent(
            QRCodeSVG,
            mergeProps(props, {
              get fgColor() {
                return color();
              },
            })
          ),
        container
      )
    );
    expect(container.firstElementChild).toBe(server);

    setColor("#1d4ed8");
    expect(container.children).toHaveLength(1);
    expect(domSnapshot(container)).toBe(
      coreSnapshot({ ...props, fgColor: "#1d4ed8" })
    );
  });
});
