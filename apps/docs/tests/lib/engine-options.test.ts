// styleEngineOptions: the engine options a saved style carries, ready for
// getQRData and <QRCode>. Unset or default values stay out, so styles saved
// before these options existed render exactly as they did.
import { describe, expect, it } from "vitest";
import {
  styleEngineOptions,
  styleSvgOptions,
} from "@/lib/qr-design/engine-options";

describe("styleEngineOptions", () => {
  it("is empty for a style without engine options", () => {
    expect(
      styleEngineOptions({ bgColor: "#fff", bodyPattern: "square" }),
    ).toEqual({});
  });

  it("drops defaults and empty values", () => {
    expect(
      styleEngineOptions({
        moduleScale: 1,
        autoLevel: false,
        logoOptions: {},
        eyeColors: { topLeft: {} },
      }),
    ).toEqual({});
  });

  it("returns every set option", () => {
    const style = {
      moduleScale: 0.8,
      autoLevel: true,
      logoOptions: { size: 0.2, x: 0.3 },
      eyeColors: { topRight: { outer: "#b91c1c" } },
    };
    expect(styleEngineOptions(style)).toEqual(style);
  });

  it("carries the circle shape, and nothing for a square one", () => {
    expect(styleEngineOptions({ shape: "circle" })).toEqual({
      shape: "circle",
    });
    expect(styleEngineOptions({ shape: "square" })).toEqual({});
    expect(styleSvgOptions({ shape: "circle" })).toEqual({ shape: "circle" });
  });

  it("gives <QRCodeSVG> only the props it takes", () => {
    expect(
      styleSvgOptions({
        moduleScale: 0.8,
        autoLevel: true,
        logoOptions: { size: 0.2 },
        eyeColors: { topRight: { outer: "#b91c1c" } },
      }),
    ).toEqual({
      moduleScale: 0.8,
      eyeColors: { topRight: { outer: "#b91c1c" } },
    });
  });
});
