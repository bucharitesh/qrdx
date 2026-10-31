// Run: cd apps/docs && npx tsx --test lib/sound/sound.test.ts
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  createSoundEngine,
  MASTER_VOLUME,
  MAX_VOICES,
  POINTER_WINDOW_MS,
  type SoundSource,
} from "./engine";
import {
  type PrefsStorage,
  readSoundPrefs,
  SOUND_PREFS_KEY,
  writeSoundPrefs,
} from "./prefs";
import {
  isSoundName,
  MAX_CUE_MS,
  SOUND_GROUPS,
  SOUND_NAMES,
  SOUND_PRESETS,
  type SoundName,
} from "./presets";
import { trimBounds } from "./trim";

// --- A minimal Web Audio fake: records nodes and schedules. ---

class FakeParam {
  value = 0;
  max = 0;
  private track(value: number) {
    this.max = Math.max(this.max, value);
    return this;
  }
  setValueAtTime(value: number) {
    return this.track(value);
  }
  linearRampToValueAtTime(value: number) {
    return this.track(value);
  }
  exponentialRampToValueAtTime(value: number) {
    if (value <= 0) throw new RangeError("exponential ramp to <= 0");
    return this.track(value);
  }
}

class FakeNode {
  connect<T>(destination: T): T {
    return destination;
  }
  disconnect() {}
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
}

class FakeSource extends FakeNode {
  type = "sine";
  buffer: FakeBuffer | null = null;
  frequency = new FakeParam();
  playbackRate = new FakeParam();
  startArgs: number[] = [];
  stopAt = Number.POSITIVE_INFINITY;
  start(...args: number[]) {
    this.startArgs = args;
  }
  stop(t: number) {
    this.stopAt = t;
  }
}

class FakeBuffer {
  private channels: Float32Array[];
  constructor(
    public numberOfChannels: number,
    public length: number,
    public sampleRate: number,
  ) {
    this.channels = Array.from(
      { length: numberOfChannels },
      () => new Float32Array(length),
    );
  }
  getChannelData(i: number) {
    return this.channels[i];
  }
}

class FakeContext {
  currentTime = 0;
  sampleRate = 44100;
  state: "suspended" | "running" = "suspended";
  destination = new FakeNode();
  sources: FakeSource[] = [];
  gains: FakeGain[] = [];
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
  suspend() {
    this.state = "suspended";
    return Promise.resolve();
  }
  createGain() {
    const node = new FakeGain();
    this.gains.push(node);
    return node;
  }
  createOscillator() {
    const node = new FakeSource();
    this.sources.push(node);
    return node;
  }
  createBufferSource() {
    return this.createOscillator();
  }
  createBiquadFilter() {
    return Object.assign(new FakeNode(), {
      type: "lowpass",
      frequency: new FakeParam(),
      Q: new FakeParam(),
    });
  }
  createDynamicsCompressor() {
    return Object.assign(new FakeNode(), {
      threshold: new FakeParam(),
      knee: new FakeParam(),
      ratio: new FakeParam(),
    });
  }
  createBuffer(channels: number, length: number, rate: number) {
    return new FakeBuffer(channels, length, rate);
  }
  /** "Decodes" to 100 ms of silence, then a 400 ms tone (longer than a cue). */
  decodeAudioData(_data: ArrayBuffer, ok: (buffer: FakeBuffer) => void) {
    const rate = this.sampleRate;
    const buffer = new FakeBuffer(1, Math.round(rate * 0.6), rate);
    const data = buffer.getChannelData(0);
    for (let i = rate * 0.1; i < rate * 0.5; i++) data[i] = 0.5;
    ok(buffer);
  }
}

function memoryStorage(): PrefsStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

function setup({ storage = memoryStorage(), samples = false } = {}) {
  let clock = 1000;
  const contexts: FakeContext[] = [];
  const played: { name: SoundName; source: SoundSource }[] = [];
  const fetched: string[] = [];
  const engine = createSoundEngine({
    createContext: () => {
      const ctx = new FakeContext();
      contexts.push(ctx);
      return ctx as unknown as AudioContext;
    },
    fetchSample: (url) => {
      fetched.push(url);
      return samples
        ? Promise.resolve(new ArrayBuffer(8))
        : Promise.reject(new Error("offline"));
    },
    storage: () => storage,
    now: () => clock,
    onPlay: (name, source) => played.push({ name, source }),
  });
  return {
    engine,
    contexts,
    played,
    fetched,
    storage,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

/** Armed and past the first gesture. */
function ready(options?: Parameters<typeof setup>[0]) {
  const env = setup(options);
  env.engine.arm();
  env.engine.unlock();
  return env;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("cue allowlist", () => {
  it("is the ui, playground and seasonal groups", () => {
    assert.deepEqual(SOUND_GROUPS.ui, [
      "copy",
      "download",
      "success",
      "error",
      "ai-done",
    ]);
    assert.deepEqual(SOUND_GROUPS.seasonal, [
      "boo",
      "meow",
      "bat",
      "seasonal-bauble",
      "seasonal-gift",
      "seasonal-snowman",
      "seasonal-cork",
      "seasonal-balloon",
    ]);
    assert.equal(new Set(SOUND_NAMES).size, SOUND_NAMES.length);
    for (const group of Object.keys(
      SOUND_GROUPS,
    ) as (keyof typeof SOUND_GROUPS)[]) {
      for (const name of SOUND_GROUPS[group]) {
        assert.equal(SOUND_PRESETS[name].group, group, name);
      }
    }
  });

  it("ignores every other name, whoever emits it", () => {
    const { engine, played } = ready();
    for (const name of [
      "tap",
      "hover-tick",
      "open",
      "close",
      "toggle-on",
      "notify",
      "scan",
      "ai-start",
      "creak",
      "pop",
      "",
    ]) {
      assert.equal(engine.play(name), false, name);
    }
    assert.equal(played.length, 0);
    assert.ok(!isSoundName("hover-tick"));
  });

  it("keeps cues short, soft and throttled", () => {
    assert.equal(MASTER_VOLUME, 0.35);
    assert.equal(MAX_VOICES, 2);
    for (const name of SOUND_NAMES) {
      const preset = SOUND_PRESETS[name];
      assert.ok(preset.durationMs <= MAX_CUE_MS, name);
      assert.ok(preset.sampleGain > 0 && preset.sampleGain <= 1, name);
      assert.ok(preset.synthGain > 0 && preset.synthGain <= 2, name);
      const expected =
        name === "tick" ? 150 : preset.group === "seasonal" ? 1000 : 400;
      assert.equal(preset.debounceMs, expected, name);
      assert.equal(preset.pointerOnly, preset.group === "seasonal", name);
      for (const step of preset.steps ?? []) {
        assert.ok(step.at >= 0 && step.at < MAX_CUE_MS / 1000, name);
        assert.ok(step.rate >= 0.5 && step.rate <= 2, name);
      }
    }
    for (const name of SOUND_GROUPS.seasonal) {
      assert.ok(
        SOUND_PRESETS[name].synthGain < SOUND_PRESETS.copy.synthGain,
        name,
      );
    }
  });

  it("ships exactly the sample files the cues use", () => {
    const dir = join(process.cwd(), "public", "sounds");
    const expected = [
      ...new Set(
        SOUND_NAMES.flatMap((name) => SOUND_PRESETS[name].sample ?? []),
      ),
    ]
      .map((url) => url.replace("/sounds/", ""))
      .sort();
    assert.deepEqual(readdirSync(dir).sort(), expected);
    for (const file of expected) assert.ok(existsSync(join(dir, file)));
  });

  for (const name of SOUND_NAMES) {
    it(`synth "${name}" ends within its length and below full scale`, () => {
      const ctx = new FakeContext();
      SOUND_PRESETS[name].synth(
        ctx as unknown as BaseAudioContext,
        ctx.createGain() as unknown as AudioNode,
        0,
      );
      assert.ok(ctx.sources.length > 0);
      for (const source of ctx.sources) {
        assert.ok(
          source.stopAt <= SOUND_PRESETS[name].durationMs / 1000 + 0.01,
          `${name} stops at ${source.stopAt}`,
        );
      }
      for (const gain of ctx.gains) assert.ok(gain.gain.max <= 1, name);
    });
  }
});

describe("engine gating", () => {
  it("creates no AudioContext and plays nothing before a user gesture", () => {
    const { engine, contexts } = setup();
    engine.arm();
    assert.equal(engine.play("copy"), false);
    assert.equal(contexts.length, 0);
  });

  it("stays silent while no provider is mounted (customer pages)", () => {
    const { engine, contexts } = setup();
    assert.equal(engine.unlock(true), false);
    assert.equal(engine.play("copy"), false);
    assert.equal(contexts.length, 0);
  });

  it("plays after a gesture and stops once disarmed", () => {
    const { engine, contexts, played, advance } = setup();
    const disarm = engine.arm();
    assert.equal(engine.unlock(), true);
    assert.equal(engine.play("copy"), true);
    assert.equal(contexts.length, 1);
    assert.deepEqual(played, [{ name: "copy", source: "synth" }]);
    disarm();
    advance(1000);
    assert.equal(engine.play("copy"), false);
  });

  it("pauses while the tab is hidden", () => {
    const { engine } = ready();
    engine.setHidden(true);
    assert.equal(engine.play("success"), false);
    engine.setHidden(false);
    assert.equal(engine.play("success"), true);
  });

  it("plays seasonal cues only right after a click or tap", () => {
    const { engine, advance } = ready();
    assert.equal(engine.play("boo"), false, "keyboard or ambient");
    engine.unlock(true);
    assert.equal(engine.play("boo"), true);
    advance(POINTER_WINDOW_MS + 500);
    engine.unlock(false);
    assert.equal(engine.play("meow"), false, "too long after the click");
    engine.unlock(true);
    assert.equal(engine.play("meow"), true);
  });
});

describe("throttling", () => {
  it("plays the same cue at most once per 400 ms", () => {
    const { engine, advance } = ready();
    assert.equal(engine.play("copy"), true);
    advance(399);
    assert.equal(engine.play("copy"), false);
    advance(1);
    assert.equal(engine.play("copy"), true);
  });

  it("lets the option tick through every 150 ms", () => {
    const { engine, advance } = ready();
    assert.equal(engine.play("tick"), true);
    advance(100);
    assert.equal(engine.play("tick"), false);
    advance(50);
    assert.equal(engine.play("tick"), true);
  });

  it("never sounds more than two cues at once", () => {
    const { engine, advance } = ready();
    assert.equal(engine.play("download"), true);
    assert.equal(engine.play("apply"), true);
    assert.equal(engine.play("error"), false);
    advance(SOUND_PRESETS.download.durationMs);
    assert.equal(engine.play("error"), true);
  });

  it("limits a seasonal cue to once a second", () => {
    const { engine, advance } = ready();
    engine.unlock(true);
    assert.equal(engine.play("bat"), true);
    advance(500);
    engine.unlock(true);
    assert.equal(engine.play("bat"), false);
    advance(500);
    engine.unlock(true);
    assert.equal(engine.play("bat"), true);
  });
});

describe("samples", () => {
  it("load each file once after the gesture, even when cues share it", async () => {
    const { engine, fetched } = ready({ samples: true });
    await settle();
    assert.equal(new Set(fetched).size, fetched.length);
    assert.ok(fetched.includes("/sounds/select.mp3"));
    assert.equal(engine.sampleStatus().good, "ready");
    assert.equal(engine.sampleStatus().boo, undefined);
  });

  it("start on the first audible sample and fade out at 250 ms", async () => {
    const { engine, contexts, played } = ready({ samples: true });
    await settle();
    assert.equal(engine.play("success"), true);
    assert.equal(played.at(-1)?.source, "sample");
    const [, offset, duration] = contexts[0].sources.at(-1)?.startArgs ?? [];
    assert.ok(Math.abs(offset - 0.097) < 0.001, `offset ${offset}`);
    assert.ok(Math.abs(duration - MAX_CUE_MS / 1000) < 1e-9, `${duration}`);
    assert.equal(
      contexts[0].gains.at(-1)?.gain.max,
      SOUND_PRESETS.success.sampleGain,
    );
  });

  it("play multi-step cues as pitched copies of one sample", async () => {
    const { engine, contexts } = ready({ samples: true });
    await settle();
    const before = contexts[0].sources.length;
    assert.equal(engine.play("good"), true);
    const steps = contexts[0].sources.slice(before);
    assert.deepEqual(
      steps.map((source) => source.playbackRate.value),
      SOUND_PRESETS.good.steps?.map((step) => step.rate),
    );
    assert.deepEqual(
      steps.map((source) => source.startArgs[0]),
      SOUND_PRESETS.good.steps?.map((step) => step.at),
    );
  });

  it("fall back to synth when loading fails", async () => {
    const { engine, played } = ready();
    await settle();
    assert.equal(engine.sampleStatus().copy, "failed");
    engine.play("copy");
    assert.equal(played.at(-1)?.source, "synth");
  });
});

describe("deferred page cues", () => {
  it("wait for the first gesture after a redirect, then play once", () => {
    const { engine, played } = setup();
    engine.arm();
    engine.playOnGesture("success");
    assert.equal(played.length, 0);
    engine.unlock(true);
    assert.deepEqual(
      played.map((entry) => entry.name),
      ["success"],
    );
    engine.unlock(true);
    assert.equal(played.length, 1);
  });

  it("expire if the visitor does nothing for a while", () => {
    const { engine, played, advance } = setup();
    engine.arm();
    engine.playOnGesture("success", 1000);
    advance(1500);
    engine.unlock(true);
    assert.equal(played.length, 0);
  });

  it("play at once when audio is already unlocked", () => {
    const { engine, played } = ready();
    engine.playOnGesture("success");
    assert.equal(played.at(-1)?.name, "success");
  });
});

describe("mute", () => {
  it("is off by default for everyone", () => {
    assert.equal(readSoundPrefs(null).muted, false);
    assert.equal(setup().engine.isMuted(), false);
  });

  it("persists and is restored in a new session", () => {
    const first = ready();
    first.engine.setMuted(true);
    assert.equal(first.engine.play("copy"), false);
    assert.deepEqual(
      JSON.parse(first.storage.data.get(SOUND_PREFS_KEY) ?? ""),
      { muted: true },
    );
    const second = setup({ storage: first.storage });
    assert.equal(second.engine.isMuted(), true);
  });

  it("creates no AudioContext while muted", () => {
    const storage = memoryStorage();
    writeSoundPrefs(storage, { muted: true });
    const { engine, contexts } = setup({ storage });
    engine.arm();
    engine.unlock(true);
    assert.equal(engine.play("copy"), false);
    assert.equal(contexts.length, 0);
  });

  it("notifies subscribers", () => {
    const { engine } = setup();
    let calls = 0;
    const unsubscribe = engine.subscribe(() => calls++);
    engine.setMuted(true);
    unsubscribe();
    engine.setMuted(false);
    assert.equal(calls, 1);
  });

  it("survives broken or blocked storage", () => {
    const throwing: PrefsStorage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    assert.deepEqual(readSoundPrefs(throwing), { muted: false });
    assert.doesNotThrow(() => writeSoundPrefs(throwing, { muted: true }));
    const garbage = memoryStorage();
    garbage.setItem(SOUND_PREFS_KEY, "{not json");
    assert.deepEqual(readSoundPrefs(garbage), { muted: false });
  });
});

describe("trimBounds", () => {
  it("skips leading silence with a short pre-roll and keeps the tail", () => {
    const data = new Float32Array(500);
    for (let i = 100; i < 200; i++) data[i] = 1;
    const { offset, duration } = trimBounds([data], 1000);
    assert.ok(Math.abs(offset - 0.097) < 1e-9);
    assert.ok(Math.abs(duration - (0.199 + 0.005 - 0.097)) < 1e-9);
  });

  it("returns the whole clip when it is silent", () => {
    assert.deepEqual(trimBounds([new Float32Array(100)], 1000), {
      offset: 0,
      duration: 0.1,
    });
  });
});
