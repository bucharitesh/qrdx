import type { SVGProps } from "react";

// Fine spider webs (iconsax has none). Hairline strokes at any size.

const RINGS = [0.18, 0.36, 0.56, 0.78, 0.98];

function webPath(from: number, to: number, spokes: number, radius: number) {
  const angles = Array.from(
    { length: spokes },
    (_, i) => from + ((to - from) * i) / (spokes - 1),
  );
  const point = (r: number, a: number) =>
    `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
  const lines = angles.map((a) => `M0 0L${point(radius * 1.45, a)}`);
  const rings = RINGS.map((ratio, ringIndex) => {
    const r = radius * ratio;
    // Threads sag toward the center, a touch more on the outer rings.
    const sag = 0.86 - ringIndex * 0.015;
    const segments = angles
      .slice(1)
      .map((a, i) => `Q${point(r * sag, (a + angles[i]) / 2)} ${point(r, a)}`);
    return `M${point(r, angles[0])}${segments.join("")}`;
  });
  return [...lines, ...rings].join("");
}

const CORNER = webPath(0, Math.PI / 2, 6, 24);

/** A point on the corner web (where a spoke meets a ring), scaled to `size` px. */
export function cornerWebPoint(size: number, spoke = 3, ring = 2) {
  const angle = ((Math.PI / 2) * spoke) / 5;
  const r = 24 * RINGS[ring] * (size / 24);
  return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
}
const FAN = webPath(0, Math.PI, 9, 24);

interface WebProps extends SVGProps<SVGSVGElement> {
  /** corner: anchored top-left (mirror with -scale-x-100); fan: hangs from a top edge */
  kind?: "corner" | "fan";
}

export function SpiderWeb({ kind = "corner", ...props }: WebProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={kind === "fan" ? "-24 0 48 24" : "0 0 24 24"}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      aria-hidden
      {...props}
    >
      <path
        d={kind === "fan" ? FAN : CORNER}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
