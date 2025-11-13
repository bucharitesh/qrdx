import type { JSX } from "react";
import type { CornerEyeDotPattern } from "../types/corner-dot";

/**
 * Generate corner dot pattern based on type
 * @param cx - Center X coordinate
 * @param cy - Center Y coordinate
 * @param radius - Radius of the dot
 * @param pattern - Pattern type for the corner dot
 * @returns JSX element representing the pattern
 */
export function generateCornerDotPath(
  cx: number,
  cy: number,
  radius: number,
  pattern: CornerEyeDotPattern = "circle"
): JSX.Element {
  const size = radius * 2;
  const halfSize = radius;

  switch (pattern) {
    case "square":
      return (
        <rect
          height={size}
          transform={`rotate(0,${cx},${cy})`}
          width={size}
          x={cx - halfSize}
          y={cy - halfSize}
        />
      );

    case "rounded-square":
      return (
        <rect
          height={size}
          rx={radius * 0.5}
          ry={radius * 0.5}
          transform={`rotate(0,${cx},${cy})`}
          width={size}
          x={cx - halfSize}
          y={cy - halfSize}
        />
      );

    case "diamond":
      return (
        <path
          d={`M ${cx - halfSize * 0.714_286} ${cy - halfSize * 0.714_286}v ${size * 0.714_286}h ${size * 0.714_286}v -${size * 0.714_286}z`}
          transform={`rotate(45,${cx},${cy})`}
        />
      );

    // case "circle":
    default:
      return (
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          transform={`rotate(0,${cx},${cy})`}
        />
      );
  }
}
