/**
 * Synthesized fallbacks (oscillators, filtered noise, envelopes), all under
 * 250 ms, used while a cue's recorded sample loads or if it fails to load.
 */

import type { SoundName } from "./presets";

export type SynthRecipe = (
  ctx: BaseAudioContext,
  out: AudioNode,
  t: number,
) => void;

const SILENT = 0.0001;

interface Envelope {
  attack: number;
  decay: number;
  gain: number;
}

function envelope(
  ctx: BaseAudioContext,
  out: AudioNode,
  t: number,
  { attack, decay, gain }: Envelope,
): GainNode {
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(gain, t + attack);
  env.gain.exponentialRampToValueAtTime(SILENT, t + attack + decay);
  env.connect(out);
  return env;
}

interface ToneOptions extends Partial<Pick<Envelope, "attack">> {
  type?: OscillatorType;
  freq: number;
  /** Glide target, reached at the end of the note. */
  to?: number;
  decay: number;
  gain: number;
}

export function tone(
  ctx: BaseAudioContext,
  out: AudioNode,
  t: number,
  { type = "sine", freq, to, attack = 0.003, decay, gain }: ToneOptions,
): void {
  const end = t + attack + decay;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, end);
  osc.connect(envelope(ctx, out, t, { attack, decay, gain }));
  osc.start(t);
  osc.stop(end + 0.005);
}

interface NoiseOptions extends Partial<Pick<Envelope, "attack">> {
  filter: BiquadFilterType;
  freq: number;
  to?: number;
  q?: number;
  decay: number;
  gain: number;
}

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(
      1,
      Math.ceil(ctx.sampleRate * 0.3),
      ctx.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buffer);
  }
  return buffer;
}

export function noise(
  ctx: BaseAudioContext,
  out: AudioNode,
  t: number,
  { filter, freq, to, q = 1, attack = 0.001, decay, gain }: NoiseOptions,
): void {
  const end = t + attack + decay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const biquad = ctx.createBiquadFilter();
  biquad.type = filter;
  biquad.Q.value = q;
  biquad.frequency.setValueAtTime(freq, t);
  if (to) biquad.frequency.exponentialRampToValueAtTime(to, end);
  src.connect(biquad).connect(envelope(ctx, out, t, { attack, decay, gain }));
  src.start(t);
  src.stop(end + 0.005);
}

/** A soft bell: fundamental plus a quiet octave partial. */
function chime(
  ctx: BaseAudioContext,
  out: AudioNode,
  t: number,
  freq: number,
  decay: number,
  gain: number,
) {
  tone(ctx, out, t, { freq, attack: 0.004, decay, gain });
  tone(ctx, out, t, {
    freq: freq * 2,
    attack: 0.004,
    decay: decay * 0.45,
    gain: gain * 0.18,
  });
}

export const SYNTH: Record<SoundName, SynthRecipe> = {
  // Crisp tick, then a short upward blip.
  copy: (ctx, out, t) => {
    noise(ctx, out, t, {
      filter: "highpass",
      freq: 5000,
      decay: 0.006,
      gain: 0.2,
    });
    tone(ctx, out, t, { freq: 2600, attack: 0.001, decay: 0.015, gain: 0.12 });
    tone(ctx, out, t + 0.045, {
      freq: 1318.5,
      to: 1568,
      attack: 0.004,
      decay: 0.08,
      gain: 0.24,
    });
  },
  // Soft downward whoosh into a low chime.
  download: (ctx, out, t) => {
    noise(ctx, out, t, {
      filter: "bandpass",
      freq: 1800,
      to: 600,
      q: 1.2,
      attack: 0.05,
      decay: 0.08,
      gain: 0.2,
    });
    chime(ctx, out, t + 0.09, 784, 0.15, 0.22);
  },
  // Two gentle rising notes (G5, D6).
  success: (ctx, out, t) => {
    chime(ctx, out, t, 784, 0.14, 0.24);
    chime(ctx, out, t + 0.08, 1174.7, 0.16, 0.24);
  },
  // Low, muted thud through a lowpass; never a buzzer.
  error: (ctx, out, t) => {
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 700;
    lowpass.connect(out);
    tone(ctx, lowpass, t, {
      freq: 180,
      to: 95,
      attack: 0.004,
      decay: 0.17,
      gain: 0.6,
    });
    tone(ctx, lowpass, t, {
      type: "triangle",
      freq: 140,
      to: 90,
      attack: 0.004,
      decay: 0.12,
      gain: 0.14,
    });
  },
  // Three quick high sparkles over a soft C6.
  "ai-done": (ctx, out, t) => {
    [1568, 2093, 2637].forEach((freq, i) => {
      tone(ctx, out, t + i * 0.035, { freq, decay: 0.15, gain: 0.12 });
    });
    chime(ctx, out, t + 0.06, 1046.5, 0.18, 0.16);
  },
  // Playground family: short sine plucks and soft noise, same register.
  apply: (ctx, out, t) => {
    tone(ctx, out, t, {
      freq: 880,
      to: 820,
      attack: 0.003,
      decay: 0.15,
      gain: 0.3,
    });
  },
  shuffle: (ctx, out, t) => {
    noise(ctx, out, t, {
      filter: "bandpass",
      freq: 2500,
      to: 5000,
      q: 1.5,
      attack: 0.03,
      decay: 0.12,
      gain: 0.25,
    });
  },
  select: (ctx, out, t) => {
    tone(ctx, out, t, {
      freq: 1046.5,
      to: 990,
      attack: 0.002,
      decay: 0.05,
      gain: 0.3,
    });
  },
  tick: (ctx, out, t) => {
    tone(ctx, out, t, { freq: 2400, attack: 0.001, decay: 0.012, gain: 0.15 });
  },
  back: (ctx, out, t) => {
    tone(ctx, out, t, { freq: 1175, attack: 0.002, decay: 0.03, gain: 0.22 });
    tone(ctx, out, t + 0.04, {
      freq: 880,
      attack: 0.002,
      decay: 0.04,
      gain: 0.22,
    });
  },
  forward: (ctx, out, t) => {
    tone(ctx, out, t, { freq: 880, attack: 0.002, decay: 0.03, gain: 0.22 });
    tone(ctx, out, t + 0.04, {
      freq: 1175,
      attack: 0.002,
      decay: 0.04,
      gain: 0.22,
    });
  },
  good: (ctx, out, t) => {
    tone(ctx, out, t, { freq: 1046.5, attack: 0.002, decay: 0.05, gain: 0.28 });
    tone(ctx, out, t + 0.075, {
      freq: 1568,
      attack: 0.002,
      decay: 0.05,
      gain: 0.28,
    });
  },
  low: (ctx, out, t) => {
    tone(ctx, out, t, { freq: 880, attack: 0.002, decay: 0.06, gain: 0.28 });
    tone(ctx, out, t + 0.09, {
      freq: 659,
      attack: 0.002,
      decay: 0.07,
      gain: 0.28,
    });
  },
  // Seasonal characters (synth only).
  boo: (ctx, out, t) => {
    noise(ctx, out, t, {
      filter: "bandpass",
      freq: 320,
      to: 180,
      q: 0.9,
      attack: 0.08,
      decay: 0.16,
      gain: 0.5,
    });
    tone(ctx, out, t, {
      freq: 110,
      to: 82,
      attack: 0.07,
      decay: 0.16,
      gain: 0.14,
    });
  },
  meow: (ctx, out, t) => {
    const formant = ctx.createBiquadFilter();
    formant.type = "bandpass";
    formant.Q.value = 2;
    formant.frequency.setValueAtTime(1200, t);
    formant.frequency.linearRampToValueAtTime(2000, t + 0.07);
    formant.frequency.linearRampToValueAtTime(900, t + 0.22);
    formant.connect(out);
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.linearRampToValueAtTime(900, t + 0.07);
    osc.frequency.linearRampToValueAtTime(520, t + 0.22);
    osc.connect(
      envelope(ctx, formant, t, { attack: 0.03, decay: 0.2, gain: 0.7 }),
    );
    osc.start(t);
    osc.stop(t + 0.24);
  },
  bat: (ctx, out, t) => {
    for (let i = 0; i < 5; i++) {
      noise(ctx, out, t + i * 0.04, {
        filter: "bandpass",
        freq: 1800 - i * 80,
        q: 1.4,
        decay: 0.018,
        gain: 0.3 * (1 - i * 0.12),
      });
    }
  },
  // Christmas: small glass bell.
  "seasonal-bauble": (ctx, out, t) => {
    chime(ctx, out, t, 1760, 0.16, 0.18);
    chime(ctx, out, t + 0.05, 2349.3, 0.12, 0.1);
  },
  // Paper rustle, then a soft bell.
  "seasonal-gift": (ctx, out, t) => {
    noise(ctx, out, t, {
      filter: "bandpass",
      freq: 3200,
      q: 0.8,
      attack: 0.01,
      decay: 0.07,
      gain: 0.18,
    });
    chime(ctx, out, t + 0.07, 1318.5, 0.14, 0.18);
  },
  // Soft snowy puff with a low, round note.
  "seasonal-snowman": (ctx, out, t) => {
    noise(ctx, out, t, {
      filter: "lowpass",
      freq: 900,
      to: 400,
      attack: 0.02,
      decay: 0.12,
      gain: 0.3,
    });
    tone(ctx, out, t + 0.02, { freq: 392, to: 370, decay: 0.15, gain: 0.16 });
  },
  // New Year: a muted cork pop.
  "seasonal-cork": (ctx, out, t) => {
    tone(ctx, out, t, {
      freq: 620,
      to: 180,
      attack: 0.001,
      decay: 0.05,
      gain: 0.4,
    });
    noise(ctx, out, t + 0.03, {
      filter: "highpass",
      freq: 4000,
      attack: 0.01,
      decay: 0.12,
      gain: 0.08,
    });
  },
  // A light upward boop.
  "seasonal-balloon": (ctx, out, t) => {
    tone(ctx, out, t, {
      freq: 520,
      to: 880,
      attack: 0.01,
      decay: 0.12,
      gain: 0.22,
    });
  },
};
