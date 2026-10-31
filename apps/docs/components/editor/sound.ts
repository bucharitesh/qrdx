// Editor sound cues. The global sound engine (lib/sound) listens for this
// event; without it the dispatch is a harmless no-op.
export type EditorSound = import("@/lib/sound/presets").SoundName;

export function emitSound(name: EditorSound) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("qrdx:sound", { detail: name }));
}
