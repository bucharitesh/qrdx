export const SOUND_PREFS_KEY = "qrdx:sound";

export interface SoundPrefs {
  muted: boolean;
}

export interface PrefsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Cues are on by default for everyone (reduced motion is about motion, not
 * sound; audio still waits for the first gesture). A stored choice wins.
 */
export function readSoundPrefs(
  storage: PrefsStorage | null | undefined,
): SoundPrefs {
  let stored: Partial<SoundPrefs> | null = null;
  try {
    const raw = storage?.getItem(SOUND_PREFS_KEY);
    stored = raw ? (JSON.parse(raw) as Partial<SoundPrefs>) : null;
  } catch {
    stored = null;
  }
  return { muted: stored?.muted === true };
}

export function writeSoundPrefs(
  storage: PrefsStorage | null | undefined,
  prefs: SoundPrefs,
): void {
  try {
    storage?.setItem(SOUND_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode or blocked storage: the choice lasts for this page only.
  }
}
