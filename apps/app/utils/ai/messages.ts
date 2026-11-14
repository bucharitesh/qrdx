import type { ChatMessage } from "@/types/ai";

function filterMessagesToDisplay(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((message) => {
    const hasTextPart = message.parts.some(
      (part) => part.type === "text" && Boolean(part.text),
    );
    // Agent steps, questions and approvals show as parts of their own.
    const hasThemeToolPart = message.parts.some((part) =>
      part.type.startsWith("tool-"),
    );
    const images = message.metadata?.promptData?.images;
    const hasAttachments = images && images.length > 0;
    return hasTextPart || hasAttachments || hasThemeToolPart;
  });
}

function getUserMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((message) => message.role === "user");
}

function getLastUserMessage(messages: ChatMessage[]): ChatMessage | undefined {
  return getUserMessages(messages).at(-1);
}

function getAssistantMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((message) => message.role === "assistant");
}

function getLastAssistantMessage(
  messages: ChatMessage[],
): ChatMessage | undefined {
  return getAssistantMessages(messages).at(-1);
}

export {
  filterMessagesToDisplay,
  getAssistantMessages,
  getLastAssistantMessage,
  getLastUserMessage,
  getUserMessages,
};
