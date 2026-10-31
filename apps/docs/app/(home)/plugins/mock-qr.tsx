import { cn } from "@repo/design-system/lib/utils";
import { QRDX_QR_M } from "@/components/fx";

// A real, scannable QR code for https://qrdx.dev (the precomputed matrix in
// components/fx/qr-matrix.ts), drawn as one SVG in a few module styles so
// the plugin mockups can show styled codes without encoding at runtime.

export type MockQrModules = "square" | "rounded" | "dots";

const QUIET = 2;

const inFinder = (x: number, y: number, n: number) =>
  (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);

/** A w × h rounded rectangle as a path, clockwise. */
function roundRect(x: number, y: number, w: number, h: number, r: number) {
  if (r <= 0) return `M${x} ${y}h${w}v${h}h${-w}z`;
  return `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`;
}

/** Same, counter-clockwise, to cut a hole with the nonzero fill rule. */
function roundRectHole(x: number, y: number, w: number, h: number, r: number) {
  if (r <= 0) return `M${x} ${y}v${h}h${w}v${-h}z`;
  return `M${x + r} ${y}a${r} ${r} 0 0 0 ${-r} ${r}v${h - 2 * r}a${r} ${r} 0 0 0 ${r} ${r}h${w - 2 * r}a${r} ${r} 0 0 0 ${r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 0 ${-r} ${-r}z`;
}

const cache = new Map<
  string,
  { modules: string; rings: string; eyes: string }
>();

function paths(code: readonly string[], style: MockQrModules) {
  const key = `${style}:${code.join("")}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const n = code.length;
  let modules = "";
  for (let y = 0; y < n; y++) {
    const row = code[y] ?? "";
    for (let x = 0; x < n; x++) {
      if (row[x] !== "1" || inFinder(x, y, n)) continue;
      const px = x + QUIET;
      const py = y + QUIET;
      if (style === "dots") {
        const r = 0.42;
        modules += `M${px + 0.5 - r} ${py + 0.5}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
      } else if (style === "rounded") {
        modules += roundRect(px + 0.06, py + 0.06, 0.88, 0.88, 0.3);
      } else {
        modules += `M${px} ${py}h1v1h-1z`;
      }
    }
  }

  const ringRadius = style === "square" ? 0 : style === "dots" ? 2.2 : 1.6;
  const eyeRadius = style === "square" ? 0 : style === "dots" ? 1.5 : 0.8;
  let rings = "";
  let eyes = "";
  for (const [fx, fy] of [
    [0, 0],
    [n - 7, 0],
    [0, n - 7],
  ] as const) {
    const x = fx + QUIET;
    const y = fy + QUIET;
    rings +=
      roundRect(x, y, 7, 7, ringRadius) +
      roundRectHole(x + 1, y + 1, 5, 5, Math.max(0, ringRadius - 1));
    eyes += roundRect(x + 2, y + 2, 3, 3, eyeRadius);
  }

  const result = { modules, rings, eyes };
  cache.set(key, result);
  return result;
}

interface MockQrProps {
  modules?: MockQrModules;
  fg?: string;
  /** Corner eyes; defaults to `fg`. */
  eye?: string;
  bg?: string;
  className?: string;
  code?: readonly string[];
}

/** Decorative: wrap it in something labelled, or leave it aria-hidden. */
export function MockQr({
  modules = "square",
  fg = "#0a0a0a",
  eye,
  bg = "#ffffff",
  className,
  code = QRDX_QR_M,
}: MockQrProps) {
  const { modules: body, rings, eyes } = paths(code, modules);
  const size = code.length + QUIET * 2;
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${size} ${size}`}
      className={cn("block aspect-square", className)}
      shapeRendering={modules === "square" ? "crispEdges" : undefined}
    >
      <rect width={size} height={size} fill={bg} />
      <path d={body} fill={fg} />
      <path d={rings} fill={eye ?? fg} />
      <path d={eyes} fill={eye ?? fg} />
    </svg>
  );
}
