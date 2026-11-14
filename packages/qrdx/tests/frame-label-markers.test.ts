// Frame label markers: an editor's preview renders with `frameLabelMarkers`
// so every frame <text> says which field it draws ("text", "secondaryText"
// or a custom spec's label id). Exports never carry them: the default render
// has none, and every export path drops the prop, so SVG, EPS and PDF bytes
// are the same with or without it.
import { describe, expect, it, test } from "vitest";
import { HAND_MADE } from "../scripts/official-frames/modules.mjs";
import {
  framePart,
  fullFrameScan,
  layoutSample,
} from "../scripts/official-frames/sample.mjs";
import { getQRAsEPS } from "../src/eps";
import {
  FRAME_LABEL_ATTRIBUTE,
  frameLabels,
  getFrameLayout,
} from "../src/frame";
import { OFFICIAL_FRAMES } from "../src/frames/official";
import { getQRAsSVGDataUri } from "../src/index";
import { getQRAsPrintPDFBuffer } from "../src/print";
import { parseSvgMarkup, type SvgNode } from "../src/utils/svg-geometry";
import type { AnyQRFrame, FrameSpec, QRProps } from "../types";
import { FRAME_STYLES } from "../types/frame";
import { getFrameSpecIssues } from "../types/frame-spec";
import { renderSvg } from "./support/qr";

const VALUE = "https://qrdx.dev/q/Ab3dE9x";
// Official frames draw labels through one code path: the hand-made frames
// and one frame per generator layout cover it (every frame with
// QRDX_FULL_FRAME_SCAN=1, split by QRDX_FRAME_SCAN_PART;
// scripts/official-frames/sample.mjs).
const MARKED_IDS = new Set([...HAND_MADE, ...layoutSample()]);
const MARKER_FRAMES = framePart(
  fullFrameScan()
    ? OFFICIAL_FRAMES
    : OFFICIAL_FRAMES.filter((frame) => MARKED_IDS.has(frame.id))
);
const BUILT_IN = FRAME_STYLES.filter((style) => style !== "none");
// The built-in styles that draw `secondaryText`
const SECOND_LINE = ["banner-top-bottom", "circle", "menu-card"];

const MARKER = new RegExp(` ${FRAME_LABEL_ATTRIBUTE}="[^"]*"`, "g");

function textNodes(markup: string): SvgNode[] {
  const found: SvgNode[] = [];
  const walk = (node: SvgNode) => {
    if (node.name === "text") found.push(node);
    node.children.forEach(walk);
  };
  const root = parseSvgMarkup(markup);
  if (root) walk(root);
  return found;
}

function markersOf(props: QRProps): string[] {
  const nodes = textNodes(renderSvg({ ...props, frameLabelMarkers: true }));
  return nodes.map((node) => node.attrs[FRAME_LABEL_ATTRIBUTE] ?? "");
}

const builtIn = (style: (typeof BUILT_IN)[number]): QRProps => ({
  value: VALUE,
  size: 256,
  frame: { style, text: "Scan me now", secondaryText: "qrdx.dev" },
});

const official = (spec: FrameSpec): QRProps => ({
  value: VALUE,
  size: 256,
  frame: { style: "custom", spec },
});

/** Two text labels, a fixed one and a curved one, like a community frame. */
const COMMUNITY_SPEC: FrameSpec = {
  kind: "qrdx.frame",
  version: 1,
  artboard: { width: 1600, height: 1600 },
  qr: { x: 400, y: 400, size: 800 },
  colors: { frame: "#111111", text: "#ffffff" },
  shapes: [
    { type: "rect", x: 0, y: 0, width: 1600, height: 1600, fill: "frame" },
  ],
  labels: [
    {
      type: "curved",
      id: "arc",
      slot: "fixed",
      text: "Open house",
      color: "text",
      curve: { cx: 800, cy: 800, radius: 720, side: "top", spread: 40 },
      fontSize: 50,
    },
    {
      type: "text",
      id: "cta",
      slot: "primary",
      text: "Scan for photos",
      color: "text",
      box: { x: 400, y: 1290, width: 800, height: 90 },
    },
    {
      type: "text",
      id: "note",
      slot: "secondary",
      text: "Book a viewing",
      color: "text",
      box: { x: 400, y: 1390, width: 800, height: 70 },
      weight: "regular",
    },
  ],
};

test("the community sample is a valid spec", () => {
  expect(getFrameSpecIssues(COMMUNITY_SPEC)).toEqual([]);
});

describe("every frame label carries its field", () => {
  it.each(BUILT_IN)("%s", (style) => {
    const markers = markersOf(builtIn(style));
    expect(markers.length).toBeGreaterThan(0);
    expect(markers.every((marker) => marker !== "")).toBe(true);
    const expected = SECOND_LINE.includes(style)
      ? ["secondaryText", "text"]
      : ["text"];
    expect([...new Set(markers)].sort()).toEqual(expected);
  });

  it.each(BUILT_IN)("%s: the layout says the same", (style) => {
    const frame = builtIn(style).frame as AnyQRFrame;
    const fields = frameLabels(getFrameLayout(256, frame)).map(
      (label) => label.field
    );
    expect(fields.length).toBeGreaterThan(0);
    expect(fields.every(Boolean)).toBe(true);
  });

  it("a built-in label's marker holds the text it draws", () => {
    const nodes = textNodes(
      renderSvg({ ...builtIn("banner-top-bottom"), frameLabelMarkers: true })
    );
    const byField = Object.fromEntries(
      nodes.map((node) => [node.attrs[FRAME_LABEL_ATTRIBUTE], node.text])
    );
    expect(byField).toEqual({ text: "Scan me now", secondaryText: "qrdx.dev" });
  });

  it.each(MARKER_FRAMES.map((frame) => [frame.id, frame] as const))(
    "official %s: each label by its spec id",
    (_id, frame) => {
      const markers = markersOf(official(frame.spec));
      const drawn = frame.spec.labels
        .filter((label) => label.text !== "")
        .map((label) => label.id);
      expect([...new Set(markers)].sort()).toEqual([...new Set(drawn)].sort());
    }
  );

  it("a community frame: two lines and every letter of a curved label", () => {
    const nodes = textNodes(
      renderSvg({ ...official(COMMUNITY_SPEC), frameLabelMarkers: true })
    );
    const arc = nodes.filter(
      (node) => node.attrs[FRAME_LABEL_ATTRIBUTE] === "arc"
    );
    // One <text> per letter, spaces skipped
    expect(arc.map((node) => node.text).join("")).toBe("Openhouse");
    expect(
      nodes
        .filter((node) => node.attrs[FRAME_LABEL_ATTRIBUTE] !== "arc")
        .map((node) => [node.attrs[FRAME_LABEL_ATTRIBUTE], node.text])
    ).toEqual([
      ["cta", "Scan for photos"],
      ["note", "Book a viewing"],
    ]);
  });
});

describe("exports never carry the marker", () => {
  const cases: [string, QRProps][] = [
    ...BUILT_IN.map((style): [string, QRProps] => [style, builtIn(style)]),
    ...MARKER_FRAMES.map((frame): [string, QRProps] => [
      `official:${frame.id}`,
      official(frame.spec),
    ]),
    ["community", official(COMMUNITY_SPEC)],
  ];

  it.each(cases)("%s: unmarked by default, markers only added", (_n, props) => {
    const plain = renderSvg(props);
    const marked = renderSvg({ ...props, frameLabelMarkers: true });
    expect(plain).not.toContain(FRAME_LABEL_ATTRIBUTE);
    expect(marked).toContain(FRAME_LABEL_ATTRIBUTE);
    // Nothing else moves: removing the markers gives the default render
    expect(marked.replace(MARKER, "")).toBe(plain);
  });

  it.each(cases)("%s: SVG export is byte-identical", async (_n, props) => {
    const plain = await getQRAsSVGDataUri(props);
    const asked = await getQRAsSVGDataUri({
      ...props,
      frameLabelMarkers: true,
    });
    expect(asked).toBe(plain);
    expect(decodeURIComponent(asked)).not.toContain(FRAME_LABEL_ATTRIBUTE);
  });

  it.each([
    [
      "sign rider",
      official(OFFICIAL_FRAMES.find((f) => f.id === "sign-rider")!.spec),
    ],
    ["circle", builtIn("circle")],
    ["menu card", builtIn("menu-card")],
    ["community", official(COMMUNITY_SPEC)],
  ] as [string, QRProps][])(
    "%s: EPS and PDF are byte-identical",
    async (_n, props) => {
      const marked = { ...props, frameLabelMarkers: true };
      expect(await getQRAsEPS(marked)).toBe(await getQRAsEPS(props));
      // jsPDF stamps the creation time and a file id; everything else matches
      const pdf = async (input: QRProps) =>
        Buffer.from(await getQRAsPrintPDFBuffer(input, { size: 50 }))
          .toString("latin1")
          .replace(/\/(CreationDate|ModDate) \(D:[^)]*\)/g, "")
          .replace(/\/ID \[[^\]]*\]/g, "");
      expect(await pdf(marked)).toBe(await pdf(props));
    }
  );
});
