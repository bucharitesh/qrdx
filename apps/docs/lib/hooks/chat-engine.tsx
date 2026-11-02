"use client";

import { useChat } from "@ai-sdk/react";
import { toast } from "@repo/design-system";
import { useQueryClient } from "@tanstack/react-query";
import {
  DefaultChatTransport,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
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
import type { EditorContextInput } from "@/lib/ai/agent/editor-context";
import type { ApplyDesignOutput, DesignProgress } from "@/lib/ai/agent/tools";
import { parseAiSdkTransportError } from "@/lib/ai/parse-ai-sdk-transport-error";
import { track } from "@/lib/analytics";
import { handleUnauthorized } from "@/lib/handle-unauthorized";
import { isDeepEqual } from "@/lib/utils";
import { useAIChatStore } from "@/store/ai-chat-store";
import { useQREditorStore } from "@/store/editor-store";
import type { ChatMessage } from "@/types/ai";
import type { ThemeEditorState } from "@/types/editor";
import type { ContentType, QRContentConfig } from "@/types/qr-content";
import { encodeQRContent } from "@/utils/qr-content-encoder";
import type {
  AppliedState,
  ChatContextValue,
  ThemeEvent,
} from "./use-chat-context";
import { SUBSCRIPTION_STATUS_QUERY_KEY } from "./use-subscription";

/*
 * The AI SDK (and zod) behind the QR chat. Only use-chat-context.tsx imports
 * this, lazily, so it stays out of pages that never show the chat.
 */

const DESIGN_TOOL = "tool-design_qr";
const APPLY_TOOL = "tool-apply_design";
/** Stop a request whose stream went silent this long. */
const STALLED_STREAM_MS = 60_000;
/** Largest logo sent along with a request (see editor-context.ts). */
const MAX_CONTEXT_LOGO_LENGTH = 200_000;

/** Dev only: `?ai-mock=...` replays a recorded response. */
const devFetch: typeof fetch | undefined =
  process.env.NODE_ENV === "development"
    ? async (input, init) => {
        const mode = getAIMockMode();
        if (!mode) return fetch(input, init);
        const { mockChatResponse } = await import(
          "@/components/editor/ai/dev-mock-chat"
        );
        return mockChatResponse(mode, init);
      }
    : undefined;

/** The code in the editor, sent with every request (lib/ai/agent/editor-context.ts). */
function editorContext(): EditorContextInput {
  const { contentType, contentConfigs, value, themeState } =
    useQREditorStore.getState();
  const config = contentConfigs[contentType] as
    | (QRContentConfig & Record<string, unknown>)
    | undefined;
  const { type: _type, ...content } = config ?? { type: contentType };
  const { customLogo, art, ...style } = themeState.styles;
  return {
    contentType,
    ...(config ? { content } : {}),
    value,
    style,
    ...(style.showLogo &&
    customLogo &&
    customLogo.length <= MAX_CONTEXT_LOGO_LENGTH
      ? { customLogo }
      : {}),
    hasArt: Boolean(art),
  };
}

/**
 * Resume a paused run once the user has answered a question or responded to
 * every approval in it. Never for a run that merely ended on a server tool
 * (a step limit), which would start a new request on its own.
 */
function shouldResume({ messages }: { messages: ChatMessage[] }): boolean {
  if (lastAssistantMessageIsCompleteWithApprovalResponses({ messages })) {
    return true;
  }
  if (!lastAssistantMessageIsCompleteWithToolCalls({ messages })) return false;
  const last = messages.at(-1);
  if (!last) return false;
  const stepStart = last.parts.reduce(
    (found, part, index) => (part.type === "step-start" ? index : found),
    -1,
  );
  const lastStep = last.parts.slice(stepStart + 1);
  return lastStep.some(
    (part) =>
      part.type === "tool-ask_user" && part.state === "output-available",
  );
}

interface EditorSnapshot {
  themeState: ThemeEditorState;
  contentType: ContentType;
  contentConfig: QRContentConfig | undefined;
  value: string;
}

function snapshot(): EditorSnapshot {
  const state = useQREditorStore.getState();
  return {
    themeState: state.themeState,
    contentType: state.contentType,
    contentConfig: state.contentConfigs[state.contentType],
    value: state.value,
  };
}

/** Puts an applied design in the editor: its style (through the undo history) and content. */
function applyToEditor(design: Extract<ApplyDesignOutput, { ok: true }>) {
  const store = useQREditorStore.getState();
  const current = store.themeState.styles;
  const logo =
    design.logo === "keep"
      ? { showLogo: current.showLogo, customLogo: current.customLogo }
      : { showLogo: design.logo.showLogo, customLogo: design.logo.customLogo };
  store.setThemeState({
    ...store.themeState,
    styles: {
      ...(current.size ? { size: current.size } : {}),
      ...design.themeStyles,
      ...logo,
    },
  });
  if (design.content) {
    const { config } = design.content;
    store.setContentType(config.type);
    store.setContentConfig(config.type, config);
    store.setValue(encodeQRContent(config));
  }
  return useQREditorStore.getState().themeState;
}

function restoreEditor(before: EditorSnapshot, applied: ThemeEditorState) {
  const store = useQREditorStore.getState();
  // Untouched since: step back through the editor's own history (redo works).
  if (isDeepEqual(store.themeState, applied)) store.undo();
  else store.setThemeState(before.themeState);
  store.setContentType(before.contentType);
  if (before.contentConfig) {
    store.setContentConfig(before.contentType, before.contentConfig);
  }
  store.setValue(before.value);
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

  // Each approved design is applied (and chimes) once; undo keeps what it replaced.
  const handledIds = useRef(new Set<string>());
  const snapshots = useRef(
    new Map<
      string,
      {
        before: EditorSnapshot;
        applied: ThemeEditorState;
        design: Extract<ApplyDesignOutput, { ok: true }>;
      }
    >(),
  );
  const [applied, setApplied] = useState<Record<string, AppliedState>>({});
  const [designProgress, setDesignProgress] = useState<
    Record<string, DesignProgress[]>
  >({});
  const [themeEvent, setThemeEvent] = useState<ThemeEvent | null>(null);

  const chat = useChat<ChatMessage>({
    transport: new DefaultChatTransport({
      api: "/api/generate-qr-theme",
      fetch: devFetch,
      prepareSendMessagesRequest: ({ body, messages, id }) => ({
        body: { ...body, id, messages, editor: editorContext() },
      }),
    }),
    sendAutomaticallyWhen: shouldResume,
    onError: (error) => {
      const defaultMessage = "Failed to design the QR code. Please try again.";
      const normalizedError = parseAiSdkTransportError(error, defaultMessage);

      if (
        normalizedError.code === "UNAUTHORIZED" ||
        normalizedError.status === 401
      ) {
        void handleUnauthorized();
        return;
      }

      setThemeEvent((prev) => ({ kind: "error", at: (prev?.at ?? 0) + 1 }));
      emitSound("error");
      track("ai_theme_generated", { status: "fail" });
      toast.error("An error occurred", {
        description: normalizedError.message,
      });
    },
    onData: (dataPart) => {
      if (dataPart.type !== "data-design-progress" || !dataPart.id) return;
      const id = dataPart.id;
      // The latest partial design, then one entry per scored attempt.
      setDesignProgress((current) => ({
        ...current,
        [id]: [
          ...(current[id] ?? []).filter((entry) => entry.stage !== "designing"),
          dataPart.data,
        ],
      }));
    },
    onFinish: () => {
      queryClient.invalidateQueries({
        queryKey: [SUBSCRIPTION_STATUS_QUERY_KEY],
      });
    },
  });

  const requestActive =
    chat.status === "submitted" || chat.status === "streaming";

  // Apply approved designs as their results arrive.
  const lastMessage = chat.messages.at(-1);
  const applyParts = useMemo(
    () =>
      lastMessage?.role === "assistant"
        ? lastMessage.parts.flatMap((part) =>
            part.type === APPLY_TOOL ? [part] : [],
          )
        : [],
    [lastMessage],
  );
  useEffect(() => {
    for (const part of applyParts) {
      if (handledIds.current.has(part.toolCallId)) continue;
      if (part.state === "output-available") {
        handledIds.current.add(part.toolCallId);
        const output = part.output;
        if (!output.ok) continue;
        const before = snapshot();
        const after = applyToEditor(output);
        snapshots.current.set(part.toolCallId, {
          before,
          applied: after,
          design: output,
        });
        setApplied((current) => ({ ...current, [part.toolCallId]: "applied" }));
        setThemeEvent((prev) => ({ kind: "applied", at: (prev?.at ?? 0) + 1 }));
        emitSound("ai-done");
        track("ai_theme_generated", { status: "success" });
      } else if (part.state === "output-error") {
        handledIds.current.add(part.toolCallId);
        setThemeEvent((prev) => ({ kind: "error", at: (prev?.at ?? 0) + 1 }));
        emitSound("error");
      }
    }
  }, [applyParts]);

  const undoApplied = useCallback((toolCallId: string) => {
    const entry = snapshots.current.get(toolCallId);
    if (!entry) return;
    restoreEditor(entry.before, entry.applied);
    setApplied((current) => ({ ...current, [toolCallId]: "undone" }));
  }, []);

  const redoApplied = useCallback((toolCallId: string) => {
    const entry = snapshots.current.get(toolCallId);
    if (!entry) return;
    const before = snapshot();
    const after = applyToEditor(entry.design);
    snapshots.current.set(toolCallId, { ...entry, before, applied: after });
    setApplied((current) => ({ ...current, [toolCallId]: "applied" }));
  }, []);

  // A design_qr call of the current request is running.
  const themeInFlight =
    requestActive &&
    lastMessage?.role === "assistant" &&
    lastMessage.parts.some(
      (part) =>
        part.type === DESIGN_TOOL &&
        (part.state === "input-streaming" || part.state === "input-available"),
    );

  // Progress of finished requests isn't needed: their results hold it.
  useEffect(() => {
    if (!requestActive) setDesignProgress({});
  }, [requestActive]);

  // Safety net: stop a request whose stream went silent, so the busy UI ends.
  const lastActivity = useRef(Date.now());
  // biome-ignore lint/correctness/useExhaustiveDependencies: any new chunk counts as activity
  useEffect(() => {
    lastActivity.current = Date.now();
  }, [chat.messages, chat.status, designProgress]);
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
    }
  }, [chat.status, chat.messages, setStoredMessages]);

  useEffect(() => {
    if (!hasStoreHydrated || hasInitializedRef.current) return;

    if (storedMessages.length > 0) {
      // Designs applied before a reload stay as they are; never re-apply.
      for (const message of storedMessages) {
        for (const part of message.parts) {
          if (isToolUIPart(part)) handledIds.current.add(part.toolCallId);
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
    designProgress,
    applied,
    undoApplied,
    redoApplied,
  };
  // Every render of the engine is new chat state for the consumers.
  useLayoutEffect(() => onChange(value));

  return null;
}
