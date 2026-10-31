import { SYNTH, type SynthRecipe } from "./synth";

/**
 * The allowlist, in three groups. The engine ignores every other name,
 * whoever emits it: cues mark meaningful moments, never hover, focus, typing,
 * scrolling, menus, dialogs or tab switches.
 */
export const SOUND_GROUPS = {
  /** Outcomes, anywhere in the app. */
  ui: ["copy", "download", "success", "error", "ai-done"],
  /** The playground family: softer, short, one sample family. */
  playground: [
    "apply",
    "shuffle",
    "select",
    "tick",
    "back",
    "forward",
    "good",
    "low",
  ],
  /** Festive characters: direct clicks only, quieter than UI cues. */
  seasonal: ["boo", "meow", "bat"],
} as const;

export const SOUND_NAMES = [
  ...SOUND_GROUPS.ui,
  ...SOUND_GROUPS.playground,
  ...SOUND_GROUPS.seasonal,
] as const;

export type SoundName = (typeof SOUND_NAMES)[number];
export type SoundGroup = keyof typeof SOUND_GROUPS;

/** Cues never run longer than this; longer samples fade out. */
export const MAX_CUE_MS = 250;

/** One playback of a sample: start offset (s) and playback rate (pitch). */
export interface SampleStep {
  at: number;
  rate: number;
}

export interface SoundPreset {
  group: SoundGroup;
  /** Recorded sample in /public/sounds (CC0, see CREDITS.md); synth otherwise. */
  sample?: string;
  /** Plays the sample several times / at other pitches (default: once, as is). */
  steps?: SampleStep[];
  /** Voice gains before the master volume, levelling every cue to one loudness. */
  sampleGain: number;
  synthGain: number;
  /** Synth length in ms (samples use their decoded, silence-trimmed length). */
  durationMs: number;
  /** The same cue plays at most once per this window. */
  debounceMs: number;
  /** Only plays right after a direct click, tap or drag-release. */
  pointerOnly: boolean;
  synth: SynthRecipe;
  /** Where the cue belongs. */
  use: string;
}

type PresetInput = Omit<
  SoundPreset,
  "group" | "debounceMs" | "pointerOnly" | "synth"
> &
  Partial<Pick<SoundPreset, "debounceMs">>;

const ui = (name: SoundName, input: PresetInput): SoundPreset => ({
  group: "ui",
  debounceMs: 400,
  pointerOnly: false,
  synth: SYNTH[name],
  ...input,
});

const playground = (name: SoundName, input: PresetInput): SoundPreset => ({
  ...ui(name, input),
  group: "playground",
});

const seasonal = (name: SoundName, input: PresetInput): SoundPreset => ({
  group: "seasonal",
  debounceMs: 1000,
  pointerOnly: true,
  synth: SYNTH[name],
  ...input,
});

export const SOUND_PRESETS: Record<SoundName, SoundPreset> = {
  copy: ui("copy", {
    sample: "/sounds/copy.mp3",
    sampleGain: 1,
    synthGain: 2,
    durationMs: 150,
    use: "A code, link, command or SVG was copied.",
  }),
  download: ui("download", {
    sample: "/sounds/download.mp3",
    sampleGain: 0.75,
    synthGain: 2,
    durationMs: 250,
    use: "A download the user asked for completed.",
  }),
  success: ui("success", {
    sample: "/sounds/success.mp3",
    sampleGain: 0.45,
    synthGain: 1.8,
    durationMs: 250,
    use: "Payment / upgrade, import, code created, dynamic code turned on.",
  }),
  error: ui("error", {
    sample: "/sounds/error.mp3",
    sampleGain: 0.9,
    synthGain: 0.8,
    durationMs: 200,
    use: "An action the user started failed.",
  }),
  "ai-done": ui("ai-done", {
    sample: "/sounds/ai-done.mp3",
    sampleGain: 0.75,
    synthGain: 2,
    durationMs: 250,
    use: "An AI theme finished generating.",
  }),
  apply: playground("apply", {
    sample: "/sounds/apply.mp3",
    sampleGain: 0.5,
    synthGain: 1,
    durationMs: 200,
    use: "Theme / preset / art / logo applied, code saved.",
  }),
  shuffle: playground("shuffle", {
    sample: "/sounds/shuffle.mp3",
    sampleGain: 1,
    synthGain: 1,
    durationMs: 200,
    use: "Shuffle theme.",
  }),
  select: playground("select", {
    sample: "/sounds/select.mp3",
    sampleGain: 0.6,
    synthGain: 1,
    durationMs: 70,
    use: "Content type changed.",
  }),
  tick: playground("tick", {
    sample: "/sounds/tick.mp3",
    sampleGain: 0.5,
    synthGain: 1,
    durationMs: 25,
    debounceMs: 150,
    use: "Design option (dots, eyes, frame) or frame text preset picked.",
  }),
  back: playground("back", {
    sample: "/sounds/back.mp3",
    sampleGain: 0.55,
    synthGain: 1,
    durationMs: 90,
    use: "Undo.",
  }),
  forward: playground("forward", {
    sample: "/sounds/back.mp3",
    steps: [{ at: 0, rate: 1.26 }],
    sampleGain: 0.5,
    synthGain: 1,
    durationMs: 90,
    use: "Redo.",
  }),
  good: playground("good", {
    sample: "/sounds/select.mp3",
    steps: [
      { at: 0, rate: 1 },
      { at: 0.075, rate: 1.5 },
    ],
    sampleGain: 0.55,
    synthGain: 1,
    durationMs: 130,
    use: "Scan check passed (score 75 or more).",
  }),
  low: playground("low", {
    sample: "/sounds/select.mp3",
    steps: [
      { at: 0, rate: 0.84 },
      { at: 0.09, rate: 0.63 },
    ],
    sampleGain: 0.7,
    synthGain: 1,
    durationMs: 170,
    use: "Scan check came back low (under 75).",
  }),
  boo: seasonal("boo", {
    sampleGain: 1,
    synthGain: 0.6,
    durationMs: 250,
    use: "Halloween ghost clicked.",
  }),
  meow: seasonal("meow", {
    sampleGain: 1,
    synthGain: 0.5,
    durationMs: 250,
    use: "Halloween cat clicked.",
  }),
  bat: seasonal("bat", {
    sampleGain: 1,
    synthGain: 0.6,
    durationMs: 230,
    use: "Halloween bat clicked.",
  }),
};

export function isSoundName(value: unknown): value is SoundName {
  return (
    typeof value === "string" &&
    (SOUND_NAMES as readonly string[]).includes(value)
  );
}
