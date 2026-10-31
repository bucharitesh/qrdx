import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
} from "ai";
import type { NextRequest } from "next/server";
import { QR_THEME_GENERATION_TOOLS } from "@/lib/ai/generate-qr-theme/tools";
import { GENERATE_QR_THEME_SYSTEM } from "@/lib/ai/prompts";
import {
  assertAIConfigured,
  baseProviderOptions,
  myProvider,
} from "@/lib/ai/providers";
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
import { generateQRThemeRequestSchema } from "@/lib/validations/ai";
import type { AdditionalAIContext, ChatMessage } from "@/types/ai";
import { convertMessagesToModelMessages } from "@/utils/ai/message-converter";

export async function POST(req: NextRequest) {
  try {
    const userId = await getCurrentUserId(req);
    assertAIConfigured();
    await enforceAIRateLimit(req, "generate-qr-theme", userId);

    const { messages } = parseWithSchema(
      generateQRThemeRequestSchema,
      await readJsonBody(req, MAX_AI_REQUEST_BODY_BYTES),
    );
    const modelMessages = await convertMessagesToModelMessages(
      messages as unknown as ChatMessage[],
    );

    const model = myProvider.languageModel("base");
    const usageId = await reserveAIRequest(
      userId,
      typeof model === "string" ? model : model.modelId,
    );

    const stream = createUIMessageStream<ChatMessage>({
      execute: ({ writer }) => {
        const context: AdditionalAIContext = { writer };

        const result = streamText({
          abortSignal: req.signal,
          model: model,
          providerOptions: baseProviderOptions,
          system: GENERATE_QR_THEME_SYSTEM,
          messages: modelMessages,
          tools: QR_THEME_GENERATION_TOOLS,
          stopWhen: stepCountIs(5),
          onError: async ({ error }) => {
            logError(error as Error, { route: "/api/generate-qr-theme" });
            await releaseAIRequest(usageId).catch((releaseError) =>
              logError(releaseError as Error, { action: "releaseAIRequest" }),
            );
          },
          onFinish: async (result) => {
            const { totalUsage } = result;
            try {
              await finalizeAIRequest(usageId, totalUsage);
            } catch (error) {
              logError(error as Error, {
                action: "finalizeAIRequest",
                totalUsage,
              });
            }
          },
          experimental_context: context,
        });

        writer.merge(
          result.toUIMessageStream({
            messageMetadata: ({ part }) => {
              // `toolName` is not typed for some reason, must be kept in sync with the actual tool names
              if (
                part.type === "tool-result" &&
                part.toolName === "generateQRTheme"
              ) {
                return { themeStyles: part.output };
              }
            },
          }),
        );
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "ResponseAborted")
    ) {
      return new Response("Request aborted by user", { status: 499 });
    }

    return handleError(error, { route: "/api/generate-qr-theme" });
  }
}
