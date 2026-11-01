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
import type { ChatMessage } from "@/types/ai";

export interface ThemeEvent {
  kind: "applied" | "error";
  /** Increases with every event, so effects can tell them apart */
  at: number;
}

export interface ChatContextValue extends UseChatHelpers<ChatMessage> {
  startNewChat: () => void;
  resetMessagesUpToIndex: (index: number) => void;
  /**
   * A generateQRTheme call of the current request is running: from its first
   * tool or data part until its output is applied, it fails, or the request
   * ends. Plain chat replies never set this.
   */
  themeInFlight: boolean;
  /** Last theme outcome (applied / error), for the preview glow. */
  themeEvent: ThemeEvent | null;
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
