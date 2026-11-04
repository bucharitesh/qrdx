// The `style` parameter: a design in a link. Round trips are exact for every
// field it carries; logos, art and content never travel; anything invalid or
// oversized is rejected whole.
import { getFrameSpecIssues } from "qrdx/types";
import { describe, expect, it } from "vitest";
import { MAX_STYLE_PARAM_LENGTH } from "@/lib/playground-links";
import { decodeStyleParam, encodeStyleParam } from "@/lib/playground-style";
import type { ThemeStyles } from "@/types/theme";
import donate from "../../../../packages/qrdx/src/frames/official/donate.json";

const LOGO_DATA_URL = `data:image/png;base64,${"iVBORw0KGgo".repeat(50)}`;
/** A 10×10 RGBA bitmap, as Logo QR / Image QR art stores it. */
const ART_IMAGE = { width: 10, height: 10, data: `${"QUJD".repeat(133)}QQ==` };

const fullStyle: ThemeStyles = {
  bgColor: "#fffaf0",
  fgColor: {
    type: "linear",
    angle: 45,
    stops: [
      { color: "#ec4899", offset: 0 },
      { color: "#8b5cf6", offset: 50 },
      { color: "#06b6d4", offset: 100 },
    ],
  },
  eyeColor: {
    type: "radial",
    stops: [
      { color: "#111111", offset: 0 },
      { color: "#333333", offset: 100 },
    ],
  },
  dotColor: { type: "solid", color: "#a855f7" },
  bodyPattern: "rounded",
  cornerEyePattern: "rounded",
  cornerEyeDotPattern: "circle",
  level: "H",
  margin: 3,
  templateId: "default",
  frame: { style: "banner-bottom", text: "Scan for menu", color: "#111111" },
};

const encode = (styles: ThemeStyles, preset?: string) => {
  const encoded = encodeStyleParam(styles, { preset });
  if (!encoded) throw new Error("expected a style value");
  return encoded;
};

/** Builds a style value from raw JSON, as a hand-edited link would. */
const forge = (json: unknown) =>
  `1.${Buffer.from(JSON.stringify(json)).toString("base64url")}`;

describe("round trip", () => {
  it("carries every style field exactly", () => {
    const { value, omitted } = encode(fullStyle, "classic");
    expect(omitted).toEqual([]);
    expect(value.startsWith("1.")).toBe(true);
    expect(decodeStyleParam(value)).toEqual({
      styles: fullStyle,
      preset: "classic",
    });
  });

  it("keeps the QRdx logo switch, which needs no image", () => {
    const { value, omitted } = encode({ ...fullStyle, showLogo: true });
    expect(omitted).toEqual([]);
    expect(decodeStyleParam(value)?.styles.showLogo).toBe(true);
  });

  it("is compact for a typical design", () => {
    const { value } = encode(
      {
        bgColor: "#ffffff",
        fgColor: "#000000",
        eyeColor: "#000000",
        dotColor: "#000000",
        bodyPattern: "circle",
        cornerEyePattern: "gear",
        cornerEyeDotPattern: "circle",
        level: "Q",
        margin: 4,
      },
      "classic",
    );
    expect(value.length).toBeLessThan(200);
  });
});

describe("privacy", () => {
  it("never carries an uploaded or remote logo, and says so", () => {
    for (const customLogo of [LOGO_DATA_URL, "https://tracker.example/l.png"]) {
      const { value, omitted } = encode({
        ...fullStyle,
        showLogo: true,
        customLogo,
      });
      expect(omitted).toEqual(["logo"]);
      const json = Buffer.from(value.slice(2), "base64url").toString();
      expect(json).not.toContain("tracker.example");
      expect(json).not.toContain("data:");
      const decoded = decodeStyleParam(value);
      expect(decoded?.styles.customLogo).toBeUndefined();
      // Without the image, the logo is off (not the QRdx mark instead).
      expect(decoded?.styles.showLogo).toBeUndefined();
    }
  });

  it("never carries art, and says so", () => {
    const { value, omitted } = encode({
      ...fullStyle,
      art: { mode: "halftone", image: ART_IMAGE },
    });
    expect(omitted).toEqual(["art"]);
    expect(value).not.toContain("QUJD");
    expect(decodeStyleParam(value)?.styles.art).toBeUndefined();
  });

  it("drops a logo, art or anything else smuggled into a hand-made value", () => {
    const decoded = decodeStyleParam(
      forge({
        b: "#ffffff",
        customLogo: "https://tracker.example/l.png",
        art: { mode: "halftone", image: ART_IMAGE },
        value: "WIFI:T:WPA;S:Home;P:secret;;",
        password: "secret",
      }),
    );
    expect(decoded).toEqual({ styles: { bgColor: "#ffffff" } });
    expect(JSON.stringify(decoded)).not.toMatch(/tracker|secret|halftone/);
  });

  it("rejects colors that could load a remote resource", () => {
    expect(
      decodeStyleParam(forge({ b: "url(https://tracker.example/x)" })),
    ).toBeNull();
    expect(
      decodeStyleParam(forge({ r: { style: "border", color: "url(#x) red" } })),
    ).toBeNull();
    // The encoder leaves such a color out rather than sharing it.
    const { value } = encode({
      ...fullStyle,
      bgColor: "url(https://tracker.example/x)",
    });
    expect(decodeStyleParam(value)?.styles.bgColor).toBeUndefined();
  });

  it("accepts the color formats people type", () => {
    for (const color of [
      "#fff",
      "#ffffff80",
      "rgb(10, 20, 30)",
      "hsl(200 50% 40%)",
      "red",
    ]) {
      expect(decodeStyleParam(forge({ b: color }))?.styles.bgColor).toBe(color);
    }
  });
});

describe("validation", () => {
  it("rejects malformed values whole", () => {
    for (const raw of [
      null,
      "",
      "1.",
      "1.!!!",
      "2.eyJiIjoiI2ZmZiJ9",
      `1.${Buffer.from("not json").toString("base64url")}`,
      forge([]),
      forge("text"),
      forge({}),
      forge({ p: "not-a-pattern" }),
      forge({ l: "Z" }),
      forge({ m: -1 }),
      forge({ m: 99 }),
      forge({ t: "no-such-template" }),
      forge({ r: { style: "no-such-frame" } }),
      forge({ r: { style: "banner-bottom", text: "x".repeat(25) } }),
      forge({ g: false }),
      forge({ b: "#fff", k: "../../etc" }),
      forge({ b: "#fff", k: 7 }),
    ]) {
      expect(decodeStyleParam(raw)).toBeNull();
    }
  });

  it("ignores keys it doesn't know (a newer link)", () => {
    expect(decodeStyleParam(forge({ b: "#000000", zz: 1 }))).toEqual({
      styles: { bgColor: "#000000" },
    });
  });

  it("caps the size at about 4 KB", () => {
    const huge = `1.${"A".repeat(MAX_STYLE_PARAM_LENGTH)}`;
    expect(decodeStyleParam(huge)).toBeNull();
  });

  it("keeps an official-size custom frame", () => {
    const frame = {
      style: "custom",
      spec: donate.spec,
    } as ThemeStyles["frame"];
    expect(getFrameSpecIssues(donate.spec)).toEqual([]);
    const { value, omitted } = encode({ ...fullStyle, frame });
    expect(omitted).toEqual([]);
    expect(decodeStyleParam(value)?.styles.frame).toEqual(frame);
  });

  it("leaves a custom frame out when it would make the link too long", () => {
    // 60 small squares in the band above the code: a valid but heavy spec.
    const dots = Array.from({ length: 60 }, (_, index) => ({
      type: "rect",
      x: 20 + index * 20,
      y: 20,
      width: 10,
      height: 10,
      fill: "text",
    }));
    const spec = { ...donate.spec, shapes: [...donate.spec.shapes, ...dots] };
    expect(getFrameSpecIssues(spec)).toEqual([]);
    const encoded = encode({
      ...fullStyle,
      frame: { style: "custom", spec } as ThemeStyles["frame"],
    });
    expect(encoded.omitted).toEqual(["frame"]);
    expect(encoded.value.length).toBeLessThanOrEqual(MAX_STYLE_PARAM_LENGTH);
    const decoded = decodeStyleParam(encoded.value);
    expect(decoded?.styles.frame).toBeUndefined();
    expect(decoded?.styles.bodyPattern).toBe("rounded");
  });

  it("returns null when nothing valid is left", () => {
    expect(encodeStyleParam({})).toBeNull();
    expect(
      encodeStyleParam({ customLogo: LOGO_DATA_URL, showLogo: true }),
    ).toBeNull();
  });
});

// ── Engine options (per-eye colors, dot size, auto error correction, logo
// layout): carried exactly, validated as strictly as the rest.
describe("engine options", () => {
  const engineStyle: ThemeStyles = {
    bgColor: "#ffffff",
    eyeColors: {
      topLeft: { outer: "#b91c1c", inner: "#1d4ed8" },
      bottomLeft: {
        outer: {
          type: "linear",
          angle: 90,
          stops: [
            { color: "#111111", offset: 0 },
            { color: "#7e22ce", offset: 100 },
          ],
        },
      },
    },
    moduleScale: 0.8,
    autoLevel: true,
    showLogo: true,
    logoOptions: { size: 0.2, padding: 1, x: 0.6, y: 0.4 },
  };

  it("round-trips them exactly", () => {
    const { value, omitted } = encode(engineStyle);
    expect(omitted).toEqual([]);
    expect(decodeStyleParam(value)).toEqual({ styles: engineStyle });
  });

  it("keeps the logo layout but never an uploaded logo", () => {
    const { value, omitted } = encode({
      ...engineStyle,
      customLogo: LOGO_DATA_URL,
    });
    expect(omitted).toEqual(["logo"]);
    const decoded = decodeStyleParam(value);
    expect(decoded?.styles.logoOptions).toEqual(engineStyle.logoOptions);
    expect(decoded?.styles.customLogo).toBeUndefined();
    expect(decoded?.styles.showLogo).toBeUndefined();
  });

  it("rejects out-of-range, unknown or unsafe values whole", () => {
    for (const json of [
      { ms: 0.3 },
      { ms: 1.5 },
      { ms: "0.8" },
      { al: false },
      { lo: { size: 0.9 } },
      { lo: { size: 0.05 } },
      { lo: { padding: 9 } },
      { lo: { x: 2 } },
      { lo: { y: -0.1 } },
      { lo: { src: "https://tracker.example/l.png" } },
      { ec: { center: { outer: "#000000" } } },
      { ec: { topLeft: { outer: "url(https://tracker.example/x)" } } },
      { ec: { topLeft: { frame: "#000000" } } },
      { ec: "#000000" },
    ]) {
      expect(decodeStyleParam(forge(json)), JSON.stringify(json)).toBeNull();
    }
  });

  it("leaves an unsafe per-eye color out when encoding", () => {
    const encoded = encodeStyleParam({
      bgColor: "#ffffff",
      eyeColors: { topLeft: { outer: "url(https://tracker.example/x)" } },
    });
    expect(
      encoded && decodeStyleParam(encoded.value)?.styles.eyeColors,
    ).toBeUndefined();
  });
});
