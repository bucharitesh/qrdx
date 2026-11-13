// Part markers: an editor's preview renders with `partMarkers` so each drawn
// part says what it is (the three finder eyes, outer ring and centre, the
// dots, the logo, the background). Without the prop nothing changes: the
// markup is the default render, and every export drops the prop.
import { describe, expect, it } from "vitest";
import { createQRArtImage } from "../src/art";
import { getQRAsEPS } from "../src/eps";
import { getQRAsSVGDataUri } from "../src/index";
import {
  QR_EYE_ATTRIBUTE,
  QR_PART_ATTRIBUTE,
  QR_PARTS,
} from "../src/part-markers";
import { parseSvgMarkup, type SvgNode } from "../src/utils/svg-geometry";
import type { QRProps } from "../types";
import { renderSvg } from "./support/qr";

const VALUE = "https://qrdx.dev/q/Ab3dE9x";
const LOGO =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='8' height='8' fill='%23e11d48'/%3E%3C/svg%3E";
const EYES = ["top-left", "top-right", "bottom-left"];

/** A 24×24 picture: dark on the left half, light on the right. */
function artImage() {
  const side = 24;
  const data = new Uint8Array(side * side * 4);
  for (let i = 0; i < side * side; i++) {
    const shade = i % side < side / 2 ? 30 : 220;
    data.set([shade, shade, shade, 255], i * 4);
  }
  return createQRArtImage({ width: side, height: side, data });
}

const logo = (extra: Partial<QRProps["imageSettings"]> = {}) => ({
  imageSettings: {
    src: LOGO,
    width: 48,
    height: 48,
    excavate: true,
    ...extra,
  },
});

const CASES: [string, QRProps][] = [
  ["plain", { value: VALUE, size: 256 }],
  [
    "styled",
    {
      value: VALUE,
      size: 256,
      bodyPattern: "liquid",
      cornerEyePattern: "leaf",
      cornerEyeDotPattern: "flower",
      fgColor: "#1c2541",
      eyeColor: "#9b2c2c",
      dotColor: "#0b3c5d",
      bgColor: "#f6f1e7",
    },
  ],
  ["with a logo", { value: VALUE, size: 256, ...logo() }],
  [
    "a rounded logo on a plate",
    {
      value: VALUE,
      size: 256,
      ...logo({ shape: "rounded", plate: "#ffffff" }),
    },
  ],
  [
    "gradients and per-eye colors",
    {
      value: VALUE,
      size: 256,
      fgColor: {
        type: "linear",
        angle: 45,
        stops: [
          { color: "#111827", offset: 0 },
          { color: "#4c1d95", offset: 100 },
        ],
      },
      bgColor: {
        type: "radial",
        stops: [
          { color: "#ffffff", offset: 0 },
          { color: "#f1f5f9", offset: 100 },
        ],
      },
      eyeColors: { topRight: { outer: "#b91c1c", inner: "#1d4ed8" } },
    },
  ],
  ["a template", { value: VALUE, size: 256, templateId: "Arrow", ...logo() }],
  ["a frame", { value: VALUE, size: 256, frame: { style: "banner-bottom" } }],
  ["a circle code", { value: VALUE, size: 256, shape: "circle" }],
  ["a heart code", { value: VALUE, size: 256, shape: "heart" }],
  [
    "Image QR",
    {
      value: VALUE,
      size: 256,
      art: { mode: "halftone", variant: "mono", image: artImage() },
    },
  ],
];

const MARKERS = new RegExp(
  ` (?:${QR_PART_ATTRIBUTE}|${QR_EYE_ATTRIBUTE})="[^"]*"`,
  "g"
);

function nodes(markup: string): SvgNode[] {
  const found: SvgNode[] = [];
  const walk = (node: SvgNode) => {
    found.push(node);
    node.children.forEach(walk);
  };
  const root = parseSvgMarkup(markup);
  if (root) walk(root);
  return found;
}

const marked = (markup: string, part: string) =>
  nodes(markup).filter((node) => node.attrs[QR_PART_ATTRIBUTE] === part);

describe("unmarked by default, markers only added", () => {
  it.each(CASES)("%s", (_name, props) => {
    const plain = renderSvg(props);
    const withMarkers = renderSvg({ ...props, partMarkers: true });
    expect(plain).not.toContain(QR_PART_ATTRIBUTE);
    expect(plain).not.toContain(QR_EYE_ATTRIBUTE);
    expect(withMarkers).toContain(QR_PART_ATTRIBUTE);
    // Nothing else moves: removing the markers gives the default render
    expect(withMarkers.replace(MARKERS, "")).toBe(plain);
    // An explicit false is the default too
    expect(renderSvg({ ...props, partMarkers: false })).toBe(plain);
  });
});

describe("each part is marked where it's drawn", () => {
  it.each(CASES)("%s: three eyes, outer and centre", (_name, props) => {
    const svg = renderSvg({ ...props, partMarkers: true });
    for (const part of ["eye-outer", "eye-centre"]) {
      const eyes = marked(svg, part).map(
        (node) => node.attrs[QR_EYE_ATTRIBUTE]
      );
      expect(eyes.sort()).toEqual([...EYES].sort());
    }
  });

  it.each(CASES)("%s: one background and the dots", (_name, props) => {
    const svg = renderSvg({ ...props, partMarkers: true });
    expect(marked(svg, "background")).toHaveLength(1);
    const body = marked(svg, "body");
    expect(body.length).toBeGreaterThan(0);
    // The dots group draws the modules
    expect(body.some((node) => node.children.length > 0)).toBe(true);
  });

  it("the logo is marked when one is drawn, and only then", () => {
    for (const [name, props] of CASES) {
      const svg = renderSvg({ ...props, partMarkers: true });
      const logos = marked(svg, "logo");
      expect(logos, name).toHaveLength(props.imageSettings ? 1 : 0);
    }
  });

  it("a plain logo is its <image>; on a plate, the group around it", () => {
    const bare = marked(
      renderSvg({ value: VALUE, size: 256, ...logo(), partMarkers: true }),
      "logo"
    );
    expect(bare[0]?.name).toBe("image");
    const plated = marked(
      renderSvg({
        value: VALUE,
        size: 256,
        ...logo({ plate: "#ffffff" }),
        partMarkers: true,
      }),
      "logo"
    );
    expect(plated[0]?.name).toBe("g");
    expect(plated[0]?.children.some((child) => child.name === "image")).toBe(
      true
    );
  });

  it("only these parts are marked", () => {
    for (const [, props] of CASES) {
      const svg = renderSvg({ ...props, partMarkers: true });
      for (const node of nodes(svg)) {
        const part = node.attrs[QR_PART_ATTRIBUTE];
        if (part !== undefined) {
          expect(QR_PARTS).toContain(part);
        }
      }
    }
  });
});

describe("exports never carry the markers", () => {
  it.each(CASES)("%s: SVG export is byte-identical", async (_name, props) => {
    const plain = await getQRAsSVGDataUri(props);
    const asked = await getQRAsSVGDataUri({ ...props, partMarkers: true });
    expect(asked).toBe(plain);
    expect(decodeURIComponent(asked)).not.toContain(QR_PART_ATTRIBUTE);
  });

  it("EPS is byte-identical", async () => {
    const props: QRProps = { value: VALUE, size: 256, bodyPattern: "rounded" };
    expect(await getQRAsEPS({ ...props, partMarkers: true })).toBe(
      await getQRAsEPS(props)
    );
  });
});
