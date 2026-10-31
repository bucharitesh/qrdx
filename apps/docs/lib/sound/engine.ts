import {
  type PrefsStorage,
  readSoundPrefs,
  type SoundPrefs,
  writeSoundPrefs,
} from "./prefs";
import {
  isSoundName,
  MAX_CUE_MS,
  SOUND_NAMES,
  SOUND_PRESETS,
  type SoundName,
} from "./presets";
import { type TrimBounds, trimBounds } from "./trim";

/** Low by default: cues sit well under the page's own media. */
export const MASTER_VOLUME = 0.35;
/** At most two cues sound together; a third requested meanwhile is dropped. */
export const MAX_VOICES = 2;
/** Pointer-only cues (seasonal) need a click / tap / release this recent. */
export const POINTER_WINDOW_MS = 600;
/** A context still waking up may take cues for this long. */
const RESUME_GRACE_MS = 500;
const FADE_S = 0.03;

export type SoundSource = "sample" | "synth";

export interface SoundEngineOptions {
  createContext?: () => AudioContext | null;
  fetchSample?: (url: string) => Promise<ArrayBuffer>;
  storage?: () => PrefsStorage | null;
  now?: () => number;
  masterVolume?: number;
  maxVoices?: number;
  onPlay?: (name: SoundName, source: SoundSource) => void;
}

type SampleState =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; buffer: AudioBuffer; bounds: TrimBounds };

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

function browserContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
  return Ctor ? new Ctor({ latencyHint: "interactive" }) : null;
}

async function browserFetch(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Sound ${url}: ${response.status}`);
  return response.arrayBuffer();
}

function browserStorage(): PrefsStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function decode(
  ctx: BaseAudioContext,
  data: ArrayBuffer,
): Promise<AudioBuffer> {
  // Older Safari only supports the callback form.
  return new Promise((resolve, reject) => {
    const result = ctx.decodeAudioData(data, resolve, reject);
    if (result && typeof result.then === "function")
      result.then(resolve, reject);
  });
}

export function createSoundEngine(options: SoundEngineOptions = {}) {
  const createContext = options.createContext ?? browserContext;
  const fetchSample = options.fetchSample ?? browserFetch;
  const storage = options.storage ?? browserStorage;
  const now = options.now ?? (() => performance.now());
  const masterVolume = options.masterVolume ?? MASTER_VOLUME;
  const maxVoices = options.maxVoices ?? MAX_VOICES;

  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let armed = 0;
  let gestured = false;
  let lastPointerAt = Number.NEGATIVE_INFINITY;
  let hidden = false;
  let resumeRequestedAt = Number.NEGATIVE_INFINITY;
  let prefs: SoundPrefs | null = null;
  let pending: { name: SoundName; until: number } | null = null;
  let voices: number[] = [];
  const lastPlayed = new Map<SoundName, number>();
  /** Decoded samples by URL (several cues share one file). */
  const samples = new Map<string, SampleState>();
  const listeners = new Set<() => void>();

  function getPrefs(): SoundPrefs {
    prefs ??= readSoundPrefs(storage());
    return prefs;
  }

  function notify() {
    for (const listener of listeners) listener();
  }

  function resume(context: AudioContext) {
    if (context.state === "running") return;
    resumeRequestedAt = now();
    context.resume().catch(() => {});
  }

  function suspend() {
    if (ctx?.state === "running") ctx.suspend().catch(() => {});
  }

  async function loadSample(context: AudioContext, url: string) {
    samples.set(url, { status: "loading" });
    try {
      const buffer = await decode(context, await fetchSample(url));
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
        buffer.getChannelData(i),
      );
      samples.set(url, {
        status: "ready",
        buffer,
        bounds: trimBounds(channels, buffer.sampleRate),
      });
    } catch {
      samples.set(url, { status: "failed" });
    }
  }

  /** Created lazily, and only after a user gesture on a page that allows sound. */
  function ensureContext(): AudioContext | null {
    if (ctx || !armed || !gestured) return ctx;
    try {
      ctx = createContext();
    } catch {
      ctx = null;
    }
    if (!ctx) return null;
    master = ctx.createGain();
    master.gain.value = masterVolume;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    master.connect(limiter).connect(ctx.destination);
    // iOS only unlocks output once something starts inside the gesture.
    const prime = ctx.createBufferSource();
    prime.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    prime.connect(ctx.destination);
    prime.start();
    const urls = new Set(SOUND_NAMES.map((name) => SOUND_PRESETS[name].sample));
    for (const url of urls) if (url) void loadSample(ctx, url);
    return ctx;
  }

  /** Builds one voice into `destination`; shared by playback and measuring. */
  function voice(
    context: BaseAudioContext,
    destination: AudioNode,
    name: SoundName,
    prefer: SoundSource = "sample",
  ): { durationMs: number; source: SoundSource; disconnect: () => void } {
    const preset = SOUND_PRESETS[name];
    const node = context.createGain();
    node.connect(destination);
    const disconnect = () => node.disconnect();
    const t = context.currentTime;
    const sample = preset.sample ? samples.get(preset.sample) : undefined;
    if (prefer === "sample" && sample?.status === "ready") {
      const max = MAX_CUE_MS / 1000;
      let end = 0;
      let capped = false;
      node.gain.setValueAtTime(preset.sampleGain, t);
      for (const { at, rate } of preset.steps ?? [{ at: 0, rate: 1 }]) {
        // Buffer seconds that fit before the cap at this playback rate.
        const length = Math.min(sample.bounds.duration, (max - at) * rate);
        if (length <= 0) continue;
        capped ||= length < sample.bounds.duration;
        end = Math.max(end, at + length / rate);
        const src = context.createBufferSource();
        src.buffer = sample.buffer;
        src.playbackRate.value = rate;
        src.connect(node);
        src.start(t + at, sample.bounds.offset, length);
      }
      if (capped) {
        node.gain.setValueAtTime(preset.sampleGain, t + end - FADE_S);
        node.gain.linearRampToValueAtTime(0, t + end);
      }
      return { durationMs: end * 1000, source: "sample", disconnect };
    }
    node.gain.value = preset.synthGain;
    preset.synth(context, node, t);
    return { durationMs: preset.durationMs, source: "synth", disconnect };
  }

  /** Plays an allowlisted cue; anything else, or any rule broken, is a no-op. */
  function play(name: string): boolean {
    if (!isSoundName(name)) return false;
    const preset = SOUND_PRESETS[name];
    if (!armed || !gestured || hidden || getPrefs().muted) return false;
    const at = now();
    if (preset.pointerOnly && at - lastPointerAt > POINTER_WINDOW_MS) {
      return false;
    }
    const last = lastPlayed.get(name);
    if (last !== undefined && at - last < preset.debounceMs) return false;
    voices = voices.filter((end) => end > at);
    if (voices.length >= maxVoices) return false;
    const context = ensureContext();
    if (!context || !master) return false;
    if (context.state !== "running") {
      resume(context);
      if (at - resumeRequestedAt > RESUME_GRACE_MS) return false;
    }
    lastPlayed.set(name, at);
    const built = voice(context, master, name);
    voices.push(at + built.durationMs);
    setTimeout(built.disconnect, built.durationMs + 250);
    options.onPlay?.(name, built.source);
    return true;
  }

  return {
    play,
    /**
     * Call from trusted user-gesture handlers (no sound plays here); nothing
     * plays before the first one. `pointer` marks a click, tap or release.
     */
    unlock(pointer = false): boolean {
      if (!armed) return false;
      gestured = true;
      if (pointer) lastPointerAt = now();
      if (getPrefs().muted || hidden) return false;
      const context = ensureContext();
      if (context) resume(context);
      const queued = pending;
      pending = null;
      if (queued && now() <= queued.until) play(queued.name);
      return Boolean(context);
    },
    /**
     * For a page reached by a full redirect (e.g. back from checkout), where
     * the browser allows no audio yet: plays now if it can, else on the first
     * gesture within `withinMs`. Never before a gesture.
     */
    playOnGesture(name: SoundName, withinMs = 10_000): void {
      if (gestured) {
        play(name);
        return;
      }
      pending = { name, until: now() + withinMs };
    },
    /** Cues only play while a SoundProvider is mounted (never on customer pages). */
    arm(): () => void {
      armed++;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        armed--;
        if (!armed) suspend();
      };
    },
    setHidden(value: boolean) {
      hidden = value;
      if (value) suspend();
      else if (ctx && armed && !getPrefs().muted) resume(ctx);
    },
    isMuted: () => getPrefs().muted,
    setMuted(muted: boolean) {
      prefs = { ...getPrefs(), muted };
      writeSoundPrefs(storage(), prefs);
      notify();
      if (muted) suspend();
    },
    /** Re-reads stored prefs (another tab changed them). */
    reloadPrefs() {
      prefs = null;
      notify();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Which cues have their sample decoded; the rest play synthesized. */
    sampleStatus(): Partial<Record<SoundName, SampleState["status"]>> {
      const status: Partial<Record<SoundName, SampleState["status"]>> = {};
      for (const name of SOUND_NAMES) {
        const url = SOUND_PRESETS[name].sample;
        const state = url ? samples.get(url) : undefined;
        if (state) status[name] = state.status;
      }
      return status;
    },
    /**
     * Diagnostic: renders a cue offline (before the master volume) and returns
     * its length, peak and loudest 50 ms RMS in dBFS, for levelling cues.
     */
    async measure(
      name: SoundName,
      prefer: SoundSource = "sample",
    ): Promise<{
      source: SoundSource;
      durationMs: number;
      peakDb: number;
      rms50Db: number;
    }> {
      const rate = 44100;
      const offline = new OfflineAudioContext(1, Math.ceil(rate * 0.5), rate);
      const { source, durationMs } = voice(
        offline,
        offline.destination,
        name,
        prefer,
      );
      const data = (await offline.startRendering()).getChannelData(0);
      const win = Math.round(rate * 0.05);
      let peak = 0;
      let rms = 0;
      for (let i = 0; i < data.length; i++)
        peak = Math.max(peak, Math.abs(data[i]));
      for (let i = 0; i + win <= data.length; i += Math.round(win / 4)) {
        let sum = 0;
        for (let j = i; j < i + win; j++) sum += data[j] * data[j];
        rms = Math.max(rms, Math.sqrt(sum / win));
      }
      const db = (v: number) =>
        Math.round(20 * Math.log10(Math.max(v, 1e-6)) * 10) / 10;
      return {
        source,
        durationMs: Math.round(durationMs),
        peakDb: db(peak),
        rms50Db: db(rms),
      };
    },
  };
}

export type SoundEngine = ReturnType<typeof createSoundEngine>;

export const soundEngine: SoundEngine = createSoundEngine({
  // Dev aid: listen for "qrdx:sound-played" to see what played and from where.
  onPlay:
    process.env.NODE_ENV === "production"
      ? undefined
      : (name, source) =>
          window.dispatchEvent(
            new CustomEvent("qrdx:sound-played", { detail: { name, source } }),
          ),
});
