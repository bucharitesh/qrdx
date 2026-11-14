import type { DeepPartial, InferUITools, UIMessage } from "ai";
import type { DesignProgress, QRAgentTools } from "@/lib/ai/agent/tools";
import type { ThemeStyles } from "./theme";

export type MentionReference = {
  id: string;
  label: string;
  themeData: ThemeStyles;
};

export type PromptImage = {
  url: string;
};

export type AIPromptData = {
  content: string;
  mentions: MentionReference[];
  images?: PromptImage[];
};

export type MyMetadata = {
  promptData?: AIPromptData;
  /** Chats from before the agent: the style a reply generated */
  themeStyles?: Partial<ThemeStyles>;
  /**
   * Signed by the server when a run pauses for the user (a question or an
   * approval), so resuming it isn't counted as a new AI request.
   */
  resume?: string;
};

export type MyUIDataParts = {
  /** Live progress of a design_qr call (transient) */
  "design-progress": DesignProgress;
  /** Chats from before the agent: the theme tool's live preview */
  "generated-qr-style":
    | {
        status: "streaming";
        themeStyles: DeepPartial<ThemeStyles>;
      }
    | {
        status: "ready";
        themeStyles: Partial<ThemeStyles>;
      };
};

/** The theme tool chats used before the agent; still rendered from history. */
type LegacyUITools = {
  generateQRTheme: {
    input: Record<string, never>;
    output: ThemeStyles;
  };
};

export type MyUITools = InferUITools<QRAgentTools> & LegacyUITools;

export type ChatMessage = UIMessage<MyMetadata, MyUIDataParts, MyUITools>;
