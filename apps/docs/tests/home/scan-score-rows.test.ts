// The home scan-score card shows the engine's checks as four short, fixed rows
// (components/sections/home/demos/scan-rows.ts) instead of its long messages,
// which were cut off with an ellipsis.
import { getScanScore, type ScanCheck, type ScanScoreResult } from "qrdx";
import { describe, expect, it } from "vitest";
import { scanRows } from "@/components/sections/home/demos/scan-rows";
import { installFakeDom } from "../../../../packages/qrdx/tests/support/fake-dom";

const result = (checks: ScanCheck[]): ScanScoreResult => ({
  score: 80,
  grade: "ok",
  checks,
});

describe("scanRows", () => {
  it("keeps four placeholder rows before the score is in", () => {
    expect(scanRows(null)).toEqual([
      { id: "contrast", label: "Contrast", value: null, passed: null },
      { id: "decode-96", label: "Small print", value: null, passed: null },
      { id: "decode-160", label: "Arm's length", value: null, passed: null },
      { id: "decode-320", label: "Close up", value: null, passed: null },
    ]);
  });

  it("turns the engine's messages into a word or two, in a fixed order", () => {
    const rows = scanRows(
      result([
        // The engine lists decode checks first; the card leads with contrast.
        {
          id: "decode-96",
          passed: false,
          message:
            "Reads at 96 px (small print or far away) only some of the time",
        },
        {
          id: "decode-160",
          passed: true,
          message: "Reads at 160 px (typical phone distance), with camera blur",
        },
        {
          id: "decode-320",
          passed: false,
          message: "Doesn't read at 320 px (close up)",
        },
        {
          id: "contrast",
          passed: true,
          message: "Contrast 19.6:1 between code and background",
        },
        {
          id: "polarity",
          passed: true,
          message: "Dark code on a light background",
        },
      ]),
    );
    expect(
      rows.map(({ label, value, passed }) => [label, value, passed]),
    ).toEqual([
      ["Contrast", "19.6:1", true],
      ["Small print", "Sometimes", false],
      ["Arm's length", "Reads", true],
      ["Close up", "Fails", false],
    ]);
  });

  it("reads a low contrast ratio, and falls back to a word without one", () => {
    const low = scanRows(
      result([
        {
          id: "contrast",
          passed: false,
          message: "Low contrast (1.4:1); 4.5:1 or more scans reliably",
        },
      ]),
    );
    expect(low[0]).toMatchObject({ value: "1.4:1", passed: false });

    const noRatio = scanRows(
      result([{ id: "contrast", passed: false, message: "Too faint" }]),
    );
    expect(noRatio[0]).toMatchObject({ value: "Low", passed: false });
  });

  it("matches the real engine's messages for a pale code", async () => {
    const uninstall = installFakeDom();
    try {
      const score = await getScanScore({
        value: "https://qrdx.dev/m/score",
        fgColor: "#d4d4d8",
        bgColor: "#ffffff",
        margin: 2,
      });
      const rows = scanRows(score);
      expect(rows).toHaveLength(4);
      for (const row of rows) {
        expect(row.value).not.toBeNull();
        expect(row.passed).not.toBeNull();
      }
      // #d4d4d8 on white is about 1.5:1: the ratio comes through, as a fail.
      expect(rows[0]?.value).toMatch(/^\d+(\.\d+)?:1$/);
      expect(rows[0]?.passed).toBe(false);
    } finally {
      uninstall();
    }
  });
});
