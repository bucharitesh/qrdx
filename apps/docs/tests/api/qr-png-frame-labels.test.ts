// Server PNGs with frame labels (GET /v1/qr, the MCP PNGs, the server scan
// score). They're rasterized by next/og, which has no fonts on Vercel: a
// label left as SVG <text> came out as a row of empty boxes. Labels are now
// drawn from Geist's glyph outlines (lib/qr-text-outline.ts) before the
// rasterizer sees them, and PNGs without text keep their exact bytes.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { parse } from "opentype.js";
import { decodePNGPixels, getFrameLayout } from "qrdx";
import type { ReactElement } from "react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { decodeQR } from "../../../../packages/qrdx/tests/support/raster";

/** Every SVG next/og is asked to draw, decoded. */
const drawn = vi.hoisted(() => ({ svgs: [] as string[] }));

vi.mock("next/og", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/og")>();
  class ImageResponse extends actual.ImageResponse {
    constructor(
      element: ReactElement,
      options?: ConstructorParameters<typeof actual.ImageResponse>[1],
    ) {
      const img = (element.props as { children?: ReactElement }).children;
      const src = (img?.props as { src?: string } | undefined)?.src ?? "";
      const prefix = "data:image/svg+xml;base64,";
      if (src.startsWith(prefix)) {
        drawn.svgs.push(
          Buffer.from(src.slice(prefix.length), "base64").toString(),
        );
      }
      super(element, options);
    }
  }
  return { ...actual, ImageResponse };
});
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: true,
      limit: 300,
      remaining: 299,
      reset: Date.now() + 30_000,
      pending: Promise.resolve(),
    }),
  }),
}));
vi.mock("@/lib/shared", () => ({ logError: () => {} }));

const route = await import("@/app/api/v1/qr/route");
const { renderQrSvg } = await import("@/lib/qr-render");
const { qrImageQuerySchema } = await import("@/app/api/v1/qr/_lib/query");
const { resolveRender, renderStyledSvg, renderStyledPng } = await import(
  "@/lib/qr-api/render"
);
const { outlineSvgText } = await import("@/lib/qr-text-outline");
const { ImageResponse } = await import("next/og");

const get = (query: string) =>
  route.GET(new NextRequest(`http://localhost:3000/api/v1/qr?${query}`));

const bold = parse(
  readFileSync(join(process.cwd(), "app/og/fonts/Geist-Bold.ttf")).buffer,
);

async function png(query: string) {
  drawn.svgs = [];
  const response = await get(query);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/png");
  const bytes = new Uint8Array(await response.arrayBuffer());
  const decoded = await decodePNGPixels(bytes);
  if (!decoded) throw new Error("not a PNG");
  const pixels = {
    width: decoded.width,
    height: decoded.height,
    data: new Uint8ClampedArray(decoded.data),
  };
  return { bytes, pixels, svgs: drawn.svgs };
}

/** The PNG pipeline before this change: the SVG as a data-URL <img>. */
async function oldRaster(svg: string, width: number, height = width) {
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const image = new ImageResponse(
    createElement(
      "div",
      { style: { display: "flex", width: "100%", height: "100%" } },
      createElement("img", { alt: "", height, src, width }),
    ),
    { width, height },
  );
  return new Uint8Array(await image.arrayBuffer());
}

const BANNER =
  "data=https://qrdx.dev&frame=banner-bottom&frameText=Scan%20me&format=png&size=400";

describe("frame labels in server PNGs", () => {
  it("reach the rasterizer as glyph outlines, never as <text>", async () => {
    const { svgs } = await png(BANNER);
    expect(svgs).toHaveLength(1);
    expect(svgs[0]).not.toMatch(/<text\b/);
    expect(svgs[0]).toMatch(/<path d="M[^"]+" fill="#FFFFFF"\/>/);
  });

  it("decode, and draw the label as letters of the right size", async () => {
    const { pixels } = await png(BANNER);
    expect(decodeQR(pixels)).toBe("https://qrdx.dev");

    const layout = getFrameLayout(400, {
      style: "banner-bottom",
      text: "Scan me",
    });
    const label = layout.label;
    if (!label) throw new Error("no label");
    expect(pixels.width).toBe(Math.ceil(layout.width));
    // White ink on the black band, around the label's baseline
    const top = Math.floor(label.y - label.fontSize);
    const bottom = Math.ceil(label.y + label.fontSize * 0.3);
    let left = Number.POSITIVE_INFINITY;
    let right = -1;
    let inkTop = Number.POSITIVE_INFINITY;
    let inkBottom = -1;
    const columns = new Set<number>();
    for (let y = top; y <= bottom; y++) {
      for (let x = 0; x < pixels.width; x++) {
        const i = (y * pixels.width + x) * 4;
        if ((pixels.data[i] ?? 0) > 160) {
          left = Math.min(left, x);
          right = Math.max(right, x);
          inkTop = Math.min(inkTop, y);
          inkBottom = Math.max(inkBottom, y);
          columns.add(x);
        }
      }
    }
    // As wide as "Scan me" set in Geist Bold, as tall as its capitals
    const width = bold.getAdvanceWidth("Scan me", label.fontSize, {
      kerning: true,
    });
    const capHeight =
      ((bold.tables.os2 as unknown as { sCapHeight: number }).sCapHeight /
        bold.unitsPerEm) *
      label.fontSize;
    expect(right - left + 1).toBeGreaterThan(width * 0.9);
    expect(right - left + 1).toBeLessThan(width * 1.05);
    expect(inkBottom - inkTop + 1).toBeGreaterThan(capHeight * 0.9);
    expect(inkBottom - inkTop + 1).toBeLessThan(capHeight * 1.3);
    // Letters, not a filled bar: the gaps between them show
    expect(columns.size).toBeLessThan((right - left + 1) * 0.95);
    // Centred on the label's x
    expect(Math.abs((left + right) / 2 - label.x)).toBeLessThan(2);
  });

  it("set along a curve keep each letter's rotation", async () => {
    const { pixels, svgs } = await png(
      "data=https://qrdx.dev&frame=circle&frameText=Scan%20me%20now&format=png&size=400",
    );
    expect(svgs[0]).not.toMatch(/<text\b/);
    expect(svgs[0]).toMatch(
      /<path d="M[^"]+" fill="[^"]+" transform="rotate\(/,
    );
    expect(decodeQR(pixels)).toBe("https://qrdx.dev");
  });
});

describe("PNGs without text", () => {
  it("keep their exact bytes: the original parameters", async () => {
    const query = "data=https://qrdx.dev&size=300&body=circle&eye=gear&level=H";
    const { bytes } = await png(`${query}&format=png`);
    const options = qrImageQuerySchema.parse(
      Object.fromEntries(new URLSearchParams(query)),
    );
    const { format: _format, ...rest } = options;
    expect(
      Buffer.from(bytes).equals(
        Buffer.from(await oldRaster(renderQrSvg(rest), rest.size)),
      ),
    ).toBe(true);
  });

  it("keep their exact bytes: a styled code without a frame", async () => {
    const render = await resolveRender({
      data: "https://qrdx.dev/menu",
      size: 360,
      style: { fgColor: "#112233", bodyPattern: "rounded" },
      flat: {},
      scope: null,
    });
    const svg = renderStyledSvg(render);
    expect(svg).not.toMatch(/<text\b/);
    const now = await renderStyledPng(render);
    expect(
      Buffer.from(now).equals(Buffer.from(await oldRaster(svg, 360))),
    ).toBe(true);
  });
});

describe("outlineSvgText", () => {
  it("returns an SVG without text as it is", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
    expect(await outlineSvgText(svg)).toBe(svg);
  });

  it("reads escaped text and anchors it as SVG does", async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><text fill="#000" font-size="20" font-weight="700" text-anchor="end" x="100" y="40">Fish &amp; Chips</text></svg>';
    const out = await outlineSvgText(svg);
    expect(out).not.toMatch(/<text\b/);
    const width = bold.getAdvanceWidth("Fish & Chips", 20, { kerning: true });
    const expected = bold
      .getPath("Fish & Chips", 100 - width, 40, 20, { kerning: true })
      .toPathData(2);
    expect(out).toContain(`<path d="${expected}" fill="#000"/>`);
  });
});
