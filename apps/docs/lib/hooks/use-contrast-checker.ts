import { getContrastRatio } from "qrdx";
import type { ColorConfig } from "qrdx/types";
import { isGradient, normalizeColorConfig } from "qrdx/types";
import { useCallback, useEffect, useState } from "react";
import { debounce } from "@/utils/debounce";

type ColorPair = {
  id: string;
  foreground: ColorConfig | string | undefined;
  background: ColorConfig | string | undefined;
};

type ContrastResult = {
  id: string;
  contrastRatio: number;
  stopColors?: Array<{ color: string; ratio: number }>;
};

/**
 * Extract all colors from a ColorConfig for contrast checking
 * For gradients, returns all stop colors. For solid colors, returns the single color.
 */
function extractColorsForContrast(
  color: ColorConfig | string | undefined,
): string[] {
  if (!color) return [];
  if (typeof color === "string") return [color];

  const normalized = normalizeColorConfig(color);
  if (normalized.type === "solid") {
    return [normalized.color];
  }

  // For gradients, extract all stop colors
  return normalized.stops.map((stop) => stop.color);
}

/**
 * Hook that calculates the contrast ratio between foreground and background colors for a list of pairs.
 * Supports ColorConfig types including gradients. For gradients, checks all stop colors and returns the worst ratio.
 * @param colorPairs - An array of color pairs, each with an id, foreground color (ColorConfig), and background color.
 * @returns An array of objects, each containing the id, calculated contrast ratio, and optional stop color details.
 */
export function useContrastChecker(colorPairs: ColorPair[]) {
  const [contrastResults, setContrastResults] = useState<ContrastResult[]>([]);

  const debouncedCalculation = useCallback(
    debounce((pairs: ColorPair[]) => {
      if (!pairs.length) {
        setContrastResults([]);
        return;
      }

      try {
        const results = pairs.map((pair) => {
          if (!pair.foreground || !pair.background) {
            return {
              id: pair.id,
              contrastRatio: 0,
            };
          }

          const foregroundColors = extractColorsForContrast(pair.foreground);
          const backgroundColors = extractColorsForContrast(pair.background);

          if (foregroundColors.length === 0 || backgroundColors.length === 0) {
            return {
              id: pair.id,
              contrastRatio: 0,
            };
          }

          // Calculate contrast for each foreground color against each background color
          // For gradients, we need to check all combinations and find the worst ratio
          const allRatios: number[] = [];
          const stopRatios: Array<{ color: string; ratio: number }> = [];

          foregroundColors.forEach((fgColor) => {
            // Calculate ratios for this foreground color against all background colors
            const ratiosForThisFg = backgroundColors.map((bgColor) => {
              const ratio = parseFloat(
                getContrastRatio(fgColor, bgColor).toString(),
              );
              allRatios.push(ratio);
              return ratio;
            });

            // Track the worst ratio for this foreground color (for gradient display)
            if (isGradient(pair.foreground)) {
              stopRatios.push({
                color: fgColor,
                ratio: Math.min(...ratiosForThisFg),
              });
            }
          });

          // Return the worst (lowest) contrast ratio across all combinations
          const minRatio = allRatios.length > 0 ? Math.min(...allRatios) : 0;

          return {
            id: pair.id,
            contrastRatio: minRatio,
            stopColors: isGradient(pair.foreground) ? stopRatios : undefined,
          };
        });

        setContrastResults(results);
      } catch (error) {
        console.error("Error checking contrast:", error);
        setContrastResults([]);
      }
    }, 750),
    [],
  );

  useEffect(() => {
    debouncedCalculation(colorPairs);
  }, [colorPairs, debouncedCalculation]);

  return contrastResults;
}
