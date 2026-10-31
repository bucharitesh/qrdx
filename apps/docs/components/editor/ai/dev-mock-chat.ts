// Dev-only replay of /api/generate-qr-theme's UI message stream (the same
// chunk sequence the route produces), loaded only in development.
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import type { ChatMessage } from "@/types/ai";
import type { ThemeStyles } from "@/types/theme";
import type { AIMockMode } from "./dev-mock-mode";

const FINAL_STYLES = {
  bgColor: "#0a0a0f",
  fgColor: "#22d3ee",
  eyeColor: "#e879f9",
  dotColor: "#22d3ee",
  bodyPattern: "circle",
  cornerEyePattern: "rounded",
  cornerEyeDotPattern: "circle",
} satisfies Partial<ThemeStyles>;

const PARTIALS: Partial<ThemeStyles>[] = [
  { bgColor: "#0a0a0f" },
  { bgColor: "#0a0a0f", fgColor: "#22d3ee" },
  { bgColor: "#0a0a0f", fgColor: "#22d3ee", eyeColor: "#e879f9" },
  {
    bgColor: "#0a0a0f",
    fgColor: "#22d3ee",
    eyeColor: "#e879f9",
    dotColor: "#22d3ee",
    bodyPattern: "circle",
  },
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function mockChatResponse(mode: AIMockMode): Response {
  const stream = createUIMessageStream<ChatMessage>({
    execute: async ({ writer }) => {
      const text = async (id: string, value: string) => {
        writer.write({ type: "text-start", id });
        for (const word of value.split(/(?<= )/)) {
          writer.write({ type: "text-delta", id, delta: word });
          await sleep(45);
        }
        writer.write({ type: "text-end", id });
      };

      writer.write({ type: "start" });
      writer.write({ type: "start-step" });
      await sleep(500);

      if (mode === "chat") {
        await text(
          "t-chat",
          "Hi! Describe a vibe, a brand or upload an image, and I'll design a QR theme for it.",
        );
        writer.write({ type: "finish-step" });
        writer.write({ type: "finish", finishReason: "stop" });
        return;
      }

      await text(
        "t-plan",
        "Going for neon nightlife: cyan dots on near-black with magenta eyes.",
      );
      const toolCallId = "mock-tool-1";
      writer.write({
        type: "tool-input-start",
        toolCallId,
        toolName: "generateQRTheme",
      });
      writer.write({
        type: "tool-input-available",
        toolCallId,
        toolName: "generateQRTheme",
        input: {},
      });

      for (const partial of PARTIALS) {
        await sleep(900);
        writer.write({
          id: toolCallId,
          type: "data-generated-qr-style",
          data: { status: "streaming", themeStyles: partial },
          transient: true,
        });
      }
      await sleep(900);

      if (mode === "error") {
        writer.write({
          type: "tool-output-error",
          toolCallId,
          errorText: "Mock: the theme model failed",
        });
        writer.write({ type: "error", errorText: "Mock: generation failed" });
        return;
      }

      writer.write({
        id: toolCallId,
        type: "data-generated-qr-style",
        data: { status: "ready", themeStyles: FINAL_STYLES },
        transient: true,
      });
      writer.write({
        type: "tool-output-available",
        toolCallId,
        output: FINAL_STYLES,
      });
      writer.write({
        type: "message-metadata",
        messageMetadata: { themeStyles: FINAL_STYLES },
      });
      writer.write({ type: "finish-step" });
      writer.write({ type: "start-step" });
      await sleep(300);
      await text(
        "t-summary",
        "Done. High contrast keeps it scannable in dim light.",
      );
      writer.write({ type: "finish-step" });
      writer.write({ type: "finish", finishReason: "stop" });
    },
  });
  return createUIMessageStreamResponse({ stream });
}
