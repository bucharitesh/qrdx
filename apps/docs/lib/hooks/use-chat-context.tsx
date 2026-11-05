"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import dynamic from "next/dynamic";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { DesignProgress } from "@/lib/ai/agent/tools";
import type { ChatMessage } from "@/types/ai";
import type { EditorChange } from "./chat-engine";

export interface ThemeEvent {
  kind: "applied" | "error";
  /** Increases with every event, so effects can tell them apart */
  at: number;
}

/** An approved design in the editor, or taken back with Undo. */
export type AppliedState = "applied" | "undone";

export interface ChatContextValue extends UseChatHelpers<ChatMessage> {
  startNewChat: () => void;
  resetMessagesUpToIndex: (index: number) => void;
  /**
   * A design_qr call of the current request is running, until its result
   * arrives or the request ends. Plain chat replies never set this.
   */
  themeInFlight: boolean;
  /** Last outcome (applied / error), for the preview glow. */
  themeEvent: ThemeEvent | null;
  /** Live progress of running design_qr calls, by tool call id */
  designProgress: Record<string, DesignProgress[]>;
  /** Approved designs applied in this session, by apply_design call id */
  applied: Record<string, AppliedState>;
  /** Puts an approved picture (use_image) in the editor, with Undo. */
  applyChange: (toolCallId: string, change: EditorChange) => void;
  /** The tool call came from a saved chat, not from this visit */
  isRestored: (toolCallId: string) => boolean;
  /** Puts back what an applied design replaced (content and style). */
  undoApplied: (toolCallId: string) => void;
  /** Applies an undone design again. */
  redoApplied: (toolCallId: string) => void;
}

type PendingCall = (chat: ChatContextValue) => void;

/*
 * The chat engine (AI SDK and zod) loads the first time a chat consumer
 * mounts, then stays mounted here at the root, so a request started on /ai
 * keeps streaming into /playground. Memo: it re-renders only on its own state.
 */
const ChatEngine = memo(
  dynamic(() => import("./chat-engine").then((m) => m.ChatEngine), {
    ssr: false,
  }),
);

const ChatContext = createContext<ChatContextValue | null>(null);
const ActivateChatContext = createContext<() => void>(() => {});

const METHODS = [
  "setMessages",
  "sendMessage",
  "regenerate",
  "stop",
  "resumeStream",
  "addToolResult",
  "addToolOutput",
  "addToolApprovalResponse",
  "clearError",
  "startNewChat",
  "resetMessagesUpToIndex",
] as const satisfies readonly (keyof ChatContextValue)[];

/** The chat before its engine has loaded: empty, and calls wait for it. */
function createIdleChat(
  queue: PendingCall[],
  activate: () => void,
): ChatContextValue {
  const deferred =
    (name: (typeof METHODS)[number]) =>
    (...args: unknown[]) =>
      new Promise<void>((resolve, reject) => {
        activate();
        queue.push((chat) => {
          const method = chat[name] as (...a: unknown[]) => unknown;
          Promise.resolve(method(...args)).then(() => resolve(), reject);
        });
      });
  return {
    id: "",
    messages: [],
    status: "ready",
    error: undefined,
    themeInFlight: false,
    themeEvent: null,
    designProgress: {},
    applied: {},
    applyChange: () => {},
    isRestored: () => true,
    undoApplied: () => {},
    redoApplied: () => {},
    ...Object.fromEntries(METHODS.map((name) => [name, deferred(name)])),
  } as unknown as ChatContextValue;
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [chat, setChat] = useState<ChatContextValue | null>(null);
  const [wanted, setWanted] = useState(false);
  const queue = useRef<PendingCall[]>([]);
  const activate = useCallback(() => setWanted(true), []);
  const idle = useMemo(
    () => createIdleChat(queue.current, activate),
    [activate],
  );

  const onChange = useCallback((next: ChatContextValue) => {
    setChat(next);
    for (const call of queue.current.splice(0)) call(next);
  }, []);

  return (
    <ActivateChatContext.Provider value={activate}>
      <ChatContext.Provider value={chat ?? idle}>
        {wanted && <ChatEngine onChange={onChange} />}
        {children}
      </ChatContext.Provider>
    </ActivateChatContext.Provider>
  );
}

export function useChatContext() {
  const activate = useContext(ActivateChatContext);
  useEffect(() => activate(), [activate]);
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return ctx;
}
