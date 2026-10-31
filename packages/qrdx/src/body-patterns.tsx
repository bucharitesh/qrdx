/** biome-ignore-all lint/style/noMagicNumbers: module geometry */
import type { JSX } from "react";
import type { BodyPattern, Modules } from "../types";
import { MODULE_SCALE_MAX, MODULE_SCALE_MIN } from "../types/qr";
import {
  circlePath,
  hash2,
  heartPath,
  type Point,
  polygonPath,
  regularPolygon,
  rotatePoints,
  roundedRectPath,
  starPoints,
} from "./shapes";

// Body patterns added after the original nine. Each one is drawn as a single
// <path> (all modules unioned under the nonzero rule), so neighbouring
// modules never show anti-aliasing seams and every output (SVG, PNG, PDF,
// EPS) paints the same outline. Alignment patterns are drawn as solid
// squares: decoders find them by their 1:1:1 rings, which shaped modules
// blur away.

export const SHAPED_BODY_PATTERNS = [
  "horizontal-line",
  "liquid",
  "liquid-horizontal",
  "liquid-vertical",
  "classy",
  "classy-rounded",
  "leaf",
  "plus",
  "hexagon",
  "star",
  "heart",
  "random-dots",
  "mosaic",
  "octagon",
] as const satisfies readonly BodyPattern[];

type ShapedBodyPattern = (typeof SHAPED_BODY_PATTERNS)[number];

export function isShapedBodyPattern(
  pattern: BodyPattern
): pattern is ShapedBodyPattern {
  return (SHAPED_BODY_PATTERNS as readonly string[]).includes(pattern);
}

/**
 * Smallest `moduleScale` each pattern still decodes at (jsQR through the
 * camera model at 4–9 px per module, dark and inverted), plus a 0.05 margin.
 * Shapes that are already small barely shrink; unlisted patterns never do.
 */
export const MODULE_SCALE_FLOOR: Partial<Record<BodyPattern, number>> = {
  circle: 0.95,
  "circle-large": 0.85,
  square: 0.75,
  diamond: 0.95,
  pacman: 0.9,
  rounded: 0.75,
  "vertical-line": 0.8,
  liquid: 0.75,
  "liquid-horizontal": 0.85,
  "liquid-vertical": 0.85,
  classy: 0.7,
  "classy-rounded": 0.7,
  leaf: 0.75,
  plus: 0.8,
  hexagon: 0.75,
  star: 0.85,
  heart: 0.85,
  "random-dots": 0.85,
  mosaic: 0.8,
  octagon: 0.8,
};

/**
 * `moduleScale` clamped to the supported range (1 when unset) and, with a
 * `pattern`, to the smallest size that pattern still scans at.
 */
export function clampModuleScale(
  scale: number | undefined,
  pattern?: BodyPattern
): number {
  if (scale === undefined || !Number.isFinite(scale)) {
    return 1;
  }
  const floor = pattern ? (MODULE_SCALE_FLOOR[pattern] ?? 1) : MODULE_SCALE_MIN;
  return Math.min(MODULE_SCALE_MAX, Math.max(MODULE_SCALE_MIN, floor, scale));
}

function isFinder(x: number, y: number, size: number) {
  return (
    (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7)
  );
}

/** Row/column centers of the alignment patterns (ISO/IEC 18004 Annex E). */
function alignmentPositions(version: number, size: number): number[] {
  if (version === 1) {
    return [];
  }
  const count = Math.floor(version / 7) + 2;
  const step =
    version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < count; pos -= step) {
    result.splice(1, 0, pos);
  }
  return result;
}

/** True for modules inside an alignment pattern (5×5, off the finders). */
export function alignmentMask(
  size: number
): (x: number, y: number) => boolean {
  const version = (size - 17) / 4;
  const positions = Number.isInteger(version)
    ? alignmentPositions(version, size)
    : [];
  const last = positions.length - 1;
  const centers: Point[] = [];
  for (const [i, cx] of positions.entries()) {
    for (const [j, cy] of positions.entries()) {
      if (
        !(
          (i === 0 && j === 0) ||
          (i === 0 && j === last) ||
          (i === last && j === 0)
        )
      ) {
        centers.push([cx, cy]);
      }
    }
  }
  return (x, y) =>
    centers.some(([ax, ay]) => Math.abs(x - ax) <= 2 && Math.abs(y - ay) <= 2);
}

type Corner = 0 | 1 | 2 | 3; // top-left, top-right, bottom-right, bottom-left

interface ConnectedStyle {
  horizontal: boolean;
  vertical: boolean;
  /** Width of a line of modules, as a share of the module */
  thickness: number;
  /** Radius of an exposed corner, as a share of half the thickness */
  radius: (corner: Corner) => number;
  /** Fill inside corners of L-shaped runs (full-size modules only) */
  fillets: boolean;
}

const CONNECTED: Partial<Record<ShapedBodyPattern, ConnectedStyle>> = {
  liquid: {
    horizontal: true,
    vertical: true,
    thickness: 1,
    radius: () => 1,
    fillets: true,
  },
  "liquid-horizontal": {
    horizontal: true,
    vertical: false,
    thickness: 0.86,
    radius: () => 1,
    fillets: false,
  },
  "liquid-vertical": {
    horizontal: false,
    vertical: true,
    thickness: 0.86,
    radius: () => 1,
    fillets: false,
  },
  classy: {
    horizontal: true,
    vertical: true,
    thickness: 1,
    radius: (corner) => (corner === 0 || corner === 2 ? 1 : 0),
    fillets: false,
  },
  "classy-rounded": {
    horizontal: true,
    vertical: true,
    thickness: 1,
    radius: (corner) => (corner === 0 || corner === 2 ? 1 : 0.4),
    fillets: false,
  },
};

/** Outline of one module drawn on its own, centered on (cx, cy). */
function moduleShape(
  pattern: ShapedBodyPattern,
  cx: number,
  cy: number,
  unit: number,
  x: number,
  y: number
): string {
  switch (pattern) {
    case "horizontal-line": {
      // 0.86 of a module tall: thinner lines (like vertical-line's 0.71)
      // fail more eye and dot pairs when the rows run along jsQR's scan
      const h = unit * 0.43;
      return roundedRectPath(cx - unit / 2, cy - h, unit, 2 * h);
    }
    case "leaf": {
      // Full-size tiles: smaller petals drop out at 4 px per module
      const h = unit * 0.5;
      return roundedRectPath(cx - h, cy - h, 2 * h, 2 * h, [
        unit * 0.4,
        unit * 0.05,
        unit * 0.4,
        unit * 0.05,
      ]);
    }
    case "plus": {
      const a = unit * 0.22;
      const l = unit * 0.5;
      return polygonPath([
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
      ]);
    }
    case "hexagon":
      return polygonPath(regularPolygon(cx, cy, unit * 0.54, 6));
    case "star":
      return polygonPath(
        starPoints(cx, cy + unit * 0.04, unit * 0.62, unit * 0.34)
      );
    case "heart":
      return heartPath(cx, cy + unit * 0.02, unit * 1.08);
    case "random-dots":
      return circlePath(cx, cy, unit * (0.38 + 0.15 * hash2(x, y)));
    case "mosaic": {
      const h = (unit * (0.8 + 0.14 * hash2(x, y, 1))) / 2;
      const corners: Point[] = [
        [cx - h, cy - h],
        [cx + h, cy - h],
        [cx + h, cy + h],
        [cx - h, cy + h],
      ];
      return polygonPath(
        rotatePoints(corners, cx, cy, (hash2(x, y, 2) - 0.5) * 16)
      );
    }
    case "octagon":
      return polygonPath(
        regularPolygon(cx, cy, (unit * 0.48) / Math.cos(Math.PI / 8), 8, 22.5)
      );
    default:
      return circlePath(cx, cy, unit * 0.45);
  }
}

/**
 * Renders the data modules for one of the `SHAPED_BODY_PATTERNS`. `scale`
 * shrinks each module (or, for connected styles, the line width) around its
 * center; alignment patterns keep full-size modules.
 */
export function renderShapedBody(
  modules: Modules,
  options: {
    margin: number;
    pixelSize: number;
    pattern: ShapedBodyPattern;
    scale?: number;
  }
): JSX.Element[] {
  const { margin, pixelSize: cell, pattern } = options;
  const scale = clampModuleScale(options.scale, pattern);
  const size = modules.length;
  const isAlignment = alignmentMask(size);
  const dark = (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x < size &&
    y < size &&
    Boolean(modules[y]?.[x]) &&
    !isFinder(x, y, size);
  const centerOf = (v: number) => (v + 0.5 + margin) * cell;

  const solid: string[] = [];
  const shapes: string[] = [];
  const style = CONNECTED[pattern];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!dark(x, y)) {
        continue;
      }
      const cx = centerOf(x);
      const cy = centerOf(y);
      if (isAlignment(x, y)) {
        solid.push(
          `M${cx - cell / 2} ${cy - cell / 2}h${cell}v${cell}h${-cell}z`
        );
        continue;
      }
      if (!style) {
        shapes.push(moduleShape(pattern, cx, cy, cell * scale, x, y));
        continue;
      }
      const h = (cell * style.thickness * scale) / 2;
      const east = style.horizontal && dark(x + 1, y);
      const west = style.horizontal && dark(x - 1, y);
      const north = style.vertical && dark(x, y - 1);
      const south = style.vertical && dark(x, y + 1);
      const exposed = [
        !(north || west),
        !(north || east),
        !(south || east),
        !(south || west),
      ];
      const radii = exposed.map((open, corner) =>
        open ? h * style.radius(corner as Corner) : 0
      ) as [number, number, number, number];
      shapes.push(roundedRectPath(cx - h, cy - h, 2 * h, 2 * h, radii));
      // Bridges to the next module when lines are thinner than a module
      if (2 * h < cell) {
        if (east) {
          shapes.push(roundedRectPath(cx, cy - h, cell, 2 * h));
        }
        if (south) {
          shapes.push(roundedRectPath(cx - h, cy, 2 * h, cell));
        }
      }
    }
  }

  // Smooth inside corners: a light module whose two neighbours and the
  // diagonal between them are dark gets a small concave fillet.
  if (style?.fillets && scale === 1) {
    const r = cell * 0.3;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (dark(x, y) || isFinder(x, y, size)) {
          continue;
        }
        const x0 = centerOf(x) - cell / 2;
        const y0 = centerOf(y) - cell / 2;
        const x1 = x0 + cell;
        const y1 = y0 + cell;
        if (dark(x - 1, y) && dark(x, y - 1) && dark(x - 1, y - 1)) {
          shapes.push(`M${x0} ${y0}h${r}A${r} ${r} 0 0 0 ${x0} ${y0 + r}Z`);
        }
        if (dark(x + 1, y) && dark(x, y - 1) && dark(x + 1, y - 1)) {
          shapes.push(`M${x1} ${y0}v${r}A${r} ${r} 0 0 0 ${x1 - r} ${y0}Z`);
        }
        if (dark(x + 1, y) && dark(x, y + 1) && dark(x + 1, y + 1)) {
          shapes.push(`M${x1} ${y1}h${-r}A${r} ${r} 0 0 0 ${x1} ${y1 - r}Z`);
        }
        if (dark(x - 1, y) && dark(x, y + 1) && dark(x - 1, y + 1)) {
          shapes.push(`M${x0} ${y1}v${-r}A${r} ${r} 0 0 0 ${x0 + r} ${y1}Z`);
        }
      }
    }
  }

  const elements: JSX.Element[] = [];
  if (shapes.length > 0) {
    elements.push(<path d={shapes.join("")} key="modules" />);
  }
  if (solid.length > 0) {
    elements.push(<path d={solid.join("")} key="alignment" />);
  }
  return elements;
}
