// The model behind each AI task. Every request goes through Vercel AI
// Gateway with AI_GATEWAY_API_KEY (lib/ai/providers.ts), so any provider on
// the gateway can serve a task. Pure, so the routes, the tests and
// scripts/ai/art-eval.ts read the same map.
//
// A provider not yet on the legal pages needs its subprocessor entry first (tests/lib/ai-models.test.ts enforces this).

import type { JSONValue } from "ai";

export type AITextTask = "base" | "qr-theme-generation" | "prompt-enhancement";
export type AITask = AITextTask | "art";

/** Options for one provider, as `providerOptions[name]` takes them. */
export type ProviderOptionValues = Record<string, JSONValue>;

export interface AIModelChoice {
  /** Gateway model id, `creator/model`. */
  model: string;
  /**
   * The gateway providers allowed to serve it (`providerOptions.gateway.only`).
   * Pinned so the Subprocessors page names everyone who can receive the
   * request: without it the gateway may fail over to another cloud (Claude is
   * also served by Amazon Bedrock and Vertex AI). Unset only for the eval's
   * candidates, which never serve users.
   */
  providers?: readonly string[];
}

export interface ArtModelChoice extends AIModelChoice {
  /**
   * How the model returns images: "files" for a multimodal LLM that answers
   * with image files (generateText, Gemini image models), "images" for an
   * image model (generateImage). Both get the control code as an input image.
   */
  output: "files" | "images";
  /** Options for the model's own provider, keyed by its creator. */
  options?: ProviderOptionValues;
  /** generateImage settings, for output "images". */
  size?: `${number}x${number}`;
  aspectRatio?: `${number}:${number}`;
}

/** Google's Gemini API and Vertex AI: both are Google. */
const GOOGLE = ["google", "vertex"] as const;

/**
 * Gemini image models through generateText: image output only, square, 1K
 * (Google's language model options in @ai-sdk/google).
 */
const GEMINI_IMAGE_OPTIONS: ProviderOptionValues = {
  responseModalities: ["IMAGE"],
  imageConfig: { aspectRatio: "1:1", imageSize: "1K" },
};

export const AI_MODELS: { [T in AITextTask]: AIModelChoice } & {
  art: ArtModelChoice;
} = {
  /** The AI theme chat: replies and calls the generateQRTheme tool. */
  base: { model: "anthropic/claude-haiku-5.5", providers: ["anthropic"] },
  /**
   * The theme itself, as structured output. Stays on Gemini: the schema has
   * numeric bounds (size > 0, margin ≥ 0) and #RRGGBB patterns, and Claude's
   * structured outputs don't support numeric bounds.
   */
  "qr-theme-generation": { model: "google/gemini-3-flash", providers: GOOGLE },
  "prompt-enhancement": {
    model: "anthropic/claude-haiku-5.5",
    providers: ["anthropic"],
  },
  art: {
    model: "google/gemini-nano-banana-2.1",
    providers: GOOGLE,
    output: "files",
    options: GEMINI_IMAGE_OPTIONS,
  },
};

/** Text-call options each model creator's provider reads. */
const TEXT_OPTIONS: Record<string, ProviderOptionValues> = {
  // A short reasoning budget: the theme tool streams one small JSON object.
  google: { thinkingConfig: { includeThoughts: false, thinkingBudget: 128 } },
};

/** "anthropic" for "anthropic/claude-haiku-5.5". */
export function creatorOf(model: string): string {
  const slash = model.indexOf("/");
  if (slash <= 0) throw new Error(`Not a gateway model id: ${model}`);
  return model.slice(0, slash);
}

/**
 * Routing rules for every request: only providers that Vercel's agreements
 * keep from training on prompts, and only the pinned providers.
 */
export function gatewayOptions(choice: AIModelChoice): ProviderOptionValues {
  return {
    disallowPromptTraining: true,
    ...(choice.providers ? { only: [...choice.providers] } : {}),
  };
}

/**
 * Provider options for a call to `choice`: the gateway's routing rules, plus
 * `own` under the model creator's key only, so a Google option never reaches
 * Anthropic (the gateway reads provider options by provider name).
 */
export function providerOptionsFor(
  choice: AIModelChoice,
  own?: ProviderOptionValues,
): Record<string, ProviderOptionValues> {
  return {
    gateway: gatewayOptions(choice),
    ...(own ? { [creatorOf(choice.model)]: own } : {}),
  };
}

export function textProviderOptions(
  task: AITextTask,
): Record<string, ProviderOptionValues> {
  const choice = AI_MODELS[task];
  return providerOptionsFor(choice, TEXT_OPTIONS[creatorOf(choice.model)]);
}

export function artProviderOptions(
  choice: ArtModelChoice,
): Record<string, ProviderOptionValues> {
  return providerOptionsFor(choice, choice.options);
}

/**
 * Art models compared by scripts/ai/art-eval.ts: ones the gateway documents
 * as accepting an input image (Vercel's image editing docs, or a model whose
 * gateway modalities list image input). ByteDance Seedream 5.0 Pro is left
 * out: the gateway lists it as text-in only and its editing docs don't
 * name it.
 */
export const ART_EVAL_CANDIDATES: readonly ArtModelChoice[] = [
  AI_MODELS.art,
  {
    model: "google/gemini-3.1-flash-image",
    providers: GOOGLE,
    output: "files",
    options: GEMINI_IMAGE_OPTIONS,
  },
  { model: "openai/gpt-image-2", output: "images", size: "1024x1024" },
  { model: "bfl/flux-kontext-pro", output: "images", aspectRatio: "1:1" },
];
