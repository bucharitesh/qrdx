import "server-only";

import { generateText } from "ai";
import { z } from "zod";
import { destinationUrlSchema } from "@/app/dashboard/codes/_lib/qr-codes";
import { assertBindableDomains } from "@/app/dashboard/domains/_lib/domains";
import { textProviderOptions } from "@/lib/ai/models";
import { assertAIConfigured, languageModel } from "@/lib/ai/providers";
import { HttpError } from "@/lib/error-response";
import { baseUrl } from "@/lib/metadata";
import { cheapestPlanWith, getPlanForScope, getPlanLimits } from "@/lib/plans";
import { PLAN_NAMES } from "@/lib/pricing";
import type { ActiveScope } from "@/lib/scope";
import { SHORT_LINK_BASE, slugProblem } from "@/lib/short-links";
import { findTakenSlugs } from "@/lib/slug-claims";
import { fetchPageTitle } from "./page-title";
import {
  parseSuggestReply,
  pickTags,
  SLUG_SUGGESTIONS,
  SUGGEST_INSTRUCTIONS,
  suggestPrompt,
} from "./prompt";

// "Suggest" next to the builder's back-half and tags fields (the Dub
// study's gap 11, after Dub's AI key and tag suggestions; the flow, not the
// code). One short call to the small text model through the AI Gateway;
// every back-half it proposes passes the same rules and uniqueness check
// as one typed by hand, and only free ones come back.

export const suggestInputSchema = z.object({
  destination: z.string().max(4096),
  domainId: z.string().trim().min(1).max(64).nullish(),
  codeId: z.string().trim().min(1).max(64).nullish(),
  /** The workspace's tag names (reused when one fits) */
  existingTags: z.array(z.string().max(64)).max(200).default([]),
  /** Tags the code already has (never suggested again) */
  currentTags: z.array(z.string().max(64)).max(50).default([]),
});

export type SuggestInput = z.input<typeof suggestInputSchema>;

export interface CodeSuggestions {
  /** Free back-halves for this code's domain, at most SLUG_SUGGESTIONS */
  slugs: string[];
  /** Tag names: existing ones in their own spelling, or new ones */
  tags: string[];
}

export interface ModelReply {
  text: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface SuggestDeps {
  /** The model call (tests pass a fake reply). */
  generate?: (prompt: string) => Promise<ModelReply>;
  fetchTitle?: (url: URL) => Promise<string | null>;
  takenSlugs?: typeof findTakenSlugs;
}

const OWN_HOSTS = new Set(
  [new URL(SHORT_LINK_BASE).hostname, baseUrl.hostname].map((host) =>
    host.toLowerCase(),
  ),
);

async function callModel(prompt: string): Promise<ModelReply> {
  const result = await generateText({
    model: languageModel("code-suggestions"),
    instructions: SUGGEST_INSTRUCTIONS,
    prompt,
    // Two short lines; anything longer is cut, never paid for. Without
    // `reasoning: "none"` the model spends the whole budget thinking and
    // replies with nothing (seen on the first real call, 2026-11-05).
    maxOutputTokens: 80,
    reasoning: "none",
    maxRetries: 1,
    providerOptions: textProviderOptions("code-suggestions"),
    abortSignal: AbortSignal.timeout(10_000),
  });
  return { text: result.text, usage: result.usage };
}

function planRequired(): HttpError {
  const plan = cheapestPlanWith((limits) => limits.customSlugs);
  return new HttpError(
    402,
    "PLAN_REQUIRED",
    `Suggestions come with custom back-halves, ${plan ? `part of ${PLAN_NAMES[plan]}` : "which your plan doesn't include"}.`,
  );
}

/**
 * Three free back-halves and up to three tags for `destination`. Needs AI on
 * the server and a plan with custom back-halves; rate limits are the
 * caller's (actions/code-suggestions.ts).
 */
export async function suggestCodeDetails(
  scope: ActiveScope,
  raw: SuggestInput,
  {
    generate = callModel,
    fetchTitle = fetchPageTitle,
    takenSlugs = findTakenSlugs,
  }: SuggestDeps = {},
): Promise<CodeSuggestions> {
  assertAIConfigured();
  const parsedInput = suggestInputSchema.safeParse(raw);
  if (!parsedInput.success) {
    throw new HttpError(400, "VALIDATION_ERROR", "Invalid request.");
  }
  const input = parsedInput.data;
  const destination = destinationUrlSchema.safeParse(input.destination);
  if (!destination.success) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Enter the destination URL first.",
    );
  }
  const url = new URL(destination.data);

  if (!getPlanLimits(await getPlanForScope(scope)).customSlugs) {
    throw planRequired();
  }
  const domainId = input.domainId ?? null;
  if (domainId) await assertBindableDomains(scope, [domainId]);

  const title = OWN_HOSTS.has(url.hostname.toLowerCase())
    ? null
    : await fetchTitle(url);
  const reply = await generate(
    suggestPrompt({ url, title, existingTags: input.existingTags }),
  );
  console.info(
    JSON.stringify({
      event: "ai.code_suggestions",
      inputTokens: reply.usage?.inputTokens ?? null,
      outputTokens: reply.usage?.outputTokens ?? null,
      titled: Boolean(title),
    }),
  );
  const parsed = parseSuggestReply(reply.text);

  const onCustomDomain = Boolean(domainId);
  const allowed = parsed.slugs.filter(
    (slug) => !slugProblem(slug, { onCustomDomain }),
  );
  const taken = allowed.length
    ? await takenSlugs(allowed, domainId, {
        exceptCodeId: input.codeId ?? undefined,
      })
    : new Set<string>();

  return {
    slugs: allowed
      .filter((slug) => !taken.has(slug))
      .slice(0, SLUG_SUGGESTIONS),
    tags: pickTags(parsed.tags, input.existingTags, input.currentTags),
  };
}
