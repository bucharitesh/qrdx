import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
} from "ai";
import type { NextRequest } from "next/server";
import { QR_THEME_GENERATION_TOOLS } from "@/lib/ai/generate-qr-theme/tools";
import { textProviderOptions } from "@/lib/ai/models";
import { GENERATE_QR_THEME_SYSTEM } from "@/lib/ai/prompts";
import { assertAIConfigured, languageModel } from "@/lib/ai/providers";
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
import { generateQRThemeRequestSchema } from "@/lib/validations/ai";
import type { ChatMessage } from "@/types/ai";
import { convertMessagesToModelMessages } from "@/utils/ai/message-converter";

export async function POST(req: NextRequest) {
  try {
    // Before the session lookup: with AI off there's nothing to sign in for.
    assertAIConfigured();
    const userId = await getCurrentUserId(req);
    await enforceAIRateLimit(req, "generate-qr-theme", userId);

    const { messages } = parseWithSchema(
      generateQRThemeRequestSchema,
      await readJsonBody(req, MAX_AI_REQUEST_BODY_BYTES),
    );
    const modelMessages = await convertMessagesToModelMessages(
      messages as unknown as ChatMessage[],
    );

    const model = languageModel("base");
    const usageId = await reserveAIRequest(
      userId,
      typeof model === "string" ? model : model.modelId,
    );

    const stream = createUIMessageStream<ChatMessage>({
      onError: streamErrorMessage,
      execute: ({ writer }) => {
        const result = streamText({
          abortSignal: req.signal,
          model: model,
          providerOptions: textProviderOptions("base"),
          instructions: GENERATE_QR_THEME_SYSTEM,
          messages: modelMessages,
          tools: QR_THEME_GENERATION_TOOLS,
          stopWhen: isStepCount(5),
          onError: async ({ error }) => {
            logError(error as Error, { route: "/api/generate-qr-theme" });
            await releaseAIRequest(usageId).catch((releaseError) =>
              logError(releaseError as Error, { action: "releaseAIRequest" }),
            );
          },
          // `usage` covers every step (v6's `totalUsage`).
          onEnd: async ({ usage }) => {
            try {
              await finalizeAIRequest(usageId, usage);
            } catch (error) {
              logError(error as Error, {
                action: "finalizeAIRequest",
                totalUsage: usage,
              });
            }
          },
          toolsContext: { generateQRTheme: { writer } },
        });

        writer.merge(
          toUIMessageStream<typeof QR_THEME_GENERATION_TOOLS, ChatMessage>({
            stream: result.stream,
            tools: QR_THEME_GENERATION_TOOLS,
            onError: streamErrorMessage,
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
