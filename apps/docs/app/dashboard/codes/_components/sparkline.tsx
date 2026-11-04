/** Inline SVG trend line; renders on the server, no chart library needed. */
export function Sparkline({
  values,
  width: WIDTH = 64,
  height: HEIGHT = 20,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? WIDTH / (values.length - 1) : WIDTH;
  const points = values
    .map((value, i) => {
      const x = i * step;
      const y = HEIGHT - 1 - (value / max) * (HEIGHT - 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      aria-hidden="true"
      className="text-primary shrink-0"
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
    >
      <polyline
        fill="none"
        points={points}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}
