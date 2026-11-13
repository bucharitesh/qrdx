// What the Art tab's AI art form sends: the request built from the form and
// the editor's content, and the intent kept across sign-in (the
// "AI_ART_GENERATE" post-login action), so Generate runs once you're back.

import {
  lockedSeedFor,
  seedIsInvalid,
} from "@/components/sections/ai-art/ai-art-run";
import type { AIArtRequest } from "@/components/sections/ai-art/config";
import {
  ART_PROMPT_MIN_LENGTH,
  ART_TEXT_MAX_LENGTH,
  seedsForRun,
} from "@/components/sections/ai-art/config";
import { findArtLook } from "@/components/sections/ai-art/looks";
import { ART_SUPPORTS_SEED } from "@/lib/ai/art-models";
import type { AIArtDraft } from "@/store/art-session-store";

/** Why the content can't be painted as it is, or null when it can. */
export type ArtPayloadIssue = "empty" | "too-long" | null;

export function artPayloadIssue(payload: string): ArtPayloadIssue {
  const text = payload.trim();
  if (!text) return "empty";
  if (text.length > ART_TEXT_MAX_LENGTH) return "too-long";
  return null;
}

/** A typed prompt is long enough, or blank (one is written for you). */
export const promptIsUsable = (prompt: string): boolean => {
  const length = prompt.trim().length;
  return length === 0 || length >= ART_PROMPT_MIN_LENGTH;
};

/** The form can run: content to paint, a usable prompt and seed. */
export function canGenerate(payload: string, draft: AIArtDraft): boolean {
  return (
    artPayloadIssue(payload) === null &&
    promptIsUsable(draft.prompt) &&
    !seedIsInvalid(draft.seed, draft.seedLocked, ART_SUPPORTS_SEED)
  );
}

/** The /api/ai/art request for the editor's content and the form. */
export function artRequestFor(
  payload: string,
  draft: AIArtDraft,
): AIArtRequest {
  return {
    text: payload.trim(),
    ...(draft.prompt.trim() && { prompt: draft.prompt.trim() }),
    ...(draft.look && { style: draft.look }),
    ...(draft.negativePrompt.trim() && {
      negativePrompt: draft.negativePrompt.trim(),
    }),
    visibility: draft.visibility,
    creativity: draft.creativity,
    ...(draft.reference && { reference: draft.reference }),
  };
}

/** One seed per variation: consecutive from a locked seed, else random. */
export function artSeedsFor(draft: AIArtDraft): number[] {
  return seedsForRun(
    draft.variations,
    lockedSeedFor(draft.seed, draft.seedLocked, ART_SUPPORTS_SEED),
  );
}

/** Kept across sign-in: the content it was for, and the form. */
export interface AIArtGenerateIntent {
  text: string;
  draft: AIArtDraft;
}

export function artGenerateIntent(
  payload: string,
  draft: AIArtDraft,
): AIArtGenerateIntent {
  return { text: payload.trim(), draft };
}

function isDraft(value: unknown): value is AIArtDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Record<string, unknown>;
  return (
    typeof draft.prompt === "string" &&
    typeof draft.negativePrompt === "string" &&
    typeof draft.visibility === "number" &&
    typeof draft.creativity === "number" &&
    typeof draft.variations === "number" &&
    typeof draft.seed === "string" &&
    typeof draft.seedLocked === "boolean" &&
    (draft.presetId === null || typeof draft.presetId === "string") &&
    (draft.reference === null || typeof draft.reference === "string")
  );
}

/** A stored intent's shape (it comes back from localStorage). */
export function parseArtGenerateIntent(
  value: unknown,
): AIArtGenerateIntent | null {
  if (!value || typeof value !== "object") return null;
  const intent = value as Record<string, unknown>;
  if (typeof intent.text !== "string" || !isDraft(intent.draft)) return null;
  return {
    text: intent.text,
    draft: {
      ...intent.draft,
      // Intents saved before looks have none.
      look: findArtLook(intent.draft.look as string | undefined)
        ? (intent.draft.look as AIArtDraft["look"])
        : null,
      referenceIsLogo: intent.draft.referenceIsLogo === true,
    },
  };
}

/**
 * Back from sign-in, Generate runs only for the content it was pressed for;
 * if that changed meanwhile, the form is restored and waits.
 */
export function shouldResumeArt(
  intent: AIArtGenerateIntent,
  payload: string,
): boolean {
  return intent.text === payload.trim() && canGenerate(payload, intent.draft);
}
