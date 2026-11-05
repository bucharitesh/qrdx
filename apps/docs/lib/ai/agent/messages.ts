import "server-only";

import { convertToModelMessages, type ModelMessage, type ToolSet } from "ai";
import type { ChatMessage } from "@/types/ai";
import { buildUserContentPartsFromPromptData } from "@/utils/ai/message-converter";

// Chat history (UI messages from the browser) → model messages. User turns
// are built from their prompt data as before (text, attached images, @theme
// mentions). Assistant turns keep their tool calls and results, which the
// AI SDK needs to resume a run after an approval or an answer. Parts of
// tools the agent no longer has (generateQRTheme, before the agent) become
// text, so old chats keep their context.

const LEGACY_THEME_TOOL = "tool-generateQRTheme";

function legacyText(part: ChatMessage["parts"][number]): string | null {
  if (part.type !== LEGACY_THEME_TOOL) return null;
  const output = (part as { output?: unknown; state?: string }).output;
  return output
    ? `(Style I generated earlier: ${JSON.stringify(output)})`
    : null;
}

export async function toAgentModelMessages(
  messages: ChatMessage[],
  tools: ToolSet,
): Promise<ModelMessage[]> {
  const known = new Set(Object.keys(tools).map((name) => `tool-${name}`));
  const out: ModelMessage[] = [];
  // Attached pictures are numbered across the chat, so use_image can name one.
  let images = 0;
  for (const message of messages) {
    if (message.role === "user") {
      const promptData = message.metadata?.promptData;
      const first = images;
      images += promptData?.images?.length ?? 0;
      const content = promptData
        ? buildUserContentPartsFromPromptData(promptData, {
            labelImage: (index) => `Image ${first + index + 1}:`,
          })
        : message.parts.flatMap((part) =>
            part.type === "text" && part.text.trim()
              ? [{ type: "text" as const, text: part.text }]
              : [],
          );
      if (content.length > 0) out.push({ role: "user", content });
      continue;
    }
    if (message.role !== "assistant") continue;

    const parts = message.parts.flatMap((part): ChatMessage["parts"] => {
      const legacy = legacyText(part);
      if (legacy) return [{ type: "text", text: legacy, state: "done" }];
      if (part.type.startsWith("tool-") && !known.has(part.type)) return [];
      return [part];
    });
    if (parts.length === 0) continue;
    out.push(
      ...(await convertToModelMessages([{ ...message, parts }], {
        tools,
        ignoreIncompleteToolCalls: true,
      })),
    );
  }
  return out;
}
