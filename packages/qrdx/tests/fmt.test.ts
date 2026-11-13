/** biome-ignore-all lint/style/noMagicNumbers: number formatting cases */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QRCodeSVG } from "../src/qr-code-svg";
import { compact, fmt, roundTo } from "../src/utils/fmt";

describe("fmt", () => {
  it("rounds to 3 decimals by default", () => {
    expect(fmt(12.345_678_901_234_567)).toBe("12.346");
    expect(fmt(0.123_449_9)).toBe("0.123");
    expect(fmt(7.757_575_757_575_758)).toBe("7.758");
    expect(fmt(-Math.PI)).toBe("-3.142");
  });

  it("drops trailing zeros", () => {
    expect(fmt(4.5)).toBe("4.5");
    expect(fmt(2.100_000_000_000_000_5)).toBe("2.1");
    expect(fmt(0.1 + 0.2)).toBe("0.3");
    expect(fmt(9.9999)).toBe("10");
  });

  it("never writes -0", () => {
    expect(fmt(-0)).toBe("0");
    expect(fmt(-0.0004)).toBe("0");
    expect(fmt(-0.000_49, 3)).toBe("0");
    expect(Object.is(roundTo(-0.0001), 0)).toBe(true);
    expect(Object.is(roundTo(-0.001), -0.001)).toBe(true);
  });

  it("writes integers as integers", () => {
    expect(fmt(0)).toBe("0");
    expect(fmt(7)).toBe("7");
    expect(fmt(-256)).toBe("-256");
    expect(fmt(1024.0002)).toBe("1024");
  });

  it("keeps large values exact, with no exponent", () => {
    expect(fmt(123_456.789_012_3)).toBe("123456.789");
    expect(fmt(1e9 + 0.5)).toBe("1000000000.5");
    expect(fmt(9_007_199_254)).toBe("9007199254");
  });

  it("takes other precisions", () => {
    expect(fmt(1.171_875_123, 6)).toBe("1.171875");
    expect(fmt(0.292_968_75, 6)).toBe("0.292969");
    expect(fmt(12.346, 2)).toBe("12.35");
    expect(fmt(12.3449, 0)).toBe("12");
    expect(roundTo(2.345_67, 2)).toBe(2.35);
  });
});

describe("compact", () => {
  it("formats numbers and passes strings through", () => {
    const x = 1.234_567_8;
    const label = "1.234567";
    expect(compact`M${x} ${-x}h${2}v${label}z`).toBe(
      "M1.235 -1.235h2v1.234567z"
    );
    expect(compact`${0.0001}`).toBe("0");
    expect(compact`plain`).toBe("plain");
  });
});

describe("rendered markup", () => {
  it("has no coordinate with more than 6 decimals", () => {
    const markup = renderToStaticMarkup(
      createElement(QRCodeSVG, {
        value: "https://qrdx.dev/q/Ab3dE9x",
        size: 333,
        bodyPattern: "circle",
        cornerEyePattern: "circle",
        cornerEyeDotPattern: "message",
        moduleScale: 0.95,
        frame: { style: "ticket", text: "Scan me" },
      })
    );
    expect(markup).not.toMatch(/\d\.\d{7,}/);
    // Coordinates themselves stop at 3 decimals (scale factors keep 6)
    const coordinates = markup.replace(/scale\([^)]*\)/g, "");
    expect(coordinates).not.toMatch(/\d\.\d{4,}/);
  });
});
