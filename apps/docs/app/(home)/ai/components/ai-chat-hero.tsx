"use client";

import { useRouter } from "next/navigation";
import { HorizontalScrollArea } from "@/components/horizontal-scroll-area";
import { useAIQRGenerationCore } from "@/lib/hooks/use-ai-qr-generation-core";
import { useChatContext } from "@/lib/hooks/use-chat-context";
import { useGuards } from "@/lib/hooks/use-gaurds";
import { usePostLoginAction } from "@/lib/hooks/use-post-login-action";
import type { AIPromptData } from "@/types/ai";
import { AIChatForm } from "./ai-chat-form";
import { ChatHeading } from "./chat-heading";
import { SuggestedPillActions } from "./suggested-pill-actions";

export function AIChatHero() {
  const { startNewChat } = useChatContext();
  const { generateQRCore, isGenerating, cancelGeneration } =
    useAIQRGenerationCore();
  const { checkValidSession, checkValidSubscription } = useGuards();
  const router = useRouter();

  const handleRedirectAndGeneration = (promptData: AIPromptData) => {
    if (!checkValidSession("signup", "AI_GENERATE_FROM_PAGE", { promptData }))
      return;
    if (!checkValidSubscription()) return;

    startNewChat();

    generateQRCore(promptData);
    router.push("/playground?tab=ai");
  };

  usePostLoginAction("AI_GENERATE_FROM_PAGE", ({ promptData }) => {
    handleRedirectAndGeneration(promptData);
  });

  return (
    <div className="relative isolate flex w-full flex-1">
      <div className="@container relative isolate z-1 mx-auto flex max-w-196 flex-1 flex-col justify-center px-4">
        <ChatHeading isGenerating={isGenerating} />

        {/* Chat form input and suggestions */}
        <div className="relative mx-auto flex w-full flex-col gap-2">
          <div className="relative isolate z-10 w-full">
            <AIChatForm
              onThemeGeneration={handleRedirectAndGeneration}
              isGeneratingTheme={isGenerating}
              onCancelThemeGeneration={cancelGeneration}
            />
          </div>

          {/* Quick suggestions */}
          <HorizontalScrollArea className="mx-auto py-2">
            <SuggestedPillActions
              onGeneration={handleRedirectAndGeneration}
              isGenerating={isGenerating}
            />
          </HorizontalScrollArea>
        </div>
      </div>
    </div>
  );
}
