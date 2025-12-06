import type {
  DeepPartial,
  InferUITools,
  UIMessage,
  UIMessageStreamWriter,
} from "ai";
import type { QR_THEME_GENERATION_TOOLS } from "@/lib/ai/generate-qr-theme/tools";
import type { QRStyle } from "@/types/qr";

// Theme data for mentions (referencing presets/current styles)
export type ThemeData = {
  light: Record<string, string>;
  dark: Record<string, string>;
};

export type MentionReference = {
  id: string;
  label: string;
  themeData: ThemeData;
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
  qrStyle?: Partial<QRStyle>;
};

export type MyUIDataParts = {
  "generated-qr-style":
    | {
        status: "streaming";
        qrStyle: DeepPartial<QRStyle>;
      }
    | {
        status: "ready";
        qrStyle: Partial<QRStyle>;
      };
};

type QRGenerationUITools = InferUITools<typeof QR_THEME_GENERATION_TOOLS>;
export type MyUITools = QRGenerationUITools;

export type ChatMessage = UIMessage<MyMetadata, MyUIDataParts, MyUITools>;

export type AdditionalAIContext = {
  writer: UIMessageStreamWriter<ChatMessage>;
};
