// Code shapes traced from an upload (`silhouette`) travel like logos: only
// the grid is stored (validated and capped), it draws in every preview and
// export, and it never goes into a link, a community item, a snippet or
// the AI's context. A grid the code can't fit in is refused.
import { createQRSilhouette } from "qrdx";
import type { QRSilhouette } from "qrdx/types";
import { describe, expect, it } from "vitest";
import {
  cliSnippet,
  imageSnippet,
  mcpSnippet,
  reactSnippet,
  restSnippet,
  shadcnSnippet,
} from "@/components/editor/action-bar/code-snippets";
import { editorContextSchema } from "@/lib/ai/agent/editor-context";
import { themePayloadFromStyle } from "@/lib/community/payloads";
import { toPublishableStyle } from "@/lib/community/public-style";
import { hasSilhouette, withoutImageFills } from "@/lib/paint/image-fills";
import { decodeStyleParam, encodeStyleParam } from "@/lib/playground-style";
import {
  styleEngineOptions,
  styleSvgOptions,
} from "@/lib/qr-design/engine-options";
import { silhouetteFileProblem } from "@/lib/qr-design/silhouette";
import { type ThemeStyles, themeStylePropsSchema } from "@/types/theme";

/** A silhouette sampled from pixels where `inside(x, y)` (0 to 1) holds. */
function traced(inside: (x: number, y: number) => boolean): QRSilhouette {
  const size = 128;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (inside((x + 0.5) / size, (y + 0.5) / size)) {
        data.set([17, 17, 17, 255], (y * size + x) * 4);
      }
    }
  }
  return createQRSilhouette({ width: size, height: size, data });
}

const BLOB = traced(
  (x, y) =>
    Math.hypot(x - 0.45, y - 0.5) < 0.38 || Math.hypot(x - 0.7, y - 0.6) < 0.2,
);
const BAR = traced((_x, y) => y > 0.45 && y < 0.55);

const STYLE: ThemeStyles = {
  bgColor: "#ffffff",
  fgColor: "#111827",
  bodyPattern: "rounded",
  silhouette: BLOB,
};

const cellsIn = (text: string) => text.includes(BLOB.cells.slice(0, 200));

describe("the saved design", () => {
  it("takes a silhouette the code fits in, and only its grid", () => {
    const parsed = themeStylePropsSchema.safeParse(STYLE);
    expect(parsed.success).toBe(true);
    expect(Object.keys(parsed.data?.silhouette ?? {}).sort()).toEqual([
      "cells",
      "height",
      "type",
      "width",
    ]);
  });

  it("refuses a thin one with the reason, and malformed or oversized grids", () => {
    const thin = themeStylePropsSchema.safeParse({ silhouette: BAR });
    expect(thin.success).toBe(false);
    expect(thin.error?.issues.map((issue) => issue.message).join()).toMatch(
      /too thin to hold the code/,
    );
    for (const silhouette of [
      { ...BLOB, cells: `${BLOB.cells}1` },
      { ...BLOB, width: 65 },
      { ...BLOB, cells: BLOB.cells.replace("0", "x") },
      { ...BLOB, type: "image", src: "data:image/png;base64,AAAA" },
    ]) {
      expect(themeStylePropsSchema.safeParse({ silhouette }).success).toBe(
        false,
      );
    }
  });

  it("checks the upload before reading it", () => {
    expect(silhouetteFileProblem({ type: "image/png", size: 1000 })).toBeNull();
    expect(
      silhouetteFileProblem({ type: "image/svg+xml", size: 1000 }),
    ).toBeNull();
    expect(silhouetteFileProblem({ type: "image/gif", size: 1000 })).toMatch(
      /PNG, JPEG or SVG/,
    );
    expect(
      silhouetteFileProblem({ type: "image/png", size: 6 * 1024 * 1024 }),
    ).toMatch(/too large/);
  });
});

describe("drawing", () => {
  it("draws the silhouette in place of the named shape, heart too", () => {
    expect(styleEngineOptions(STYLE).shape).toBe(BLOB);
    expect(styleEngineOptions({ ...STYLE, shape: "circle" }).shape).toBe(BLOB);
    expect(styleEngineOptions({ shape: "heart" })).toEqual({ shape: "heart" });
    expect(styleSvgOptions({ shape: "heart" })).toEqual({ shape: "heart" });
  });
});

describe("it travels like a logo", () => {
  it("withoutImageFills drops it, and keeps a plain style as is", () => {
    expect(hasSilhouette(STYLE)).toBe(true);
    const next = withoutImageFills(STYLE);
    expect(next.silhouette).toBeUndefined();
    expect(next.bodyPattern).toBe("rounded");
    const plain = { shape: "heart" as const };
    expect(withoutImageFills(plain)).toBe(plain);
  });

  it("never goes in a style link, which says so", () => {
    const encoded = encodeStyleParam({ ...STYLE, shape: "heart" });
    expect(encoded?.omitted).toEqual(["silhouette"]);
    const decoded = decodeStyleParam(encoded?.value);
    expect(decoded?.styles.silhouette).toBeUndefined();
    expect(decoded?.styles.shape).toBe("heart");
    // A forged link can't carry one either
    const forged = `1.${Buffer.from(JSON.stringify({ sh: BLOB })).toString("base64url")}`;
    expect(decodeStyleParam(forged)).toBeNull();
  });

  it("never goes in a community item", () => {
    const { style } = toPublishableStyle(STYLE);
    expect(style.silhouette).toBeUndefined();
    const built = themePayloadFromStyle(STYLE);
    expect(built).not.toBeNull();
    expect(cellsIn(JSON.stringify(built?.payload))).toBe(false);
  });

  it("never goes in a snippet, which says so", () => {
    const input = {
      style: STYLE,
      value: "https://qrdx.dev",
      contentType: "url" as const,
    };
    for (const snippet of [
      reactSnippet(input),
      shadcnSnippet(input),
      imageSnippet(input),
      restSnippet(input),
      mcpSnippet(input),
      cliSnippet(input),
    ]) {
      const code = "code" in snippet ? snippet.code : "";
      const url = "url" in snippet ? String(snippet.url) : "";
      expect(cellsIn(code + url)).toBe(false);
      expect(code + url).not.toContain('"silhouette"');
      expect(snippet.omitted.join("\n")).toMatch(/Your code shape/);
    }
  });

  it("never reaches the AI", () => {
    const parsed = editorContextSchema.parse({
      contentType: "url",
      value: "https://qrdx.dev",
      style: STYLE,
      hasArt: false,
    });
    expect(cellsIn(JSON.stringify(parsed))).toBe(false);
  });
});

describe("Design → Frame: a shaped code takes the place of a frame", () => {
  it("picking a shape clears the frame and border; a frame clears the shape", async () => {
    const { frameShapeOf, withShape, withoutShape } = await import(
      "@/components/editor/control-sections/frame-shapes"
    );
    const framed: ThemeStyles = {
      fgColor: "#111827",
      frame: { style: "banner-bottom", text: "Scan me" },
      templateId: "border",
    };
    const heart = withShape(framed, { shape: "heart" });
    expect(heart).toEqual({ fgColor: "#111827", shape: "heart" });
    expect(frameShapeOf(heart)).toBe("heart");
    const traced = withShape(heart, { silhouette: BLOB });
    expect(traced.shape).toBeUndefined();
    expect(frameShapeOf(traced)).toBe("silhouette");
    const plain = withoutShape(traced);
    expect(plain).toEqual({ fgColor: "#111827" });
    expect(frameShapeOf(plain)).toBeNull();
    expect(withoutShape(framed)).toBe(framed);
  });
});
