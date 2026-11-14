import "server-only";

import type { ScanGrade } from "qrdx";
import { DesignTooLongError, scoreDesign } from "@/lib/qr-design/score";
import type { ThemeStyles } from "@/types/theme";
import { GATE_SAMPLES, type GateSample, MIN_GATE_SCORE } from "./scan-samples";

// The publish gate: a design (a theme, or a frame on a classic code) goes
// into the community only when the server-side scan score (the editor's
// score: rendered by the engine, rasterized, scored from pixels) is Great
// with each of the sample payloads. Nothing about it comes from the client.

export interface GateResult {
  sample: GateSample["id"];
  label: string;
  score: number;
  grade: ScanGrade | "too-long";
  passed: boolean;
}

export interface ScanGate {
  passed: boolean;
  /** Lowest score across the samples (0 when one couldn't be encoded) */
  minScore: number;
  results: GateResult[];
}

export type ScoreFn = typeof scoreDesign;

/** Scores `style` with every gate sample. */
export async function checkScanGate(
  style: ThemeStyles,
  score: ScoreFn = scoreDesign,
): Promise<ScanGate> {
  const results: GateResult[] = [];
  for (const sample of GATE_SAMPLES) {
    try {
      const result = await score(sample.value, style);
      results.push({
        sample: sample.id,
        label: sample.label,
        score: result.score,
        grade: result.grade,
        passed: result.score >= MIN_GATE_SCORE,
      });
    } catch (error) {
      if (!(error instanceof DesignTooLongError)) throw error;
      results.push({
        sample: sample.id,
        label: sample.label,
        score: 0,
        grade: "too-long",
        passed: false,
      });
    }
  }
  return {
    passed: results.every((result) => result.passed),
    minScore: Math.min(...results.map((result) => result.score)),
    results,
  };
}

/** Why a gate failed, e.g. "... With Wi-Fi details it scores 71." */
export function gateFailureMessage(gate: ScanGate): string {
  const failed = gate.results.filter((result) => !result.passed);
  const parts = failed.map((result) =>
    result.grade === "too-long"
      ? `${result.label} won't fit in a code at this error correction level`
      : `with ${result.label} it scores ${result.score}`,
  );
  const reasons = parts.join("; ");
  return `Only designs that scan Great (${MIN_GATE_SCORE} or more) can be published. ${reasons.charAt(0).toUpperCase()}${reasons.slice(1)}.`;
}
