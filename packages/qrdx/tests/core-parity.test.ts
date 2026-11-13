// The React-free core (qrdx/core) must draw exactly what the React components
// draw: for every case in the matrix (every pattern, eye and dot, gradients,
// image fills, logos, every frame style and every official frame, shapes,
// art, templates, part and label markers, root attributes), the core's
// markup equals React's renderToStaticMarkup byte for byte.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  createQRCodeTree,
  getQRAsSVGDataUri,
  getQRAsSVGNode,
  h,
  type QRNode,
  renderToString,
  resolveQRCodeProps,
  toHyperscript,
  toSVGString,
} from "../src/core";
import { OFFICIAL_FRAMES } from "../src/frames/official";
import { getQRAsSVG, QRCode, QRCodeSVG } from "../src/index";
import type { QRSVGOptions, TemplateDefinition } from "../types";
import { type ParityCase, parityCases } from "./support/parity-cases";

const cases = parityCases({
  allOfficialFrames: OFFICIAL_FRAMES.map((frame) => frame.id),
});

const reactMarkup = (c: ParityCase) =>
  renderToStaticMarkup(
    c.component === "code"
      ? createElement(QRCode, c.props)
      : createElement(QRCodeSVG, c.props)
  );

const coreMarkup = (c: ParityCase) =>
  toSVGString(c.component === "code" ? resolveQRCodeProps(c.props) : c.props);

describe("core parity with React", () => {
  it("covers a wide matrix", () => {
    expect(cases.length).toBeGreaterThan(OFFICIAL_FRAMES.length + 100);
  });

  it.each(cases.map((c) => [c.name, c] as const))(
    "%s: toSVGString equals <QRCodeSVG>",
    (_name, c) => {
      expect(coreMarkup(c)).toBe(reactMarkup(c));
    }
  );

  it("getQRAsSVGDataUri writes the core's markup", async () => {
    for (const c of cases.slice(0, 80)) {
      if (c.component !== "svg") {
        continue;
      }
      const {
        frameLabelMarkers: _labels,
        partMarkers: _parts,
        ...exported
      } = c.props;
      const uri = await getQRAsSVGDataUri(c.props);
      expect(decodeURIComponent(uri.replace("data:image/svg+xml,", ""))).toBe(
        toSVGString(exported)
      );
    }
  });

  it("getQRAsSVGNode draws what getQRAsSVG draws", async () => {
    for (const c of cases) {
      if (c.component !== "svg" || c.name.startsWith("official")) {
        continue;
      }
      const react = renderToStaticMarkup(await getQRAsSVG(c.props));
      expect(renderToString(await getQRAsSVGNode(c.props))).toBe(react);
    }
  });
});

describe("the tree", () => {
  const props: QRSVGOptions = {
    value: "https://qrdx.dev",
    frame: { style: "banner-bottom", text: "Scan me" },
    className: "qr",
  };

  it("is plain data, with no React in it", () => {
    const seen = new Set<unknown>();
    const walk = (node: unknown) => {
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (node && typeof node === "object") {
        const { type, props: nodeProps, key } = node as QRNode;
        expect(Object.keys(node).sort()).toEqual(["key", "props", "type"]);
        expect(key === null || typeof key === "string").toBe(true);
        if (typeof type === "string") {
          seen.add(type);
        }
        walk(nodeProps.children);
      }
    };
    walk(createQRCodeTree(props));
    expect(seen.has("svg")).toBe(true);
    expect(seen.has("text")).toBe(true);
  });

  it("converts to another framework's elements with DOM attribute names", () => {
    const tree = createQRCodeTree(props);
    interface El {
      attrs: Record<string, string>;
      kids: unknown[];
      type: string;
    }
    const [root] = toHyperscript<El>(tree, (type, attrs, kids) => ({
      type,
      attrs,
      kids,
    }));
    const escapeMarkup = (text: string) =>
      text
        .replaceAll("&", "&amp;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#x27;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
    const serialize = (node: El | string): string =>
      typeof node === "string"
        ? escapeMarkup(node)
        : `<${node.type}${Object.entries(node.attrs)
            .map(([name, value]) => ` ${name}="${escapeMarkup(value)}"`)
            .join("")}>${(node.kids as (El | string)[])
            .map(serialize)
            .join("")}</${node.type}>`;
    expect(serialize(root as El)).toBe(renderToString(tree));
    expect((root as El).attrs.class).toBe("qr");
  });

  it("draws templates written with h, with or without React", () => {
    const template: TemplateDefinition<{ label?: string }> = {
      id: "Neutral",
      name: "Neutral",
      wrapper: (children, templateProps) =>
        h(
          "svg",
          { viewBox: "0 0 300 340", xmlns: "http://www.w3.org/2000/svg" },
          h("g", { transform: "translate(20, 20) scale(0.87)" }, children),
          h(
            "text",
            {
              x: "150",
              y: "325",
              textAnchor: "middle",
              fill: templateProps?.fgColor,
            },
            templateProps?.label
          )
        ),
    };
    const templated: QRSVGOptions = {
      value: "https://qrdx.dev",
      customTemplate: template,
      customProps: { label: "Hi & bye" },
    };
    const markup = toSVGString(templated);
    expect(markup).toContain('text-anchor="middle"');
    expect(markup).toContain("Hi &amp; bye");
    expect(renderToStaticMarkup(createElement(QRCodeSVG, templated))).toBe(
      markup
    );
  });

  it("leaves out what React leaves out", () => {
    const markup = toSVGString({
      value: "x",
      onClick: () => undefined,
      ref: { current: null },
      hidden: false,
      "data-on": true,
      draggable: false,
      dangerouslySetInnerHTML: undefined,
      style: { marginTop: 0, opacity: 0.5, "--qr-accent": " red " },
      href: "javascript:alert(1)",
    });
    expect(markup).toBe(
      renderToStaticMarkup(
        createElement(QRCodeSVG, {
          value: "x",
          onClick: () => undefined,
          hidden: false,
          "data-on": true,
          draggable: false,
          style: {
            marginTop: 0,
            opacity: 0.5,
            ...{ "--qr-accent": " red " },
          },
          ...({ href: "javascript:alert(1)" } as any),
        })
      )
    );
    expect(markup).not.toContain("onClick");
    expect(markup).toContain('data-on="true"');
  });
});
