export interface TrimBounds {
  /** Seconds to skip at the start (leading silence minus a short pre-roll). */
  offset: number;
  /** Seconds of audible sound from `offset`. */
  duration: number;
}

const PRE_ROLL_S = 0.003;
const TAIL_S = 0.005;

/**
 * Finds where a decoded sample becomes audible and where it fades out, so
 * clips with leading silence start on the transient (no added latency).
 */
export function trimBounds(
  channels: ArrayLike<number>[],
  sampleRate: number,
): TrimBounds {
  const length = channels[0]?.length ?? 0;
  let peak = 0;
  for (const data of channels) {
    for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(data[i]));
  }
  if (peak === 0 || length === 0)
    return { offset: 0, duration: length / sampleRate };

  const onset = peak * 0.05; // -26 dB below the peak
  const tail = peak * 0.003; // -50 dB below the peak
  const audible = (i: number, threshold: number) =>
    channels.some((data) => Math.abs(data[i]) > threshold);

  let start = 0;
  while (start < length && !audible(start, onset)) start++;
  let end = length - 1;
  while (end > start && !audible(end, tail)) end--;

  const offset = Math.max(0, start / sampleRate - PRE_ROLL_S);
  const stop = Math.min(length / sampleRate, end / sampleRate + TAIL_S);
  return { offset, duration: Math.max(0, stop - offset) };
}
