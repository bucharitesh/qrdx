/** biome-ignore-all lint/suspicious/noArrayIndexKey: false positive */
/** biome-ignore-all lint/suspicious/useIterableCallbackReturn: false positive */

import { ScrollArea } from "@repo/design-system/components/ui/scroll-area";
import { cn } from "@repo/design-system/lib/utils";
import { AnimatedBot } from "@/components/editor/ai/animated-bot";
import type { AIPromptData, ChatMessage } from "@/types/ai";
import { buildAIPromptRender } from "@/utils/ai/ai-prompt";
import ColorPreview from "../theme-preview/color-preview";
import { ChatImagePreview } from "./chat-image-preview";
import { ChatThemePreview } from "./chat-theme-preview";
import { MessageActions } from "./message-actions";
import { MessageEditForm } from "./message-edit-form";
import { StreamText } from "./stream-text";

type MessageProps = {
  message: ChatMessage;
  onRetry: () => void;
  isEditing: boolean;
  onEdit: () => void;
  onEditSubmit: (newPromptData: AIPromptData) => void;
  onEditCancel: () => void;
  isLastMessageStreaming: boolean;
  isGeneratingTheme: boolean;
};

export default function Message({
  message,
  onRetry,
  isEditing,
  onEdit,
  onEditSubmit,
  onEditCancel,
  isLastMessageStreaming,
  isGeneratingTheme,
}: MessageProps) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  const showMessageActions = !isLastMessageStreaming;

  return (
    <div
      className={cn(
        "flex w-full items-start gap-4",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "flex w-full max-w-[90%] items-start",
          isUser ? "justify-end" : "",
        )}
      >
        <div
          className={cn(
            "group/message relative flex w-full flex-col gap-2 wrap-anywhere whitespace-pre-wrap",
          )}
        >
          {isUser && (
            <UserMessage
              message={message}
              isEditing={isEditing}
              onRetry={onRetry}
              onEdit={onEdit}
              onEditSubmit={onEditSubmit}
              onEditCancel={onEditCancel}
              isGeneratingTheme={isGeneratingTheme}
            />
          )}

          {isAssistant && (
            <AssistantMessage
              message={message}
              isLastMessageStreaming={isLastMessageStreaming}
            />
          )}

          {showMessageActions && (
            <MessageActions
              message={message}
              onRetry={onRetry}
              onEdit={onEdit}
              isEditing={isEditing}
              isGeneratingTheme={isGeneratingTheme}
            />
          )}
        </div>
      </div>
    </div>
  );
}

interface AssistantMessageProps {
  message: ChatMessage;
  isLastMessageStreaming: boolean;
}

function AssistantMessage({
  message,
  isLastMessageStreaming,
}: AssistantMessageProps) {
  return (
    <div className="flex items-start gap-3">
      <div className="bg-background/70 relative grid size-8 shrink-0 place-items-center rounded-full border shadow-xs backdrop-blur-sm select-none">
        <AnimatedBot
          className="size-5"
          thinking={isLastMessageStreaming}
          title="QRdx AI"
        />
      </div>

      <div className="relative flex w-full flex-col gap-3 mt-1.5">
        {message.parts.map((part, idx) => {
          const { type } = part;
          const key = `message-${message.id}-part-${idx}`;

          if (type === "text") {
            return (
              <StreamText
                key={key}
                text={part.text}
                className="w-fit text-sm leading-relaxed"
                animate={isLastMessageStreaming}
                markdown
              />
            );
          }

          if (type === "tool-generateQRTheme") {
            const { state } = part;

            if (state === "output-available") {
              const themeStyles = part.output;
              return (
                <ChatThemePreview
                  key={key}
                  status="complete"
                  themeStyles={themeStyles}
                  className="p-0 border-border/40 shadow-sm overflow-hidden rounded-xl"
                >
                  <ScrollArea className="h-48">
                    <div className="p-3">
                      <ColorPreview styles={themeStyles} />
                    </div>
                  </ScrollArea>
                </ChatThemePreview>
              );
            }

            if (state === "output-error") {
              return (
                <ChatThemePreview key={key} status="error" className="p-0" />
              );
            }

            // Still generating only while this request runs; a call left
            // unfinished by a stopped or failed request reads as stopped.
            return (
              <ChatThemePreview
                key={key}
                status={isLastMessageStreaming ? "loading" : "error"}
                className="p-0"
              />
            );
          }
        })}
      </div>
    </div>
  );
}

interface UserMessageProps {
  message: ChatMessage;
  isEditing: boolean;
  onRetry: () => void;
  onEdit: () => void;
  onEditSubmit: (newPromptData: AIPromptData) => void;
  onEditCancel: () => void;
  isGeneratingTheme: boolean;
}

function UserMessage({
  message,
  isEditing,
  onEditSubmit,
  onEditCancel,
  isGeneratingTheme,
}: UserMessageProps) {
  const promptData = message.metadata?.promptData;
  const shouldDisplayMsgContent = promptData?.content?.trim() !== "";

  const getDisplayContent = () => {
    if (promptData) {
      return buildAIPromptRender(promptData);
    }

    return message.parts
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("");
  };

  const msgContent = getDisplayContent();

  const getImagesToDisplay = () => {
    const images = promptData?.images ?? [];

    if (images.length === 1) {
      return (
        <div className="self-end mb-2">
          <ChatImagePreview
            src={images[0].url}
            alt="Image preview"
            className="rounded-xl border border-border/20 shadow-sm"
          />
        </div>
      );
    } else if (images.length > 1) {
      return (
        <div className="flex flex-row items-center justify-end gap-2 self-end mb-2">
          {images.map((image, idx) => (
            <div key={idx} className="aspect-square size-full max-w-32 flex-1">
              <ChatImagePreview
                className="size-full object-cover rounded-xl border border-border/20 shadow-sm"
                src={image.url}
                alt="Image preview"
              />
            </div>
          ))}
        </div>
      );
    }

    return null;
  };

  const msgImages = getImagesToDisplay();

  if (isEditing) {
    return (
      <MessageEditForm
        key={message.id}
        message={message}
        onEditSubmit={onEditSubmit}
        onEditCancel={onEditCancel}
        disabled={isGeneratingTheme}
      />
    );
  }

  return (
    <div className="relative flex flex-col items-end gap-1">
      {msgImages}

      {shouldDisplayMsgContent && (
        <div
          className={cn(
            "bg-secondary text-secondary-foreground w-fit max-w-[85%] self-end rounded-lg px-3.5 py-2 text-sm leading-relaxed",
          )}
        >
          {msgContent}
        </div>
      )}
    </div>
  );
}
