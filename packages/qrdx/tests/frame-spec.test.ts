// The frame spec (types/frame-spec.ts) and how the engine draws it
// (src/frame-spec.ts): schema and hard limits, text sanitizing, theme
// colors, labels, gradients, dashes, icons, the plate that keeps the quiet
// zone clear, and fuzzing of malformed specs.
import { describe, expect, it } from "vitest";
import { svgToEPS } from "../src/eps";
import {
  drawFrameOnCanvas,
  frameLabels,
  getFrameGapRatio,
  getFrameLayout,
  isFrameActive,
} from "../src/frame";
import { FRAME_ICON_BOX, getFrameIconPath } from "../src/frame-icons";
import { FrameSpecError } from "../src/frame-spec";
import { BUILT_IN_FRAME_SPECS } from "../src/frames/builtin";
import { getQRAsPrintPDFBuffer } from "../src/print";
import {
  countPathSegments,
  tokenizePathData,
  writePathData,
} from "../src/utils/path-data";
import { segmentsBounds } from "../src/utils/polygon-clip";
import { parsePathData, parseSvgMarkup } from "../src/utils/svg-geometry";
import type { AnyQRFrame, FrameSpec, QRProps } from "../types";
import { FRAME_STYLES, frameSchema } from "../types/frame";
import {
  anyFrameSchema,
  FRAME_ICON_MAX_SEGMENTS,
  FRAME_ICONS,
  frameSpecSchema,
  getFrameSpecIssues,
  sanitizeFrameText,
} from "../types/frame-spec";
import { qrPropsSchema } from "../types/qr";
import { capture, renderSvg } from "./support/qr";

/** A small valid spec: a card, a window, a primary and a secondary label. */
function baseSpec(): FrameSpec {
  return {
    kind: "qrdx.frame",
    version: 1,
    artboard: { width: 1200, height: 1500 },
    qr: { x: 100, y: 100, size: 1000, padding: 80 },
    colors: { frame: "#111111", text: "#ffffff" },
    shapes: [
      {
        type: "rect",
        x: 0,
        y: 0,
        width: 1200,
        height: 1500,
        radius: 40,
        fill: "frame",
      },
    ],
    labels: [
      {
        type: "text",
        id: "cta",
        slot: "primary",
        text: "Scan me",
        color: "text",
        box: { x: 100, y: 1200, width: 1000, height: 160 },
      },
      {
        type: "text",
        id: "note",
        slot: "secondary",
        text: "qrdx.dev",
        color: "text",
        box: { x: 100, y: 1360, width: 1000, height: 100 },
        weight: "regular",
      },
    ],
  };
}

const custom = (spec: unknown, extra: Partial<AnyQRFrame> = {}) =>
  ({ style: "custom", spec, ...extra }) as AnyQRFrame;

const issuesOf = (mutate: (spec: FrameSpec) => unknown) => {
  const spec = baseSpec();
  return getFrameSpecIssues(mutate(spec) ?? spec).join("\n");
};

describe("frame text", () => {
  it("strips controls, invisible and direction characters", () => {
    expect(sanitizeFrameText("  Scan\u0000 me\u0007 ")).toBe("Scan me");
    expect(sanitizeFrameText("Scan‮em‬")).toBe("Scanem");
    expect(sanitizeFrameText("Wi​Fi﻿")).toBe("WiFi");
    expect(sanitizeFrameText("line\nbreak\ttab")).toBe("line break tab");
    expect(sanitizeFrameText("lone \uD800 surrogate")).toBe("lone surrogate");
    expect(sanitizeFrameText("Café")).toBe("Café");
  });

  it("caps at 24 characters without splitting a character", () => {
    expect(Array.from(sanitizeFrameText("x".repeat(40)))).toHaveLength(24);
    const emoji = sanitizeFrameText(`${"a".repeat(23)}\u{1F600}\u{1F600}`);
    expect(emoji).toBe(`${"a".repeat(23)}\u{1F600}`);
    expect(sanitizeFrameText("abcdef", 3)).toBe("abc");
  });
});

describe("frame spec schema", () => {
  it("accepts a valid spec and the built-in ones", () => {
    expect(getFrameSpecIssues(baseSpec())).toEqual([]);
    for (const spec of Object.values(BUILT_IN_FRAME_SPECS)) {
      expect(getFrameSpecIssues(spec)).toEqual([]);
    }
  });

  it("rejects unknown keys anywhere (no href, handlers or extras)", () => {
    expect(issuesOf((s) => ({ ...s, onload: "alert(1)" }))).toMatch(
      /onload|Unrecognized/i
    );
    expect(
      issuesOf((s) => ({
        ...s,
        shapes: [{ ...s.shapes[0], href: "https://x" }],
      }))
    ).not.toBe("");
    const polluted = JSON.parse(
      JSON.stringify(baseSpec()).replace('"kind"', '"__proto__":{"x":1},"kind"')
    );
    expect(getFrameSpecIssues(polluted)).not.toEqual([]);
    expect(
      issuesOf((s) => ({ ...s, labels: [{ ...s.labels[0], html: "<b>" }] }))
    ).not.toBe("");
  });

  it("rejects other kinds and versions", () => {
    expect(issuesOf((s) => ({ ...s, version: 2 }))).not.toBe("");
    expect(issuesOf((s) => ({ ...s, kind: "svg" }))).not.toBe("");
    expect(getFrameSpecIssues(null)).not.toEqual([]);
    expect(getFrameSpecIssues("<svg/>")).not.toEqual([]);
  });

  it("allows only plain path data", () => {
    const withPath = (d: string) =>
      issuesOf((s) => {
        s.shapes.push({ type: "path", d, fill: "frame" });
      });
    expect(withPath("M10 10L20 20Z")).toBe("");
    expect(withPath("M10 10l10-5a5 5 0 011 2z")).toBe("");
    for (const d of [
      "M0 0 url(#a)",
      "M0 0<script>",
      "M1e3 0",
      "M0.0001 0",
      "L10 10",
      "M0 0 L10",
      "M0 0 X10 10",
    ]) {
      expect(withPath(d), d).toMatch(/Path data/);
    }
  });

  it("limits numbers: precision, range, finiteness", () => {
    expect(issuesOf((s) => ({ ...s, qr: { ...s.qr, x: 100.0001 } }))).toMatch(
      /decimals/
    );
    expect(issuesOf((s) => ({ ...s, qr: { ...s.qr, x: 5000 } }))).not.toBe("");
    expect(
      issuesOf((s) => ({ ...s, qr: { ...s.qr, x: Number.NaN } }))
    ).not.toBe("");
    expect(
      issuesOf((s) => ({ ...s, qr: { ...s.qr, x: Number.POSITIVE_INFINITY } }))
    ).not.toBe("");
    expect(
      issuesOf((s) => ({ ...s, artboard: { width: 40, height: 1500 } }))
    ).toMatch(/Artboard/);
    expect(
      issuesOf((s) => ({ ...s, artboard: { width: 2400, height: 1500 } }))
    ).toMatch(/Artboard/);
  });

  it("keeps the code big, padded and inside the artboard", () => {
    expect(issuesOf((s) => ({ ...s, qr: { ...s.qr, size: 500 } }))).toMatch(
      /at least 50%/
    );
    expect(issuesOf((s) => ({ ...s, qr: { ...s.qr, padding: 20 } }))).toMatch(
      /padding/
    );
    expect(issuesOf((s) => ({ ...s, qr: { ...s.qr, x: 150 } }))).toMatch(
      /inside the artboard/
    );
  });

  it("keeps shapes and labels on the artboard and labels off the code", () => {
    expect(
      issuesOf((s) => {
        s.shapes.push({
          type: "circle",
          cx: 1190,
          cy: 10,
          r: 50,
          fill: "frame",
        });
      })
    ).toMatch(/outside the artboard/);
    expect(
      issuesOf((s) => {
        s.labels[0] = {
          ...s.labels[0],
          box: { x: 100, y: 1100, width: 1000, height: 160 },
        } as never;
      })
    ).toMatch(/overlaps the code/);
    expect(
      issuesOf((s) => {
        s.labels.push({
          type: "curved",
          id: "arc",
          slot: "fixed",
          text: "ARC",
          color: "text",
          curve: { cx: 600, cy: 600, radius: 600, side: "top" },
          fontSize: 60,
        });
      })
    ).toMatch(/curved label/);
  });

  it("checks labels: ids, slots, clean text, font size", () => {
    expect(
      issuesOf((s) => {
        s.labels[1] = { ...s.labels[1], id: "cta" } as never;
      })
    ).toMatch(/used twice/);
    expect(
      issuesOf((s) => {
        s.labels[1] = { ...s.labels[1], slot: "primary" } as never;
      })
    ).toMatch(/Only one/);
    expect(
      issuesOf((s) => {
        s.labels[0] = { ...s.labels[0], text: "Scan‮me" } as never;
      })
    ).toMatch(/control or invisible/);
    expect(
      issuesOf((s) => {
        s.labels[0] = { ...s.labels[0], text: "x".repeat(25) } as never;
      })
    ).toMatch(/at most 24/);
    expect(
      issuesOf((s) => {
        s.labels[0] = { ...s.labels[0], maxLength: 4 } as never;
      })
    ).toMatch(/at most 4/);
    expect(
      issuesOf((s) => {
        s.labels[0] = { ...s.labels[0], fontSize: 155 } as never;
      })
    ).toMatch(/95%/);
  });

  it("accepts only hex colors and theme tokens", () => {
    for (const fill of [
      "red",
      "#12345",
      "url(#g)",
      "rgb(0,0,0)",
      "currentColor",
    ]) {
      expect(
        issuesOf((s) => {
          s.shapes[0] = { ...s.shapes[0], fill } as never;
        }),
        fill
      ).not.toBe("");
    }
    for (const fill of [
      "#abc",
      "#AABBCC",
      "accent",
      "background",
      { mix: ["frame", "#ffffff"], amount: 0.5 },
    ]) {
      expect(
        issuesOf((s) => {
          s.shapes[0] = { ...s.shapes[0], fill } as never;
        })
      ).toBe("");
    }
    expect(
      issuesOf((s) => {
        s.shapes[0] = {
          ...s.shapes[0],
          fill: {
            mix: [{ mix: ["frame", "text"], amount: 1 }, "text"],
            amount: 0.5,
          },
        } as never;
      })
    ).not.toBe("");
  });

  it("enforces the element, segment, dash, gradient and size limits", () => {
    const rects = (n: number) =>
      Array.from({ length: n }, () => ({
        type: "rect",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        fill: "frame",
      }));
    expect(issuesOf((s) => ({ ...s, shapes: rects(65) }))).not.toBe("");
    expect(
      issuesOf((s) => ({
        ...s,
        labels: Array.from({ length: 9 }, (_, i) => ({
          ...s.labels[1],
          id: `l${i}`,
          slot: "fixed",
        })),
      }))
    ).not.toBe("");
    const points = Array.from(
      { length: 257 },
      (_, i) => [i, i] as [number, number]
    );
    expect(
      issuesOf((s) => {
        s.shapes.push({ type: "polygon", points, fill: "frame" });
      })
    ).not.toBe("");
    const zigzag = `M0 0${" L10 10 L0 20".repeat(1100)}`;
    expect(
      issuesOf((s) => {
        s.shapes.push({ type: "path", d: zigzag, fill: "frame" });
      })
    ).toMatch(/segments|16000|too_big/i);
    expect(
      issuesOf((s) => {
        s.shapes.push({
          type: "line",
          x1: 0,
          y1: 10,
          x2: 1200,
          y2: 10,
          width: 4,
          dash: [0.5, 0.5],
          fill: "frame",
        });
      })
    ).toMatch(/segments/);
    expect(
      issuesOf((s) => ({
        ...s,
        shapes: Array.from({ length: 40 }, () => ({
          type: "rect",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          fill: { gradient: { from: "frame", to: "text", steps: 64 } },
        })),
      }))
    ).toMatch(/Gradient/);
    const big = Array.from({ length: 60 }, () => ({
      type: "polygon",
      points: Array.from({ length: 30 }, (_, i) => [
        1000.125 + (i % 7),
        100.375 + i,
      ]),
      fill: "frame",
    }));
    expect(issuesOf((s) => ({ ...s, shapes: big }))).toMatch(/bytes/);
  });

  it("is a separate style: built-in frame options are unchanged", () => {
    expect(FRAME_STYLES).not.toContain("custom");
    expect(
      frameSchema.safeParse({ style: "custom", spec: baseSpec() }).success
    ).toBe(false);
    expect(
      anyFrameSchema.safeParse({
        style: "custom",
        spec: baseSpec(),
        text: "Hi",
      }).success
    ).toBe(true);
    expect(
      anyFrameSchema.safeParse({ style: "banner-top", text: "Hi" }).success
    ).toBe(true);
    expect(anyFrameSchema.safeParse({ style: "custom" }).success).toBe(false);
    expect(
      qrPropsSchema.safeParse({ value: "x", frame: custom(baseSpec()) }).success
    ).toBe(true);
  });
});

describe("drawing a frame spec", () => {
  it("fails loudly on an invalid or missing spec", () => {
    expect(isFrameActive(custom(undefined))).toBe(true);
    expect(() => getFrameLayout(200, custom(undefined))).toThrow(
      FrameSpecError
    );
    expect(() =>
      getFrameLayout(200, custom({ ...baseSpec(), version: 9 }))
    ).toThrow(/Invalid frame spec/);
    try {
      getFrameLayout(
        200,
        custom({ ...baseSpec(), qr: { x: 0, y: 0, size: 10 } })
      );
    } catch (error) {
      expect((error as FrameSpecError).issues.length).toBeGreaterThan(0);
    }
  });

  it("scales the spec so the code is the requested size", () => {
    const layout = getFrameLayout(300, custom(baseSpec()));
    expect(layout.qrSize).toBe(300);
    expect(layout.width).toBeCloseTo(360);
    expect(layout.height).toBeCloseTo(450);
    expect(layout.qrX).toBeCloseTo(30);
  });

  it("fills the slots from the frame text, sanitized", () => {
    const texts = (frame: Partial<AnyQRFrame>) =>
      frameLabels(getFrameLayout(300, custom(baseSpec(), frame))).map(
        (label) => label.text
      );
    expect(texts({})).toEqual(["Scan me", "qrdx.dev"]);
    expect(texts({ text: "Join\u0000 us", secondaryText: "" })).toEqual([
      "Join us",
    ]);
    expect(texts({ text: "" })).toEqual(["qrdx.dev"]);
    const spec = baseSpec();
    spec.labels[0] = { ...spec.labels[0], maxLength: 5 } as never;
    spec.labels[0].text = "Scan";
    expect(
      frameLabels(
        getFrameLayout(300, custom(spec, { text: "Scan this now" }))
      )[0]?.text
    ).toBe("Scan");
  });

  it("binds colors to the theme, with the spec's defaults", () => {
    const fills = (frame: Partial<AnyQRFrame>, bg?: string) => {
      const layout = getFrameLayout(300, custom(baseSpec(), frame), bg);
      return {
        card: layout.shapes[0]?.fill,
        plate: layout.shapes.at(-1)?.fill,
        label: frameLabels(layout)[0]?.color,
      };
    };
    expect(fills({})).toEqual({
      card: "#111111",
      plate: "#FFFFFF",
      label: "#ffffff",
    });
    expect(
      fills({ color: "#be123c", textColor: "#fde68a" }, "#fef3c7")
    ).toEqual({
      card: "#be123c",
      plate: "#fef3c7",
      label: "#fde68a",
    });
    // The plate stays opaque on a transparent background
    expect(fills({}, "transparent").plate).toBe("#FFFFFF");
  });

  it("aligns labels and sets their weight in every output", async () => {
    const spec = baseSpec();
    spec.labels[0] = { ...spec.labels[0], align: "start" } as never;
    spec.labels[1] = { ...spec.labels[1], align: "end" } as never;
    const layout = getFrameLayout(1000, custom(spec));
    const [start, end] = frameLabels(layout);
    expect(start?.align).toBe("start");
    expect(start?.x).toBeCloseTo(100);
    expect(end?.x).toBeCloseTo(1100);
    expect(end?.fontWeight).toBe(400);
    const svg = renderSvg({ value: "frame", size: 200, frame: custom(spec) });
    expect(svg).toContain('text-anchor="start"');
    expect(svg).toContain('text-anchor="end"');
    expect(svg).toContain('font-weight="400"');
    const eps = await svgToEPS(svg);
    expect(eps).toContain("/QRDX-Regular");
    expect(eps).toContain("/QRDX-Bold");
  });

  it("scales labels with fontScale", () => {
    const size = (fontScale: number) =>
      frameLabels(getFrameLayout(1000, custom(baseSpec(), { fontScale })))[0]
        ?.fontSize ?? 0;
    expect(size(0.5)).toBeLessThan(size(1));
    expect(size(1.5)).toBeGreaterThan(size(1));
    expect(size(1.5)).toBeLessThanOrEqual(160 * 0.95 + 1e-9);
  });

  it("draws gradients as solid steps from one color to the other", () => {
    const spec = baseSpec();
    spec.shapes[0] = {
      ...spec.shapes[0],
      fill: {
        gradient: {
          from: "#000000",
          to: "#ffffff",
          direction: "vertical",
          steps: 16,
        },
      },
    } as never;
    const layout = getFrameLayout(500, custom(spec));
    const steps = layout.shapes.slice(0, -1);
    expect(steps).toHaveLength(16);
    const level = (fill: string) => Number.parseInt(fill.slice(1, 3), 16);
    expect(level(steps[0]?.fill ?? "")).toBeLessThan(16);
    expect(level(steps.at(-1)?.fill ?? "")).toBeGreaterThan(239);
    expect(steps.every((shape) => shape.type === "path")).toBe(true);
  });

  it("cuts dashed lines into whole dashes, with square or round ends", () => {
    const spec = baseSpec();
    spec.shapes.push({
      type: "line",
      x1: 100,
      y1: 1190,
      x2: 1100,
      y2: 1190,
      width: 10,
      dash: [60, 40],
      fill: "background",
    });
    spec.shapes.push({
      type: "line",
      x1: 100,
      y1: 1195,
      x2: 1100,
      y2: 1195,
      width: 10,
      cap: "round",
      fill: "background",
    });
    const layout = getFrameLayout(1000, custom(spec));
    const dashed = layout.shapes[1];
    const round = layout.shapes[2];
    expect(dashed?.type === "path" && dashed.d.match(/M/g)?.length).toBe(10);
    expect(round?.type === "path" && round.d.includes("A")).toBe(true);
  });

  it("has icons that stay in their box and within the segment budget", () => {
    for (const icon of FRAME_ICONS) {
      const { d } = getFrameIconPath(icon);
      const commands = tokenizePathData(d, 3);
      expect(commands, icon).not.toBeNull();
      expect(countPathSegments(commands ?? []), icon).toBeLessThanOrEqual(
        FRAME_ICON_MAX_SEGMENTS
      );
      const box = segmentsBounds(parsePathData(d));
      expect(
        box &&
          box.x0 >= -0.01 &&
          box.y0 >= -0.01 &&
          box.x1 <= FRAME_ICON_BOX + 0.01 &&
          box.y1 <= FRAME_ICON_BOX + 0.01,
        icon
      ).toBe(true);
    }
  });

  it("keeps the quiet zone clear even under artwork that covers the code", () => {
    // A black square right under the code: the plate covers it.
    const spec = baseSpec();
    spec.shapes.push({
      type: "rect",
      x: 100,
      y: 100,
      width: 1000,
      height: 1000,
      fill: "#000000",
    });
    const props: QRProps = {
      value: "https://qrdx.dev/q/Ab3dE9x",
      size: 256,
      level: "M",
      frame: custom(spec),
    };
    expect(capture(props, { modulePx: 6 })).toBe(props.value);
    expect(getFrameGapRatio(custom(spec))).toBeCloseTo(0.08);
  });

  it("escapes hostile label text in SVG, EPS and PDF", async () => {
    const text = '<b>(x)\\ & "q"</b>';
    const frame = custom(baseSpec(), { text: text.slice(0, 24) });
    const svg = renderSvg({ value: "frame", size: 200, frame });
    expect(svg).not.toContain("<b>");
    expect(parseSvgMarkup(svg)).not.toBeNull();
    const eps = await svgToEPS(svg);
    expect(eps).toContain("\\(x\\)\\\\");
    const pdf = await getQRAsPrintPDFBuffer(
      { value: "frame", size: 200, frame },
      { size: 30 }
    );
    expect(
      new TextDecoder().decode(new Uint8Array(pdf)).startsWith("%PDF-")
    ).toBe(true);
  });
});

describe("path data", () => {
  it("reads compact and implicit forms and writes them scaled", () => {
    const commands = tokenizePathData("M10 20 30 40l5-5h2v-2a5 5 0 016 6z");
    expect(commands?.map((c) => c.command).join("")).toBe("MLlhvaz");
    const written = writePathData(commands ?? [], 2, 1, 1);
    expect(written).toBe("M21 41L61 81l10 -10h4v-4a10 10 0 0 1 12 12z");
  });

  it("rejects anything outside the grammar", () => {
    for (const d of [
      "",
      "Z",
      "M",
      "M1",
      "M1 2 3",
      "M1 2e3",
      "M1 2 L",
      "M1 2 A1 1 0 2 0 3 3",
      "M1 2;",
    ]) {
      expect(
        d === "" ? tokenizePathData(d)?.length : tokenizePathData(d),
        d
      ).toBeFalsy();
    }
  });
});

describe("fuzzing malformed specs", () => {
  it("never throws while validating, and every valid result draws", () => {
    let seed = 11;
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    const values: unknown[] = [
      -1,
      0,
      0.5,
      1e9,
      Number.NaN,
      "",
      "frame",
      "#fff",
      "M0 0",
      null,
      [],
      {},
      true,
      "<script>",
      1.234_56,
    ];
    const mutate = (node: unknown): unknown => {
      if (Array.isArray(node)) {
        if (random() < 0.02)
          return values[Math.floor(random() * values.length)];
        return node.map((item) => mutate(item));
      }
      if (node && typeof node === "object") {
        const out: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(node)) {
          const roll = random();
          if (roll < 0.01) continue;
          out[key] =
            roll < 0.03
              ? values[Math.floor(random() * values.length)]
              : mutate(value);
        }
        if (random() < 0.01) out.extra = "x";
        return out;
      }
      // Small numeric nudges keep many candidates valid
      if (typeof node === "number" && random() < 0.05) {
        return Math.round((node + (random() - 0.5) * 200) * 10) / 10;
      }
      return random() < 0.02
        ? values[Math.floor(random() * values.length)]
        : node;
    };
    let valid = 0;
    for (let round = 0; round < 400; round++) {
      const candidate = mutate(baseSpec());
      let result: ReturnType<typeof frameSpecSchema.safeParse> | undefined;
      expect(() => {
        result = frameSpecSchema.safeParse(candidate);
      }).not.toThrow();
      if (result?.success) {
        valid++;
        const layout = getFrameLayout(200, custom(candidate));
        expect(
          Number.isFinite(layout.width) && Number.isFinite(layout.height)
        ).toBe(true);
        expect(
          renderSvg({ value: "x", size: 120, frame: custom(candidate) })
        ).not.toMatch(/NaN|Infinity/);
      }
    }
    expect(valid).toBeGreaterThan(20);
  });
});

// Added with the built-in frames as specs (src/frames/builtin)
describe("spec fields the built-in frames use", () => {
  it("cuts a label's collapse band out when the label is empty", () => {
    const spec = baseSpec();
    spec.labels = [
      {
        ...(spec.labels[0] as Extract<
          FrameSpec["labels"][number],
          { type: "text" }
        >),
        collapse: { y: 1200, height: 160 },
      },
    ];
    // A shape wholly inside the band goes with it; one crossing it shrinks
    spec.shapes.push({
      type: "rect",
      x: 500,
      y: 1250,
      width: 200,
      height: 50,
      fill: "accent",
    });
    expect(getFrameSpecIssues(spec)).toEqual([]);
    const full = getFrameLayout(1000, custom(spec));
    const empty = getFrameLayout(1000, custom(spec, { text: "" }));
    expect(full.height).toBeCloseTo(1500);
    expect(empty.height).toBeCloseTo(1340);
    expect(empty.qrY).toBeCloseTo(full.qrY);
    expect(frameLabels(empty)).toEqual([]);
    // card, accent rect, plate → card, plate
    expect(full.shapes).toHaveLength(3);
    expect(empty.shapes).toHaveLength(2);
    const card = empty.shapes[0];
    expect(card?.type === "rect" && card.height).toBeCloseTo(1340);
  });

  it("moves path points below a band up, relative commands included", () => {
    const spec = baseSpec();
    spec.labels = [
      {
        ...(spec.labels[0] as Extract<
          FrameSpec["labels"][number],
          { type: "text" }
        >),
        collapse: { y: 1200, height: 100 },
      },
    ];
    spec.shapes = [{ type: "path", d: "M0 1400l100 0V1500H0z", fill: "frame" }];
    const layout = getFrameLayout(1000, custom(spec, { text: "" }));
    const path = layout.shapes[0];
    expect(path?.type === "path" && path.d).toBe("M0 1300L100 1300V1400H0Z");
  });

  it("keeps collapse bands off the code and off each other", () => {
    const band = (y: number, height: number) => (spec: FrameSpec) => {
      const label = spec.labels[0] as Extract<
        FrameSpec["labels"][number],
        { type: "text" }
      >;
      label.collapse = { y, height };
    };
    expect(issuesOf(band(1000, 200))).toMatch(/crosses the code/);
    expect(issuesOf(band(1400, 200))).toMatch(/inside the artboard/);
    expect(
      issuesOf((spec) => {
        band(1200, 160)(spec);
        const note = spec.labels[1] as Extract<
          FrameSpec["labels"][number],
          { type: "text" }
        >;
        note.collapse = { y: 1300, height: 100 };
      })
    ).toMatch(/may not overlap/);
  });

  it("lets a label's row reach into the padding while its letters stay off it", () => {
    // The row starts at the code's edge: its capitals, at the largest
    // font, still clear the 40-unit padding
    const near = (spec: FrameSpec) => {
      spec.qr.padding = 40;
      const label = spec.labels[0] as Extract<
        FrameSpec["labels"][number],
        { type: "text" }
      >;
      label.box = { x: 100, y: 1100, width: 1000, height: 180 };
    };
    expect(issuesOf(near)).toBe("");
    // Over the code itself, never
    expect(
      issuesOf((spec) => {
        near(spec);
        (spec.labels[0] as { box: { y: number } }).box.y = 1090;
      })
    ).toMatch(/overlaps the code/);
    // Letters that would reach the padding
    expect(
      issuesOf((spec) => {
        near(spec);
        (spec.labels[0] as { box: { height: number } }).box.height = 120;
      })
    ).toMatch(/overlaps the code/);
  });

  it("works out a default text color from the frame and accent colors", () => {
    const spec = baseSpec();
    spec.colors = {
      frame: "#000000",
      accent: "#ffffff",
      text: { mix: ["frame", "accent"], amount: 0.5 },
    };
    expect(getFrameSpecIssues(spec)).toEqual([]);
    const label = (frame: Partial<AnyQRFrame>) =>
      frameLabels(getFrameLayout(1000, custom(spec, frame)))[0]?.color;
    expect(label({})).toBe("#808080");
    expect(label({ color: "#ff0000" })).toBe("#ff8080");
    expect(label({ textColor: "#123456" })).toBe("#123456");
    // It can't refer to itself
    expect(
      getFrameSpecIssues({
        ...spec,
        colors: {
          frame: "#000000",
          text: { mix: ["text", "frame"], amount: 0.5 },
        },
      })
    ).not.toEqual([]);
  });

  it('keeps a see-through background with plate "background" only when nothing lies under the plate', () => {
    const ring = (): FrameSpec => ({
      ...baseSpec(),
      qr: { x: 100, y: 100, size: 1000, padding: 80, plate: "background" },
      shapes: [
        {
          type: "rect",
          x: 20,
          y: 20,
          width: 1160,
          height: 1160,
          fill: "background",
        },
        {
          type: "rect",
          x: 0,
          y: 0,
          width: 1200,
          height: 1500,
          fill: "frame",
          hole: { x: 20, y: 20, width: 1160, height: 1160 },
        },
      ],
    });
    expect(getFrameSpecIssues(ring())).toEqual([]);
    const layout = getFrameLayout(1000, custom(ring()), "transparent");
    expect(layout.shapes.map((shape) => shape.fill)).toEqual([
      "transparent",
      "#111111",
    ]);
    // An opaque background still gets the plate
    expect(getFrameLayout(1000, custom(ring()), "#fef3c7").shapes).toHaveLength(
      3
    );
    // Artwork under the plate isn't allowed
    const covered = ring();
    covered.shapes.push({
      type: "circle",
      cx: 600,
      cy: 600,
      r: 100,
      fill: "frame",
    });
    expect(getFrameSpecIssues(covered).join()).toMatch(/plate "background"/);
    // Without it, the plate stays opaque: white on a see-through background
    const opaque = baseSpec();
    expect(
      getFrameLayout(1000, custom(opaque), "transparent").shapes.at(-1)?.fill
    ).toBe("#FFFFFF");
  });

  it("draws every built-in style from its spec", () => {
    for (const style of FRAME_STYLES.filter((name) => name !== "none")) {
      const spec = BUILT_IN_FRAME_SPECS[style];
      expect(getFrameSpecIssues(spec), style).toEqual([]);
      // A style and its spec as a custom frame draw the same artwork; only
      // the labels' fields differ (the frame options they edit)
      const named = getFrameLayout(256, { style, secondaryText: "qrdx.dev" });
      const asSpec = getFrameLayout(
        256,
        custom(spec, { secondaryText: "qrdx.dev" })
      );
      expect(asSpec.shapes).toEqual(named.shapes);
      expect(frameLabels(named).map((label) => label.field)).toEqual(
        frameLabels(asSpec).map((label) =>
          label.field === spec?.labels.find((l) => l.slot === "secondary")?.id
            ? "secondaryText"
            : "text"
        )
      );
    }
  });
});

// Added with the built-in templates as specs (src/template/specs)
describe("spec fields the built-in templates use", () => {
  const stroked = (): FrameSpec => ({
    ...baseSpec(),
    shapes: [
      {
        type: "circle",
        cx: 600,
        cy: 600,
        r: 560,
        hole: 540,
        fill: "#ffffff",
        stroke: { color: "frame", width: 20 },
      },
    ],
  });

  it("outlines a shape with a stroke in every output", async () => {
    expect(getFrameSpecIssues(stroked())).toEqual([]);
    const layout = getFrameLayout(1000, custom(stroked(), { color: "#be123c" }));
    const ring = layout.shapes[0];
    expect(ring?.stroke).toBe("#be123c");
    expect(ring?.strokeWidth).toBeCloseTo(20);
    const svg = renderSvg({ value: "stroke", size: 200, frame: custom(stroked()) });
    expect(svg).toMatch(/stroke="#111111" stroke-width="4"/);
    // A canvas strokes it after its fill
    const calls: string[] = [];
    const ctx = new Proxy(
      {},
      {
        get: (_t, key: string) => () => calls.push(key),
        set: (_t, key: string, value) => {
          calls.push(`${key}=${value}`);
          return true;
        },
      }
    ) as unknown as CanvasRenderingContext2D;
    const previous = (globalThis as Record<string, unknown>).Path2D;
    (globalThis as Record<string, unknown>).Path2D = class {};
    try {
      drawFrameOnCanvas(ctx, layout);
    } finally {
      (globalThis as Record<string, unknown>).Path2D = previous;
    }
    expect(calls.indexOf("stroke")).toBeGreaterThan(calls.indexOf("fill"));
    expect(calls).toContain("lineWidth=20");
    // EPS strokes it too
    const eps = await svgToEPS(svg);
    expect(eps).toMatch(/ w .* s\n/);
  });

  it("keeps strokes thin and inside the artboard", () => {
    const thick = stroked();
    (thick.shapes[0] as { stroke: { width: number } }).stroke.width = 200;
    expect(getFrameSpecIssues(thick).join()).toMatch(/at most 10%/);
    const wide = stroked();
    // The circle fits; its stroke, half outside the edge, doesn't
    (wide.shapes[0] as { r: number }).r = 598;
    expect(getFrameSpecIssues(wide).join()).toMatch(/outside the artboard/);
  });

  it("draws no plate with qr.plate none, and allows a tighter padding", () => {
    const spec: FrameSpec = {
      ...baseSpec(),
      qr: { x: 100, y: 100, size: 1000, padding: 10, plate: "none" },
    };
    expect(getFrameSpecIssues(spec)).toEqual([]);
    // The card only: no plate behind the code
    expect(getFrameLayout(1000, custom(spec)).shapes).toHaveLength(1);
    expect(getFrameGapRatio(custom(spec))).toBeCloseTo(0.01);
    // Other plates still need 4%
    expect(
      getFrameSpecIssues({ ...spec, qr: { ...spec.qr, plate: "opaque" } }).join()
    ).toMatch(/at least 4%/);
  });
});
