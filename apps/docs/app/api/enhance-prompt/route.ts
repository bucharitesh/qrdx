import { smoothStream, streamText } from "ai";
import type { NextRequest } from "next/server";
import { ENHANCE_PROMPT_SYSTEM } from "@/lib/ai/prompts";
import {
  assertAIConfigured,
  baseProviderOptions,
  myProvider,
} from "@/lib/ai/providers";
import { streamErrorMessage } from "@/lib/ai/stream-error-message";
import { MAX_AI_REQUEST_BODY_BYTES } from "@/lib/constants";
import { handleError } from "@/lib/error-response";
import {
  enforceAIRateLimit,
  parseWithSchema,
  readJsonBody,
} from "@/lib/request-guards";
import { getCurrentUserId, logError } from "@/lib/shared";
import {
  finalizeAIRequest,
  releaseAIRequest,
  reserveAIRequest,
} from "@/lib/subscription";
import { enhancePromptRequestSchema } from "@/lib/validations/ai";
import type { AIPromptData } from "@/types/ai";
import { ValidationError } from "@/types/errors";
import { buildUserContentPartsFromPromptData } from "@/utils/ai/message-converter";

export async function POST(req: NextRequest) {
  try {
    const userId = await getCurrentUserId(req);
    assertAIConfigured();
    await enforceAIRateLimit(req, "enhance-prompt", userId);

    const { promptData } = parseWithSchema(
      enhancePromptRequestSchema,
      await readJsonBody(req, MAX_AI_REQUEST_BODY_BYTES),
    );
    const userContentParts = buildUserContentPartsFromPromptData(
      promptData as AIPromptData,
    );
    if (userContentParts.length === 0) {
      throw new ValidationError("Prompt is empty");
    }

    const model = myProvider.languageModel("prompt-enhancement");
    const usageId = await reserveAIRequest(
      userId,
      typeof model === "string" ? model : model.modelId,
    );

    const result = streamText({
      system: ENHANCE_PROMPT_SYSTEM,
      messages: [
        {
          role: "user",
          content: userContentParts,
        },
      ],
      model,
      providerOptions: baseProviderOptions,
      experimental_transform: smoothStream({
        delayInMs: 10,
        chunking: "word",
      }),
      onError: async ({ error }) => {
        logError(error as Error, { route: "/api/enhance-prompt" });
        await releaseAIRequest(usageId).catch((releaseError) =>
          logError(releaseError as Error, { action: "releaseAIRequest" }),
        );
      },
      onFinish: async ({ totalUsage }) => {
        try {
          await finalizeAIRequest(usageId, totalUsage);
        } catch (error) {
          logError(error as Error, { action: "finalizeAIRequest" });
        }
      },
    });

    return result.toUIMessageStreamResponse({ onError: streamErrorMessage });
  } catch (error) {
    return handleError(error, { route: "/api/enhance-prompt" });
  }
}
