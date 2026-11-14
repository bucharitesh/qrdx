import type { SoundName } from "./presets";

/** The window event SoundProvider listens for; detail is a cue name. */
export const SOUND_EVENT = "qrdx:sound";

/**
 * Asks for a cue (no engine import, safe anywhere). The engine decides:
 * ignored before the first gesture, while muted, when throttled, or on
 * customer pages.
 */
export function soundEvent(name: SoundName): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SOUND_EVENT, { detail: name }));
}
