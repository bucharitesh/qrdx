"use client";

import { cn } from "@repo/design-system/lib/utils";
import { AIChatFormBody } from "@/components/editor/ai/ai-chat-form-body";
import { AISendButton } from "@/components/editor/ai/ai-send-button";
import { AlertBanner } from "@/components/editor/ai/alert-banner";
import { EnhancePromptButton } from "@/components/editor/ai/enhance-prompt-button";
import { ImageUploader } from "@/components/editor/ai/image-uploader";
import { COMPOSER_PLACEHOLDERS } from "@/components/editor/ai/prompt-suggestions";
import { ShineBorder } from "@/components/editor/ai/shine-border";
import ThemePresetSelect from "@/components/editor/qr-preset-select";
import { MAX_IMAGE_FILES } from "@/lib/constants";
import { useAIChatForm } from "@/lib/hooks/use-ai-chat-form";
import { useAIEnhancePrompt } from "@/lib/hooks/use-ai-enhance-prompt";
import { useGuards } from "@/lib/hooks/use-gaurds";
import { useSubscription } from "@/lib/hooks/use-subscription";
import type { AIPromptData } from "@/types/ai";

export function AIChatForm({
  onThemeGeneration,
  isGeneratingTheme,
  onCancelThemeGeneration,
}: {
  onThemeGeneration: (promptData: AIPromptData) => void;
  isGeneratingTheme: boolean;
  onCancelThemeGeneration: () => void;
}) {
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
    isSomeImageUploading,
    isUserDragging,
    isInitializing,
  } = useAIChatForm();

  const { checkValidSession, checkValidSubscription } = useGuards();
  const { subscriptionStatus } = useSubscription();
  const isPro = subscriptionStatus?.isSubscribed ?? false;
  const hasFreeRequestsLeft = (subscriptionStatus?.requestsRemaining ?? 0) > 0;

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

  const handleGenerate = async () => {
    if (!checkValidSession() || !checkValidSubscription()) return; // Act as an early return

    // Only send images that are not loading, and strip loading property
    const images = uploadedImages
      .filter((img) => !img.loading)
      .map(({ url }) => ({ url }));

    // Proceed only if there is text, or at least one image
    if (isEmptyPrompt && images.length === 0) return;

    onThemeGeneration({
      ...promptData,
      content: promptData?.content ?? "",
      mentions: promptData?.mentions ?? [],
      images,
    });

    clearLocalDraft();
  };

  return (
    <div className="@container/form relative transition-all contain-layout">
      <AlertBanner />

      <div
        className={cn(
          "group relative isolate z-10 flex size-full min-h-[100px] flex-1 flex-col gap-2 rounded-lg border p-2 backdrop-blur-xl transition-[border-color] duration-300 focus-within:border-transparent",
          "bg-background/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),inset_0_0_28px_-14px_rgba(139,92,246,0.35),0_16px_40px_-20px_rgba(0,0,0,0.35)]",
          "dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_0_32px_-14px_rgba(167,139,250,0.3),0_16px_40px_-20px_rgba(0,0,0,0.8)]",
          isGeneratingTheme && "border-transparent",
        )}
      >
        <ShineBorder
          boostOnFocus
          className={cn(
            "opacity-0 transition-opacity duration-300 group-focus-within:opacity-100",
            isGeneratingTheme && "opacity-100",
          )}
          glow
        />
        {/* Opaque fill inside the ring, so the glow only shows as an outer
            halo and the box keeps the normal input surface. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-[1.25px] -z-10 rounded-[calc(var(--radius)-1.25px)] bg-background dark:bg-[linear-gradient(180deg,#26262b,#18181c)]"
        />
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
          handleGenerate={handleGenerate}
          initialEditorContent={editorContentDraft ?? undefined}
          textareaKey={editorContentDraft ? "with-draft" : "no-draft"}
          externalEditorContent={enhancedPromptAsJsonContent}
          isStreamingContent={isEnhancingPrompt}
          placeholders={COMPOSER_PLACEHOLDERS}
        />

        <div className="flex items-center justify-between gap-2">
          <div className="flex w-full max-w-64 items-center gap-2 overflow-hidden">
            <ThemePresetSelect
              disabled={
                isGeneratingTheme || isEnhancingPrompt || isInitializing
              }
              withCycleThemes={false}
              variant="outline"
              size="sm"
              className="shadow-none"
            />
          </div>

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

            <AISendButton
              disabled={
                isEmptyPrompt ||
                isSomeImageUploading ||
                isEnhancingPrompt ||
                isInitializing
              }
              generating={isGeneratingTheme}
              label="Generate"
              onClick={handleGenerate}
              onStop={onCancelThemeGeneration}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
