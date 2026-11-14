import { useMemo, useSyncExternalStore } from "react";
import { SOUND_EVENT, soundEvent } from "./emit";
import { soundEngine } from "./engine";
import type { SoundName } from "./presets";

export { SOUND_EVENT, soundEvent };

/** Plays a cue now, bypassing the event (same rules apply). */
export function playSound(name: SoundName): boolean {
  return soundEngine.play(name);
}

const subscribe = (listener: () => void) => soundEngine.subscribe(listener);
const getMuted = () => soundEngine.isMuted();
const getServerMuted = () => false;

export function useSound() {
  const muted = useSyncExternalStore(subscribe, getMuted, getServerMuted);
  return useMemo(
    () => ({
      play: playSound,
      muted,
      setMuted: (value: boolean) => soundEngine.setMuted(value),
    }),
    [muted],
  );
}
