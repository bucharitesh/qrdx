"use client";

import { useChat } from "@ai-sdk/react";
import { toast } from "@repo/design-system";
import { useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport } from "ai";
import { createContext, useContext, useEffect, useRef } from "react";
import { parseAiSdkTransportError } from "@/lib/ai/parse-ai-sdk-transport-error";
import { useAIChatStore } from "@/store/ai-chat-store";
import { useQREditorStore } from "@/store/editor-store";
import type { ChatMessage } from "@/types/ai";
import { SUBSCRIPTION_STATUS_QUERY_KEY } from "./use-subscription";

interface ChatContext extends ReturnType<typeof useChat<ChatMessage>> {
  startNewChat: () => void;
  resetMessagesUpToIndex: (index: number) => void;
}

const ChatContext = createContext<ChatContext | null>(null);

function applyGeneratedQRStyle(qrStyle: Record<string, unknown>) {
  const { setStyle, style } = useQREditorStore.getState();

  // Merge the generated style with the current style
  const mergedStyle = { ...style, ...qrStyle };

  setStyle(mergedStyle);
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const storedMessages = useAIChatStore((s) => s.messages);
  const setStoredMessages = useAIChatStore((s) => s.setMessages);

  const hasStoreHydrated = useAIChatStore((s) => s.hasHydrated);
  const hasInitializedRef = useRef(false);

  const chat = useChat<ChatMessage>({
    transport: new DefaultChatTransport({
      api: "/api/generate-qr-theme",
    }),
    onError: (error) => {
      const defaultMessage = "Failed to generate QR style. Please try again.";
      const normalizedError = parseAiSdkTransportError(error, defaultMessage);

      toast.error("An error occurred", {
        description: normalizedError.message,
      });
    },
    onData: (dataPart) => {
      // Handle generated QR style data - apply during both streaming and ready states
      const { type, data } = dataPart as {
        type: string;
        data: { status: string; qrStyle?: Record<string, unknown> };
      };

      if (type === "data-generated-qr-style" && data?.qrStyle) {
        // Apply the style during both streaming and ready states for real-time preview
        applyGeneratedQRStyle(data.qrStyle);
      }
    },
    onFinish: () => {
      queryClient.invalidateQueries({
        queryKey: [SUBSCRIPTION_STATUS_QUERY_KEY],
      });
    },
  });

  const startNewChat = () => {
    chat.stop();
    chat.setMessages([]);
  };

  const resetMessagesUpToIndex = (index: number) => {
    const newMessages = chat.messages.slice(0, index);
    chat.setMessages(newMessages);
  };

  useEffect(() => {
    if (!hasInitializedRef.current) return;

    // Only update the stored messages when the chat is not currently processing a request
    if (chat.status === "ready" || chat.status === "error") {
      setStoredMessages(chat.messages);

      // Debug: Log messages to see the structure

      // Check for qrStyle in metadata of the last assistant message
      const lastMessage = chat.messages[chat.messages.length - 1];
      if (lastMessage?.role === "assistant" && lastMessage?.metadata?.qrStyle) {
        applyGeneratedQRStyle(
          lastMessage.metadata.qrStyle as Record<string, unknown>,
        );
      }
    }
  }, [chat.status, chat.messages, setStoredMessages]);

  useEffect(() => {
    if (!hasStoreHydrated || hasInitializedRef.current) return;

    if (storedMessages.length > 0) {
      chat.setMessages(storedMessages);
    }

    hasInitializedRef.current = true;
  }, [hasStoreHydrated, storedMessages, chat]);

  return (
    <ChatContext.Provider
      value={{ ...chat, startNewChat, resetMessagesUpToIndex }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return ctx;
}

