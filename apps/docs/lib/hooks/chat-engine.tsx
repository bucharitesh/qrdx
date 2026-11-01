"use client";

import { useChat } from "@ai-sdk/react";
import { toast } from "@repo/design-system";
import { useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport } from "ai";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getAIMockMode } from "@/components/editor/ai/dev-mock-mode";
import { emitSound } from "@/components/editor/sound";
import { parseAiSdkTransportError } from "@/lib/ai/parse-ai-sdk-transport-error";
import { track } from "@/lib/analytics";
import { handleUnauthorized } from "@/lib/handle-unauthorized";
import { isDeepEqual } from "@/lib/utils";
import { useAIChatStore } from "@/store/ai-chat-store";
import { useQREditorStore } from "@/store/editor-store";
import type { ChatMessage } from "@/types/ai";
import type { ChatContextValue, ThemeEvent } from "./use-chat-context";
import { SUBSCRIPTION_STATUS_QUERY_KEY } from "./use-subscription";

/*
 * The AI SDK (and zod) behind the QR chat. Only use-chat-context.tsx imports
 * this, lazily, so it stays out of pages that never show the chat.
 */

const TOOL_TYPE = "tool-generateQRTheme";
/** Stop a request whose stream went silent this long. */
const STALLED_STREAM_MS = 60_000;

/** Dev only: `?ai-mock=theme|chat|error` replays a recorded response. */
const devFetch: typeof fetch | undefined =
  process.env.NODE_ENV === "development"
    ? async (input, init) => {
        const mode = getAIMockMode();
        if (!mode) return fetch(input, init);
        const { mockChatResponse } = await import(
          "@/components/editor/ai/dev-mock-chat"
        );
        return mockChatResponse(mode);
      }
    : undefined;

function applyGeneratedQRStyle(qrStyle: Record<string, unknown>) {
  const { themeState, setThemeState } = useQREditorStore.getState();

  // Merge the generated style with the current style
  const mergedStyle = { ...themeState.styles, ...qrStyle };

  if (isDeepEqual(themeState.styles, mergedStyle)) {
    return;
  }

  setThemeState({
    ...themeState,
    styles: mergedStyle,
  });
}

/** The chat itself; ChatProvider loads it on first use and keeps it mounted. */
export function ChatEngine({
  onChange,
}: {
  onChange: (chat: ChatContextValue) => void;
}) {
  const queryClient = useQueryClient();
  const storedMessages = useAIChatStore((s) => s.messages);
  const setStoredMessages = useAIChatStore((s) => s.setMessages);

  const hasStoreHydrated = useAIChatStore((s) => s.hasHydrated);
  const hasInitializedRef = useRef(false);

  // Theme application bookkeeping: each tool call applies (and chimes) once.
  const appliedIds = useRef(new Set<string>());
  const failedIds = useRef(new Set<string>());
  const [streamingToolId, setStreamingToolId] = useState<string | null>(null);
  // useChat keeps its first callbacks, so onError reads this through a ref.
  const inFlightToolIdRef = useRef<string | null>(null);
  const [themeEvent, setThemeEvent] = useState<ThemeEvent | null>(null);

  const markApplied = useCallback(
    (toolCallId: string, themeStyles?: Record<string, unknown>) => {
      if (themeStyles) applyGeneratedQRStyle(themeStyles);
      if (appliedIds.current.has(toolCallId)) return;
      appliedIds.current.add(toolCallId);
      setThemeEvent((prev) => ({ kind: "applied", at: (prev?.at ?? 0) + 1 }));
      emitSound("ai-done");
      track("ai_theme_generated", { status: "success" });
    },
    [],
  );

  const markFailed = useCallback((toolCallId: string) => {
    if (failedIds.current.has(toolCallId)) return;
    failedIds.current.add(toolCallId);
    setThemeEvent((prev) => ({ kind: "error", at: (prev?.at ?? 0) + 1 }));
    emitSound("error");
    track("ai_theme_generated", { status: "fail" });
  }, []);

  const chat = useChat<ChatMessage>({
    transport: new DefaultChatTransport({
      api: "/api/generate-qr-theme",
      fetch: devFetch,
    }),
    onError: (error) => {
      const defaultMessage = "Failed to generate QR style. Please try again.";
      const normalizedError = parseAiSdkTransportError(error, defaultMessage);

      if (
        normalizedError.code === "UNAUTHORIZED" ||
        normalizedError.status === 401
      ) {
        void handleUnauthorized();
        return;
      }

      if (inFlightToolIdRef.current) markFailed(inFlightToolIdRef.current);
      else {
        emitSound("error");
        track("ai_theme_generated", { status: "fail" });
      }
      toast.error("An error occurred", {
        description: normalizedError.message,
      });
    },
    onData: (dataPart) => {
      if (dataPart.type !== "data-generated-qr-style") return;

      const toolCallId = dataPart.id ?? "current";
      const { themeStyles, status } = dataPart.data;
      if (status === "ready") {
        markApplied(toolCallId, themeStyles as Record<string, unknown>);
        return;
      }
      if (!appliedIds.current.has(toolCallId)) setStreamingToolId(toolCallId);
      if (themeStyles) {
        applyGeneratedQRStyle(themeStyles as Record<string, unknown>);
      }
    },
    onFinish: () => {
      queryClient.invalidateQueries({
        queryKey: [SUBSCRIPTION_STATUS_QUERY_KEY],
      });
    },
  });

  const requestActive =
    chat.status === "submitted" || chat.status === "streaming";

  // The tool part is the source of truth; transient data parts only add the
  // live preview. Apply the final output if the "ready" data part was missed.
  const lastMessage = chat.messages.at(-1);
  const toolParts = useMemo(
    () =>
      lastMessage?.role === "assistant"
        ? lastMessage.parts.flatMap((part) =>
            part.type === TOOL_TYPE ? [part] : [],
          )
        : [],
    [lastMessage],
  );

  useEffect(() => {
    for (const part of toolParts) {
      if (part.state === "output-available") {
        markApplied(
          part.toolCallId,
          part.output as unknown as Record<string, unknown>,
        );
      } else if (part.state === "output-error") {
        markFailed(part.toolCallId);
      }
    }
  }, [toolParts, markApplied, markFailed]);

  const isPending = (toolCallId: string) =>
    !appliedIds.current.has(toolCallId) && !failedIds.current.has(toolCallId);
  const pendingToolPart = toolParts.find(
    (part) =>
      (part.state === "input-streaming" || part.state === "input-available") &&
      isPending(part.toolCallId),
  );
  const inFlightToolId = requestActive
    ? (pendingToolPart?.toolCallId ??
      (streamingToolId && isPending(streamingToolId) ? streamingToolId : null))
    : null;
  const themeInFlight = inFlightToolId !== null;
  inFlightToolIdRef.current = inFlightToolId;

  // A request is over (finished, failed or stopped): nothing is streaming.
  useEffect(() => {
    if (!requestActive) setStreamingToolId(null);
  }, [requestActive]);

  // Safety net: stop a request whose stream went silent, so the busy UI ends.
  const lastActivity = useRef(Date.now());
  // biome-ignore lint/correctness/useExhaustiveDependencies: any new chunk counts as activity
  useEffect(() => {
    lastActivity.current = Date.now();
  }, [chat.messages, chat.status]);
  useEffect(() => {
    if (!requestActive) return;
    const timer = setInterval(() => {
      if (Date.now() - lastActivity.current > STALLED_STREAM_MS) {
        chat.stop();
        track("ai_theme_generated", { status: "fail" });
        toast.error("The AI stopped responding", {
          description: "Try again in a moment.",
        });
      }
    }, 5_000);
    return () => clearInterval(timer);
  }, [requestActive, chat.stop]);

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
      const persistedMessages = useAIChatStore.getState().messages;
      if (!isDeepEqual(persistedMessages, chat.messages)) {
        setStoredMessages(chat.messages);
      }

      // Check for themeStyles in metadata of the last assistant message
      const lastMessage = chat.messages[chat.messages.length - 1];
      if (
        lastMessage?.role === "assistant" &&
        lastMessage?.metadata?.themeStyles
      ) {
        applyGeneratedQRStyle(
          lastMessage.metadata.themeStyles as Record<string, unknown>,
        );
      }
    }
  }, [chat.status, chat.messages, setStoredMessages]);

  useEffect(() => {
    if (!hasStoreHydrated || hasInitializedRef.current) return;

    if (storedMessages.length > 0) {
      for (const message of storedMessages) {
        for (const part of message.parts) {
          if (part.type === TOOL_TYPE) appliedIds.current.add(part.toolCallId);
        }
      }
      chat.setMessages(storedMessages);
    }

    hasInitializedRef.current = true;
  }, [hasStoreHydrated, storedMessages, chat.setMessages]);

  const value: ChatContextValue = {
    ...chat,
    startNewChat,
    resetMessagesUpToIndex,
    themeInFlight,
    themeEvent,
  };
  // Every render of the engine is new chat state for the consumers.
  useLayoutEffect(() => onChange(value));

  return null;
}
