import { SCAN_TEST_SIZES, type ScanCheck, type ScanScoreResult } from "qrdx";

/** One line of the home scan-score demo: a short label and a short value. */
export interface ScanRow {
  id: string;
  label: string;
  /** null until the score is in. */
  value: string | null;
  /** null until the score is in. */
  passed: boolean | null;
}

// Plain names for the engine's test sizes (96, 160 and 320 px), smallest first:
// small print or far away, a typical phone distance, close up.
const SIZE_LABELS = ["Small print", "Arm's length", "Close up"] as const;

function contrastValue(check: ScanCheck): string {
  const ratio = /(\d+(?:\.\d+)?):1/.exec(check.message)?.[1];
  if (ratio) return `${ratio}:1`;
  return check.passed ? "Good" : "Low";
}

function decodeValue(check: ScanCheck): string {
  if (check.passed) return "Reads";
  return /some of the time/i.test(check.message) ? "Sometimes" : "Fails";
}

/**
 * The engine's checks as four fixed rows (contrast, then each test size), so
 * the list keeps its order and height while the ink changes. The engine's own
 * messages are long sentences; the card has room for a word or two.
 */
export function scanRows(result: ScanScoreResult | null): ScanRow[] {
  const contrast = result?.checks.find((check) => check.id === "contrast");
  return [
    {
      id: "contrast",
      label: "Contrast",
      value: contrast ? contrastValue(contrast) : null,
      passed: contrast?.passed ?? null,
    },
    ...SCAN_TEST_SIZES.map((size, index) => {
      const check = result?.checks.find(({ id }) => id === `decode-${size}`);
      return {
        id: `decode-${size}`,
        label: SIZE_LABELS[index] ?? `${size} px`,
        value: check ? decodeValue(check) : null,
        passed: check?.passed ?? null,
      };
    }),
  ];
}
