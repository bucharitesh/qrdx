// Part markers: an editor's live preview renders with `partMarkers` so it can
// find each part of the code on screen (the finder eyes, the dots, the logo,
// the background) and put a control over it. Off by default; exports drop it.

/** Marks a drawn part of the code in SVG drawn with `partMarkers`. */
export const QR_PART_ATTRIBUTE = "data-qrdx-part";

/** Says which finder an "eye-outer" or "eye-centre" part belongs to. */
export const QR_EYE_ATTRIBUTE = "data-qrdx-eye";

/** The parts `partMarkers` marks (values of QR_PART_ATTRIBUTE). */
export const QR_PARTS = [
  "eye-outer",
  "eye-centre",
  "body",
  "logo",
  "background",
] as const;

export type QRPart = (typeof QR_PARTS)[number];

/** The finder eyes, as QR_EYE_ATTRIBUTE names them. */
export type QRPartEye = "top-left" | "top-right" | "bottom-left";

/**
 * The attributes that mark `part` (and its eye), or none when markers are
 * off. Spread last on the element, so dropping them gives the default markup.
 */
export function partMarker(
  on: boolean | undefined,
  part: QRPart,
  eye?: QRPartEye
): Record<string, string> | undefined {
  if (!on) {
    return;
  }
  return eye
    ? { [QR_PART_ATTRIBUTE]: part, [QR_EYE_ATTRIBUTE]: eye }
    : { [QR_PART_ATTRIBUTE]: part };
}
