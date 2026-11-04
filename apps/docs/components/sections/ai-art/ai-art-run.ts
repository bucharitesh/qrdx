// One AI art run (one request per variation) as plain state and functions,
// with no React: the /ai/art studio keeps a store of its own, the playground
// keeps one for the session (store/art-session-store.ts) so a run outlives the
// Art panel. use-ai-art-run.ts wires these to the session, credits and toasts.

import { createStore, type StoreApi } from "zustand/vanilla";
import { type MyErrorResponseType, UnauthorizedError } from "@/types/errors";
import {
  type AIArtCredits,
  type AIArtRequest,
  type AIArtResult,
  type AIArtVariant,
  ART_MAX_SEED,
  ART_QR_VISIBILITY,
} from "./config";

/** The images of one run (one request per variation). */
export interface AIArtRun {
  variants: AIArtVariant[];
  /** Variations that failed; no credit was used for them */
  failed: number;
  /** Exactly what the QR code encodes */
  text: string;
  visibility: number;
  creativity: number;
}

/** A failed /api/ai/art response, with its JSON error body. */
export class ArtRequestError extends Error {
  readonly body: MyErrorResponseType;

  constructor(body: MyErrorResponseType) {
    super(body.message ?? "AI art request failed");
    this.name = "ArtRequestError";
    this.body = body;
  }
}

export interface AIArtRunState {
  /** False once the server said AI art isn't set up here (a 503) */
  configured: boolean;
  /** The images of the last run that finished */
  run: AIArtRun | null;
  /**
   * Bumped when a run starts and when results are cleared: a response for an
   * older id is never shown.
   */
  runId: number;
  /** Variations the run in flight will return; 0 when idle */
  pending: number;
  controller: AbortController | null;
}

export const initialAIArtRunState = (configured = true): AIArtRunState => ({
  configured,
  run: null,
  runId: 0,
  pending: 0,
  controller: null,
});

/** A store for one surface's runs (the studio page keeps its own). */
export function createAIArtRunStore(
  configured = true,
): StoreApi<AIArtRunState> {
  return createStore<AIArtRunState>()(() => initialAIArtRunState(configured));
}

/** Why a run came back without images. */
export type AIArtAbortReason = "cancelled" | "cleared";

export type AIArtRunOutcome =
  | { status: "aborted"; reason: AIArtAbortReason }
  | { status: "unauthorized" }
  | {
      status: "failed";
      error: MyErrorResponseType | null;
      credits: AIArtCredits | null;
    }
  | {
      status: "done";
      run: AIArtRun;
      /** The first failed variation's error, when some failed */
      firstError: MyErrorResponseType | null;
      credits: AIArtCredits | null;
    };

export interface AIArtRunDeps {
  /** One image per request, so each response stays small. */
  requestImage: (
    request: AIArtRequest,
    signal: AbortSignal,
  ) => Promise<AIArtResult>;
}

/** Each response counted the credits when it was reserved; the latest count is the highest. */
function latestCredits(done: AIArtResult[]): AIArtCredits | null {
  return (
    done
      .map((item) => item.credits)
      .filter((item): item is AIArtCredits => item !== null)
      .sort((a, b) => b.used - a.used)[0] ?? null
  );
}

const errorBody = (error: unknown): MyErrorResponseType | null =>
  error instanceof ArtRequestError ? error.body : null;

/**
 * Runs one request per seed and records the images in `store`. A run that
 * was cancelled, or whose results were cleared meanwhile (the content
 * changed), leaves the store as it is and says why.
 */
export async function runAIArt(
  store: StoreApi<AIArtRunState>,
  deps: AIArtRunDeps,
  request: AIArtRequest,
  seeds: number[],
): Promise<AIArtRunOutcome> {
  store.getState().controller?.abort("cancelled");
  const controller = new AbortController();
  const id = store.getState().runId + 1;
  store.setState({ runId: id, pending: seeds.length, controller });

  try {
    const outcomes = await Promise.allSettled(
      seeds.map((seed) =>
        deps.requestImage({ ...request, seed }, controller.signal),
      ),
    );
    if (controller.signal.aborted || store.getState().runId !== id) {
      return {
        status: "aborted",
        reason:
          controller.signal.reason === "cleared" ? "cleared" : "cancelled",
      };
    }
    const done = outcomes.flatMap((outcome) =>
      outcome.status === "fulfilled" ? [outcome.value] : [],
    );
    const failures = outcomes.flatMap((outcome) =>
      outcome.status === "rejected" ? [outcome.reason as unknown] : [],
    );
    if (failures.some((error) => error instanceof UnauthorizedError)) {
      return { status: "unauthorized" };
    }

    const credits = latestCredits(done);
    if (done.length === 0) {
      const error = errorBody(failures[0]);
      if (error?.code === "AI_NOT_CONFIGURED") {
        store.setState({ configured: false });
      }
      return { status: "failed", error, credits };
    }

    const [{ text, visibility, creativity }] = done as [AIArtResult];
    const run: AIArtRun = {
      variants: done.map((item) => item.variant),
      failed: failures.length,
      text,
      visibility,
      creativity,
    };
    store.setState({ run });
    return {
      status: "done",
      run,
      firstError: errorBody(failures[0]),
      credits,
    };
  } finally {
    if (store.getState().runId === id) {
      store.setState({ pending: 0, controller: null });
    }
  }
}

/** Stops the run in flight; its images, if any arrive, are never shown. */
export function cancelAIArt(store: StoreApi<AIArtRunState>): void {
  const { controller, runId } = store.getState();
  controller?.abort("cancelled");
  store.setState({ runId: runId + 1, pending: 0, controller: null });
}

/** Forgets the results (and stops a run in flight): the content they encode changed. */
export function clearAIArt(store: StoreApi<AIArtRunState>): void {
  const { controller, runId, run, pending } = store.getState();
  if (!(run || pending || controller)) return;
  controller?.abort("cleared");
  store.setState({ run: null, runId: runId + 1, pending: 0, controller: null });
}

/** "Retry with a clearer code": the same seed and content, QR visibility one step up. */
export function clearerRequest(
  base: AIArtRequest,
  run: AIArtRun,
): AIArtRequest {
  return {
    ...base,
    text: run.text,
    visibility: Math.min(
      ART_QR_VISIBILITY.max,
      run.visibility + ART_QR_VISIBILITY.retryStep,
    ),
    creativity: run.creativity,
  };
}

/** A locked seed from the form, when locking is on and the field holds one. */
export function lockedSeedFor(
  seed: string,
  locked: boolean,
  supported: boolean,
): number | undefined {
  return supported && locked && seed.trim() !== ""
    ? Number(seed.trim())
    : undefined;
}

/** The seed field is on but doesn't hold a usable seed. */
export function seedIsInvalid(
  seed: string,
  locked: boolean,
  supported: boolean,
): boolean {
  if (!(supported && locked)) return false;
  const value = lockedSeedFor(seed, locked, supported);
  return (
    value === undefined ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > ART_MAX_SEED
  );
}

/** Fewer credits left this month than the run would use. */
export function lacksCredits(
  credits: AIArtCredits | null,
  variations: number,
): boolean {
  return (
    credits?.remaining !== null &&
    credits?.remaining !== undefined &&
    credits.remaining < variations
  );
}
