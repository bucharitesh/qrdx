"use client";

import type { JSONContent } from "@tiptap/react";
import { useEffect, useReducer, useRef, useTransition } from "react";
import { MAX_IMAGE_FILE_SIZE, MAX_IMAGE_FILES } from "@/lib/constants";
import { useDocumentDragAndDropIntent } from "@/lib/hooks/use-document-drag-and-drop-intent";
import { useImageUpload } from "@/lib/hooks/use-image-upload";
import { createSyncedImageUploadReducer } from "@/lib/hooks/use-image-upload-reducer";
import { useAILocalDraftStore } from "@/store/ai-local-draft-store";
import { convertJSONContentToPromptData } from "@/utils/ai/ai-prompt";

export function useAIChatForm() {
  const {
    editorContentDraft,
    setEditorContentDraft,
    clearLocalDraft,
    imagesDraft,
    setImagesDraft,
  } = useAILocalDraftStore();

  const [isInitializing, startTransition] = useTransition();
  const hasInitialized = useRef(false);

  const [uploadedImages, dispatch] = useReducer(
    createSyncedImageUploadReducer(setImagesDraft),
    [], // Always start with empty array to avoid stale initial state
  );

  // Initialize uploadedImages from persisted draft once
  useEffect(() => {
    if (!hasInitialized.current && imagesDraft.length > 0) {
      hasInitialized.current = true;

      startTransition(() => {
        dispatch({
          type: "INITIALIZE",
          payload: imagesDraft.map(({ url }) => ({ url })),
        });
      });
    }
  }, [imagesDraft]);

  const {
    fileInputRef,
    handleImagesUpload,
    handleImageRemove,
    clearUploadedImages,
    isSomeImageUploading,
  } = useImageUpload({
    maxFiles: MAX_IMAGE_FILES,
    maxFileSize: MAX_IMAGE_FILE_SIZE,
    images: uploadedImages,
    dispatch,
  });

  const { isUserDragging } = useDocumentDragAndDropIntent();

  const promptData = convertJSONContentToPromptData(
    editorContentDraft || { type: "doc", content: [] },
  );

  const isEmptyPrompt =
    uploadedImages.length === 0 &&
    (!promptData?.content?.trim() || promptData.content.length === 0);

  const handleContentChange = (jsonContent: JSONContent) => {
    setEditorContentDraft(jsonContent);
  };

  return {
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
  };
}


