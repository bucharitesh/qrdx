// The editor's scan score run on the server (lib/qr-design/score.ts): the
// design is rendered by the engine, rasterized with resvg (next/og) and
// scored by qrdx's getScanScoreFromPixels. No browser, database or network.
import { describe, expect, it } from "vitest";
import { scoreDesign } from "@/lib/qr-design/score";
import { CLASSIC_STYLE, toThemeStyles } from "@/lib/qr-design/style";

const WIFI = "WIFI:T:WPA;S:Cafe Guest;P:sunshine123;;";

describe("scoreDesign", () => {
  it("grades a classic code as great", async () => {
    const result = await scoreDesign(WIFI, toThemeStyles(CLASSIC_STYLE));
    expect(result.grade).toBe("great");
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.checks.find((c) => c.id === "decode-320")?.passed).toBe(true);
  });

  it("fails a code with no contrast", async () => {
    const result = await scoreDesign(
      WIFI,
      toThemeStyles({ ...CLASSIC_STYLE, fgColor: "#FFFFFF" }),
    );
    expect(result.grade).toBe("fails");
  });

  it("marks low contrast and circle eyes down", async () => {
    const result = await scoreDesign(
      WIFI,
      toThemeStyles({
        ...CLASSIC_STYLE,
        fgColor: "#A3A3A3",
        eyeColor: "#A3A3A3",
        dotColor: "#A3A3A3",
        cornerEyePattern: "circle",
      }),
    );
    expect(result.grade).not.toBe("great");
    const failed = result.checks.filter((c) => !c.passed).map((c) => c.id);
    expect(failed).toContain("contrast");
    expect(failed).toContain("eye-shape");
  });

  it("scores a logo by its footprint and a frame by its gap", async () => {
    const withLogo = await scoreDesign(
      WIFI,
      toThemeStyles({ ...CLASSIC_STYLE, logo: "qrdx", level: "L" }),
    );
    // At level L the logo is drawn only as big as each error-correction
    // block can repair (qrdx caps it), so its check passes on that footprint
    const logo = withLogo.checks.find((c) => c.id === "logo");
    expect(logo?.passed).toBe(true);
    expect(logo?.message).toMatch(/repairs it/);

    const framed = await scoreDesign(
      WIFI,
      toThemeStyles({
        ...CLASSIC_STYLE,
        margin: 0,
        frame: { style: "banner-bottom", text: "Scan for Wi-Fi" },
      }),
    );
    // The frame keeps a light gap, so no quiet-zone penalty without a margin.
    expect(framed.checks.find((c) => c.id === "quiet-zone")?.passed).toBe(true);
    expect(framed.checks.find((c) => c.id === "decode-320")?.passed).toBe(true);
  });
});
