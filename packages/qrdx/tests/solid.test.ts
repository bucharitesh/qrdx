// qrdx/solid on a server (solid-js/web's server build, which Node resolves):
// renderToString writes toSVGString's markup byte for byte, plus the
// hydration key Solid needs on the root element, and none inside
// <NoHydration>. tests/solid.dom.test.ts hydrates this markup in a DOM.
import { createComponent, type JSX } from "solid-js";
import { isServer, NoHydration, renderToString } from "solid-js/web";
import { describe, expect, it } from "vitest";
import {
  type QRSVGOptions,
  resolveQRCodeProps,
  toSVGString,
} from "../src/core";
import type { QRCodeProps } from "../src/qr-code-props";
import { QRCode, QRCodeSVG } from "../src/solid";
import { type ParityCase, parityCases } from "./support/parity-cases";

const cases = parityCases();

const coreProps = (c: ParityCase): QRSVGOptions =>
  c.component === "code" ? resolveQRCodeProps(c.props as QRCodeProps) : c.props;

const component = (c: ParityCase): JSX.Element =>
  c.component === "code"
    ? createComponent(QRCode, c.props as QRCodeProps)
    : createComponent(QRCodeSVG, c.props);

describe("qrdx/solid on a server", () => {
  it("runs on Solid's server build", () => {
    expect(isServer).toBe(true);
  });

  it.each(cases.map((c) => [c.name, c] as const))(
    "%s: renderToString writes toSVGString's markup",
    (_name, c) => {
      const expected = toSVGString(coreProps(c));
      const html = renderToString(() => component(c));
      // The root element carries Solid's hydration key, and only it does
      // (solid-js 1.8 writes the key unquoted)
      const key = html.match(/^<svg( data-hk=(?:"[^"]+"|[^\s>]+))/)?.[1];
      expect(key).toBeTruthy();
      expect(html.match(/data-hk=/g)).toHaveLength(1);
      expect(html.replace(key as string, "")).toBe(expected);

      const plain = renderToString(() =>
        createComponent(NoHydration, {
          get children() {
            return component(c);
          },
        })
      );
      expect(plain).toBe(expected);
    }
  );

  it("gives each code on a page its own key", () => {
    const html = renderToString(() => [
      createComponent(QRCodeSVG, { value: "https://qrdx.dev/a" }),
      createComponent(QRCode, { value: "https://qrdx.dev/b" }),
    ]);
    const keys = [...html.matchAll(/data-hk=("[^"]+"|[^\s>]+)/g)].map(
      (m) => m[1]
    );
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
  });
});
