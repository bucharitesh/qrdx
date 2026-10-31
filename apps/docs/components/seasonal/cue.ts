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
