// Bat silhouette for the roosting flock (the characters are 3D renders, see sprite.tsx).

/** 24×24 bat silhouette. */
export const BAT_SHAPE =
  "M10.9 6.5 11.4 8.6 12 8l.6.6.5-2.1.5 2.7Q17 7.2 23 6.5Q21 9.2 20.8 12Q19.4 10.2 17.8 11.4Q16 12.2 15.4 14.6Q13 15 12 18Q11 15 8.6 14.6Q8 12.2 6.2 11.4Q4.6 10.2 3.2 12Q3 9.2 1 6.5Q7 7.2 10.4 9.2Z";

export function BatArt({
  className,
  size = 24,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden
    >
      <path d={BAT_SHAPE} fill="currentColor" />
      <circle cx="11.2" cy="10.4" r=".55" fill="#FDE68A" />
      <circle cx="12.8" cy="10.4" r=".55" fill="#FDE68A" />
    </svg>
  );
}
