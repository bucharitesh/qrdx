import { describe, expect, it } from "vitest";
import {
  artColorFix,
  artColorIssue,
} from "@/components/editor/control-sections/art-colors";

describe("art color issue and fix", () => {
  it("explains the owner's dark-on-dark report and fixes it on white", () => {
    // Flash Sale: dark red dots on dark red, white eyes and center dots.
    const style = {
      bgColor: "#682929",
      fgColor: "#761731",
      eyeColor: "#FFFFFF",
      dotColor: "#FFFFFF",
    };
    expect(artColorIssue(style)).toBe("low-contrast");
    const fix = artColorFix(style);
    // The dots keep their color; white eyes would vanish on white, so they
    // follow the dots.
    expect(fix).toEqual({
      bgColor: "#ffffff",
      fgColor: "#761731",
      eyeColor: "#761731",
      dotColor: "#761731",
    });
    expect(artColorIssue({ ...style, ...fix })).toBeNull();
  });

  it("swaps inverted colors and keeps eyes that still show", () => {
    const style = {
      bgColor: "#111111",
      fgColor: "#f5f5f5",
      eyeColor: "#1d4ed8",
      dotColor: undefined,
    };
    expect(artColorIssue(style)).toBe("inverted");
    const fix = artColorFix(style);
    expect(fix).toEqual({
      bgColor: "#f5f5f5",
      fgColor: "#111111",
      eyeColor: "#1d4ed8",
      dotColor: undefined,
    });
    expect(artColorIssue({ ...style, ...fix })).toBeNull();
  });

  it("uses black dots when the old ones are too light for white", () => {
    const fix = artColorFix({ bgColor: "#dddddd", fgColor: "#cccccc" });
    expect(fix?.bgColor).toBe("#ffffff");
    expect(fix?.fgColor).toBe("#000000");
  });

  it("reads gradients by their first stop, like the renderer", () => {
    const style = {
      bgColor: {
        type: "linear" as const,
        angle: 90,
        stops: [
          { color: "#0f172a", offset: 0 },
          { color: "#ffffff", offset: 1 },
        ],
      },
      fgColor: "#1e293b",
    };
    expect(artColorIssue(style)).toBe("low-contrast");
  });

  it("leaves working colors alone", () => {
    expect(
      artColorIssue({ bgColor: "#ffffff", fgColor: "#000000" }),
    ).toBeNull();
    expect(artColorFix({ bgColor: "#ffffff", fgColor: "#000000" })).toBeNull();
  });
});
