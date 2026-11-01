"use client";

import { useCompletion } from "@ai-sdk/react";
import { toast } from "@repo/design-system";
import type { JSONContent } from "@tiptap/react";
import { useCallback, useMemo, useRef } from "react";
import { parseAiSdkTransportError } from "@/lib/ai/parse-ai-sdk-transport-error";
import { track } from "@/lib/analytics";
import { useAILocalDraftStore } from "@/store/ai-local-draft-store";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";
import type { AIPromptData } from "@/types/ai";
import type { ThemeStyles } from "@/types/theme";
import { convertPromptDataToJSONContent } from "@/utils/ai/ai-prompt";

export function useAIEnhancePrompt() {
  const { openGetProDialog } = useGetProDialogStore();
  const { complete, completion, isLoading, stop, setCompletion } =
    useCompletion({
      api: "/api/enhance-prompt",
      onError: (error) => {
        const defaultMessage = "Failed to enhance prompt. Please try again.";
        const normalized = parseAiSdkTransportError(error, defaultMessage);

        track("prompt_enhance_failed", {
          code: normalized.code,
          status: normalized.status,
        });

        if (normalized.code === "SUBSCRIPTION_REQUIRED") {
          openGetProDialog();
        }

        toast.error("An error occurred", {
          description: normalized.message,
        });
      },
      onFinish: (_prompt, finalCompletion) => {
        track("prompt_enhance_finished", {
          duration_ms: startTimeRef.current
            ? Date.now() - startTimeRef.current
            : undefined,
          length: finalCompletion?.length ?? 0,
        });

        const promptData: AIPromptData = {
          content: finalCompletion,
          mentions: activeMentionsRef.current,
        };
        const jsonContent = convertPromptDataToJSONContent(promptData);
        useAILocalDraftStore.getState().setEditorContentDraft(jsonContent);
      },
    });

  const activeMentionsRef = useRef<
    Array<{ id: string; label: string; themeData: ThemeStyles }>
  >([]);
  const startTimeRef = useRef<number | null>(null);

  const enhancedPromptAsJsonContent: JSONContent | undefined = useMemo(() => {
    if (!completion) return undefined;
    const promptData: AIPromptData = {
      content: completion,
      mentions: activeMentionsRef.current,
    };
    return convertPromptDataToJSONContent(promptData);
  }, [completion]);

  const startEnhance = useCallback(
    async (promptData: AIPromptData) => {
      const prompt = promptData?.content ?? "";
      if (!prompt?.trim()) return;

      if (isLoading) stop();
      setCompletion("");

      startTimeRef.current = Date.now();
      activeMentionsRef.current = promptData?.mentions ?? [];

      track("prompt_enhance_started", {
        length: prompt.length,
        mention_count: promptData?.mentions?.length ?? 0,
        image_count: promptData?.images?.length ?? 0,
      });

      await complete(prompt, { body: { promptData } });
    },
    [complete, isLoading, stop, setCompletion],
  );

  const stopEnhance = useCallback(() => {
    stop();

    if (enhancedPromptAsJsonContent) {
      useAILocalDraftStore
        .getState()
        .setEditorContentDraft(enhancedPromptAsJsonContent);
    }

    track("prompt_enhance_canceled", {
      duration_ms: startTimeRef.current
        ? Date.now() - startTimeRef.current
        : undefined,
    });
  }, [stop, enhancedPromptAsJsonContent]);

  return {
    startEnhance,
    stopEnhance,
    enhancedPrompt: completion,
    enhancedPromptAsJsonContent,
    isEnhancingPrompt: isLoading,
  } as const;
}
