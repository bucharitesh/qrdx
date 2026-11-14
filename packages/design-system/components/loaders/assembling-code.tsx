import { cn } from "@repo/design-system/lib/utils";
import { type LoaderProps, LoaderSvg } from "./loader-svg";

// A 7×7 mini code: three 3×3 finder eyes, then data modules. Each module is
// [column, row, delay in s]; the eyes build first (0–0.24 s), the data after.
// The centre module is the accent.
const EYES: [number, number, number][] = [
  [0, 0, 0],
  [1, 0, 0.03],
  [2, 0, 0.06],
  [4, 0, 0.12],
  [5, 0, 0.15],
  [6, 0, 0.18],
  [0, 1, 0.03],
  [1, 1, 0.06],
  [2, 1, 0.09],
  [4, 1, 0.15],
  [5, 1, 0.18],
  [6, 1, 0.21],
  [0, 2, 0.06],
  [1, 2, 0.09],
  [2, 2, 0.12],
  [4, 2, 0.18],
  [5, 2, 0.21],
  [6, 2, 0.24],
  [0, 4, 0.12],
  [1, 4, 0.15],
  [2, 4, 0.18],
  [0, 5, 0.15],
  [1, 5, 0.18],
  [2, 5, 0.21],
  [0, 6, 0.18],
  [1, 6, 0.21],
  [2, 6, 0.24],
];

const DATA: [number, number, number][] = [
  [1, 3, 0.5],
  [5, 3, 0.7],
  [6, 3, 0.75],
  [4, 4, 1],
  [6, 4, 0.25],
  [3, 5, 0.45],
  [5, 5, 0.55],
  [3, 6, 0.8],
  [4, 6, 0.85],
];

const CENTRE: [number, number, number] = [3, 3, 0.6];

const MODULES = [...EYES, ...DATA, CENTRE];

/**
 * The loader for generating: AI art and themes, bulk and batch runs. A mini
 * QR code builds itself module by module, finder eyes first, then fades and
 * rebuilds (2.6 s). The centre module is in the brand accent.
 */
export function AssemblingCode({ size = 40, ...props }: LoaderProps) {
  return (
    <LoaderSvg size={size} viewBox="0 0 49 49" {...props}>
      {MODULES.map(([column, row, delay]) => (
        <rect
          className={cn(
            "qrdx-loader-build",
            column === CENTRE[0] && row === CENTRE[1] && "qrdx-loader-accent"
          )}
          height="6"
          key={`${column}-${row}`}
          rx="1.4"
          style={{ animationDelay: `${delay}s` }}
          width="6"
          x={1 + column * 7}
          y={1 + row * 7}
        />
      ))}
    </LoaderSvg>
  );
}
