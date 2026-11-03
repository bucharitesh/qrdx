/** biome-ignore-all lint/style/noMagicNumbers: icon geometry */
// The glyphs a frame spec can place by id (`{ type: "icon", icon: "wifi" }`),
// so a spec never needs an image. Each is path data in a 24 × 24 box, built
// from the same primitives as the frames. Generic shapes only: no brand
// marks. Shapes in one icon either never overlap (nonzero) or use even-odd
// for their holes; every outline runs clockwise on screen, so overlapping
// parts of a nonzero icon join instead of cancelling out.
import type { FrameSpecIcon } from "../types/frame-spec";
import {
  circlePath,
  heartPath,
  type Point,
  polygonPath,
  roundedRectPath,
  starPoints,
} from "./shapes";
import { fmt } from "./utils/fmt";

/** Side of the box icons are drawn in. */
export const FRAME_ICON_BOX = 24;

export interface FrameIconPath {
  d: string;
  fillRule: "nonzero" | "evenodd";
}

const at = (cx: number, cy: number, r: number, degrees: number): Point => {
  const angle = (degrees * Math.PI) / 180;
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
};
const pt = ([x, y]: Point) => `${fmt(x)} ${fmt(y)}`;

/** Ring sector from angle `a0` to `a1` (degrees, clockwise on screen). */
function sector(
  cx: number,
  cy: number,
  inner: number,
  outer: number,
  a0: number,
  a1: number
): string {
  const large = a1 - a0 > 180 ? 1 : 0;
  return (
    `M${pt(at(cx, cy, outer, a0))}` +
    `A${fmt(outer)} ${fmt(outer)} 0 ${large} 1 ${pt(at(cx, cy, outer, a1))}` +
    `L${pt(at(cx, cy, inner, a1))}` +
    `A${fmt(inner)} ${fmt(inner)} 0 ${large} 0 ${pt(at(cx, cy, inner, a0))}Z`
  );
}

/** Ellipse as two arcs, clockwise. */
function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  return (
    `M${fmt(cx - rx)} ${fmt(cy)}A${fmt(rx)} ${fmt(ry)} 0 1 1 ${fmt(cx + rx)} ${fmt(cy)}` +
    `A${fmt(rx)} ${fmt(ry)} 0 1 1 ${fmt(cx - rx)} ${fmt(cy)}Z`
  );
}

/** Signed area (positive when clockwise on screen). */
function area(points: Point[]): number {
  let sum = 0;
  points.forEach(([x, y], i) => {
    const [nx, ny] = points[(i + 1) % points.length] as Point;
    sum += x * ny - nx * y;
  });
  return sum / 2;
}

/** Polygon path running clockwise on screen. */
function clockwise(points: Point[]): string {
  return polygonPath(area(points) < 0 ? [...points].reverse() : points);
}

/** A bar of `width` from (x1, y1) to (x2, y2), square ends. */
function bar(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number
): string {
  const length = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = (-(y2 - y1) / length) * (width / 2);
  const ny = ((x2 - x1) / length) * (width / 2);
  return clockwise([
    [x1 + nx, y1 + ny],
    [x2 + nx, y2 + ny],
    [x2 - nx, y2 - ny],
    [x1 - nx, y1 - ny],
  ]);
}

const nonzero = (...parts: string[]): FrameIconPath => ({
  d: parts.join(""),
  fillRule: "nonzero",
});
const evenodd = (...parts: string[]): FrameIconPath => ({
  d: parts.join(""),
  fillRule: "evenodd",
});

function snowflake(): FrameIconPath {
  const parts: string[] = [];
  for (const angle of [0, 60, 120]) {
    const [x1, y1] = at(12, 12, 10.5, angle + 180);
    const [x2, y2] = at(12, 12, 10.5, angle);
    parts.push(bar(x1, y1, x2, y2, 2));
  }
  for (let arm = 0; arm < 6; arm++) {
    const angle = arm * 60;
    const [bx, by] = at(12, 12, 6.2, angle);
    for (const turn of [-45, 45]) {
      const [ex, ey] = at(bx, by, 3.6, angle + turn);
      parts.push(bar(bx, by, ex, ey, 1.7));
    }
  }
  return nonzero(...parts);
}

const ICONS: Record<FrameSpecIcon, () => FrameIconPath> = {
  wifi: () =>
    nonzero(
      sector(12, 20, 4.6, 7.2, -135, -45),
      sector(12, 20, 9.2, 11.8, -135, -45),
      sector(12, 20, 13.8, 16.4, -135, -45),
      circlePath(12, 20, 2.2)
    ),
  star: () => nonzero(polygonPath(starPoints(12, 12.8, 11.6, 4.8))),
  heart: () => nonzero(heartPath(12, 12.4, 22)),
  phone: () =>
    evenodd(
      roundedRectPath(6, 1.5, 12, 21, 2.6),
      roundedRectPath(7.8, 4.2, 8.4, 13.4, 0.6),
      circlePath(12, 19.8, 1.1)
    ),
  headphones: () =>
    nonzero(
      sector(12, 13, 7.6, 9.8, -180, 0),
      roundedRectPath(2, 12, 5, 9.5, 2),
      roundedRectPath(17, 12, 5, 9.5, 2)
    ),
  calendar: () =>
    evenodd(
      roundedRectPath(2.5, 4, 19, 17.5, 2.5),
      roundedRectPath(4.6, 9, 14.8, 10.6, 0.8),
      roundedRectPath(7, 11.4, 2.6, 2.6, 0.4),
      roundedRectPath(10.7, 11.4, 2.6, 2.6, 0.4),
      roundedRectPath(14.4, 11.4, 2.6, 2.6, 0.4),
      roundedRectPath(7, 15.1, 2.6, 2.6, 0.4),
      roundedRectPath(10.7, 15.1, 2.6, 2.6, 0.4),
      roundedRectPath(6.5, 1.4, 2.4, 2.6, [1.2, 1.2, 0, 0]),
      roundedRectPath(15.1, 1.4, 2.4, 2.6, [1.2, 1.2, 0, 0])
    ),
  user: () =>
    nonzero(
      circlePath(12, 7.5, 4.6),
      "M3 21.5C3 16.2 7 13.6 12 13.6C17 13.6 21 16.2 21 21.5Z"
    ),
  chat: () =>
    evenodd(
      roundedRectPath(2, 3, 20, 14, 4),
      polygonPath([
        [6.5, 17],
        [11.5, 17],
        [5.8, 21.8],
      ]),
      circlePath(7.5, 10, 1.5),
      circlePath(12, 10, 1.5),
      circlePath(16.5, 10, 1.5)
    ),
  bag: () =>
    nonzero(
      roundedRectPath(3.5, 7.5, 17, 14.5, 2),
      sector(12, 7.5, 3.1, 4.8, -180, 0)
    ),
  bell: () =>
    nonzero(
      "M3.5 17.2A8.5 8.5 0 0 1 20.5 17.2Z",
      roundedRectPath(1.5, 18.2, 21, 2.6, 1.3),
      roundedRectPath(11.2, 6.6, 1.6, 2.6, 0),
      roundedRectPath(9.8, 4.6, 4.4, 2.4, 1.2)
    ),
  cup: () =>
    nonzero(
      "M4 6.5H17V13.5A6.5 6.5 0 0 1 4 13.5Z",
      sector(17, 10.2, 1.7, 3.6, -90, 90),
      roundedRectPath(2, 20.6, 17, 2, 1),
      roundedRectPath(7, 1.6, 1.6, 3.4, 0.8),
      roundedRectPath(11.6, 1.6, 1.6, 3.4, 0.8)
    ),
  card: () =>
    evenodd(
      roundedRectPath(1.5, 4.5, 21, 15, 2.5),
      roundedRectPath(1.5, 8, 21, 3, 0),
      roundedRectPath(4.5, 13.6, 4.6, 3.2, 0.6)
    ),
  check: () =>
    evenodd(
      circlePath(12, 12, 10.5),
      polygonPath([
        [6.6, 12.4],
        [8.4, 10.6],
        [10.6, 12.8],
        [15.8, 7.6],
        [17.6, 9.4],
        [10.6, 16.4],
      ])
    ),
  info: () =>
    evenodd(
      circlePath(12, 12, 10.5),
      circlePath(12, 7.2, 1.6),
      roundedRectPath(10.6, 10, 2.8, 8, 0.8)
    ),
  home: () =>
    evenodd(
      polygonPath([
        [12, 2.5],
        [22.5, 11.5],
        [19.5, 11.5],
        [19.5, 21.5],
        [4.5, 21.5],
        [4.5, 11.5],
        [1.5, 11.5],
      ]),
      roundedRectPath(10, 14.5, 4, 7, [0.6, 0.6, 0, 0])
    ),
  pin: () =>
    evenodd(
      "M12 22.5C8.5 17.6 4.5 14 4.5 9.5A7.5 7.5 0 0 1 19.5 9.5C19.5 14 15.5 17.6 12 22.5Z",
      circlePath(12, 9.5, 3)
    ),
  share: () =>
    nonzero(
      bar(6, 12, 18, 5, 1.8),
      bar(6, 12, 18, 19, 1.8),
      circlePath(18, 5, 3.2),
      circlePath(6, 12, 3.2),
      circlePath(18, 19, 3.2)
    ),
  download: () =>
    nonzero(
      roundedRectPath(10.6, 2, 2.8, 9.5, 0),
      polygonPath([
        [6, 10],
        [18, 10],
        [12, 16.5],
      ]),
      polygonPath([
        [2.5, 15],
        [5.3, 15],
        [5.3, 19],
        [18.7, 19],
        [18.7, 15],
        [21.5, 15],
        [21.5, 21.8],
        [2.5, 21.8],
      ])
    ),
  clock: () =>
    evenodd(
      circlePath(12, 12, 10.5),
      circlePath(12, 12, 8.4),
      polygonPath([
        [11, 5.4],
        [13, 5.4],
        [13, 11.3],
        [16.9, 13.5],
        [15.9, 15.2],
        [11, 12.5],
      ])
    ),
  snowflake,
  pumpkin: () =>
    nonzero(
      ellipse(7.8, 14.6, 5.8, 6.9),
      ellipse(16.2, 14.6, 5.8, 6.9),
      ellipse(12, 14.6, 4.8, 7.4),
      roundedRectPath(10.9, 3.4, 2.2, 4.6, 0.8),
      clockwise([
        [13, 4.2],
        [17.2, 3],
        [16.2, 5.4],
        [13, 6],
      ])
    ),
  tree: () =>
    nonzero(
      polygonPath([
        [12, 1.5],
        [16.8, 8.2],
        [7.2, 8.2],
      ]),
      polygonPath([
        [12, 5.2],
        [19, 13.6],
        [5, 13.6],
      ]),
      polygonPath([
        [12, 9.4],
        [21.2, 19.2],
        [2.8, 19.2],
      ]),
      roundedRectPath(10.4, 18.6, 3.2, 3.9, 0.4)
    ),
  sparkle: () =>
    nonzero(
      polygonPath(starPoints(9.5, 13.5, 9, 2.4, 4)),
      polygonPath(starPoints(19, 5, 4, 1.1, 4))
    ),
  gift: () =>
    nonzero(
      roundedRectPath(3, 11.2, 7.8, 10.6, 1),
      roundedRectPath(13.2, 11.2, 7.8, 10.6, 1),
      roundedRectPath(2, 7.4, 8.8, 3.2, 1),
      roundedRectPath(13.2, 7.4, 8.8, 3.2, 1),
      ellipse(8.8, 4.8, 2.9, 1.9),
      ellipse(15.2, 4.8, 2.9, 1.9)
    ),
};

/** Path data of a built-in icon, in a 24 × 24 box. */
export function getFrameIconPath(icon: FrameSpecIcon): FrameIconPath {
  return ICONS[icon]();
}
