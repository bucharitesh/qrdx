import { smoothStream, streamText } from "ai";
import type { NextRequest } from "next/server";
import { ENHANCE_PROMPT_SYSTEM } from "@/lib/ai/prompts";
import { baseProviderOptions, myProvider } from "@/lib/ai/providers";
import { handleError } from "@/lib/error-response";
import { requireSubscriptionOrFreeUsage } from "@/lib/subscription";
import type { AIPromptData } from "@/types/ai";
import { buildUserContentPartsFromPromptData } from "@/utils/ai/message-converter";

export async function POST(req: NextRequest) {
  try {
    await requireSubscriptionOrFreeUsage(req);

    const body = await req.json();
    const {
      prompt: _prompt,
      promptData,
    }: { prompt: string; promptData: AIPromptData } = body;
    const userContentParts = buildUserContentPartsFromPromptData(promptData);

    const result = streamText({
      system: ENHANCE_PROMPT_SYSTEM,
      messages: [
        {
          role: "user",
          content: userContentParts,
        },
      ],
      model: myProvider.languageModel("prompt-enhancement"),
      providerOptions: baseProviderOptions,
      experimental_transform: smoothStream({
        delayInMs: 10,
        chunking: "word",
      }),
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    return handleError(error, { route: "/api/enhance-prompt" });
  }
}
