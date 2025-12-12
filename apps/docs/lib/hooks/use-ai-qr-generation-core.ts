"use client";

import type { AIPromptData } from "@/types/ai";
import { useChatContext } from "./use-chat-context";

export function useAIQRGenerationCore() {
  const { status, sendMessage, stop } = useChatContext();
  const isGenerating = status === "submitted" || status === "streaming";

  const generateQRCore = async (promptData?: AIPromptData) => {
    if (!promptData)
      throw new Error("Failed to generate QR style. Please try again.");

    sendMessage({
      text: promptData.content,
      metadata: { promptData },
    });
  };

  return {
    generateQRCore,
    isGenerating,
    cancelGeneration: stop,
  };
}








