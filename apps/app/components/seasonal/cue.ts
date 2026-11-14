import { soundEvent } from "@/lib/sound/emit";
import type { SoundName } from "@/lib/sound/presets";

const last = new Map<SoundName, number>();

/** One soft cue per direct click on a character, at most every 400 ms. */
export function seasonalCue(name: SoundName) {
  const now = performance.now();
  if (now - (last.get(name) ?? -Infinity) < 400) return;
  last.set(name, now);
  soundEvent(name);
}

/**
 * Interactive characters are real buttons (keyboard: Tab, then Enter / Space):
 * no button chrome, a focus ring only for keyboard focus.
 */
export const CHARACTER_BUTTON =
  "cursor-pointer rounded-md outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
