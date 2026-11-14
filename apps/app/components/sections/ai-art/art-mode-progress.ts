"use client";

// The progress text of a scene or photo run: "Painting the picture…" while a
// scene's picture is being made (step 1), then "Painting the code into it…".
// Null for code mode, which keeps its own text.

import { useTranslations } from "next-intl";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { AIArtRunState } from "./ai-art-run";

export function useArtModeProgress(
  store: StoreApi<AIArtRunState>,
): string | null {
  const t = useTranslations("aiArt.artModes");
  const picturing = useStore(store, (state) => state.picturing);
  const mode = useStore(store, (state) => state.pendingMode);
  if (picturing > 0) return t("paintingPicture");
  if (mode === "scene" || mode === "photo") return t("paintingCode");
  return null;
}
