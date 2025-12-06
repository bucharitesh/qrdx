import type { JSONContent } from "@tiptap/react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { idbStorage } from "./idb-storage";

interface AILocalDraftStore {
  editorContentDraft: JSONContent | null;
  setEditorContentDraft: (content: JSONContent | null) => void;
  setPromptDraft: (text: string) => void;
  imagesDraft: { url: string }[];
  setImagesDraft: (imagesDraft: { url: string }[]) => void;
  clearLocalDraft: () => void;
}

export const useAILocalDraftStore = create<AILocalDraftStore>()(
  persist(
    (set) => ({
      editorContentDraft: null,
      setEditorContentDraft: (content) => set({ editorContentDraft: content }),
      setPromptDraft: (text: string) =>
        set({
          editorContentDraft: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: text ? [{ type: "text", text }] : [],
              },
            ],
          },
        }),
      imagesDraft: [],
      setImagesDraft: (images) => set({ imagesDraft: images }),
      clearLocalDraft: () => set({ editorContentDraft: null, imagesDraft: [] }),
    }),
    {
      name: "ai-local-draft-store",
      storage: createJSONStorage(() => idbStorage),
    },
  ),
);
