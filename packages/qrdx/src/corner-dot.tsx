/** @jsxImportSource ./jsx */

import type { CornerEyeDotPattern } from "../types/corner-dot";
import type { EyeCorner } from "./corner-eye";
import type { QRNode } from "./jsx/runtime";
import {
  circlePath,
  heartPath,
  polygonPath,
  regularPolygon,
  roundedRectPath,
  superellipsePoints,
} from "./shapes";
import { compact, fmt, SCALE_DECIMALS } from "./utils/fmt";

/** Index (top-left, top-right, bottom-right, bottom-left) of the outer corner. */
function outerCornerIndex(corner: EyeCorner) {
  return corner === "top-left" ? 0 : corner === "top-right" ? 1 : 3;
}

/**
 * Generate corner dot pattern based on type
 * @param cx - Center X coordinate
 * @param cy - Center Y coordinate
 * @param radius - Radius of the dot
 * @param pattern - Pattern type for the corner dot
 * @param corner - Which finder this is (leaf and drop dots face outward)
 * @returns JSX element representing the pattern
 */
export function generateCornerDotPath(
  cx: number,
  cy: number,
  radius: number,
  pattern: CornerEyeDotPattern = "circle",
  corner: EyeCorner = "top-left"
): QRNode {
  const size = radius * 2;
  const halfSize = radius;
  // One finder module (the dot is 3 × 3 modules)
  const m = size / 3;

  switch (pattern) {
    case "leaf":
    case "leaf-reverse":
    case "drop":
    case "drop-reverse": {
      const outer = outerCornerIndex(corner);
      const inner = (outer + 2) % 4;
      const round = 1.3 * m;
      // The "sharp" corners stay soft, so blur can't join them to wavy eye
      // frames (fully sharp corners fail inside curly eyes)
      const sharp = 0.7 * m;
      const isSharp = (i: number) => {
        switch (pattern) {
          case "leaf":
            return i === outer || i === inner;
          case "leaf-reverse":
            return !(i === outer || i === inner);
          case "drop":
            return i === outer;
          default:
            return i === inner;
        }
      };
      const radii = [0, 1, 2, 3].map((i) => (isSharp(i) ? sharp : round)) as [
        number,
        number,
        number,
        number,
      ];
      return (
        <path
          d={roundedRectPath(cx - radius, cy - radius, size, size, radii)}
        />
      );
    }

    case "extra-rounded":
      return (
        <path
          d={roundedRectPath(cx - radius, cy - radius, size, size, 1.15 * m)}
        />
      );

    case "plus": {
      // Arms 2.3 modules wide keep the 3-module center run on most rows
      // (2-module arms fail jsQR in sharp renders at 8–14 px per module)
      const a = 1.15 * m;
      const l = radius;
      return (
        <path
          d={polygonPath([
            [cx - a, cy - l],
            [cx + a, cy - l],
            [cx + a, cy - a],
            [cx + l, cy - a],
            [cx + l, cy + a],
            [cx + a, cy + a],
            [cx + a, cy + l],
            [cx - a, cy + l],
            [cx - a, cy + a],
            [cx - l, cy + a],
            [cx - l, cy - a],
            [cx - a, cy - a],
          ])}
        />
      );
    }

    case "cross-rounded": {
      const a = 1.15 * m;
      // Rounder ends (radius 0.7+) fail jsQR at close range
      const r = 0.5 * m;
      return (
        <path
          d={
            roundedRectPath(cx - radius, cy - a, size, 2 * a, r) +
            roundedRectPath(cx - a, cy - radius, 2 * a, size, r)
          }
        />
      );
    }

    case "hexagon":
      // Pointy-top: three modules wide, so rows through it stay wide
      return <path d={polygonPath(regularPolygon(cx, cy, 1.72 * m, 6))} />;

    case "octagon":
      return (
        <path
          d={polygonPath(
            regularPolygon(cx, cy, radius / Math.cos(Math.PI / 8), 8, 22.5)
          )}
        />
      );

    case "flower": {
      // Petals on the diagonals: petals on the axes leave rows near the
      // top and bottom too narrow for the finder's 3-module center.
      const d = 0.6 * m;
      const petal = 0.9 * m;
      return (
        <path
          d={
            circlePath(cx - d, cy - d, petal) +
            circlePath(cx + d, cy - d, petal) +
            circlePath(cx + d, cy + d, petal) +
            circlePath(cx - d, cy + d, petal) +
            circlePath(cx, cy, 1.2 * m)
          }
        />
      );
    }

    case "heart":
      // A smaller heart's top notch leaves too short a center run
      return <path d={heartPath(cx, cy + 0.12 * m, 3.5 * m)} />;

    case "squircle":
      return (
        <path
          d={polygonPath(superellipsePoints(cx, cy, radius, radius, 4, 64))}
        />
      );

    case "dots": {
      const dots: string[] = [];
      for (const dy of [-1, 0, 1]) {
        for (const dx of [-1, 0, 1]) {
          dots.push(
            circlePath(
              // Closer than one module, so the grid reads as a solid 3 × 3
              // center to decoders, sharp or blurred
              cx + dx * m * 0.82,
              cy + dy * m * 0.82,
              0.58 * m
            )
          );
        }
      }
      return <path d={dots.join("")} />;
    }

    case "square":
      return (
        <rect
          height={fmt(size)}
          transform={compact`rotate(0,${cx},${cy})`}
          width={fmt(size)}
          x={fmt(cx - halfSize)}
          y={fmt(cy - halfSize)}
        />
      );

    case "rounded":
      return (
        <rect
          height={fmt(size)}
          rx={fmt(radius * 0.5)}
          ry={fmt(radius * 0.5)}
          transform={compact`rotate(0,${cx},${cy})`}
          width={fmt(size)}
          x={fmt(cx - halfSize)}
          y={fmt(cy - halfSize)}
        />
      );

    case "diamond":
      return (
        <path
          d={compact`M ${cx - halfSize * 0.714_286} ${cy - halfSize * 0.714_286}v ${size * 0.714_286}h ${size * 0.714_286}v -${size * 0.714_286}z`}
          transform={compact`rotate(45,${cx},${cy})`}
        />
      );

    case "message": {
      // Scale to match old patterns: new patterns span ~30 units in 80x80, old patterns fill 'size'
      const scale = size / 30;
      const transformX = (coord: number) => (coord - 40) * scale + cx;
      const transformY = (coord: number) => (coord - 40) * scale + cy;
      const path = compact`M ${transformX(25)} ${transformY(35.714_285_714_285_715)}v ${8.571_428_571_428_571 * scale}a ${10.714_285_714_285_714 * scale} ${10.714_285_714_285_714 * scale}, 0, 0, 0, ${10.714_285_714_285_714 * scale} ${10.714_285_714_285_714 * scale}h ${19.285_714_285_714_285 * scale}v -${19.285_714_285_714_285 * scale}a ${10.714_285_714_285_714 * scale} ${10.714_285_714_285_714 * scale}, 0, 0, 0, -${10.714_285_714_285_714 * scale} -${10.714_285_714_285_714 * scale}h -${8.571_428_571_428_571 * scale}a ${10.714_285_714_285_714 * scale} ${10.714_285_714_285_714 * scale}, 0, 0, 0, -${10.714_285_714_285_714 * scale} ${10.714_285_714_285_714 * scale}`;
      return (
        <path
          clipRule="evenodd"
          d={path}
          transform={compact`rotate(0,${cx},${cy})`}
        />
      );
    }

    case "message-reverse": {
      // Scale to match old patterns: new patterns span ~30 units in 80x80, old patterns fill 'size'
      const scale = size / 30;
      const transformX = (coord: number) => (coord - 40) * scale + cx;
      const transformY = (coord: number) => (coord - 40) * scale + cy;
      const path = compact`M ${transformX(25)} ${transformY(35.714_285_714_285_715)}v ${8.571_428_571_428_571 * scale}a ${10.714_285_714_285_714 * scale} ${10.714_285_714_285_714 * scale}, 0, 0, 0, ${10.714_285_714_285_714 * scale} ${10.714_285_714_285_714 * scale}h ${19.285_714_285_714_285 * scale}v -${19.285_714_285_714_285 * scale}a ${10.714_285_714_285_714 * scale} ${10.714_285_714_285_714 * scale}, 0, 0, 0, -${10.714_285_714_285_714 * scale} -${10.714_285_714_285_714 * scale}h -${8.571_428_571_428_571 * scale}a ${10.714_285_714_285_714 * scale} ${10.714_285_714_285_714 * scale}, 0, 0, 0, -${10.714_285_714_285_714 * scale} ${10.714_285_714_285_714 * scale}`;
      return (
        <path
          clipRule="evenodd"
          d={path}
          transform={compact`rotate(-180,${cx},${cy})`}
        />
      );
    }

    case "diya": {
      // Scale to match old patterns: new patterns span ~30 units in 80x80, old patterns fill 'size'
      const scale = size / 30;
      const transformX = (coord: number) => (coord - 40) * scale + cx;
      const transformY = (coord: number) => (coord - 40) * scale + cy;
      const path = compact`M ${transformX(25)} ${transformY(35.714_285_714_285_715)}v ${8.571_428_571_428_571 * scale}a ${10.714_285_714_285_714 * scale} ${10.714_285_714_285_714 * scale}, 0, 0, 0, ${10.714_285_714_285_714 * scale} ${10.714_285_714_285_714 * scale}h ${19.285_714_285_714_285 * scale}v -${19.285_714_285_714_285 * scale}a ${10.714_285_714_285_714 * scale} ${10.714_285_714_285_714 * scale}, 0, 0, 0, -${10.714_285_714_285_714 * scale} -${10.714_285_714_285_714 * scale}h -${8.571_428_571_428_571 * scale}H ${transformX(25)}z`;
      return (
        <path
          clipRule="evenodd"
          d={path}
          transform={compact`rotate(0,${cx},${cy})`}
        />
      );
    }

    case "diya-reverse": {
      // Scale to match old patterns: new patterns span ~30 units in 80x80, old patterns fill 'size'
      const scale = size / 30;
      const transformX = (coord: number) => (coord - 40) * scale + cx;
      const transformY = (coord: number) => (coord - 40) * scale + cy;
      const path = compact`M ${transformX(25)} ${transformY(35.714_285_714_285_715)}v ${19.285_714_285_714_285 * scale}h ${19.285_714_285_714_285 * scale}a ${10.714_285_714_285_714 * scale} ${10.714_285_714_285_714 * scale}, 0, 0, 0, ${10.714_285_714_285_714 * scale} -${10.714_285_714_285_714 * scale}v -${19.285_714_285_714_285 * scale}h -${19.285_714_285_714_285 * scale}a ${10.714_285_714_285_714 * scale} ${10.714_285_714_285_714 * scale}, 0, 0, 0, -${10.714_285_714_285_714 * scale} ${10.714_285_714_285_714 * scale}z`;
      return (
        <path
          clipRule="evenodd"
          d={path}
          transform={compact`rotate(0,${cx},${cy})`}
        />
      );
    }

    case "rounded-triangle": {
      // Scale to match old patterns: new patterns span ~21 units in 80x80, old patterns fill 'size'
      const scale = size / 21;
      const transformX = (coord: number) => (coord - 40) * scale + cx;
      const transformY = (coord: number) => (coord - 40) * scale + cy;
      const path = compact`M ${transformX(33.571_428_571_428_57)} ${transformY(29.285_714_285_714_285)}h ${12.857_142_857_142_856 * scale}c ${4.285_714_285_714_286 * scale} 0 ${4.285_714_285_714_286 * scale} ${4.285_714_285_714_286 * scale} ${4.285_714_285_714_286 * scale} ${4.285_714_285_714_286 * scale}v ${12.857_142_857_142_856 * scale}c 0 ${4.285_714_285_714_286 * scale} -${4.285_714_285_714_286 * scale} ${4.285_714_285_714_286 * scale} -${4.285_714_285_714_286 * scale} ${4.285_714_285_714_286 * scale}h -${12.857_142_857_142_856 * scale}c -${4.285_714_285_714_286 * scale} 0 -${4.285_714_285_714_286 * scale} -${4.285_714_285_714_286 * scale} -${4.285_714_285_714_286 * scale} -${4.285_714_285_714_286 * scale}v -${12.857_142_857_142_856 * scale}c 0 -${4.285_714_285_714_286 * scale} ${4.285_714_285_714_286 * scale} -${4.285_714_285_714_286 * scale} ${4.285_714_285_714_286 * scale} -${4.285_714_285_714_286 * scale}z`;
      return <path d={path} transform={compact`rotate(45,${cx},${cy})`} />;
    }

    case "star": {
      // Scale to match old patterns: new patterns span ~27 units in 80x80, old patterns fill 'size'
      const scale = size / 27;
      const transformX = (coord: number) => (coord - 40) * scale + cx;
      const transformY = (coord: number) => (coord - 40) * scale + cy;
      const path = compact`M ${transformX(38.846_153_846_153_85)},${transformY(26.546_153_846_153_846)}c${0.669_230_769_230_769_1 * scale},-${1.015_384_615_384_615_3 * scale},${2.215_384_615_384_615 * scale},-${1.015_384_615_384_615_3 * scale},${2.884_615_384_615_384 * scale},0l${4.038_461_538_461_538 * scale},${6.069_230_769_230_768 * scale}c${0.230_769_230_769_230_75 * scale},${0.346_153_846_153_846_1 * scale},${0.6 * scale},${0.6 * scale},${1.015_384_615_384_615_3 * scale},${0.715_384_615_384_615_3 * scale}l${7.223_076_923_076_922 * scale},${1.823_076_923_076_923 * scale}c${1.2 * scale},${0.3 * scale},${1.684_615_384_615_384_4 * scale},${1.707_692_307_692_307_6 * scale},${0.899_999_999_999_999_9 * scale},${2.653_846_153_846_153_3 * scale}l-${4.730_769_230_769_23 * scale},${5.584_615_384_615_384 * scale}c-${0.276_923_076_923_076_9 * scale},${0.323_076_923_076_923_1 * scale},-${0.415_384_615_384_615_35 * scale},${0.738_461_538_461_538_4 * scale},-${0.392_307_692_307_692_3 * scale},${1.130_769_230_769_230_7 * scale}l${0.438_461_538_461_538_4 * scale},${7.199_999_999_999_999 * scale}c${0.069_230_769_230_769_22 * scale},${1.2 * scale},-${1.176_923_076_923_076_7 * scale},${2.076_923_076_923_076_6 * scale},-${2.330_769_230_769_230_5 * scale},${1.638_461_538_461_538_2 * scale}l-${6.969_230_769_230_768_5 * scale},-${2.607_692_307_692_307_3 * scale}c-${0.392_307_692_307_692_3 * scale},-${0.161_538_461_538_461_55 * scale},-${0.853_846_153_846_153_8 * scale},-${0.161_538_461_538_461_55 * scale},-${1.246_153_846_153_846_2 * scale},0l-${6.969_230_769_230_768_5 * scale},${2.607_692_307_692_307_3 * scale}c-${1.153_846_153_846_153_7 * scale},${0.438_461_538_461_538_4 * scale},-${2.4 * scale},-${0.438_461_538_461_538_4 * scale},-${2.330_769_230_769_230_5 * scale},-${1.638_461_538_461_538_2 * scale}l${0.438_461_538_461_538_4 * scale},-${7.199_999_999_999_999 * scale}c${0.023_076_923_076_923_075 * scale},-${0.415_384_615_384_615_35 * scale},-${0.115_384_615_384_615_38 * scale},-${0.830_769_230_769_230_7 * scale},-${0.392_307_692_307_692_3 * scale},-${1.130_769_230_769_230_7 * scale}l-${4.730_769_230_769_23 * scale},-${5.584_615_384_615_384 * scale}c-${0.784_615_384_615_384_6 * scale},-${0.923_076_923_076_923 * scale},-${0.323_076_923_076_923_1 * scale},-${2.330_769_230_769_230_5 * scale},${0.899_999_999_999_999_9 * scale},-${2.653_846_153_846_153_3 * scale}l${7.223_076_923_076_922 * scale},-${1.823_076_923_076_923 * scale}c${0.415_384_615_384_615_35 * scale},-${0.115_384_615_384_615_38 * scale},${0.784_615_384_615_384_6 * scale},-${0.346_153_846_153_846_1 * scale},${1.015_384_615_384_615_3 * scale},-${0.715_384_615_384_615_3 * scale}l${4.038_461_538_461_538 * scale},-${6.069_230_769_230_768 * scale}z`;
      return (
        <path
          clipRule="evenodd"
          d={path}
          transform={compact`rotate(0,${cx},${cy})`}
        />
      );
    }

    case "banner": {
      // Scale to match old patterns: new patterns span ~28 units in 80x80, old patterns fill 'size'
      const scale = size / 28;
      const path =
        "M38.235 26.104C38.759 25.677, 39.51 25.677, 40.034 26.104L41.776 27.52C42.091 27.777, 42.501 27.887, 42.902 27.822L45.118 27.466C45.785 27.359, 46.436 27.735, 46.677 28.366L47.477 30.464C47.621 30.843, 47.921 31.143, 48.301 31.288L50.399 32.088C51.03 32.328, 51.406 32.979, 51.298 33.646L50.942 35.863C50.878 36.264, 50.988 36.674, 51.244 36.989L52.661 38.73C53.087 39.254, 53.087 40.006, 52.661 40.53L51.244 42.271C50.988 42.587, 50.878 42.996, 50.942 43.397L51.298 45.614C51.406 46.281, 51.03 46.932, 50.399 47.173L48.301 47.972C47.921 48.117, 47.621 48.417, 47.477 48.797L46.677 50.894C46.436 51.526, 45.785 51.901, 45.118 51.794L42.902 51.438C42.501 51.374, 42.091 51.483, 41.776 51.74L40.034 53.157C39.51 53.583, 38.759 53.583, 38.235 53.157L36.493 51.74C36.178 51.483, 35.768 51.374, 35.367 51.438L33.15 51.794C32.483 51.901, 31.833 51.526, 31.592 50.894L30.792 48.797C30.647 48.417, 30.347 48.117, 29.968 47.972L27.87 47.173C27.239 46.932, 26.863 46.281, 26.97 45.614L27.326 43.397C27.391 42.996, 27.281 42.587, 27.025 42.271L25.608 40.53C25.182 40.006, 25.182 39.254, 25.608 38.73L27.025 36.989C27.281 36.674, 27.391 36.264, 27.326 35.863L26.97 33.646C26.863 32.979, 27.239 32.328, 27.87 32.088L29.968 31.288C30.347 31.143, 30.647 30.843, 30.792 30.464L31.592 28.366C31.833 27.735, 32.483 27.359, 33.15 27.466L35.367 27.822C35.768 27.887, 36.178 27.777, 36.493 27.52L38.235 26.104Z";
      return (
        <g
          transform={compact`translate(${cx - 40 * scale},${cy - 40 * scale}) scale(${fmt(scale, SCALE_DECIMALS)})`}
        >
          <path clipRule="evenodd" d={path} />
        </g>
      );
    }

    default:
      return (
        <circle
          cx={fmt(cx)}
          cy={fmt(cy)}
          r={fmt(radius)}
          transform={compact`rotate(0,${cx},${cy})`}
        />
      );
  }
}
