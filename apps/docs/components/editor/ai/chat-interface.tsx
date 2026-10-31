"use client";

import { toast } from "@repo/design-system";
import { cn } from "@repo/design-system/lib/utils";
import dynamic from "next/dynamic";
import React from "react";
import { useAIQRGenerationCore } from "@/lib/hooks/use-ai-qr-generation-core";
import { useChatContext } from "@/lib/hooks/use-chat-context";
import { useGuards } from "@/lib/hooks/use-gaurds";
import { useMounted } from "@/lib/hooks/use-mounted";
import { usePostLoginAction } from "@/lib/hooks/use-post-login-action";
import type { AIPromptData } from "@/types/ai";
import { ChatInput } from "./chat-input";
import { ClosableSuggestedPillActions } from "./closeable-suggested-pill-actions";
import { getAIMockMode } from "./dev-mock-mode";
import {
  type RecentGeneration,
  rememberGenerations,
} from "./recent-generations";

const Messages = dynamic(
  () => import("./messages").then((mod) => mod.Messages),
  {
    ssr: false,
  },
);

const NoMessagesPlaceholder = dynamic(
  () =>
    import("./no-messages-placeholder").then(
      (mod) => mod.NoMessagesPlaceholder,
    ),
  {
    ssr: false,
  },
);

export function ChatInterface() {
  const { messages, regenerate, resetMessagesUpToIndex } = useChatContext();
  const { isGenerating, generateQRCore, cancelGeneration } =
    useAIQRGenerationCore();

  const guards = useGuards();
  // Dev-only `?ai-mock=` replays a response without signing in.
  const isMock = getAIMockMode() !== null;
  const checkValidSession: typeof guards.checkValidSession = (...args) =>
    isMock || guards.checkValidSession(...args);
  const checkValidSubscription = () =>
    isMock || guards.checkValidSubscription();

  const isMounted = useMounted();

  const hasMessages = messages.length > 0;
  const [editingMessageIndex, setEditingMessageIndex] = React.useState<
    number | null
  >(null);

  const handleGenerateFromSuggestion = (
    promptData: AIPromptData | undefined,
  ) => {
    if (
      !checkValidSession("signup", "AI_GENERATE_FROM_CHAT_SUGGESTION", {
        promptData,
      })
    )
      return;
    if (!checkValidSubscription()) return;

    generateQRCore(promptData);
  };

  const handleRetry = (messageIndex: number) => {
    if (!checkValidSession("signup", "AI_GENERATE_RETRY", { messageIndex }))
      return;
    if (!checkValidSubscription()) return;

    setEditingMessageIndex(null);
    const messageToRetry = messages[messageIndex];

    if (messageToRetry) {
      regenerate({ messageId: messageToRetry.id });
    } else {
      toast.error("Cannot retry this message", {
        description: "Seems like this message is not longer available.",
      });
    }
  };

  const handleEdit = (messageIndex: number) => {
    if (!checkValidSession()) return; // Simply act as an early return

    setEditingMessageIndex(messageIndex);
  };

  const handleEditCancel = () => {
    setEditingMessageIndex(null);
  };

  const handleEditSubmit = (messageIndex: number, promptData: AIPromptData) => {
    if (
      !checkValidSession("signup", "AI_GENERATE_EDIT", {
        messageIndex,
        promptData,
      })
    ) {
      return;
    }
    if (!checkValidSubscription()) return;

    // Reset messages up to the edited message
    resetMessagesUpToIndex(messageIndex);
    setEditingMessageIndex(null);
    generateQRCore(promptData);
  };

  usePostLoginAction("AI_GENERATE_FROM_CHAT_SUGGESTION", ({ promptData }) => {
    handleGenerateFromSuggestion(promptData);
  });

  usePostLoginAction("AI_GENERATE_RETRY", ({ messageIndex }) => {
    handleRetry(messageIndex);
  });

  usePostLoginAction("AI_GENERATE_EDIT", ({ messageIndex, promptData }) => {
    handleEditSubmit(messageIndex, promptData);
  });

  // Keep finished generations reachable after "New chat".
  React.useEffect(() => {
    if (isGenerating) return;
    const found: RecentGeneration[] = [];
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      message.parts.forEach((part, index) => {
        if (
          part.type === "tool-generateQRTheme" &&
          part.state === "output-available" &&
          part.output
        ) {
          found.push({
            id: `${message.id}-${index}`,
            styles: part.output as RecentGeneration["styles"],
          });
        }
      });
    }
    rememberGenerations(found);
  }, [messages, isGenerating]);

  return (
    <section className="@container relative isolate z-1 mx-auto flex size-full max-w-196 flex-1 flex-col">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {isMounted && hasMessages ? (
          <Messages
            messages={messages}
            onRetry={handleRetry}
            onEdit={handleEdit}
            onEditSubmit={handleEditSubmit}
            onEditCancel={handleEditCancel}
            editingMessageIndex={editingMessageIndex}
            isGeneratingTheme={isGenerating}
          />
        ) : (
          <div className="animate-in fade-in-50 size-full overflow-y-auto overscroll-contain px-4 pt-6 pb-10 duration-300 ease-out">
            <NoMessagesPlaceholder
              onGenerateTheme={handleGenerateFromSuggestion}
              isGeneratingTheme={isGenerating}
            />
          </div>
        )}
      </div>

      {/* Composer pinned to the bottom, with a soft fade over the list above */}
      <div className="relative z-1 mx-auto w-full px-4 pb-4">
        <div
          aria-hidden
          className="from-background pointer-events-none absolute inset-x-0 -top-8 h-8 bg-linear-to-t to-transparent"
        />
        <div
          className={cn(
            "transition-all ease-out",
            !isMounted
              ? "h-0 scale-80 opacity-0"
              : hasMessages
                ? "scale-100 opacity-100"
                : "h-0 scale-80 opacity-0",
          )}
        >
          <ClosableSuggestedPillActions
            onGenerateTheme={handleGenerateFromSuggestion}
            isGeneratingTheme={isGenerating}
          />
        </div>

        <ChatInput
          onThemeGeneration={generateQRCore}
          isGeneratingTheme={isGenerating}
          onCancelThemeGeneration={cancelGeneration}
        />
      </div>
    </section>
  );
}
