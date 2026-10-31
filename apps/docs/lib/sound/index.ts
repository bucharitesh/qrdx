/**
 * QRdx sound cues
 * ===============
 *
 * Short, soft cues at meaningful moments, on by default (audio still waits for
 * the first real gesture). Code asks for a cue; nothing is automatic except
 * "error" for an error toast right after a user action. Never on hover,
 * focus, typing, scrolling, menus, dialogs, tab switches or page loads.
 *
 * Cues (any other name is ignored, whoever emits it):
 *   ui          copy · download · success · error · ai-done
 *   playground  apply · shuffle · select · tick · back · forward · good · low
 *   seasonal    boo · meow · bat (direct click only, quieter, 1 per second)
 * See SOUND_PRESETS[name].use for where each belongs.
 *
 * Trigger one (one line; no engine import):
 *   import { soundEvent } from "@/lib/sound/emit";
 *   soundEvent("apply");
 *   // or: window.dispatchEvent(new CustomEvent("qrdx:sound", { detail: "apply" }));
 *
 * Rules the engine enforces:
 * - no AudioContext and no sound before the first user gesture;
 * - silent on customer pages (/p, /q, /ended) and /scan: SoundProvider is not
 *   mounted there (app/providers.tsx), so the engine stays disarmed;
 * - master volume 0.35; cues are 250 ms or shorter; at most 2 at once (a
 *   third is dropped); the same cue at most once per 400 ms (tick: 150 ms,
 *   seasonal: 1 s); seasonal cues need a click / tap within 600 ms;
 * - mute persists in localStorage ("qrdx:sound"); a hidden tab suspends audio.
 *
 * Mute: <SoundSetting /> (Settings → Preferences) and <SoundSwitch /> (the
 * playground's keyboard-shortcuts dialog). Samples: Kenney CC0 (CREDITS.md).
 */

export { SOUND_EVENT, soundEvent } from "./emit";
export { type SoundEngine, soundEngine } from "./engine";
export {
  isSoundName,
  SOUND_GROUPS,
  SOUND_NAMES,
  SOUND_PRESETS,
  type SoundName,
} from "./presets";
export { playSound, useSound } from "./use-sound";
