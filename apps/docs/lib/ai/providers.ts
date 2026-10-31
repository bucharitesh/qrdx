import "server-only";

import {
  createGoogleGenerativeAI,
  type GoogleGenerativeAIProviderOptions,
} from "@ai-sdk/google";
import { customProvider, type LanguageModel } from "ai";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/error-response";

const google = createGoogleGenerativeAI({
  apiKey: env.GOOGLE_API_KEY,
});

export const isAIConfigured = Boolean(env.GOOGLE_API_KEY);

/** Rejects AI requests with a 503 when no provider key is set. */
export function assertAIConfigured(): void {
  if (!isAIConfigured) {
    throw new HttpError(503, "AI_NOT_CONFIGURED", "AI is not configured");
  }
}

export const baseProviderOptions = {
  google: {
    thinkingConfig: {
      includeThoughts: false,
      thinkingBudget: 128,
    },
  } satisfies GoogleGenerativeAIProviderOptions,
};

type ModelId = "base" | "qr-theme-generation" | "prompt-enhancement";

interface MyProvider {
  languageModel: (id: ModelId) => LanguageModel;
}

export const myProvider: MyProvider = customProvider({
  languageModels: {
    base: google("gemini-2.5-flash"),
    "qr-theme-generation": google("gemini-3-flash-preview"),
    "prompt-enhancement": google("gemini-2.5-flash"),
  },
});
