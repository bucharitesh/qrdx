"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Kbd } from "@repo/design-system/components/ui/kbd";
import { cn } from "@repo/design-system/lib/utils";
import { Add as Plus } from "iconsax-reactjs";
import { InfoHint } from "@/components/help/info-hint";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { MAX_IMAGE_FILES } from "@/lib/constants";
import { useAIChatForm } from "@/lib/hooks/use-ai-chat-form";
import { useAIEnhancePrompt } from "@/lib/hooks/use-ai-enhance-prompt";
import { useChatContext } from "@/lib/hooks/use-chat-context";
import { useGuards } from "@/lib/hooks/use-gaurds";
import { useMounted } from "@/lib/hooks/use-mounted";
import { usePostLoginAction } from "@/lib/hooks/use-post-login-action";
import { useSubscription } from "@/lib/hooks/use-subscription";
import type { AIPromptData } from "@/types/ai";
import { AIChatFormBody } from "./ai-chat-form-body";
import { AISendButton } from "./ai-send-button";
import { AlertBanner, BannerWrapper } from "./alert-banner";
import { AnimatedBot } from "./animated-bot";
import { getAIMockMode } from "./dev-mock-mode";
import { EnhancePromptButton } from "./enhance-prompt-button";
import { ImageUploader } from "./image-uploader";
import { COMPOSER_PLACEHOLDERS } from "./prompt-suggestions";
import { ShineBorder, ShineText } from "./shine-border";

type ThemeGenerationPayload = {
  promptData: AIPromptData;
  options: {
    shouldClearLocalDraft?: boolean;
  };
};

interface ChatInputProps {
  onThemeGeneration: (promptData: AIPromptData) => Promise<void>;
  isGeneratingTheme: boolean;
  onCancelThemeGeneration: () => void;
}

export function ChatInput({
  onThemeGeneration,
  isGeneratingTheme,
  onCancelThemeGeneration,
}: ChatInputProps) {
  const { messages, startNewChat, themeInFlight } = useChatContext();
  const guards = useGuards();
  // Dev-only `?ai-mock=` replays a response without signing in.
  const isMock = getAIMockMode() !== null;
  const checkValidSession: typeof guards.checkValidSession = (...args) =>
    isMock || guards.checkValidSession(...args);
  const checkValidSubscription = () =>
    isMock || guards.checkValidSubscription();
  const isMounted = useMounted();
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
    startNewChat();
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

  const generateTheme = async (payload: ThemeGenerationPayload) => {
    const { promptData, options } = payload;

    if (options.shouldClearLocalDraft) {
      clearLocalDraft();
      clearUploadedImages();
    }

    onThemeGeneration(promptData);
  };

  const handleGenerateSubmit = async () => {
    // Only send images that are not loading, and strip loading property
    const images = uploadedImages
      .filter((img) => !img.loading)
      .map(({ url }) => ({ url }));

    // Proceed only if there is text, or at least one image
    if (isEmptyPrompt && images.length === 0) return;

    const payload: ThemeGenerationPayload = {
      promptData: {
        ...promptData,
        images,
      },
      options: {
        shouldClearLocalDraft: true,
      },
    };

    if (!checkValidSession("signup", "AI_GENERATE_FROM_CHAT", payload)) return;
    if (!checkValidSubscription()) return;

    generateTheme(payload);
  };

  usePostLoginAction("AI_GENERATE_FROM_CHAT", (payload) => {
    generateTheme(payload);
  });

  const canSend =
    !isEmptyPrompt &&
    !isSomeImageUploading &&
    !isEnhancingPrompt &&
    !isInitializing;

  return (
    <div className="relative transition-all contain-layout">
      <BannerWrapper show={themeInFlight}>
        <div className="flex size-full items-center gap-2">
          <AnimatedBot className="size-4" thinking />
          <ShineText className="text-xs font-medium">
            Designing your theme…
          </ShineText>
        </div>
      </BannerWrapper>

      <AlertBanner />
      <div
        className={cn(
          "group relative isolate z-10 flex size-full min-h-[100px] flex-1 flex-col gap-2 rounded-lg border p-2 backdrop-blur-xl transition-[border-color,box-shadow] duration-300",
          "bg-background/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),inset_0_0_28px_-14px_rgba(139,92,246,0.35),0_10px_30px_-18px_rgba(0,0,0,0.35)]",
          "dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_0_32px_-14px_rgba(167,139,250,0.3),0_12px_32px_-18px_rgba(0,0,0,0.8)]",
          "focus-within:border-transparent",
          isGeneratingTheme && "border-transparent",
        )}
      >
        <ShineBorder
          boostOnFocus
          className={cn(
            "opacity-0 transition-opacity duration-300 group-focus-within:opacity-100",
            isGeneratingTheme && "opacity-100",
          )}
          glow={isGeneratingTheme}
        />
        {/* Opaque fill just inside the ring so the glow never tints the input */}
        <span
          aria-hidden
          className="bg-background pointer-events-none absolute inset-[1.25px] -z-10 rounded-[calc(var(--radius)-1.25px)] dark:bg-[linear-gradient(180deg,#1f1f23,#18181c)]"
        />
        <AIChatFormBody
          isUserDragging={isUserDragging}
          disabled={isEnhancingPrompt}
          canSubmit={canSend && !isGeneratingTheme}
          uploadedImages={uploadedImages}
          handleImagesUpload={handleImagesUpload}
          handleImageRemove={handleImageRemove}
          handleContentChange={handleContentChange}
          handleGenerate={handleGenerateSubmit}
          initialEditorContent={editorContentDraft ?? undefined}
          textareaKey={editorContentDraft ? "with-draft" : "no-draft"}
          externalEditorContent={enhancedPromptAsJsonContent}
          isStreamingContent={isEnhancingPrompt}
          placeholders={COMPOSER_PLACEHOLDERS}
        />
        <div className="@container/form flex items-center justify-between gap-1">
          <div className="flex items-center gap-0.5">
            <TooltipWrapper label="Start a new chat" asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNewChat}
                disabled={
                  !isMounted ||
                  isGeneratingTheme ||
                  isEnhancingPrompt ||
                  isInitializing ||
                  messages.length === 0
                }
                className="text-muted-foreground hover:text-foreground gap-1.5 shadow-none"
              >
                <Plus />
                <span className="hidden @[300px]/form:inline">New chat</span>
              </Button>
            </TooltipWrapper>

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
            <InfoHint align="start" className="mx-1.5" id="ai-generate" />
          </div>

          <div className="flex items-center gap-1.5">
            {(isPro || hasFreeRequestsLeft) && promptData?.content ? (
              <EnhancePromptButton
                isEnhancing={isEnhancingPrompt}
                onStart={handleEnhancePrompt}
                onStop={stopEnhance}
                disabled={isGeneratingTheme || isInitializing}
              />
            ) : null}

            <AISendButton
              disabled={!canSend}
              generating={isGeneratingTheme}
              label="Generate"
              onClick={handleGenerateSubmit}
              onStop={onCancelThemeGeneration}
            />
          </div>
        </div>
      </div>
      <p className="text-muted-foreground/80 mt-1.5 hidden items-center justify-end gap-1 px-1 text-[11px] sm:flex">
        <Kbd className="h-4 min-w-4 text-[10px]">⏎</Kbd> to send
        <span aria-hidden>·</span>
        <Kbd className="h-4 min-w-4 text-[10px]">⇧⏎</Kbd> new line
      </p>
    </div>
  );
}
