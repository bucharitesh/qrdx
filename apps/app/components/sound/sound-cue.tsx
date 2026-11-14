"use client";

import { useEffect } from "react";
import { soundEngine } from "@/lib/sound/engine";
import type { SoundName } from "@/lib/sound/presets";

/**
 * Plays one cue for a page that is itself the outcome (e.g. /success after
 * checkout). The browser allows no audio after a full redirect, so the cue
 * waits for the visitor's first click or key press (up to 10 s).
 */
export function SoundCue({ name }: { name: SoundName }) {
  useEffect(() => {
    soundEngine.playOnGesture(name);
  }, [name]);
  return null;
}
