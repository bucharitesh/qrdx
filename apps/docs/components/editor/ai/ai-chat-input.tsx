"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowUp, Loader2, Plus, StopCircle } from "lucide-react";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { MAX_IMAGE_FILES } from "@/lib/constants";
import { useAIChatForm } from "@/lib/hooks/use-ai-chat-form";
import { useAIEnhancePrompt } from "@/lib/hooks/use-ai-enhance-prompt";
import { useGuards } from "@/lib/hooks/use-gaurds";
import { useSubscription } from "@/lib/hooks/use-subscription";
import type { AIPromptData } from "@/types/ai";
import { AIChatFormBody } from "./ai-chat-form-body";
import { EnhancePromptButton } from "./enhance-prompt-button";
import { ImageUploader } from "./image-uploader";

interface AIChatInputProps {
  onThemeGeneration: (promptData: AIPromptData) => Promise<void>;
  isGeneratingTheme: boolean;
  onCancelThemeGeneration: () => void;
  onNewChat?: () => void;
  hasMessages?: boolean;
}

export function AIChatInput({
  onThemeGeneration,
  isGeneratingTheme,
  onCancelThemeGeneration,
  onNewChat,
  hasMessages = false,
}: AIChatInputProps) {
  const { checkValidSession, checkValidSubscription } = useGuards();
  const { subscriptionStatus } = useSubscription();
  const isPro = subscriptionStatus?.isSubscribed ?? false;
  const hasFreeRequestsLeft = (subscriptionStatus?.requestsRemaining ?? 0) > 0;

  const {
    editorContentDraft,
    handleContentChange,
    promptData,
    isEmptyPrompt,
    clearLocalDraft,
    uploadedImages,
    fileInputRef,
    handleImagesUpload,
    handleImageRemove,
    clearUploadedImages,
    isSomeImageUploading,
    isUserDragging,
    isInitializing,
  } = useAIChatForm();

  const handleNewChat = () => {
    onNewChat?.();
    clearLocalDraft();
    clearUploadedImages();
  };

  const {
    startEnhance,
    stopEnhance,
    enhancedPromptAsJsonContent,
    isEnhancingPrompt,
  } = useAIEnhancePrompt();

  const handleEnhancePrompt = () => {
    if (!checkValidSession() || !checkValidSubscription()) return;

    // Only send images that are not loading, and strip loading property
    const images = uploadedImages
      .filter((img) => !img.loading)
      .map(({ url }) => ({ url }));
    startEnhance({ ...promptData, images });
  };

  const handleGenerateSubmit = async () => {
    // Only send images that are not loading, and strip loading property
    const images = uploadedImages
      .filter((img) => !img.loading)
      .map(({ url }) => ({ url }));

    // Proceed only if there is text, or at least one image
    if (isEmptyPrompt && images.length === 0) return;

    if (!checkValidSession() || !checkValidSubscription()) return;

    await onThemeGeneration({
      ...promptData,
      images,
    });

    clearLocalDraft();
    clearUploadedImages();
  };

  return (
    <div className="relative transition-all contain-layout">
      {isGeneratingTheme && (
        <div className="bg-muted/50 absolute inset-x-0 -top-8 flex h-8 items-center justify-center gap-1.5 rounded-t-lg border-x border-t text-xs">
          <Loader2 className="size-3 animate-spin" />
          <span>Generating...</span>
        </div>
      )}

      <div className="bg-background relative isolate z-10 flex size-full min-h-[100px] flex-1 flex-col gap-2 overflow-hidden rounded-lg border p-2 shadow-xs">
        <AIChatFormBody
          isUserDragging={isUserDragging}
          disabled={isEnhancingPrompt}
          canSubmit={
            !isGeneratingTheme &&
            !isEnhancingPrompt &&
            !isEmptyPrompt &&
            !isSomeImageUploading &&
            !isInitializing
          }
          uploadedImages={uploadedImages}
          handleImagesUpload={handleImagesUpload}
          handleImageRemove={handleImageRemove}
          handleContentChange={handleContentChange}
          handleGenerate={handleGenerateSubmit}
          initialEditorContent={editorContentDraft ?? undefined}
          textareaKey={editorContentDraft ? "with-draft" : "no-draft"}
          externalEditorContent={enhancedPromptAsJsonContent}
          isStreamingContent={isEnhancingPrompt}
        />
        <div className="@container/form flex items-center justify-between gap-2">
          {hasMessages && onNewChat ? (
            <TooltipWrapper label="Create new chat" asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNewChat}
                disabled={
                  isGeneratingTheme || isEnhancingPrompt || isInitializing
                }
                className="flex items-center gap-1.5 shadow-none"
              >
                <Plus className="size-4" />
                <span>New</span>
              </Button>
            </TooltipWrapper>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            {(isPro || hasFreeRequestsLeft) && promptData?.content ? (
              <EnhancePromptButton
                isEnhancing={isEnhancingPrompt}
                onStart={handleEnhancePrompt}
                onStop={stopEnhance}
                disabled={isGeneratingTheme || isInitializing}
              />
            ) : null}

            <ImageUploader
              fileInputRef={fileInputRef}
              onImagesUpload={handleImagesUpload}
              onClick={() => fileInputRef.current?.click()}
              disabled={
                isGeneratingTheme ||
                isEnhancingPrompt ||
                isInitializing ||
                uploadedImages.some((img) => img.loading) ||
                uploadedImages.length >= MAX_IMAGE_FILES
              }
            />

            {isGeneratingTheme ? (
              <TooltipWrapper label="Cancel generation" asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={onCancelThemeGeneration}
                  className={cn(
                    "flex items-center gap-1.5 shadow-none",
                    "@max-[350px]/form:w-8",
                  )}
                >
                  <StopCircle className="size-4" />
                  <span className="hidden @[350px]/form:inline-flex">Stop</span>
                </Button>
              </TooltipWrapper>
            ) : (
              <TooltipWrapper label="Send message" asChild>
                <Button
                  size="sm"
                  className="size-8 shadow-none"
                  onClick={handleGenerateSubmit}
                  disabled={
                    isEmptyPrompt ||
                    isSomeImageUploading ||
                    isGeneratingTheme ||
                    isEnhancingPrompt ||
                    isInitializing
                  }
                >
                  {isGeneratingTheme ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ArrowUp className="size-4" />
                  )}
                </Button>
              </TooltipWrapper>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
