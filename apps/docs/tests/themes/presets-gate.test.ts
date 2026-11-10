// Every built-in theme on the community publish gate (lib/community/
// scan-gate.ts), the bar a shared design must clear: the server-side scan
// score (engine render, resvg raster, pixel score, a logo's footprint) with
// each sample payload. Kept apart from presets-scan.test.ts so the two run
// in parallel.
import { describe, expect, it, vi } from "vitest";
import { checkScanGate } from "@/lib/community/scan-gate";
import { MIN_GATE_SCORE } from "@/lib/community/scan-samples";
import { isInverted } from "@/lib/themes/color";
import { defaultPresets } from "@/utils/qr-presets";

// Each test decodes rendered codes, which is CPU-bound: under a heavily loaded
// machine (many test runs at once) a test can pass 30 s. The limit is raised
// for this file only; nothing it checks changes.
vi.setConfig({ testTimeout: 120_000 });

const entries = Object.entries(defaultPresets);

// The community publish gate (lib/community/scan-gate.ts): Great (85+) with
// a link and with Wi-Fi details, scored from pixels with any logo's
// footprint. Light-on-dark codes lose 10 points for polarity and can't get
// there; these older ones are kept as they are (saved designs and ?preset=
// links use them), and no new theme may join them.
const BELOW_GREAT = [
  "neon",
  "midnight",
  "cyberpunk",
  "starry",
  "netflix",
  "noir",
  "halloweenPumpkin",
  "halloweenGhost",
  "halloweenPotion",
];

describe("built-in themes score Great on the publish gate", () => {
  it("only the listed light-on-dark themes are exempt", () => {
    const inverted = entries
      .filter(([, p]) => isInverted(p.styles.fgColor, p.styles.bgColor))
      .map(([id]) => id);
    expect(inverted.sort()).toEqual([...BELOW_GREAT].sort());
  });

  for (const [id, preset] of entries) {
    if (BELOW_GREAT.includes(id)) continue;
    it(`${preset.label ?? id} (${id})`, async () => {
      const gate = await checkScanGate(preset.styles);
      const results = gate.results.map((r) => `${r.sample} ${r.score}`);
      expect(gate.minScore, `${results}`).toBeGreaterThanOrEqual(
        MIN_GATE_SCORE,
      );
    });
  }
});
