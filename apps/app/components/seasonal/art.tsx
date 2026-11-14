// Bat silhouettes for the roosting flock (the other characters are 3D renders,
// see sprite.tsx). Symmetric vector paths: crisp at any size, no raster.

/** Hanging bat, 24×44: feet gripping the top edge, wings folded, head down. */
export const BAT_HANGING =
  "M12 3.4L12.35 3.3L12.55 0.7L12.6 0L15.1 0L14.6 0.7L14.4 4Q18 3.8 19.5 8.4Q21.3 14.2 20 20.8L19 20.4Q19.6 24.8 17.7 28L16.9 27.6Q17.2 31.2 15.4 32.8L14.7 33.5Q16.7 34.6 16.5 37.6L16.8 43.6Q14.8 40.8 14 39.9Q13.2 41.6 12 41.7Q10.8 41.6 10 39.9Q9.2 40.8 7.2 43.6L7.5 37.6Q7.3 34.6 9.3 33.5L8.6 32.8Q6.8 31.2 7.1 27.6L6.3 28Q4.4 24.8 5 20.4L4 20.8Q2.7 14.2 4.5 8.4Q6 3.8 9.6 4L9.4 0.7L8.9 0L11.4 0L11.45 0.7L11.65 3.3L12 3.4Z";

/** Flying bat, 40×20: wings spread with a scalloped trailing edge. */
export const BAT_FLYING =
  "M20 5.8L20.9 5.5L21.9 2.4L22.5 6L24.4 6.6Q28.6 2 34.2 1.6Q37.8 2.4 39.7 6.6Q36.3 7 34.7 10.8Q32.3 8.6 29.9 12.4Q27.4 10.8 25.2 13.4Q23.4 13.2 22.2 15.4Q21 15 20 16.4Q19 15 17.8 15.4Q16.6 13.2 14.8 13.4Q12.6 10.8 10.1 12.4Q7.7 8.6 5.3 10.8Q3.7 7 0.3 6.6Q2.2 2.4 5.8 1.6Q11.4 2 15.6 6.6L17.5 6L18.1 2.4L19.1 5.5L20 5.8Z";

/** Height of the hanging bat for a given width. */
export const batHeight = (width: number) => Math.round((width * 44) / 24);

/**
 * One bat in both poses: hanging (feet at the box's top edge) and, while it
 * flies, spread wings centred on the same spot. CSS shows one of them.
 */
export function BatArt({
  width,
  hangingClassName,
  flyingClassName,
}: {
  width: number;
  hangingClassName?: string;
  flyingClassName?: string;
}) {
  const flying = Math.round(width * 1.9);
  return (
    <>
      <svg
        viewBox="0 0 24 44"
        width={width}
        height={batHeight(width)}
        className={hangingClassName}
        aria-hidden
      >
        <path d={BAT_HANGING} fill="currentColor" />
      </svg>
      <svg
        viewBox="0 0 40 20"
        width={flying}
        height={Math.round(flying / 2)}
        className={flyingClassName}
        style={{ marginLeft: (width - flying) / 2 }}
        aria-hidden
      >
        <path d={BAT_FLYING} fill="currentColor" />
      </svg>
    </>
  );
}
