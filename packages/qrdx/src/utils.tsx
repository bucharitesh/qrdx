import type { JSX } from "react";
import React from "react";
import type { Excavation, ImageSettings, Modules, QRPropsSVG } from "../types";
import qrcodegen from "./codegen";
import {
  DEFAULT_BGCOLOR,
  DEFAULT_FGCOLOR,
  DEFAULT_IMG_SCALE,
  DEFAULT_LEVEL,
  DEFAULT_MARGIN,
  DEFAULT_SIZE,
  ERROR_LEVEL_MAP,
} from "./constants";
import { getTemplate } from "./templates";

// We could just do this in generatePath, except that we want to support
// non-Path2D canvas, so we need to keep it an explicit step.
export function excavateModules(
  modules: Modules,
  excavation: Excavation
): Modules {
  return modules.slice().map((row, y) => {
    if (y < excavation.y || y >= excavation.y + excavation.h) {
      return row;
    }
    return row.map((cell, x) => {
      if (x < excavation.x || x >= excavation.x + excavation.w) {
        return cell;
      }
      return false;
    });
  });
}

export function generatePath(modules: Modules, margin = 0): string {
  const ops: string[] = [];
  modules.forEach((row, y) => {
    let start: number | null = null;
    row.forEach((cell, x) => {
      if (!cell && start !== null) {
        // M0 0h7v1H0z injects the space with the move and drops the comma,
        // saving a char per operation
        ops.push(
          `M${start + margin} ${y + margin}h${x - start}v1H${start + margin}z`
        );
        start = null;
        return;
      }

      // end of row, clean up or skip
      if (x === row.length - 1) {
        if (!cell) {
          // We would have closed the op above already so this can only mean
          // 2+ light modules in a row.
          return;
        }
        if (start === null) {
          // Just a single dark module.
          ops.push(`M${x + margin},${y + margin} h1v1H${x + margin}z`);
        } else {
          // Otherwise finish the current line.
          ops.push(
            `M${start + margin},${y + margin} h${x + 1 - start}v1H${
              start + margin
            }z`
          );
        }
        return;
      }

      if (cell && start === null) {
        start = x;
      }
    });
  });
  return ops.join("");
}

// Helper function to check if a module is part of a position detection pattern (corner)
function isCornerModule(x: number, y: number, size: number): boolean {
  // Top-left corner (0,0 to 6,6)
  if (x < 7 && y < 7) {
    return true;
  }
  // Top-right corner (size-7,0 to size-1,6)
  if (x >= size - 7 && y < 7) {
    return true;
  }
  // Bottom-left corner (0,size-7 to 6,size-1)
  if (x < 7 && y >= size - 7) {
    return true;
  }
  return false;
}

// Generate corner square path based on pattern type
function generateCornerSquarePath(
  offsetX: number,
  offsetY: number,
  size: number,
  pattern = "gear"
): string {
  switch (pattern) {
    case "square":
      return generateCornerSquarePattern(offsetX, offsetY, size);
    case "rounded":
      return generateCornerRoundedPattern(offsetX, offsetY, size);
    case "rounded-inward":
      return generateCornerRoundedInwardPattern(offsetX, offsetY, size);
    case "rounded-inward-flipped":
      return generateCornerRoundedInwardFlippedPattern(offsetX, offsetY, size);
    case "semi-round":
      return generateCornerSemiRoundPattern(offsetX, offsetY, size);
    case "rounded-extra":
      return generateCornerRoundedExtraPattern(offsetX, offsetY, size);
    case "rounded-square":
      return generateCornerRoundedSquarePattern(offsetX, offsetY, size);
    case "circle":
      return generateCornerCirclePattern(offsetX, offsetY, size);
    default:
      return generateCornerGearPattern(offsetX, offsetY, size);
  }
}

// Pattern 1: Basic square corners
function generateCornerSquarePattern(
  offsetX: number,
  offsetY: number,
  size: number
): string {
  const scale = size / 80;
  const transform = (coord: number, offset: number) => coord * scale + offset;

  const path = `M ${transform(5, offsetX)} ${transform(5, offsetY)}v ${70 * scale}h ${70 * scale}v -${70 * scale}zM ${transform(15, offsetX)} ${transform(15, offsetY)}h ${50 * scale}v ${50 * scale}h -${50 * scale}z`;

  return path;
}

// Pattern 2: Rounded corners
function generateCornerRoundedPattern(
  offsetX: number,
  offsetY: number,
  size: number
): string {
  const scale = size / 80;
  const transform = (coord: number, offset: number) => coord * scale + offset;

  // Using the exact path from user's specification - rounded square corners
  const path = `M ${transform(5, offsetX)} ${transform(15, offsetY)}v ${50 * scale}a ${10 * scale} ${10 * scale}, 0, 0, 0, ${10 * scale} ${10 * scale}h ${50 * scale}a ${10 * scale} ${10 * scale}, 0, 0, 0, ${10 * scale} -${10 * scale}v -${50 * scale}a ${10 * scale} ${10 * scale}, 0, 0, 0, -${10 * scale} -${10 * scale}h -${50 * scale}a ${10 * scale} ${10 * scale}, 0, 0, 0, -${10 * scale} ${10 * scale}zM ${transform(20, offsetX)} ${transform(15, offsetY)}h ${40 * scale}a ${5 * scale} ${5 * scale}, 0, 0, 1, ${5 * scale} ${5 * scale}v ${40 * scale}a ${5 * scale} ${5 * scale}, 0, 0, 1, -${5 * scale} ${5 * scale}h -${40 * scale}a ${5 * scale} ${5 * scale}, 0, 0, 1, -${5 * scale} -${5 * scale}v -${40 * scale}a ${5 * scale} ${5 * scale}, 0, 0, 1, ${5 * scale} -${5 * scale}z`;

  return path;
}

// Pattern 3: Rounded inward
function generateCornerRoundedInwardPattern(
  offsetX: number,
  offsetY: number,
  size: number
): string {
  const scale = size / 80;
  const transform = (coord: number, offset: number) => coord * scale + offset;

  const path = `M ${transform(5, offsetX)} ${transform(30, offsetY)}v 20a ${25 * scale} ${25 * scale}, 0, 0, 0, ${25 * scale} ${25 * scale}h 45v -45a ${25 * scale} ${25 * scale}, 0, 0, 0, -${25 * scale} -${25 * scale}h -20a ${25 * scale} ${25 * scale}, 0, 0, 0, -${25 * scale} ${25 * scale}M ${transform(30, offsetX)} ${transform(15, offsetY)}h 20a ${15 * scale} ${15 * scale}, 0, 0, 1, ${15 * scale} ${15 * scale}v 35h -35a ${15 * scale} ${15 * scale}, 0, 0, 1, -${15 * scale} -${15 * scale}v -20a ${15 * scale} ${15 * scale}, 0, 0, 1, ${15 * scale} -${15 * scale}`;

  return path;
}

// Pattern 4: Rounded inward flipped
function generateCornerRoundedInwardFlippedPattern(
  offsetX: number,
  offsetY: number,
  size: number
): string {
  const scale = size / 80;
  const transform = (coord: number, offset: number) => coord * scale + offset;

  const path = `M ${transform(5, offsetX)} ${transform(30, offsetY)}v 20a ${25 * scale} ${25 * scale}, 0, 0, 0, ${25 * scale} ${25 * scale}h 45v -45a ${25 * scale} ${25 * scale}, 0, 0, 0, -${25 * scale} -${25 * scale}h -20a ${25 * scale} ${25 * scale}, 0, 0, 0, -${25 * scale} ${25 * scale}M ${transform(30, offsetX)} ${transform(15, offsetY)}h 20a ${15 * scale} ${15 * scale}, 0, 0, 1, ${15 * scale} ${15 * scale}v 35h -35a ${15 * scale} ${15 * scale}, 0, 0, 1, -${15 * scale} -${15 * scale}v -20a ${15 * scale} ${15 * scale}, 0, 0, 1, ${15 * scale} -${15 * scale}`;

  return path;
}

// Pattern 6: Semi-round
function generateCornerSemiRoundPattern(
  offsetX: number,
  offsetY: number,
  size: number
): string {
  const scale = size / 80;
  const transform = (coord: number, offset: number) => coord * scale + offset;

  const path = `M ${transform(5, offsetX)} ${transform(30, offsetY)}v 20a ${25 * scale} ${25 * scale}, 0, 0, 0, ${25 * scale} ${25 * scale}h 45v -45a ${25 * scale} ${25 * scale}, 0, 0, 0, -${25 * scale} -${25 * scale}h -20H ${transform(5, offsetX)}zM ${transform(30, offsetX)} ${transform(15, offsetY)}h 20a ${15 * scale} ${15 * scale}, 0, 0, 1, ${15 * scale} ${15 * scale}v 35h -35a ${15 * scale} ${15 * scale}, 0, 0, 1, -${15 * scale} -${15 * scale}v -35z`;

  return path;
}

// Pattern 7: Rounded-extra
function generateCornerRoundedExtraPattern(
  offsetX: number,
  offsetY: number,
  size: number
): string {
  const scale = size / 80;
  const transform = (coord: number, offset: number) => coord * scale + offset;

  const path = `M ${transform(5, offsetX)} ${transform(30, offsetY)}v 20a ${25 * scale} ${25 * scale}, 0, 0, 0, ${25 * scale} ${25 * scale}h 20a ${25 * scale} ${25 * scale}, 0, 0, 0, ${25 * scale} -${25 * scale}v -20a ${25 * scale} ${25 * scale}, 0, 0, 0, -${25 * scale} -${25 * scale}h -20a ${25 * scale} ${25 * scale}, 0, 0, 0, -${25 * scale} ${25 * scale}M ${transform(30, offsetX)} ${transform(15, offsetY)}h 20a ${15 * scale} ${15 * scale}, 0, 0, 1, ${15 * scale} ${15 * scale}v 20a ${15 * scale} ${15 * scale}, 0, 0, 1, -${15 * scale} ${15 * scale}h -20a ${15 * scale} ${15 * scale}, 0, 0, 1, -${15 * scale} -${15 * scale}v -20a ${15 * scale} ${15 * scale}, 0, 0, 1, ${15 * scale} -${15 * scale}`;

  return path;
}

// Pattern 8: Rounded-square
function generateCornerRoundedSquarePattern(
  offsetX: number,
  offsetY: number,
  size: number
): string {
  const scale = size / 80;
  const transform = (coord: number, offset: number) => coord * scale + offset;

  const path = `M ${transform(5, offsetX)} ${transform(40, offsetY)}a ${35 * scale} ${35 * scale}, 0, 0, 0, ${35 * scale} ${35 * scale}h 30a ${5 * scale} ${5 * scale}, 0, 0, 0, ${5 * scale} -${5 * scale}v -30a ${35 * scale} ${35 * scale}, 0, 0, 0, -${35 * scale} -${35 * scale}a ${35 * scale} ${35 * scale}, 0, 0, 0, -${35 * scale} ${35 * scale}zM ${transform(40, offsetX)} ${transform(15, offsetY)}a ${25 * scale} ${25 * scale}, 0, 0, 1, ${25 * scale} ${25 * scale}v 25h -25a ${25 * scale} ${25 * scale}, 0, 0, 1, -${25 * scale} -${25 * scale}a ${25 * scale} ${25 * scale}, 0, 0, 1, ${25 * scale} -${25 * scale}z`;

  return path;
}

// Pattern 9: Circle
function generateCornerCirclePattern(
  offsetX: number,
  offsetY: number,
  size: number
): string {
  const scale = size / 80;
  const transform = (coord: number, offset: number) => coord * scale + offset;

  // Using the exact path from user's specification - proper circles (made slightly bigger)
  const outerRadius = 37.5 * scale; // Increased from 35
  const innerRadius = 27 * scale; // Increased from 25
  const path = `M ${transform(40, offsetX)} ${transform(2.5, offsetY)}a ${outerRadius} ${outerRadius} 0 1 0 ${0.1 * scale} 0zm 0 ${10.5 * scale}a ${innerRadius} ${innerRadius} 0 1 1 -${0.1 * scale} 0Z`;

  return path;
}

// Generate corner dot pattern based on type
function generateCornerDotPath(
  cx: number,
  cy: number,
  radius: number,
  pattern = "circle"
): JSX.Element {
  const size = radius * 2;
  const halfSize = radius;

  switch (pattern) {
    case "square":
      // Pattern 1: Square dot
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
      // Pattern 2: Rounded square dot
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
      // Pattern 4: Rounded inward
      return (
        <path
          clipRule="evenodd"
          d={`M ${cx - halfSize} ${cy - halfSize * 0.428_571}v ${size * 0.285_714}a ${size * 0.357_143} ${size * 0.357_143}, 0, 0, 0, ${size * 0.357_143} ${size * 0.357_143}h ${size * 0.642_857}v -${size * 0.642_857}a ${size * 0.357_143} ${size * 0.357_143}, 0, 0, 0, -${size * 0.357_143} -${size * 0.357_143}h -${size * 0.285_714}a ${size * 0.357_143} ${size * 0.357_143}, 0, 0, 0, -${size * 0.357_143} ${size * 0.357_143}`}
          transform={`rotate(0,${cx},${cy})`}
        />
      );

    case "rounded-inward-flipped":
      // Pattern 5: Rounded inward flipped
      return (
        <path
          clipRule="evenodd"
          d={`M ${cx - halfSize} ${cy - halfSize * 0.428_571}v ${size * 0.285_714}a ${size * 0.357_143} ${size * 0.357_143}, 0, 0, 0, ${size * 0.357_143} ${size * 0.357_143}h ${size * 0.642_857}v -${size * 0.642_857}a ${size * 0.357_143} ${size * 0.357_143}, 0, 0, 0, -${size * 0.357_143} -${size * 0.357_143}h -${size * 0.285_714}a ${size * 0.357_143} ${size * 0.357_143}, 0, 0, 0, -${size * 0.357_143} ${size * 0.357_143}`}
          transform={`rotate(-180,${cx},${cy})`}
        />
      );

    case "semi-round":
      // Pattern 6: Semi-round
      return (
        <path
          clipRule="evenodd"
          d={`M ${cx - halfSize} ${cy - halfSize * 0.428_571}v ${size * 0.285_714}a ${size * 0.357_143} ${size * 0.357_143}, 0, 0, 0, ${size * 0.357_143} ${size * 0.357_143}h ${size * 0.642_857}v -${size * 0.642_857}a ${size * 0.357_143} ${size * 0.357_143}, 0, 0, 0, -${size * 0.357_143} -${size * 0.357_143}h -${size * 0.285_714}H ${cx - halfSize}z`}
          transform={`rotate(0,${cx},${cy})`}
        />
      );

    case "leaf":
      // Pattern 8: Leaf shape
      return (
        <path
          clipRule="evenodd"
          d={`M ${cx - halfSize} ${cy - halfSize * 0.428_571}v ${size * 0.642_857}h ${size * 0.642_857}a ${size * 0.357_143} ${size * 0.357_143}, 0, 0, 0, ${size * 0.357_143} -${size * 0.357_143}v -${size * 0.642_857}h -${size * 0.642_857}a ${size * 0.357_143} ${size * 0.357_143}, 0, 0, 0, -${size * 0.357_143} ${size * 0.357_143}z`}
          transform={`rotate(0,${cx},${cy})`}
        />
      );

    case "diamond":
      // Pattern 9: Diamond
      return (
        <path
          d={`M ${cx - halfSize * 0.714_286} ${cy - halfSize * 0.714_286}v ${size * 0.714_286}h ${size * 0.714_286}v -${size * 0.714_286}z`}
          transform={`rotate(45,${cx},${cy})`}
        />
      );

    case "diamond-rounded":
      // Pattern 10: Diamond with rounded corners
      return (
        <path
          d={`M ${cx - halfSize * 0.571_429} ${cy - halfSize * 0.714_286}h ${size * 0.428_571}c ${size * 0.142_857} 0 ${size * 0.142_857} ${size * 0.142_857} ${size * 0.142_857} ${size * 0.142_857}v ${size * 0.428_571}c 0 ${size * 0.142_857} -${size * 0.142_857} ${size * 0.142_857} -${size * 0.142_857} ${size * 0.142_857}h -${size * 0.428_571}c -${size * 0.142_857} 0 -${size * 0.142_857} -${size * 0.142_857} -${size * 0.142_857} -${size * 0.142_857}v -${size * 0.428_571}c 0 -${size * 0.142_857} ${size * 0.142_857} -${size * 0.142_857} ${size * 0.142_857} -${size * 0.142_857}z`}
          transform={`rotate(45,${cx},${cy})`}
        />
      );

    default:
      // Pattern 3: Circle (default)
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

// Pattern 10: Gear (current default decorative design)
function generateCornerGearPattern(
  offsetX: number,
  offsetY: number,
  size: number
): string {
  // The original path is designed for a 74.7x74.7 viewBox
  const scale = size / 74.7002;

  // Scale and translate the path coordinates
  const transformCoord = (coord: number) => coord * scale + offsetX;
  const transformY = (coord: number) => coord * scale + offsetY;

  // Using template literals for the path - this is the new decorative design
  const path = `M${transformCoord(37.3496)} ${transformY(0)}C${transformCoord(39.2939)} ${transformY(0)} ${transformCoord(40.9948)} ${transformY(1.038_42)} ${transformCoord(41.9287)} ${transformY(2.590_82)}C${transformCoord(43.2293)} ${transformY(1.340_13)} ${transformCoord(45.1347)} ${transformY(0.780_267)} ${transformCoord(47.0098)} ${transformY(1.280_27)}C${transformCoord(48.8871)} ${transformY(1.789_28)} ${transformCoord(50.261)} ${transformY(3.237_67)} ${transformCoord(50.7578)} ${transformY(4.984_38)}C${transformCoord(52.3454)} ${transformY(4.0996)} ${transformCoord(54.3432)} ${transformY(4.047)} ${transformCoord(56.0303)} ${transformY(5.019_53)}C${transformCoord(57.7094)} ${transformY(5.987_52)} ${transformCoord(58.6586)} ${transformY(7.736_47)} ${transformCoord(58.6924)} ${transformY(9.5459)}C${transformCoord(60.4517)} ${transformY(9.106_61)} ${transformCoord(62.3883)} ${transformY(9.572_15)} ${transformCoord(63.7598)} ${transformY(10.9502)}C${transformCoord(65.1282)} ${transformY(12.3253)} ${transformCoord(65.5963)} ${transformY(14.2585)} ${transformCoord(65.1641)} ${transformY(16.0127)}C${transformCoord(66.974)} ${transformY(16.044)} ${transformCoord(68.7242)} ${transformY(16.9982)} ${transformCoord(69.7002)} ${transformY(18.6797)}C${transformCoord(70.6781)} ${transformY(20.3647)} ${transformCoord(70.6241)} ${transformY(22.3635)} ${transformCoord(69.7402)} ${transformY(23.9502)}C${transformCoord(71.4776)} ${transformY(24.4496)} ${transformCoord(72.9194)} ${transformY(25.8232)} ${transformCoord(73.4199)} ${transformY(27.7002)}C${transformCoord(73.927)} ${transformY(29.5707)} ${transformCoord(73.3661)} ${transformY(31.4794)} ${transformCoord(72.1104)} ${transformY(32.7822)}C${transformCoord(73.6621)} ${transformY(33.7163)} ${transformCoord(74.7002)} ${transformY(35.4166)} ${transformCoord(74.7002)} ${transformY(37.3604)}C${transformCoord(74.7001)} ${transformY(39.307)} ${transformCoord(73.6582)} ${transformY(41.0084)} ${transformCoord(72.1025)} ${transformY(41.9414)}C${transformCoord(73.357)} ${transformY(43.245)} ${transformCoord(73.9207)} ${transformY(45.1525)} ${transformCoord(73.4199)} ${transformY(47.0303)}C${transformCoord(72.9187)} ${transformY(48.9027)} ${transformCoord(71.4782)} ${transformY(50.2735)} ${transformCoord(69.7383)} ${transformY(50.7734)}C${transformCoord(70.6201)} ${transformY(52.3601)} ${transformCoord(70.6716)} ${transformY(54.3549)} ${transformCoord(69.7002)} ${transformY(56.04)}C${transformCoord(68.7237)} ${transformY(57.7225)} ${transformCoord(66.9721)} ${transformY(58.6729)} ${transformCoord(65.1611)} ${transformY(58.7031)}C${transformCoord(65.598)} ${transformY(60.4623)} ${transformCoord(65.131)} ${transformY(62.3982)} ${transformCoord(63.7598)} ${transformY(63.7695)}C${transformCoord(62.3847)} ${transformY(65.138)} ${transformCoord(60.4515)} ${transformY(65.6061)} ${transformCoord(58.6973)} ${transformY(65.1738)}C${transformCoord(58.6635)} ${transformY(66.9833)} ${transformCoord(57.7094)} ${transformY(68.7322)} ${transformCoord(56.0303)} ${transformY(69.7002)}C${transformCoord(54.3461)} ${transformY(70.6777)} ${transformCoord(52.348)} ${transformY(70.6248)} ${transformCoord(50.7617)} ${transformY(69.7422)}C${transformCoord(50.2643)} ${transformY(71.4831)} ${transformCoord(48.8896)} ${transformY(72.9284)} ${transformCoord(47.0098)} ${transformY(73.4297)}C${transformCoord(45.1389)} ${transformY(73.9368)} ${transformCoord(43.2296)} ${transformY(73.3763)} ${transformCoord(41.9268)} ${transformY(72.1201)}C${transformCoord(40.9927)} ${transformY(73.6717)} ${transformCoord(39.2932)} ${transformY(74.71)} ${transformCoord(37.3496)} ${transformY(74.71)}C${transformCoord(35.4051)} ${transformY(74.7098)} ${transformCoord(33.7042)} ${transformY(73.6711)} ${transformCoord(32.7705)} ${transformY(72.1182)}C${transformCoord(31.4697)} ${transformY(73.3758)} ${transformCoord(29.5597)} ${transformY(73.9418)} ${transformCoord(27.6797)} ${transformY(73.4404)}V${transformY(73.4502)}C${transformCoord(25.8065)} ${transformY(72.9422)} ${transformCoord(24.434)} ${transformY(71.4985)} ${transformCoord(23.9346)} ${transformY(69.7568)}C${transformCoord(22.3504)} ${transformY(70.6301)} ${transformCoord(20.3591)} ${transformY(70.6781)} ${transformCoord(18.6797)} ${transformY(69.71)}C${transformCoord(16.9957)} ${transformY(68.7391)} ${transformCoord(16.045)} ${transformY(66.9831)} ${transformCoord(16.0166)} ${transformY(65.168)}C${transformCoord(14.2547)} ${transformY(65.6091)} ${transformCoord(12.3134)} ${transformY(65.1435)} ${transformCoord(10.9395)} ${transformY(63.7695)}C${transformCoord(9.5687)} ${transformY(62.3919)} ${transformCoord(9.101_68)} ${transformY(60.454)} ${transformCoord(9.538_09)} ${transformY(58.6973)}C${transformCoord(7.727_91)} ${transformY(58.6641)} ${transformCoord(5.978_15)} ${transformY(57.71)} ${transformCoord(5.009_77)} ${transformY(56.0303)}C${transformCoord(4.035_52)} ${transformY(54.3517)} ${transformCoord(4.083_77)} ${transformY(52.3649)} ${transformCoord(4.958_01)} ${transformY(50.7812)}C${transformCoord(3.217_05)} ${transformY(50.2839)} ${transformCoord(1.770_87)} ${transformY(48.9101)} ${transformCoord(1.269_53)} ${transformY(47.0303)}V${transformY(47.0205)}C${transformCoord(0.762_081)} ${transformY(45.1489)} ${transformCoord(1.327_58)} ${transformY(43.2375)} ${transformCoord(2.584_96)} ${transformY(41.9346)}C${transformCoord(1.036_04)} ${transformY(41)} ${transformCoord(0.000_108_484)} ${transformY(39.3019)} ${transformCoord(0)} ${transformY(37.3604)}C${transformCoord(0)} ${transformY(35.4159)} ${transformCoord(1.038_15)} ${transformY(33.7141)} ${transformCoord(2.590_82)} ${transformY(32.7803)}C${transformCoord(1.340_44)} ${transformY(31.4797)} ${transformCoord(0.780_389)} ${transformY(29.575)} ${transformCoord(1.280_27)} ${transformY(27.7002)}C${transformCoord(1.782_58)} ${transformY(25.8232)} ${transformCoord(3.228_06)} ${transformY(24.4482)} ${transformCoord(4.973_63)} ${transformY(23.9512)}C${transformCoord(4.089_38)} ${transformY(22.3638)} ${transformCoord(4.037_43)} ${transformY(20.3664)} ${transformCoord(5.009_77)} ${transformY(18.6797)}C${transformCoord(5.978_15)} ${transformY(16.9999)} ${transformCoord(7.727_88)} ${transformY(16.0496)} ${transformCoord(9.538_09)} ${transformY(16.0166)}C${transformCoord(9.101_39)} ${transformY(14.2576)} ${transformCoord(9.568_46)} ${transformY(12.3214)} ${transformCoord(10.9395)} ${transformY(10.9502)}C${transformCoord(12.3171)} ${transformY(9.579_11)} ${transformCoord(14.2558)} ${transformY(9.111_37)} ${transformCoord(16.0127)} ${transformY(9.547_85)}C${transformCoord(16.0426)} ${transformY(7.734_21)} ${transformCoord(16.9969)} ${transformY(5.979_89)} ${transformCoord(18.6797)} ${transformY(5.009_77)}C${transformCoord(20.3596)} ${transformY(4.034_74)} ${transformCoord(22.3521)} ${transformY(4.084_68)} ${transformCoord(23.9365)} ${transformY(4.960_94)}C${transformCoord(24.4378)} ${transformY(3.227_49)} ${transformCoord(25.8059)} ${transformY(1.7898)} ${transformCoord(27.6797)} ${transformY(1.290_04)}C${transformCoord(29.5511)} ${transformY(0.782_64)} ${transformCoord(31.4617)} ${transformY(1.343_57)} ${transformCoord(32.7646)} ${transformY(2.600_59)}C${transformCoord(33.6971)} ${transformY(1.042_68)} ${transformCoord(35.4013)} ${transformY(0.000_152_405)} ${transformCoord(37.3496)} ${transformY(0)}ZM${transformCoord(41.0615)} ${transformY(9.175_78)}C${transformCoord(40.1006)} ${transformY(10.1057)} ${transformCoord(38.793)} ${transformY(10.6797)} ${transformCoord(37.3496)} ${transformY(10.6797)}C${transformCoord(35.9064)} ${transformY(10.6796)} ${transformCoord(34.5985)} ${transformY(10.1066)} ${transformCoord(33.6377)} ${transformY(9.176_76)}C${transformCoord(32.9511)} ${transformY(10.3241)} ${transformCoord(31.8358)} ${transformY(11.2176)} ${transformCoord(30.4404)} ${transformY(11.5898)}C${transformCoord(29.0527)} ${transformY(11.9661)} ${transformCoord(27.6436)} ${transformY(11.7542)} ${transformCoord(26.4766)} ${transformY(11.1074)}C${transformCoord(26.1072)} ${transformY(12.3879)} ${transformCoord(25.2629)} ${transformY(13.5333)} ${transformCoord(24.0195)} ${transformY(14.25)}C${transformCoord(22.7695)} ${transformY(14.9754)} ${transformCoord(21.347)} ${transformY(15.1322)} ${transformCoord(20.0479)} ${transformY(14.8047)}C${transformCoord(20.0289)} ${transformY(16.1454)} ${transformCoord(19.5108)} ${transformY(17.4793)} ${transformCoord(18.4902)} ${transformY(18.5)}C${transformCoord(17.4696)} ${transformY(19.5158)} ${transformCoord(16.1409)} ${transformY(20.033)} ${transformCoord(14.8066)} ${transformY(20.0566)}C${transformCoord(15.1312)} ${transformY(21.3534)} ${transformCoord(14.9738)} ${transformY(22.7723)} ${transformCoord(14.25)} ${transformY(24.0195)}C${transformCoord(13.5243)} ${transformY(25.2699)} ${transformCoord(12.3701)} ${transformY(26.1148)} ${transformCoord(11.082)} ${transformY(26.4795)}C${transformCoord(11.7347)} ${transformY(27.6479)} ${transformCoord(11.9529)} ${transformY(29.062)} ${transformCoord(11.5801)} ${transformY(30.46)}C${transformCoord(11.2085)} ${transformY(31.8485)} ${transformCoord(10.3194)} ${transformY(32.9607)} ${transformCoord(9.175_78)} ${transformY(33.6475)}C${transformCoord(10.106)} ${transformY(34.6084)} ${transformCoord(10.6797)} ${transformY(35.9167)} ${transformCoord(10.6797)} ${transformY(37.3604)}C${transformCoord(10.6796)} ${transformY(38.805)} ${transformCoord(10.1053)} ${transformY(40.1141)} ${transformCoord(9.173_83)} ${transformY(41.0752)}C${transformCoord(10.3132)} ${transformY(41.7614)} ${transformCoord(11.1999)} ${transformY(42.871)} ${transformCoord(11.5703)} ${transformY(44.2598)}C${transformCoord(11.946)} ${transformY(45.6504)} ${transformCoord(11.7335)} ${transformY(47.0592)} ${transformCoord(11.0889)} ${transformY(48.2266)}C${transformCoord(12.377)} ${transformY(48.593)} ${transformCoord(13.5297)} ${transformY(49.441)} ${transformCoord(14.25)} ${transformY(50.6904)}C${transformCoord(14.9754)} ${transformY(51.9405)} ${transformCoord(15.1322)} ${transformY(53.3629)} ${transformCoord(14.8047)} ${transformY(54.6621)}C${transformCoord(16.142)} ${transformY(54.6835)} ${transformCoord(17.4721)} ${transformY(55.2016)} ${transformCoord(18.4902)} ${transformY(56.2197)}C${transformCoord(19.5097)} ${transformY(57.2441)} ${transformCoord(20.0278)} ${transformY(58.5787)} ${transformCoord(20.0479)} ${transformY(59.918)}C${transformCoord(21.3469)} ${transformY(59.5917)} ${transformCoord(22.7696)} ${transformY(59.7493)} ${transformCoord(24.0195)} ${transformY(60.4697)}C${transformCoord(25.2676)} ${transformY(61.1892)} ${transformCoord(26.1117)} ${transformY(62.3406)} ${transformCoord(26.4775)} ${transformY(63.627)}C${transformCoord(27.6424)} ${transformY(62.9822)} ${transformCoord(29.0498)} ${transformY(62.7688)} ${transformCoord(30.4404)} ${transformY(63.1396)}C${transformCoord(31.8284)} ${transformY(63.5112)} ${transformCoord(32.9402)} ${transformY(64.3999)} ${transformCoord(33.627)} ${transformY(65.543)}C${transformCoord(34.5887)} ${transformY(64.6072)} ${transformCoord(35.9012)} ${transformY(64.0304)} ${transformCoord(37.3496)} ${transformY(64.0303)}C${transformCoord(38.7912)} ${transformY(64.0303)} ${transformCoord(40.098)} ${transformY(64.6023)} ${transformCoord(41.0586)} ${transformY(65.5303)}C${transformCoord(41.7458)} ${transformY(64.3887)} ${transformCoord(42.8594)} ${transformY(63.5007)} ${transformCoord(44.25)} ${transformY(63.1299)}C${transformCoord(45.643)} ${transformY(62.7522)} ${transformCoord(47.057)} ${transformY(62.9676)} ${transformCoord(48.2266)} ${transformY(63.6201)}C${transformCoord(48.5931)} ${transformY(62.3323)} ${transformCoord(49.4413)} ${transformY(61.1801)} ${transformCoord(50.6904)} ${transformY(60.46)}C${transformCoord(51.9373)} ${transformY(59.7364)} ${transformCoord(53.3558)} ${transformY(59.5781)} ${transformCoord(54.6523)} ${transformY(59.9023)}C${transformCoord(54.6744)} ${transformY(58.5659)} ${transformCoord(55.1925)} ${transformY(57.2372)} ${transformCoord(56.21)} ${transformY(56.2197)}C${transformCoord(57.2339)} ${transformY(55.2007)} ${transformCoord(58.5676)} ${transformY(54.6816)} ${transformCoord(59.9062)} ${transformY(54.6611)}C${transformCoord(59.5835)} ${transformY(53.3649)} ${transformCoord(59.7414)} ${transformY(51.9468)} ${transformCoord(60.46)} ${transformY(50.7002)}C${transformCoord(61.1797)} ${transformY(49.4517)} ${transformCoord(62.3312)} ${transformY(48.6068)} ${transformCoord(63.6182)} ${transformY(48.2412)}C${transformCoord(62.9651)} ${transformY(47.0726)} ${transformCoord(62.7473)} ${transformY(45.658)} ${transformCoord(63.1201)} ${transformY(44.2598)}C${transformCoord(63.4916)} ${transformY(42.8718)} ${transformCoord(64.3794)} ${transformY(41.7591)} ${transformCoord(65.5225)} ${transformY(41.0723)}C${transformCoord(64.5929)} ${transformY(40.1115)} ${transformCoord(64.0206)} ${transformY(38.8033)} ${transformCoord(64.0205)} ${transformY(37.3604)}C${transformCoord(64.0205)} ${transformY(35.9186)} ${transformCoord(64.5915)} ${transformY(34.611)} ${transformCoord(65.5195)} ${transformY(33.6504)}C${transformCoord(64.3785)} ${transformY(32.9631)} ${transformCoord(63.4908)} ${transformY(31.8501)} ${transformCoord(63.1201)} ${transformY(30.46)}C${transformCoord(62.7421)} ${transformY(29.0656)} ${transformCoord(62.9572)} ${transformY(27.6498)} ${transformCoord(63.6113)} ${transformY(26.4795)}C${transformCoord(62.3272)} ${transformY(26.1115)} ${transformCoord(61.1784)} ${transformY(25.2657)} ${transformCoord(60.46)} ${transformY(24.0195)}C${transformCoord(59.7364)} ${transformY(22.7727)} ${transformCoord(59.5781)} ${transformY(21.3541)} ${transformCoord(59.9023)} ${transformY(20.0576)}C${transformCoord(58.5626)} ${transformY(20.038)} ${transformCoord(57.23)} ${transformY(19.52)} ${transformCoord(56.21)} ${transformY(18.5)}C${transformCoord(55.1931)} ${transformY(17.4783)} ${transformCoord(54.675)} ${transformY(16.1482)} ${transformCoord(54.6523)} ${transformY(14.8125)}C${transformCoord(53.3557)} ${transformY(15.1357)} ${transformCoord(51.9374)} ${transformY(14.9785)} ${transformCoord(50.6904)} ${transformY(14.2598)}C${transformCoord(49.4399)} ${transformY(13.5339)} ${transformCoord(48.5931)} ${transformY(12.3801)} ${transformCoord(48.2285)} ${transformY(11.0918)}C${transformCoord(47.0603)} ${transformY(11.7439)} ${transformCoord(45.6474)} ${transformY(11.9624)} ${transformCoord(44.25)} ${transformY(11.5898)}V${transformY(11.5801)}C${transformCoord(42.8613)} ${transformY(11.2085)} ${transformCoord(41.7483)} ${transformY(10.3196)} ${transformCoord(41.0615)} ${transformY(9.175_78)}Z`;

  return path;
}

// Generate circles for data modules with different patterns
function generateDataCircles(
  modules: Modules,
  options: {
    margin: number;
    pixelSize: number;
    pattern?:
      | "circle"
      | "square"
      | "diamond"
      | "circle-mixed"
      | "pacman"
      | "rounded"
      | "clean-square";
  }
): JSX.Element[] {
  const { margin, pixelSize, pattern = "circle" } = options;
  const shapes: JSX.Element[] = [];
  const qrSize = modules.length;
  const radius = pixelSize * 0.333_333; // radius for circles

  modules.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell && !isCornerModule(x, y, qrSize)) {
        const cx = (x + 0.5 + margin) * pixelSize;
        const cy = (y + 0.5 + margin) * pixelSize;
        const key = `${x}-${y}`;

        switch (pattern) {
          case "circle":
            // Pattern 1: Standard circles
            shapes.push(
              <circle
                cx={cx}
                cy={cy}
                key={key}
                r={radius}
                transform={`rotate(0,${cx},${cy})`}
              />
            );
            break;

          case "square":
            // Pattern 2: Squares
            {
              const halfSize = pixelSize * 0.357_143; // half of 71.4% pixel size
              shapes.push(
                <path
                  d={`M ${cx - halfSize} ${cy - halfSize}v ${pixelSize * 0.714_286}h ${pixelSize * 0.714_286}v -${pixelSize * 0.714_286}z`}
                  key={key}
                  transform={`rotate(0,${cx},${cy})`}
                />
              );
            }
            break;

          case "diamond":
            // Pattern 3: Squares rotated 45 degrees (diamond shape)
            {
              const halfSize = pixelSize * 0.357_143;
              shapes.push(
                <path
                  d={`M ${cx - halfSize} ${cy - halfSize}v ${pixelSize * 0.714_286}h ${pixelSize * 0.714_286}v -${pixelSize * 0.714_286}z`}
                  key={key}
                  transform={`rotate(45,${cx},${cy})`}
                />
              );
            }
            break;

          case "circle-mixed":
            // Pattern 4: Circles with varying sizes
            {
              const randomFactor =
                (x + y) % 3 === 0 ? 1.5 : (x + y) % 2 === 0 ? 1.0 : 1.25;
              const variedRadius = radius * randomFactor;
              shapes.push(
                <circle
                  cx={cx}
                  cy={cy}
                  key={key}
                  r={variedRadius}
                  transform={`rotate(0,${cx},${cy})`}
                />
              );
            }
            break;

          case "pacman":
            // Pattern 5: Rounded rectangles (pill shapes)
            {
              const halfWidth = pixelSize * 0.5;
              const halfHeight = pixelSize * 0.357_143;
              shapes.push(
                <path
                  d={`M ${cx - halfWidth} ${cy - halfHeight}v ${pixelSize * 0.714_286}h ${halfWidth}a ${halfWidth * 0.5} ${halfWidth * 0.5}, 0, 0, 0, 0 -${pixelSize * 0.714_286}h -${halfWidth}v -${pixelSize * 0.714_286}z`}
                  key={key}
                  transform={`rotate(${((x + y) % 2) === 0 ? 0 : 90},${cx},${cy})`}
                />
              );
            }
            break;

          case "rounded":
            // Pattern: Clean squares with rounded corners
            {
              const halfSize = pixelSize * 0.5;
              const cornerRadius = pixelSize * 0.2; // 20% radius for smooth corners
              shapes.push(
                <rect
                  height={pixelSize}
                  key={key}
                  rx={cornerRadius}
                  ry={cornerRadius}
                  transform={`rotate(0,${cx},${cy})`}
                  width={pixelSize}
                  x={cx - halfSize}
                  y={cy - halfSize}
                />
              );
            }
            break;

          case "clean-square":
            // Pattern 12: Clean rectangles only
            {
              const halfSize = pixelSize * 0.5;
              shapes.push(
                <rect
                  height={pixelSize}
                  key={key}
                  transform={`rotate(0,${cx},${cy})`}
                  width={pixelSize}
                  x={cx - halfSize}
                  y={cy - halfSize}
                />
              );
            }
            break;

          default:
            // Default to circle
            shapes.push(
              <circle
                cx={cx}
                cy={cy}
                key={key}
                r={radius}
                transform={`rotate(0,${cx},${cy})`}
              />
            );
        }
      }
    });
  });

  return shapes;
}

export function getImageSettings(
  cells: Modules,
  size: number,
  _margin: number,
  imageSettings?: ImageSettings
): null | {
  x: number;
  y: number;
  h: number;
  w: number;
  excavation: Excavation | null;
} {
  if (imageSettings == null) {
    return null;
  }

  const qrCodeSize = cells.length;
  const defaultSize = Math.floor(size * DEFAULT_IMG_SCALE);
  const scale = qrCodeSize / size;
  const w = (imageSettings.width || defaultSize) * scale;
  const h = (imageSettings.height || defaultSize) * scale;

  // Center the image in the QR code area (without margins)
  const x =
    imageSettings.x == null ? qrCodeSize / 2 - w / 2 : imageSettings.x * scale;
  const y =
    imageSettings.y == null ? qrCodeSize / 2 - h / 2 : imageSettings.y * scale;

  let excavation: Excavation | null = null;
  if (imageSettings.excavate) {
    const floorX = Math.floor(x);
    const floorY = Math.floor(y);
    const ceilW = Math.ceil(w + x - floorX);
    const ceilH = Math.ceil(h + y - floorY);
    excavation = { x: floorX, y: floorY, w: ceilW, h: ceilH };
  }

  return { x, y, h, w, excavation };
}

export function convertImageSettingsToPixels(
  calculatedImageSettings: {
    x: number;
    y: number;
    w: number;
    h: number;
    excavation: Excavation | null;
  },
  size: number,
  numCells: number,
  margin: number
) {
  const pixelRatio = size / numCells;
  const imgWidth = calculatedImageSettings.w * pixelRatio;
  const imgHeight = calculatedImageSettings.h * pixelRatio;
  const imgLeft = (calculatedImageSettings.x + margin) * pixelRatio;
  const imgTop = (calculatedImageSettings.y + margin) * pixelRatio;

  return { imgWidth, imgHeight, imgLeft, imgTop };
}

export function QRCodeSVG(props: QRPropsSVG) {
  const {
    value,
    size = DEFAULT_SIZE,
    level = DEFAULT_LEVEL,
    bgColor = DEFAULT_BGCOLOR,
    fgColor = DEFAULT_FGCOLOR,
    eyeColor,
    dotColor,
    dotPattern = "circle",
    cornerEyePattern = "gear",
    cornerEyeDotPattern = "circle",
    margin = DEFAULT_MARGIN,
    isOGContext = false,
    imageSettings,
    templateId,
    customText,
    ...otherProps
  } = props;

  const shouldUseHigherErrorLevel =
    isOGContext && imageSettings?.excavate && (level === "L" || level === "M");

  // Use a higher error correction level 'Q' when excavation is enabled
  // to ensure the QR code remains scannable despite the removed modules.
  const effectiveLevel = shouldUseHigherErrorLevel ? "Q" : level;

  let cells = qrcodegen.QrCode.encodeText(
    value,
    ERROR_LEVEL_MAP[effectiveLevel]
  ).getModules();

  const numCells = cells.length + margin * 2;
  const calculatedImageSettings = getImageSettings(
    cells,
    size,
    margin,
    imageSettings
  );

  let image: null | JSX.Element = null;
  if (imageSettings != null && calculatedImageSettings != null) {
    if (calculatedImageSettings.excavation != null) {
      cells = excavateModules(cells, calculatedImageSettings.excavation);
    }

    // Convert image settings from module coordinates to pixel coordinates
    const { imgWidth, imgHeight, imgLeft, imgTop } =
      convertImageSettingsToPixels(
        calculatedImageSettings,
        size,
        numCells,
        margin
      );

    if (isOGContext) {
      image = (
        <img
          alt="Logo"
          src={imageSettings.src}
          style={{
            position: "absolute",
            left: `${imgLeft}px`,
            top: `${imgTop}px`,
            width: `${imgWidth}px`,
            height: `${imgHeight}px`,
          }}
        />
      );
    } else {
      image = (
        <image
          height={imgHeight}
          href={imageSettings.src}
          preserveAspectRatio="none"
          width={imgWidth}
          x={imgLeft}
          y={imgTop}
        />
      );
    }
  }

  // Calculate pixel size for positioning
  const pixelSize = size / numCells;
  const qrSize = cells.length;
  const cornerSize = 7 * pixelSize; // Corner patterns are 7x7 modules
  const cornerDotRadius = 1.5 * pixelSize; // Inner dot radius

  // Generate data circles with selected pattern
  const dataCircles = generateDataCircles(cells, {
    margin,
    pixelSize,
    pattern: dotPattern,
  });

  // Calculate corner positions with margin
  const topLeftX = margin * pixelSize;
  const topLeftY = margin * pixelSize;
  const topRightX = (qrSize - 7 + margin) * pixelSize;
  const topRightY = margin * pixelSize;
  const bottomLeftX = margin * pixelSize;
  const bottomLeftY = (qrSize - 7 + margin) * pixelSize;

  // QR Code content (can be used standalone or inside wrapper)
  const qrContent = (
    <>
      <style>{`
        .background-color { fill: ${bgColor}; }
        .dot-color { fill: ${fgColor}; }
        .corners-square-color-0-0 { fill: ${eyeColor || fgColor}; }
        .corners-dot-color-0-0 { fill: ${dotColor || fgColor}; }
        .corners-square-color-1-0 { fill: ${eyeColor || fgColor}; }
        .corners-dot-color-1-0 { fill: ${dotColor || fgColor}; }
        .corners-square-color-0-1 { fill: ${eyeColor || fgColor}; }
        .corners-dot-color-0-1 { fill: ${dotColor || fgColor}; }
      `}</style>

      {/* Background */}
      <rect
        className="background-color"
        height={size}
        width={size}
        x={0}
        y={0}
      />

      {/* Data module circles */}
      <g className="dot-color">{dataCircles}</g>

      {/* Top-left corner square */}
      <g className="corners-square-color-0-0">
        <path
          clipRule="evenodd"
          d={generateCornerSquarePath(
            topLeftX,
            topLeftY,
            cornerSize,
            cornerEyePattern
          )}
          transform={`rotate(0,${topLeftX + cornerSize / 2},${topLeftY + cornerSize / 2})`}
        />
      </g>

      {/* Top-left corner dot */}
      <g className="corners-dot-color-0-0">
        {generateCornerDotPath(
          topLeftX + cornerSize / 2,
          topLeftY + cornerSize / 2,
          cornerDotRadius,
          cornerEyeDotPattern
        )}
      </g>

      {/* Top-right corner square */}
      <g className="corners-square-color-1-0">
        <path
          clipRule="evenodd"
          d={generateCornerSquarePath(
            topRightX,
            topRightY,
            cornerSize,
            cornerEyePattern
          )}
          transform={`rotate(0,${topRightX + cornerSize / 2},${topRightY + cornerSize / 2})`}
        />
      </g>

      {/* Top-right corner dot */}
      <g className="corners-dot-color-1-0">
        {generateCornerDotPath(
          topRightX + cornerSize / 2,
          topRightY + cornerSize / 2,
          cornerDotRadius,
          cornerEyeDotPattern
        )}
      </g>

      {/* Bottom-left corner square */}
      <g className="corners-square-color-0-1">
        <path
          clipRule="evenodd"
          d={generateCornerSquarePath(
            bottomLeftX,
            bottomLeftY,
            cornerSize,
            cornerEyePattern
          )}
          transform={`rotate(0,${bottomLeftX + cornerSize / 2},${bottomLeftY + cornerSize / 2})`}
        />
      </g>

      {/* Bottom-left corner dot */}
      <g className="corners-dot-color-0-1">
        {generateCornerDotPath(
          bottomLeftX + cornerSize / 2,
          bottomLeftY + cornerSize / 2,
          cornerDotRadius,
          cornerEyeDotPattern
        )}
      </g>

      {image}
    </>
  );

  // Check if template is specified
  if (templateId) {
    const template = getTemplate(templateId);
    if (template) {
      // For templates, we need to create a properly sized SVG that fits the template coordinate system
      // Templates expect the QR content to be in a coordinate system that matches their transforms
      const templateSize = 300; // All templates use 300x300 base coordinate system

      // Create QR content as a complete SVG for templates
      const templateQrContent = (
        <svg
          height={templateSize}
          viewBox={`0 0 ${templateSize} ${templateSize}`}
          width={templateSize}
        >
          <style>{`
            .dot-color { fill: ${fgColor}; }
            .corners-square-color-0-0 { fill: ${eyeColor}; }
            .corners-dot-color-0-0 { fill: ${dotColor}; }
            .corners-square-color-1-0 { fill: ${eyeColor}; }
            .corners-dot-color-1-0 { fill: ${dotColor}; }
            .corners-square-color-0-1 { fill: ${eyeColor}; }
            .corners-dot-color-0-1 { fill: ${dotColor}; }
          `}</style>

          {/* Scale all QR elements to fit template coordinate system */}
          <g transform={`scale(${templateSize / size})`}>
            {/* Data module circles */}
            <g className="dot-color">{dataCircles}</g>

            {/* Top-left corner square */}
            <g className="corners-square-color-0-0">
              <path
                clipRule="evenodd"
                d={generateCornerSquarePath(
                  topLeftX,
                  topLeftY,
                  cornerSize,
                  cornerEyePattern
                )}
                transform={`rotate(0,${topLeftX + cornerSize / 2},${topLeftY + cornerSize / 2})`}
              />
            </g>

            {/* Top-left corner dot */}
            <g className="corners-dot-color-0-0">
              {generateCornerDotPath(
                topLeftX + cornerSize / 2,
                topLeftY + cornerSize / 2,
                cornerDotRadius,
                cornerEyeDotPattern
              )}
            </g>

            {/* Top-right corner square */}
            <g className="corners-square-color-1-0">
              <path
                clipRule="evenodd"
                d={generateCornerSquarePath(
                  topRightX,
                  topRightY,
                  cornerSize,
                  cornerEyePattern
                )}
                transform={`rotate(0,${topRightX + cornerSize / 2},${topRightY + cornerSize / 2})`}
              />
            </g>

            {/* Top-right corner dot */}
            <g className="corners-dot-color-1-0">
              {generateCornerDotPath(
                topRightX + cornerSize / 2,
                topRightY + cornerSize / 2,
                cornerDotRadius,
                cornerEyeDotPattern
              )}
            </g>

            {/* Bottom-left corner square */}
            <g className="corners-square-color-0-1">
              <path
                clipRule="evenodd"
                d={generateCornerSquarePath(
                  bottomLeftX,
                  bottomLeftY,
                  cornerSize,
                  cornerEyePattern
                )}
                transform={`rotate(0,${bottomLeftX + cornerSize / 2},${bottomLeftY + cornerSize / 2})`}
              />
            </g>

            {/* Bottom-left corner dot */}
            <g className="corners-dot-color-0-1">
              {generateCornerDotPath(
                bottomLeftX + cornerSize / 2,
                bottomLeftY + cornerSize / 2,
                cornerDotRadius,
                cornerEyeDotPattern
              )}
            </g>

            {image}
          </g>
        </svg>
      );

      // Use template wrapper with the QR content and pass the size
      const wrappedSvg = template.wrapper(templateQrContent, {
        fgColor,
        bgColor,
        customText,
        ...otherProps,
      });

      // Clone the wrapped SVG element and override width/height to match requested size
      // This ensures downloads get the proper size while keeping viewBox for scaling
      // Remove percentage-based styles that would interfere with absolute sizing
      // @ts-expect-error
      const originalStyle = wrappedSvg?.props?.style || {};
      const newStyle = {
        ...originalStyle,
        width: undefined,
        height: undefined,
      };

      // @ts-expect-error
      return React.cloneElement(wrappedSvg, {
        width: size,
        height: size,
        style: newStyle,
      });
    }
  }

  // Standard QR code without wrapper (backward compatibility)
  return (
    <svg
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      {...otherProps}
    >
      {qrContent}
    </svg>
  );
}

// For canvas we're going to switch our drawing mode based on whether or not
// the environment supports Path2D. We only need the constructor to be
// supported, but Edge doesn't actually support the path (string) type
// argument. Luckily it also doesn't support the addPath() method. We can
// treat that as the same thing.
export const SUPPORTS_PATH2D = (() => {
  try {
    new Path2D().addPath(new Path2D());
  } catch (_e) {
    return false;
  }
  return true;
})();

// Utility functions for contrast calculation
export const hexToRgb = (
  hex: string
): { r: number; g: number; b: number } | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: Number.parseInt(result[1], 16),
        g: Number.parseInt(result[2], 16),
        b: Number.parseInt(result[3], 16),
      }
    : null;
};

export const getLuminance = (r: number, g: number, b: number): number => {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c /= 255;
    return c <= 0.039_28 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
};

export const getContrastRatio = (color1: string, color2: string): number => {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);

  if (!(rgb1 && rgb2)) {
    return 1;
  }

  const lum1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
  const lum2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);

  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);

  return (brightest + 0.05) / (darkest + 0.05);
};

export const getContrastLevel = (
  ratio: number
): { level: string; warning: boolean; message: string } => {
  if (ratio >= 7) {
    return { level: "AAA", warning: false, message: "Excellent contrast" };
  }
  if (ratio >= 4.5) {
    return { level: "AA", warning: false, message: "Good contrast" };
  }
  if (ratio >= 3) {
    return {
      level: "AA Large",
      warning: true,
      message: "Low contrast - may be difficult to scan",
    };
  }
  return {
    level: "Fail",
    warning: true,
    message: "Poor contrast - QR code may not scan properly",
  };
};
