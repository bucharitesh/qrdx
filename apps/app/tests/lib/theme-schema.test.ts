// Saved-theme schema: what a user can store (valid and invalid inputs).
import { describe, expect, it } from "vitest";
import { downloadSizeSchema, themeStylePropsSchema } from "@/types/theme";

const valid = {
  size: 512,
  bgColor: "#ffffff",
  fgColor: {
    type: "linear",
    angle: 45,
    stops: [
      { color: "#111827", offset: 0 },
      { color: "#4c1d95", offset: 100 },
    ],
  },
  eyeColor: { type: "solid", color: "#ff0000" },
  dotColor: {
    type: "radial",
    stops: [
      { color: "#000", offset: 0 },
      { color: "#333", offset: 100 },
    ],
  },
  bodyPattern: "circle",
  cornerEyePattern: "gear",
  cornerEyeDotPattern: "star",
  level: "H",
  margin: 4,
  frame: { style: "banner-bottom", text: "Scan for the menu" },
  showLogo: true,
  customLogo: "data:image/png;base64,iVBORw0KGgo=",
};

describe("themeStylePropsSchema", () => {
  it("accepts a complete theme", () => {
    expect(themeStylePropsSchema.parse(valid)).toMatchObject({
      level: "H",
      margin: 4,
    });
  });

  it("accepts an empty theme (every field is optional)", () => {
    expect(themeStylePropsSchema.parse({})).toEqual({});
  });

  it.each<[string, Record<string, unknown>]>([
    // Names no pattern will ever use (the pattern lists keep growing).
    ["unknown body pattern", { bodyPattern: "not-a-pattern" }],
    ["unknown eye pattern", { cornerEyePattern: "not-a-pattern" }],
    ["unknown eye dot", { cornerEyeDotPattern: "not-a-pattern" }],
    ["unknown error level", { level: "X" }],
    ["lowercase error level", { level: "h" }],
    [
      "gradient with one stop",
      { fgColor: { type: "linear", stops: [{ color: "#000", offset: 0 }] } },
    ],
    [
      "stop offset over 100",
      {
        fgColor: {
          type: "linear",
          stops: [
            { color: "#000", offset: 0 },
            { color: "#fff", offset: 150 },
          ],
        },
      },
    ],
    ["numeric color", { bgColor: 0xffffff }],
    ["negative margin", { margin: -1 }],
    ["zero size", { size: 0 }],
    ["negative size", { size: -256 }],
    ["infinite size", { size: Number.POSITIVE_INFINITY }],
    ["NaN margin", { margin: Number.NaN }],
    [
      "frame label over 24 characters",
      { frame: { style: "border", text: "x".repeat(25) } },
    ],
    ["unknown frame style", { frame: { style: "banner" } }],
    ["string boolean", { showLogo: "yes" }],
  ])("rejects a %s", (_name, input) => {
    expect(themeStylePropsSchema.safeParse(input).success).toBe(false);
  });

  it("drops unknown keys instead of storing them", () => {
    expect(
      themeStylePropsSchema.parse({ level: "M", evil: "<script>" }),
    ).toEqual({ level: "M" });
  });
});

describe("downloadSizeSchema", () => {
  it.each([
    [{ width: 50, height: 50 }, true],
    [{ width: 5000, height: 5000 }, true],
    [{ width: 49, height: 100 }, false],
    [{ width: 100, height: 5001 }, false],
  ])("%j → %s", (input, ok) => {
    expect(downloadSizeSchema.safeParse(input).success).toBe(ok);
  });
});
