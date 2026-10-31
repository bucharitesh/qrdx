// What the AI theme generator may return, and the scannability guard applied
// to it. Contrast follows WCAG 2.x (black/white = 21:1, #777 on white ≈ 4.48).
import { APICallError } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  contrastRatio,
  ensureScannable,
  type GeneratedThemeStyles,
  themeStylePropsOutputSchema,
} from "@/lib/ai/generate-qr-theme";
import { streamErrorMessage } from "@/lib/ai/stream-error-message";

const theme: GeneratedThemeStyles = {
  bgColor: "#FFFFFF",
  fgColor: "#000000",
  eyeColor: "#1D4ED8",
  dotColor: "#B91C1C",
  bodyPattern: "circle",
  cornerEyePattern: "gear",
  cornerEyeDotPattern: "circle",
};

describe("themeStylePropsOutputSchema", () => {
  it("accepts a complete theme, with optional size, margin and showLogo", () => {
    expect(themeStylePropsOutputSchema.parse(theme)).toEqual(theme);
    expect(
      themeStylePropsOutputSchema.parse({
        ...theme,
        size: 512,
        margin: 2,
        showLogo: true,
      }),
    ).toMatchObject({ size: 512, margin: 2, showLogo: true });
  });

  it.each([
    "bgColor",
    "fgColor",
    "eyeColor",
    "dotColor",
    "bodyPattern",
    "cornerEyePattern",
    "cornerEyeDotPattern",
  ] as const)("requires %s", (key) => {
    const { [key]: _removed, ...rest } = theme;
    expect(themeStylePropsOutputSchema.safeParse(rest).success).toBe(false);
  });

  it.each([
    "#fff",
    "#FFFFFF80",
    "white",
    "rgb(0,0,0)",
    "FFFFFF",
    "#GGGGGG",
  ])("rejects the color %j (only #RRGGBB)", (color) => {
    expect(
      themeStylePropsOutputSchema.safeParse({ ...theme, fgColor: color })
        .success,
    ).toBe(false);
  });

  it("rejects gradients", () => {
    expect(
      themeStylePropsOutputSchema.safeParse({
        ...theme,
        fgColor: {
          type: "linear",
          stops: [
            { color: "#000000", offset: 0 },
            { color: "#FFFFFF", offset: 100 },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("rejects unknown patterns and invalid margins", () => {
    expect(
      themeStylePropsOutputSchema.safeParse({
        ...theme,
        bodyPattern: "not-a-pattern",
      }).success,
    ).toBe(false);
    expect(
      themeStylePropsOutputSchema.safeParse({ ...theme, margin: -2 }).success,
    ).toBe(false);
  });

  it("never returns templateId, frame, art or level even if the model sends them", () => {
    const output = themeStylePropsOutputSchema.parse({
      ...theme,
      templateId: "Arrow",
      frame: { style: "banner-top" },
      art: { mode: "logo" },
      level: "L",
    });
    expect(output).toEqual(theme);
  });

  it("does not offer templateId, frame, art or level to the model", () => {
    const json = z.toJSONSchema(themeStylePropsOutputSchema) as {
      properties: Record<string, unknown>;
      required?: string[];
    };
    for (const key of ["templateId", "frame", "art", "level"]) {
      expect(Object.keys(json.properties)).not.toContain(key);
    }
    expect([...(json.required ?? [])].sort()).toEqual([
      "bgColor",
      "bodyPattern",
      "cornerEyeDotPattern",
      "cornerEyePattern",
      "dotColor",
      "eyeColor",
      "fgColor",
    ]);
  });
});

describe("contrastRatio (WCAG 2.x)", () => {
  it.each<[string, string, number]>([
    ["#000000", "#FFFFFF", 21],
    ["#FFFFFF", "#000000", 21],
    ["#777777", "#FFFFFF", 4.48],
    ["#0000FF", "#FFFFFF", 8.59],
    ["#123456", "#123456", 1],
  ])("%s on %s ≈ %s:1", (a, b, expected) => {
    expect(contrastRatio(a, b)).toBeCloseTo(expected, 2);
  });

  it("is case-insensitive", () => {
    expect(contrastRatio("#abcdef", "#000000")).toBe(
      contrastRatio("#ABCDEF", "#000000"),
    );
  });
});

describe("ensureScannable", () => {
  it("leaves a theme with good contrast untouched", () => {
    expect(ensureScannable(theme)).toEqual(theme);
  });

  it("lightens near-black modules on blue until they reach 4.5:1", () => {
    const { fgColor } = ensureScannable({
      ...theme,
      bgColor: "#0000FF",
      fgColor: "#111111",
    });
    expect(contrastRatio(fgColor, "#0000FF")).toBeGreaterThanOrEqual(4.5);
    expect(luminanceOrder(fgColor, "#0000FF")).toBe("lighter");
  });

  it("keeps the hue: a gold accent eye on cream becomes a darker gold, not black", () => {
    const { eyeColor } = ensureScannable({
      ...theme,
      bgColor: "#F4EFE6",
      eyeColor: "#B8913A",
    });
    expect(contrastRatio(eyeColor, "#F4EFE6")).toBeGreaterThanOrEqual(3);
    expect(eyeColor).not.toBe("#000000");
    const [r, g, b] = rgb(eyeColor);
    expect(r).toBeGreaterThan(b); // still a warm (gold) tone
    expect(g).toBeGreaterThan(b);
    expect(luminanceOrder(eyeColor, "#B8913A")).toBe("darker");
  });

  it("asks 4.5:1 of modules but only 3:1 of the large eyes", () => {
    // #949494 on white is ≈3.03:1: fine for eyes, too faint for modules.
    const fixed = ensureScannable({
      ...theme,
      fgColor: "#949494",
      eyeColor: "#949494",
      dotColor: "#949494",
    });
    expect(fixed.eyeColor).toBe("#949494");
    expect(fixed.dotColor).toBe("#949494");
    expect(fixed.fgColor).not.toBe("#949494");
    expect(contrastRatio(fixed.fgColor, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });

  it("reaches the threshold on every grey background, including mid greys", () => {
    for (let gray = 0; gray <= 255; gray += 5) {
      const hex = gray.toString(16).padStart(2, "0");
      const bg = `#${hex}${hex}${hex}`;
      const fixed = ensureScannable({
        ...theme,
        bgColor: bg,
        fgColor: bg,
        eyeColor: bg,
        dotColor: bg,
      });
      expect(
        contrastRatio(fixed.fgColor, bg),
        `fg on ${bg}`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(fixed.eyeColor, bg),
        `eye on ${bg}`,
      ).toBeGreaterThanOrEqual(3);
      expect(
        contrastRatio(fixed.dotColor, bg),
        `dot on ${bg}`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("always returns #RRGGBB colors", () => {
    const fixed = ensureScannable({
      ...theme,
      bgColor: "#3A7BD5",
      fgColor: "#4A8BE5",
    });
    expect(fixed.fgColor).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it("keeps patterns and other fields", () => {
    const input = {
      ...theme,
      bgColor: "#0000FF",
      fgColor: "#111111",
      margin: 3,
    };
    expect(ensureScannable(input)).toMatchObject({
      bodyPattern: "circle",
      margin: 3,
      bgColor: "#0000FF",
    });
  });

  it("returns streamed partials unchanged until a valid background arrives", () => {
    const partial = { fgColor: "#EEEEEE" };
    expect(ensureScannable(partial)).toBe(partial);
    const halfTyped = { bgColor: "#FFF", fgColor: "#EEEEEE" };
    expect(ensureScannable(halfTyped)).toEqual(halfTyped);
  });

  it("fixes the colors a partial has and sends no values for ones it lacks", () => {
    const fixed = ensureScannable({ bgColor: "#FFFFFF", fgColor: "#EEEEEE" });
    // Streamed parts travel as JSON, so the client merges only these keys
    // (an undefined eyeColor must not wipe the user's current one).
    expect(Object.keys(JSON.parse(JSON.stringify(fixed))).sort()).toEqual([
      "bgColor",
      "fgColor",
    ]);
    expect(
      contrastRatio(fixed.fgColor as string, "#FFFFFF"),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("skips colors that are not #RRGGBB yet", () => {
    expect(ensureScannable({ bgColor: "#FFFFFF", fgColor: "#EE" })).toEqual({
      bgColor: "#FFFFFF",
      fgColor: "#EE",
    });
  });
});

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

/** Whether `a` is lighter or darker than `b` (by WCAG contrast against black). */
function luminanceOrder(a: string, b: string): "lighter" | "darker" {
  return contrastRatio(a, "#000000") > contrastRatio(b, "#000000")
    ? "lighter"
    : "darker";
}

describe("streamErrorMessage", () => {
  const apiError = (statusCode: number) =>
    new APICallError({
      message: "API key not valid. Please pass a valid API key.",
      url: "https://example.invalid",
      requestBodyValues: {},
      statusCode,
    });

  it("tells visitors to retry when the provider is rate limited (429)", () => {
    expect(streamErrorMessage(apiError(429))).toBe(
      "The AI is busy right now. Try again in a minute.",
    );
  });

  it.each([400, 401, 500, 503])("hides provider details for a %i", (status) => {
    const message = streamErrorMessage(apiError(status));
    expect(message).toBe(
      "AI generation isn't available right now. Please try again later.",
    );
    expect(message).not.toMatch(/API key/);
  });

  it("uses the generic message for non-API errors", () => {
    expect(streamErrorMessage(new Error("boom"))).not.toMatch(/boom/);
    expect(streamErrorMessage("x")).toMatch(/isn't available/);
  });
});
