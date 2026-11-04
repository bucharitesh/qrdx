// AI art runs (components/sections/ai-art/ai-art-run.ts), shared by the
// /ai/art studio and the playground's Art tab, with mocked /api/ai/art
// responses: no network, no model, no credits. Plus the Art tab's form
// helpers (components/editor/art/ai-art-intent.ts) and its session store.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// The editor store persists to window.localStorage, which Node doesn't have.
vi.hoisted(() => {
  const items = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      clear: () => items.clear(),
      getItem: (key: string) => items.get(key) ?? null,
      removeItem: (key: string) => items.delete(key),
      setItem: (key: string, value: string) => items.set(key, String(value)),
    },
  });
});

// The preset store loads saved themes through a server action.
vi.mock("@/actions/qr-themes", () => ({ getThemes: vi.fn() }));

const {
  ArtRequestError,
  cancelAIArt,
  clearAIArt,
  clearerRequest,
  createAIArtRunStore,
  lacksCredits,
  lockedSeedFor,
  runAIArt,
  seedIsInvalid,
} = await import("@/components/sections/ai-art/ai-art-run");
const { ART_QR_VISIBILITY, ART_TEXT_MAX_LENGTH } = await import(
  "@/components/sections/ai-art/config"
);
const {
  artGenerateIntent,
  artPayloadIssue,
  artRequestFor,
  artSeedsFor,
  canGenerate,
  parseArtGenerateIntent,
  shouldResumeArt,
} = await import("@/components/editor/art/ai-art-intent");
const { DEFAULT_AI_ART_DRAFT, resolveArtMode, useArtSessionStore } =
  await import("@/store/art-session-store");
const { useQREditorStore } = await import("@/store/editor-store");
const { AI_ART_PRESETS } = await import("@/components/sections/ai-art/presets");
const { UnauthorizedError } = await import("@/types/errors");

import type {
  AIArtCredits,
  AIArtRequest,
  AIArtResult,
} from "@/components/sections/ai-art/config";

afterAll(() => {
  vi.unstubAllGlobals();
});

const TEXT = "https://qrdx.dev/q/Ab3dE9x";
const REQUEST: AIArtRequest = {
  text: TEXT,
  prompt: "a zen garden",
  visibility: 50,
  creativity: 45,
};

const credits = (used: number): AIArtCredits => ({
  plan: "free",
  limit: 3,
  used,
  remaining: 3 - used,
  pooled: false,
  resetsAt: "2026-12-01T00:00:00.000Z",
});

/** A /api/ai/art response for one seed. */
const response = (seed: number, used: number): AIArtResult => ({
  variant: {
    imageUrl: `data:image/png;base64,${seed}`,
    width: 1024,
    height: 1024,
    seed,
    blended: false,
    blend: "none",
    blendStrength: 0,
  },
  text: TEXT,
  visibility: 50,
  creativity: 45,
  credits: credits(used),
});

/** Resolves or rejects per seed, recording each request. */
function mockApi(
  outcomes: Record<number, AIArtResult | Error>,
  delay?: Promise<void>,
) {
  const calls: { request: AIArtRequest; signal: AbortSignal }[] = [];
  return {
    calls,
    requestImage: async (request: AIArtRequest, signal: AbortSignal) => {
      calls.push({ request, signal });
      await delay;
      const outcome = outcomes[request.seed ?? -1];
      if (!outcome) throw new Error(`no mock for seed ${request.seed}`);
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
  };
}

describe("a run", () => {
  it("sends one request per seed and keeps every image", async () => {
    const store = createAIArtRunStore();
    const api = mockApi({ 1: response(1, 1), 2: response(2, 2) });
    const running = runAIArt(store, api, REQUEST, [1, 2]);
    expect(store.getState().pending).toBe(2);
    const outcome = await running;

    expect(api.calls.map(({ request }) => request.seed)).toEqual([1, 2]);
    expect(outcome.status).toBe("done");
    if (outcome.status !== "done") return;
    expect(outcome.run.variants.map((variant) => variant.seed)).toEqual([1, 2]);
    expect(outcome.run).toMatchObject({
      failed: 0,
      text: TEXT,
      visibility: 50,
    });
    // The highest count is the latest.
    expect(outcome.credits?.used).toBe(2);
    expect(store.getState()).toMatchObject({
      run: outcome.run,
      pending: 0,
      controller: null,
    });
  });

  it("keeps the images that came back when some variations fail", async () => {
    const store = createAIArtRunStore();
    const api = mockApi({
      1: response(1, 1),
      2: new ArtRequestError({ code: "RATE_LIMITED", message: "Slow down" }),
    });
    const outcome = await runAIArt(store, api, REQUEST, [1, 2]);
    expect(outcome.status).toBe("done");
    if (outcome.status !== "done") return;
    expect(outcome.run.failed).toBe(1);
    expect(outcome.run.variants).toHaveLength(1);
    expect(outcome.firstError?.message).toBe("Slow down");
  });

  it("reports the error when every variation fails, and keeps the last images", async () => {
    const store = createAIArtRunStore();
    await runAIArt(store, mockApi({ 1: response(1, 1) }), REQUEST, [1]);
    const before = store.getState().run;
    const outcome = await runAIArt(
      store,
      mockApi({
        2: new ArtRequestError({
          code: "SUBSCRIPTION_REQUIRED",
          message: "No AI art credits left this month",
        }),
      }),
      REQUEST,
      [2],
    );
    expect(outcome).toMatchObject({
      status: "failed",
      error: { code: "SUBSCRIPTION_REQUIRED" },
    });
    expect(store.getState().run).toBe(before);
    expect(store.getState().pending).toBe(0);
  });

  it("turns AI art off when the server says it isn't set up", async () => {
    const store = createAIArtRunStore();
    await runAIArt(
      store,
      mockApi({
        1: new ArtRequestError({ code: "AI_NOT_CONFIGURED", message: "Off" }),
      }),
      REQUEST,
      [1],
    );
    expect(store.getState().configured).toBe(false);
  });

  it("stops quietly when the session ended", async () => {
    const store = createAIArtRunStore();
    const outcome = await runAIArt(
      store,
      mockApi({ 1: new UnauthorizedError() }),
      REQUEST,
      [1],
    );
    expect(outcome.status).toBe("unauthorized");
    expect(store.getState().run).toBeNull();
  });

  it("drops a cancelled run's images", async () => {
    const store = createAIArtRunStore();
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const api = mockApi({ 1: response(1, 1) }, gate);
    const running = runAIArt(store, api, REQUEST, [1]);
    cancelAIArt(store);
    expect(api.calls[0]?.signal.aborted).toBe(true);
    release();
    expect(await running).toEqual({ status: "aborted", reason: "cancelled" });
    expect(store.getState()).toMatchObject({ run: null, pending: 0 });
  });

  it("drops a run whose content changed meanwhile, and says why", async () => {
    const store = createAIArtRunStore();
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const running = runAIArt(
      store,
      mockApi({ 1: response(1, 1) }, gate),
      REQUEST,
      [1],
    );
    clearAIArt(store);
    release();
    expect(await running).toEqual({ status: "aborted", reason: "cleared" });
    expect(store.getState().run).toBeNull();
  });
});

describe("run helpers", () => {
  it("retries the same content one visibility step clearer", () => {
    const run = {
      variants: [],
      failed: 0,
      text: TEXT,
      visibility: 90,
      creativity: 30,
    };
    expect(clearerRequest({ ...REQUEST, text: "other" }, run)).toMatchObject({
      text: TEXT,
      visibility: ART_QR_VISIBILITY.max,
      creativity: 30,
      prompt: "a zen garden",
    });
  });

  it("reads a locked seed only when locking is on and supported", () => {
    expect(lockedSeedFor("42", true, true)).toBe(42);
    expect(lockedSeedFor("42", false, true)).toBeUndefined();
    expect(lockedSeedFor("42", true, false)).toBeUndefined();
    expect(seedIsInvalid("", true, true)).toBe(true);
    expect(seedIsInvalid("99999999999", true, true)).toBe(true);
    expect(seedIsInvalid("", false, true)).toBe(false);
  });

  it("knows when the month's credits can't cover a run", () => {
    expect(lacksCredits(credits(2), 2)).toBe(true);
    expect(lacksCredits(credits(2), 1)).toBe(false);
    expect(lacksCredits({ ...credits(0), remaining: null }, 4)).toBe(false);
    expect(lacksCredits(null, 4)).toBe(false);
  });
});

describe("the Art tab's AI art form", () => {
  const draft = {
    ...DEFAULT_AI_ART_DRAFT,
    prompt: "  a lighthouse at dusk ",
    negativePrompt: " people ",
    variations: 3,
  };

  it("paints the editor's content, trimmed, and nothing else", () => {
    expect(artRequestFor(` ${TEXT} `, draft)).toEqual({
      text: TEXT,
      prompt: "a lighthouse at dusk",
      negativePrompt: "people",
      visibility: DEFAULT_AI_ART_DRAFT.visibility,
      creativity: DEFAULT_AI_ART_DRAFT.creativity,
    });
    expect(artSeedsFor(draft)).toHaveLength(3);
  });

  it("needs content that fits, and a prompt", () => {
    expect(artPayloadIssue("")).toBe("empty");
    expect(artPayloadIssue("x".repeat(ART_TEXT_MAX_LENGTH + 1))).toBe(
      "too-long",
    );
    expect(artPayloadIssue(TEXT)).toBeNull();
    expect(canGenerate(TEXT, draft)).toBe(true);
    expect(canGenerate(TEXT, { ...draft, prompt: "ab" })).toBe(false);
    expect(canGenerate("", draft)).toBe(false);
  });

  it("resumes after sign-in only for the content Generate was pressed for", () => {
    const stored = JSON.parse(JSON.stringify(artGenerateIntent(TEXT, draft)));
    const intent = parseArtGenerateIntent(stored);
    expect(intent?.draft.prompt).toBe(draft.prompt);
    if (!intent) return;
    expect(shouldResumeArt(intent, TEXT)).toBe(true);
    expect(shouldResumeArt(intent, "https://example.com")).toBe(false);
    expect(parseArtGenerateIntent({ text: TEXT, draft: { prompt: 1 } })).toBe(
      null,
    );
    expect(parseArtGenerateIntent(null)).toBeNull();
  });
});

describe("the Art tab's session", () => {
  beforeEach(() => {
    useQREditorStore.setState({ value: TEXT });
    useArtSessionStore.setState({
      picked: null,
      run: null,
      pending: 0,
      controller: null,
      canvasOpen: false,
      checks: { run: null, results: [] },
      draft: DEFAULT_AI_ART_DRAFT,
    });
  });

  it("shows AI art when picked, else the design's art, else the pick", () => {
    const art = { mode: "logo" as const };
    expect(resolveArtMode("ai", art)).toBe("ai");
    expect(resolveArtMode(null, art)).toBe("logo");
    expect(resolveArtMode("halftone", art)).toBe("logo");
    expect(resolveArtMode("halftone", undefined)).toBe("halftone");
    expect(resolveArtMode(null, undefined)).toBe("off");
  });

  it("fills the prompt from a style preset", () => {
    const preset = AI_ART_PRESETS[0];
    if (!preset) throw new Error("no presets");
    useArtSessionStore.getState().applyStylePreset(preset);
    expect(useArtSessionStore.getState().draft).toMatchObject({
      presetId: preset.id,
      prompt: preset.prompt,
    });
  });

  it("forgets the results as soon as the content changes", async () => {
    await runAIArt(
      useArtSessionStore,
      mockApi({ 1: response(1, 1) }),
      REQUEST,
      [1],
    );
    useArtSessionStore.setState({ canvasOpen: true, selected: 0 });
    expect(useArtSessionStore.getState().run).not.toBeNull();
    useQREditorStore.getState().setValue(TEXT);
    expect(useArtSessionStore.getState().run).not.toBeNull();
    useQREditorStore.getState().setValue("https://example.com");
    expect(useArtSessionStore.getState()).toMatchObject({
      run: null,
      canvasOpen: false,
    });
  });

  it("stops a run in flight when the content changes", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const running = runAIArt(
      useArtSessionStore,
      mockApi({ 1: response(1, 1) }, gate),
      REQUEST,
      [1],
    );
    useQREditorStore.getState().setValue("https://example.com");
    release();
    expect(await running).toEqual({ status: "aborted", reason: "cleared" });
    expect(useArtSessionStore.getState().run).toBeNull();
  });

  it("keeps scan checks per run", async () => {
    await runAIArt(
      useArtSessionStore,
      mockApi({ 1: response(1, 1) }),
      REQUEST,
      [1],
    );
    const { run, setCheck } = useArtSessionStore.getState();
    if (!run) throw new Error("no run");
    setCheck(run, 0, { status: "scannable", score: 88 });
    expect(useArtSessionStore.getState().checks.results[0]?.score).toBe(88);
    const other = { ...run };
    setCheck(other, 0, { status: "unreadable", score: null });
    expect(useArtSessionStore.getState().checks).toEqual({
      run: other,
      results: [{ status: "unreadable", score: null }],
    });
  });
});
