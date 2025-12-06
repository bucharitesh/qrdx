import "server-only";

import {
  createGoogleGenerativeAI,
  type GoogleGenerativeAIProviderOptions,
} from "@ai-sdk/google";
import { customProvider, type LanguageModel } from "ai";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

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
    "qr-theme-generation": google("gemini-2.5-flash"),
    "prompt-enhancement": google("gemini-2.5-flash"),
  },
});


