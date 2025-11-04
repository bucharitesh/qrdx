import type { JSX } from "react";
import type { CornerEyeDotPattern } from "../types/corner-dot";

// Generate corner dot pattern based on type
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

    case "rounded-inward":
      return (
        <path
          clipRule="evenodd"
          d={`M ${cx - halfSize} ${cy - halfSize * 0.428_571}v ${size * 0.285_714}a ${size * 0.357_143} ${size * 0.357_143}, 0, 0, 0, ${size * 0.357_143} ${size * 0.357_143}h ${size * 0.642_857}v -${size * 0.642_857}a ${size * 0.357_143} ${size * 0.357_143}, 0, 0, 0, -${size * 0.357_143} -${size * 0.357_143}h -${size * 0.285_714}a ${size * 0.357_143} ${size * 0.357_143}, 0, 0, 0, -${size * 0.357_143} ${size * 0.357_143}`}
          transform={`rotate(0,${cx},${cy})`}
        />
      );

    case "rounded-inward-flipped":
      return (
        <path
          clipRule="evenodd"
          d={`M ${cx - halfSize} ${cy - halfSize * 0.428_571}v ${size * 0.285_714}a ${size * 0.357_143} ${size * 0.357_143}, 0, 0, 0, ${size * 0.357_143} ${size * 0.357_143}h ${size * 0.642_857}v -${size * 0.642_857}a ${size * 0.357_143} ${size * 0.357_143}, 0, 0, 0, -${size * 0.357_143} -${size * 0.357_143}h -${size * 0.285_714}a ${size * 0.357_143} ${size * 0.357_143}, 0, 0, 0, -${size * 0.357_143} ${size * 0.357_143}`}
          transform={`rotate(-180,${cx},${cy})`}
        />
      );

    case "semi-round":
      return (
        <path
          clipRule="evenodd"
          d={`M ${cx - halfSize} ${cy - halfSize * 0.428_571}v ${size * 0.285_714}a ${size * 0.357_143} ${size * 0.357_143}, 0, 0, 0, ${size * 0.357_143} ${size * 0.357_143}h ${size * 0.642_857}v -${size * 0.642_857}a ${size * 0.357_143} ${size * 0.357_143}, 0, 0, 0, -${size * 0.357_143} -${size * 0.357_143}h -${size * 0.285_714}H ${cx - halfSize}z`}
          transform={`rotate(0,${cx},${cy})`}
        />
      );

    case "leaf":
      return (
        <path
          clipRule="evenodd"
          d={`M ${cx - halfSize} ${cy - halfSize * 0.428_571}v ${size * 0.642_857}h ${size * 0.642_857}a ${size * 0.357_143} ${size * 0.357_143}, 0, 0, 0, ${size * 0.357_143} -${size * 0.357_143}v -${size * 0.642_857}h -${size * 0.642_857}a ${size * 0.357_143} ${size * 0.357_143}, 0, 0, 0, -${size * 0.357_143} ${size * 0.357_143}z`}
          transform={`rotate(0,${cx},${cy})`}
        />
      );

    case "diamond":
      return (
        <path
          d={`M ${cx - halfSize * 0.714_286} ${cy - halfSize * 0.714_286}v ${size * 0.714_286}h ${size * 0.714_286}v -${size * 0.714_286}z`}
          transform={`rotate(45,${cx},${cy})`}
        />
      );

    case "diamond-rounded":
      return (
        <path
          d={`M ${cx - halfSize * 0.571_429} ${cy - halfSize * 0.714_286}h ${size * 0.428_571}c ${size * 0.142_857} 0 ${size * 0.142_857} ${size * 0.142_857} ${size * 0.142_857} ${size * 0.142_857}v ${size * 0.428_571}c 0 ${size * 0.142_857} -${size * 0.142_857} ${size * 0.142_857} -${size * 0.142_857} ${size * 0.142_857}h -${size * 0.428_571}c -${size * 0.142_857} 0 -${size * 0.142_857} -${size * 0.142_857} -${size * 0.142_857} -${size * 0.142_857}v -${size * 0.428_571}c 0 -${size * 0.142_857} ${size * 0.142_857} -${size * 0.142_857} ${size * 0.142_857} -${size * 0.142_857}z`}
          transform={`rotate(45,${cx},${cy})`}
        />
      );

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
