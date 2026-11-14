import { cn } from "@repo/design-system/lib/utils";
import { type LoaderProps, LoaderSvg } from "./loader-svg";

const MODULES = [
  { x: 14, y: 14, delay: "0s" },
  { x: 28, y: 14, delay: "0.12s" },
  { x: 21, y: 21, delay: "0.24s", accent: true },
  { x: 14, y: 28, delay: "0.36s" },
  { x: 28, y: 28, delay: "0.48s" },
];

/**
 * The primary loader, for page and route loads: the mark's four corner
 * brackets breathe in and out like a camera locking on (1.6 s) while the X's
 * five modules pop in one by one, the centre one in the brand accent.
 */
export function Scanframe({ size = 40, ...props }: LoaderProps) {
  return (
    <LoaderSvg size={size} viewBox="0 0 48 48" {...props}>
      <path
        className="qrdx-loader-bracket qrdx-loader-breathe-tl"
        d="M4 16V10a6 6 0 0 1 6-6h6"
      />
      <path
        className="qrdx-loader-bracket qrdx-loader-breathe-tr"
        d="M32 4h6a6 6 0 0 1 6 6v6"
      />
      <path
        className="qrdx-loader-bracket qrdx-loader-breathe-br"
        d="M44 32v6a6 6 0 0 1-6 6h-6"
      />
      <path
        className="qrdx-loader-bracket qrdx-loader-breathe-bl"
        d="M16 44h-6a6 6 0 0 1-6-6v-6"
      />
      {MODULES.map((module) => (
        <rect
          className={cn(
            "qrdx-loader-pop",
            module.accent && "qrdx-loader-accent"
          )}
          height="6"
          key={`${module.x}-${module.y}`}
          rx="1.6"
          style={{ animationDelay: module.delay }}
          width="6"
          x={module.x}
          y={module.y}
        />
      ))}
    </LoaderSvg>
  );
}
