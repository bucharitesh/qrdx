// The playground's Art tab for this visit: the mode picked, the vector art's
// last source image, the AI art form, and the AI art results with the one
// shown over the preview. Never persisted: each result is a data URL of about
// 1 MB. The results go as soon as the code's content changes, since they
// encode the old content.

import type { QRArtMode } from "qrdx/types";
import { create } from "zustand";
import {
  type AIArtRun,
  type AIArtRunState,
  clearAIArt,
  initialAIArtRunState,
} from "@/components/sections/ai-art/ai-art-run";
import {
  ART_CREATIVITY,
  ART_QR_VISIBILITY,
  type ArtMode,
  DEFAULT_ART_MODE,
} from "@/components/sections/ai-art/config";
import type { ScanCheckResult } from "@/components/sections/ai-art/image-utils";
import type { ArtLookId } from "@/components/sections/ai-art/looks";
import type { AIArtPreset } from "@/components/sections/ai-art/presets";
import { useQREditorStore } from "@/store/editor-store";

/** The Art tab's modes. "halftone" is Image QR. */
export type ArtTabMode = "off" | QRArtMode | "ai";

/** The AI art form. The prompt is typed or filled in by a style preset, never from a link. */
export interface AIArtDraft {
  presetId: string | null;
  prompt: string;
  /** A quick look added to the prompt (looks.ts) */
  look: ArtLookId | null;
  negativePrompt: string;
  visibility: number;
  creativity: number;
  variations: number;
  seed: string;
  seedLocked: boolean;
  /** A reference image (data: URL, at most 512 px) */
  reference: string | null;
  /** The reference is the editor's logo ("Use my logo as reference") */
  referenceIsLogo: boolean;
  /** How the code sits in the artwork: the code itself, a scene or a photo */
  mode: ArtMode;
  /** Photo mode's photo (a JPEG data: URL); never kept across sign-in */
  photo: string | null;
}

export const DEFAULT_AI_ART_DRAFT: AIArtDraft = {
  presetId: null,
  prompt: "",
  look: null,
  negativePrompt: "",
  visibility: ART_QR_VISIBILITY.default,
  creativity: ART_CREATIVITY.default,
  variations: 2,
  seed: "",
  seedLocked: false,
  reference: null,
  referenceIsLogo: false,
  mode: DEFAULT_ART_MODE,
  photo: null,
};

export interface ArtSessionStore extends AIArtRunState {
  /**
   * A mode picked that the design doesn't show by itself: AI art (not part of
   * the design), or Logo QR or Image QR before an image is chosen. Vector art
   * in the design otherwise decides the mode.
   */
  picked: "ai" | QRArtMode | null;
  pick: (mode: "ai" | QRArtMode | null) => void;
  /** The vector art's last upload or sample, so switching mode re-samples it */
  source: Blob | string | null;
  setSource: (source: Blob | string | null) => void;

  draft: AIArtDraft;
  updateDraft: (patch: Partial<AIArtDraft>) => void;
  /**
   * Fills the prompt from a style preset (presets.ts) and resets the look:
   * a preset carries its own style
   */
  applyStylePreset: (preset: AIArtPreset) => void;
  /**
   * Generate, pressed signed out, waiting to run once signed in (the
   * "AI_ART_GENERATE" post-login action; components/editor/art/ai-art-intent.ts).
   */
  resume: { text: string; draft: AIArtDraft } | null;
  setResume: (resume: { text: string; draft: AIArtDraft } | null) => void;

  /** The variation shown over the preview */
  selected: number;
  select: (index: number) => void;
  /** The browser's scan check of each variation of `run` */
  checks: { run: AIArtRun | null; results: (ScanCheckResult | undefined)[] };
  setCheck: (run: AIArtRun, index: number, result: ScanCheckResult) => void;
  /** The result covers the preview (Back to code closes it) */
  canvasOpen: boolean;
  setCanvasOpen: (open: boolean) => void;
  /** Forgets the results and stops a run in flight. */
  clearResults: () => void;
}

/** What the Art tab shows: AI art, the design's vector art, a pending pick, or off. */
export function resolveArtMode(
  picked: ArtSessionStore["picked"],
  art: { mode: QRArtMode } | undefined,
): ArtTabMode {
  if (picked === "ai") return "ai";
  if (art) return art.mode;
  return picked ?? "off";
}

export const useArtSessionStore = create<ArtSessionStore>()((set, get) => ({
  ...initialAIArtRunState(),
  picked: null,
  pick: (picked) => set({ picked }),
  source: null,
  setSource: (source) => set({ source }),

  draft: DEFAULT_AI_ART_DRAFT,
  updateDraft: (patch) => set({ draft: { ...get().draft, ...patch } }),
  applyStylePreset: (preset) =>
    set({
      draft: {
        ...get().draft,
        presetId: preset.id,
        prompt: preset.prompt,
        look: null,
        negativePrompt: preset.negativePrompt ?? "",
      },
    }),
  resume: null,
  setResume: (resume) => set({ resume }),

  selected: 0,
  select: (selected) => set({ selected }),
  checks: { run: null, results: [] },
  setCheck: (run, index, result) => {
    const { checks } = get();
    const results = checks.run === run ? [...checks.results] : [];
    results[index] = result;
    set({ checks: { run, results } });
  },
  canvasOpen: false,
  setCanvasOpen: (canvasOpen) => set({ canvasOpen }),
  clearResults: () => {
    const { run, pending, controller, canvasOpen } = get();
    if (!(run || pending || controller || canvasOpen)) return;
    clearAIArt(useArtSessionStore);
    set({ selected: 0, checks: { run: null, results: [] }, canvasOpen: false });
  },
}));

// Results encode the content they were made for: they go when it changes.
useQREditorStore.subscribe((state, previous) => {
  if (state.value !== previous.value) {
    useArtSessionStore.getState().clearResults();
  }
});
