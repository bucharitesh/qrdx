import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
} from "ai";
import type { NextRequest } from "next/server";
import { recordAIUsage } from "@/actions/ai-usage";
import { QR_THEME_GENERATION_TOOLS } from "@/lib/ai/generate-qr-theme/tools";
import { GENERATE_QR_THEME_SYSTEM } from "@/lib/ai/prompts";
import { baseProviderOptions, myProvider } from "@/lib/ai/providers";
import { handleError } from "@/lib/error-response";
import { getCurrentUserId, logError } from "@/lib/shared";
import { validateSubscriptionAndUsage } from "@/lib/subscription";
import type {
  AdditionalAIContext,
  AIPromptData,
  ChatMessage,
} from "@/types/ai";
import { SubscriptionRequiredError } from "@/types/errors";
import { convertMessagesToModelMessages } from "@/utils/ai/message-converter";

export async function POST(req: NextRequest) {
  try {
    const userId = await getCurrentUserId(req);

    const subscriptionCheck = await validateSubscriptionAndUsage(userId);

    if (!subscriptionCheck.canProceed) {
      throw new SubscriptionRequiredError(subscriptionCheck.error, {
        requestsRemaining: subscriptionCheck.requestsRemaining,
      });
    }

    const body = await req.json();
    const { messages, promptData } = body as {
      messages: ChatMessage[];
      promptData?: AIPromptData;
    };

    const modelMessages = await convertMessagesToModelMessages(
      messages,
      promptData,
    );

    // Validate that we have at least one message to process
    if (modelMessages.length === 0) {
      return new Response(
        JSON.stringify({ error: "No valid messages to process" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const stream = createUIMessageStream<ChatMessage>({
      execute: ({ writer }) => {
        const context: AdditionalAIContext = { writer };
        const model = myProvider.languageModel("base");

        const result = streamText({
          abortSignal: req.signal,
          model: model,
          providerOptions: baseProviderOptions,
          system: GENERATE_QR_THEME_SYSTEM,
          messages: modelMessages,
          tools: QR_THEME_GENERATION_TOOLS,
          stopWhen: stepCountIs(5),
          onError: (error) => {
            if (error instanceof Error) console.error(error);
          },
          onFinish: async (result) => {
            const { totalUsage } = result;
            try {
              await recordAIUsage({
                modelId:
                  (model as { modelId?: string }).modelId ?? "gemini-2.5-flash",
                promptTokens: totalUsage.inputTokens,
                completionTokens: totalUsage.outputTokens,
              });
            } catch (error) {
              logError(error as Error, { action: "recordAIUsage", totalUsage });
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
                return { qrStyle: part.output };
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
