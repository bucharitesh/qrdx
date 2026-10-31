import {
  calculatePrintSize,
  getMinVersion,
  mmToInches,
  modulesForVersion,
} from "@/lib/print-size";
import type { SeoDistance } from "./types";

/** What a dynamic QRdx code encodes: a 7-character short link. */
export const SAMPLE_SHORT_LINK = "https://qrdx.dev/q/aB3dE5f";

/** QRdx's default error-correction level. */
const ECC = "Q";

const SHORT_LINK_MODULES = modulesForVersion(
  getMinVersion(SAMPLE_SHORT_LINK, ECC) ?? 3,
);

export interface SizingRow {
  label: string;
  distance: string;
  /** Printed code, edge to edge, without the quiet zone. */
  minimum: string;
}

function formatLength(mm: number): string {
  const metric =
    mm < 1000 ? `${(mm / 10).toFixed(1)} cm` : `${(mm / 1000).toFixed(2)} m`;
  const inches = mmToInches(mm);
  const imperial =
    inches < 36 ? `${inches.toFixed(1)} in` : `${(inches / 12).toFixed(1)} ft`;
  return `${metric} (${imperial})`;
}

function formatDistance(meters: number): string {
  const feet = meters * 3.2808;
  const metric = meters < 1 ? `${Math.round(meters * 100)} cm` : `${meters} m`;
  const imperial =
    feet < 3 ? `${Math.round(feet * 12)} in` : `${Math.round(feet)} ft`;
  return `${metric} (${imperial})`;
}

/**
 * Minimum printed sizes for a dynamic short link at each distance, using the
 * same formula as the /tools/print-size calculator.
 */
export function sizingRows(distances: SeoDistance[]): SizingRow[] {
  return distances.map(({ label, meters }) => {
    const result = calculatePrintSize({
      distanceMm: meters * 1000,
      modules: SHORT_LINK_MODULES,
    });
    return {
      label,
      distance: formatDistance(meters),
      minimum: formatLength(result.symbolMm),
    };
  });
}
