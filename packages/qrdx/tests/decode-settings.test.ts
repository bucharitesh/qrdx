/** biome-ignore-all lint/suspicious/noMisplacedAssertion: known() returns it or it.fails */
// Round trip renderer → pixels → jsQR across the settings a user changes:
// error correction, colors, margins, logos, frames, templates and payload size.
// Expected text is always the exact input (ISO/IEC 18004: byte mode carries
// UTF-8 unchanged).
import { describe, expect, it } from "vitest";
import { getFrameDimensions } from "../src/frame";
import { getQRData } from "../src/helpers";
import { getTemplateIds } from "../src/templates";
import type { QRProps } from "../types";
import { FRAME_STYLES } from "../types/frame";
import { knownUnreadable } from "./support/known-issues";
import {
  capture,
  PHONE_MODULE_SIZES,
  renderSvg,
  symbolSize,
} from "./support/qr";
import { decodeQR, rasterizeSvg, simulateCamera } from "./support/raster";

const VALUE = "https://qrdx.dev/q/Ab3dE9x?utm=campaign";
/** `it`, or `it.fails` for a tracked renderer bug (support/known-issues). */
const known = (id: string) => (knownUnreadable.setting(id) ? it.fails : it);
const LEVELS = ["L", "M", "Q", "H"] as const;

function decodesAtPhoneDistances(props: QRProps, page?: string) {
  return PHONE_MODULE_SIZES.filter(
    (modulePx) => capture(props, { modulePx, page }) !== props.value
  );
}

// A busy two-color logo (SVG data URI) that covers modules the way a real one does.
const LOGO = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#1d4ed8"/><circle cx="32" cy="32" r="18" fill="#fbbf24"/><rect x="24" y="8" width="6" height="48" fill="#111827"/></svg>'
)}`;

describe("error correction levels", () => {
  it.each(LEVELS)("level %s decodes with the default style", (level) => {
    expect(decodesAtPhoneDistances({ value: VALUE, level, size: 256 })).toEqual(
      []
    );
  });

  it.each(LEVELS)("level %s decodes with plain square modules", (level) => {
    expect(
      decodesAtPhoneDistances({
        value: VALUE,
        level,
        size: 256,
        bodyPattern: "square",
        cornerEyePattern: "square",
        cornerEyeDotPattern: "square",
      })
    ).toEqual([]);
  });
});

describe("colors", () => {
  const square = {
    bodyPattern: "square",
    cornerEyePattern: "square",
    cornerEyeDotPattern: "square",
  } as const;

  it("decodes dark brand colors on a light background", () => {
    expect(
      decodesAtPhoneDistances({
        value: VALUE,
        size: 256,
        fgColor: "#1e3a8a",
        bgColor: "#fef3c7",
        eyeColor: "#7c2d12",
        dotColor: "#166534",
        ...square,
      })
    ).toEqual([]);
  });

  it("decodes an inverted (light on dark) code that keeps its own quiet zone", () => {
    expect(
      decodesAtPhoneDistances(
        {
          value: VALUE,
          size: 256,
          margin: 4,
          fgColor: "#ffffff",
          bgColor: "#000000",
          ...square,
        },
        "#000000"
      )
    ).toEqual([]);
  });

  it("decodes a linear gradient foreground", () => {
    expect(
      decodesAtPhoneDistances({
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
        ...square,
      })
    ).toEqual([]);
  });

  it("decodes on a transparent background printed on white paper", () => {
    expect(
      decodesAtPhoneDistances({
        value: VALUE,
        size: 256,
        bgColor: "transparent",
        ...square,
      })
    ).toEqual([]);
  });
});

describe("margins", () => {
  for (const margin of [0, 1, 2, 4, 8]) {
    known(`margin-${margin}`)(`decodes with a ${margin}-module margin`, () => {
      expect(
        decodesAtPhoneDistances({ value: VALUE, size: 256, margin })
      ).toEqual([]);
    });
  }

  it("draws the quiet zone in the background color", () => {
    const svg = renderSvg({
      value: VALUE,
      size: 300,
      margin: 4,
      bgColor: "#fef3c7",
    });
    const image = rasterizeSvg(svg);
    // Top-left pixel lies in the margin.
    expect(Array.from(image.data.slice(0, 3))).toEqual([0xfe, 0xf3, 0xc7]);
  });
});

describe("center logo", () => {
  // getQRData lays a logo out at 256 px on a 1024 px code (25% of the width).
  const logoProps = (level: "Q" | "H", excavate: boolean): QRProps => ({
    ...getQRData({ value: VALUE, level, logo: LOGO, size: 1024 }),
    imageSettings: { src: LOGO, width: 256, height: 256, excavate },
  });

  it("decodes with the default logo layout at level H", () => {
    expect(decodesAtPhoneDistances(logoProps("H", true))).toEqual([]);
  });

  it("decodes with the default logo layout at level Q (the default level)", () => {
    expect(decodesAtPhoneDistances(logoProps("Q", true))).toEqual([]);
  });

  it("decodes at level H when the logo is drawn over modules without excavation", () => {
    expect(decodesAtPhoneDistances(logoProps("H", false))).toEqual([]);
  });

  it("removes the modules under an excavated logo", () => {
    const withLogo = renderSvg(logoProps("H", true));
    const without = renderSvg({
      ...logoProps("H", true),
      imageSettings: undefined,
    });
    const count = (svg: string) => (svg.match(/<circle /g) ?? []).length;
    expect(count(withLogo)).toBeLessThan(count(without));
  });
});

describe("frames", () => {
  const styles = FRAME_STYLES.filter((style) => style !== "none");

  it.each(styles)("%s frame keeps the code decodable", (style) => {
    const frame = { style, text: "Scan for the menu" };
    const size = 256;
    const props: QRProps = {
      value: VALUE,
      size,
      frame,
      bodyPattern: "square",
      cornerEyePattern: "square",
      cornerEyeDotPattern: "square",
    };
    const svg = renderSvg(props);
    const { width } = getFrameDimensions(size, frame);
    const modules = symbolSize(VALUE);
    const failures = PHONE_MODULE_SIZES.filter((modulePx) => {
      const image = rasterizeSvg(svg, {
        width: (width / size) * modules * modulePx,
        pad: 2 * modulePx,
      });
      return decodeQR(simulateCamera(image, modulePx)) !== VALUE;
    });
    expect(failures).toEqual([]);
  });
});

describe("templates", () => {
  it.each(
    getTemplateIds()
  )("%s template keeps the code decodable", (templateId) => {
    const svg = renderSvg({
      value: VALUE,
      size: 256,
      templateId,
      bodyPattern: "square",
      cornerEyePattern: "square",
      cornerEyeDotPattern: "square",
    });
    const readable = [600, 900, 1200].filter(
      (width) => decodeQR(rasterizeSvg(svg, { width, pad: 24 })) === VALUE
    );
    expect(readable.length, "decoded at template widths 600/900/1200 px").toBe(
      3
    );
  });
});

describe("payloads", () => {
  it("round-trips unicode, emoji and reserved characters byte for byte", () => {
    const value = 'Zoë 👋 東京 ½ ; , : \\ " & ? # % +';
    expect(capture({ value, level: "M", size: 256 }, { modulePx: 6 })).toBe(
      value
    );
  });

  it("round-trips a numeric-only payload (numeric mode)", () => {
    const value = "0123456789012345678901234567890";
    expect(capture({ value, level: "M", size: 256 }, { modulePx: 6 })).toBe(
      value
    );
  });

  it("round-trips a near-capacity payload (version 40-L, 2900 bytes)", () => {
    const value = "x".repeat(2900);
    expect(symbolSize(value, "L")).toBe(177);
    expect(
      capture(
        { value, level: "L", size: 512, bodyPattern: "square" },
        { modulePx: 3, camera: false }
      )
    ).toBe(value);
  });

  it("throws a clear error when the payload exceeds QR capacity", () => {
    expect(() => renderSvg({ value: "x".repeat(2954), level: "L" })).toThrow(
      /too long/i
    );
  });
});

describe("sharp digital renders (screens, screenshots, web scanners)", () => {
  // No camera blur: jsQR reads the pixels exactly as rendered. Dotted bodies
  // draw the alignment pattern as dots too, which breaks its 1:1:1 rings.
  for (const modulePx of [6, 10, 14]) {
    known(`sharp-${modulePx}`)(
      `default style decodes at ${modulePx} px per module`,
      () => {
        expect(
          capture({ value: VALUE, size: 256 }, { modulePx, camera: false })
        ).toBe(VALUE);
      }
    );
  }

  it("square modules decode at any sharp size", () => {
    for (const modulePx of [3, 6, 10, 14]) {
      expect(
        capture(
          { value: VALUE, size: 256, bodyPattern: "square" },
          { modulePx, camera: false }
        )
      ).toBe(VALUE);
    }
  });
});

describe("determinism", () => {
  it("renders identical markup for identical props (SSR hydration safe)", () => {
    const props: QRProps = { value: VALUE, size: 256 };
    expect(renderSvg(props)).toBe(renderSvg(props));
  });

  known("gradient-ids")(
    "renders identical markup for identical gradient props (SSR hydration safe)",
    () => {
      const props: QRProps = {
        value: VALUE,
        size: 256,
        fgColor: {
          type: "linear",
          angle: 0,
          stops: [
            { color: "#000000", offset: 0 },
            { color: "#1d4ed8", offset: 100 },
          ],
        },
      };
      expect(renderSvg(props)).toBe(renderSvg(props));
    }
  );
});
