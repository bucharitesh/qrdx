// Color checks for the barcode generator: contrast, light-on-dark bars and
// colors that red scanner light can't tell apart.
import { contrastRatio, luminance } from "@/lib/themes/color";

/**
 * Contrast lines, the same as the QR scan score's (SCAN_CONTRAST_MIN, _LOW
 * and _FAIL in the qrdx engine; tests/barcode keeps them equal).
 */
export const BARCODE_CONTRAST = { min: 4.5, low: 3, fail: 1.5 } as const;

/** Below this, red scanner light barely separates the bars from the background. */
export const RED_LIGHT_CONTRAST_MIN = 3;

export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export interface ColorWarning {
  level: "warning" | "error";
  message: string;
}

function redChannel(hex: string): number {
  const value = Number.parseInt(hex.slice(1, 3), 16) / 255;
  return value <= 0.039_28 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

const ratioText = (ratio: number) =>
  `${(Math.floor(ratio * 10) / 10).toFixed(1)}:1`;

/** What's wrong with the colors for scanning, worst first; empty when fine. */
export function barcodeColorWarnings(
  foreground: string,
  background: string,
): ColorWarning[] {
  if (!(HEX_COLOR.test(foreground) && HEX_COLOR.test(background))) {
    return [
      {
        level: "error",
        message: "Colors must be six-digit hex values, like #000000.",
      },
    ];
  }
  const warnings: ColorWarning[] = [];
  const ratio = contrastRatio(foreground, background);
  const fg = luminance(foreground) ?? 0;
  const bg = luminance(background) ?? 1;

  if (ratio < BARCODE_CONTRAST.fail) {
    warnings.push({
      level: "error",
      message: `Contrast ${ratioText(ratio)}: the bars and background are almost the same, so scanners won't find the code.`,
    });
  } else if (ratio < BARCODE_CONTRAST.low) {
    warnings.push({
      level: "error",
      message: `Contrast ${ratioText(ratio)} is too low to scan reliably. Aim for ${BARCODE_CONTRAST.min}:1 or more; black on white is safest.`,
    });
  } else if (ratio < BARCODE_CONTRAST.min) {
    warnings.push({
      level: "warning",
      message: `Contrast ${ratioText(ratio)} is below the ${BARCODE_CONTRAST.min}:1 that scans reliably. Darker bars or a lighter background help.`,
    });
  }

  if (fg > bg) {
    warnings.push({
      level: "warning",
      message:
        "Light bars on a dark background: many retail and warehouse scanners can't read inverted barcodes. Use dark bars on a light background.",
    });
  } else {
    const redContrast =
      (redChannel(background) + 0.05) / (redChannel(foreground) + 0.05);
    if (
      ratio >= BARCODE_CONTRAST.fail &&
      redContrast < RED_LIGHT_CONTRAST_MIN
    ) {
      warnings.push({
        level: "warning",
        message:
          "Laser and LED scanners use red light, which makes red, orange and yellow bars look like the background. Use black, dark blue or dark green bars.",
      });
    }
  }
  return warnings;
}
