import type {
  DeepPartial,
  InferUITools,
  UIMessage,
  UIMessageStreamWriter,
} from "ai";
import type { QR_THEME_GENERATION_TOOLS } from "@/lib/ai/generate-qr-theme/tools";
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
  themeStyles?: Partial<ThemeStyles>;
};

export type MyUIDataParts = {
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

type ThemeGenerationUITools = InferUITools<typeof QR_THEME_GENERATION_TOOLS>;
export type MyUITools = ThemeGenerationUITools;

export type ChatMessage = UIMessage<MyMetadata, MyUIDataParts, MyUITools>;

export type AdditionalAIContext = {
  writer: UIMessageStreamWriter<ChatMessage>;
};
