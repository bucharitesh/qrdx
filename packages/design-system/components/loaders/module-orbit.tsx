import { type LoaderProps, LoaderSvg } from "./loader-svg";

// The leading module first, then its tail, counter-clockwise behind it.
const RING = [
  { x: 21, y: 3, tail: undefined },
  { x: 6.2, y: 13.8, tail: "qrdx-loader-tail-1" },
  { x: 11.8, y: 31.2, tail: "qrdx-loader-tail-2" },
  { x: 30.2, y: 31.2, tail: "qrdx-loader-tail-3" },
  { x: 35.8, y: 13.8, tail: "qrdx-loader-tail-4" },
];

/**
 * The compact loader, for buttons, toasts and other tight spots (16–20 px):
 * five modules orbit the centre with a fading tail (1.1 s) while the centre
 * module holds still in the brand accent.
 */
export function ModuleOrbit({ size = 16, ...props }: LoaderProps) {
  return (
    <LoaderSvg size={size} viewBox="0 0 48 48" {...props}>
      <g className="qrdx-loader-orbit">
        {RING.map((module) => (
          <rect
            className={module.tail}
            height="6"
            key={`${module.x}-${module.y}`}
            rx="1.6"
            width="6"
            x={module.x}
            y={module.y}
          />
        ))}
      </g>
      <rect
        className="qrdx-loader-accent"
        height="6"
        rx="1.6"
        width="6"
        x="21"
        y="21"
      />
    </LoaderSvg>
  );
}
