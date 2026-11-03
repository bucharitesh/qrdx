// The publish gate (lib/community/scan-gate.ts): the server-side scan score
// must be Great with every sample payload. Runs the real scorer (engine
// render, resvg raster, pixel score); no database or network.
import { describe, expect, it } from "vitest";
import { checkScanGate, gateFailureMessage } from "@/lib/community/scan-gate";
import { GATE_SAMPLES, MIN_GATE_SCORE } from "@/lib/community/scan-samples";
import { DesignTooLongError } from "@/lib/qr-design/score";
import { CLASSIC_STYLE, toThemeStyles } from "@/lib/qr-design/style";

describe("checkScanGate", () => {
  it("passes a classic code with every sample", async () => {
    const gate = await checkScanGate(toThemeStyles(CLASSIC_STYLE));
    expect(gate.passed).toBe(true);
    expect(gate.results.map((r) => r.sample)).toEqual(
      GATE_SAMPLES.map((s) => s.id),
    );
    expect(gate.minScore).toBeGreaterThanOrEqual(MIN_GATE_SCORE);
  });

  it("refuses a low-contrast code and says which samples failed", async () => {
    const gate = await checkScanGate(
      toThemeStyles({
        ...CLASSIC_STYLE,
        fgColor: "#BDBDBD",
        eyeColor: "#BDBDBD",
        dotColor: "#BDBDBD",
      }),
    );
    expect(gate.passed).toBe(false);
    expect(gate.minScore).toBeLessThan(MIN_GATE_SCORE);
    const message = gateFailureMessage(gate);
    expect(message).toMatch(/scan Great \(85 or more\)/);
    expect(message).toMatch(/With a link it scores \d+/);
  });

  it("counts content that doesn't fit as a failure, not an error", async () => {
    const gate = await checkScanGate({}, async (value) => {
      if (value.startsWith("WIFI:")) throw new DesignTooLongError();
      return { score: 95, grade: "great", checks: [] } as never;
    });
    expect(gate.passed).toBe(false);
    expect(gate.minScore).toBe(0);
    expect(gateFailureMessage(gate)).toMatch(
      /Wi-Fi details won't fit in a code at this error correction level/,
    );
  });

  it("lets other scorer errors through", async () => {
    await expect(
      checkScanGate({}, async () => {
        throw new Error("render failed");
      }),
    ).rejects.toThrow("render failed");
  });
});
