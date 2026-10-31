"use client";

import { create } from "zustand";
import { newShuffleSeed, shuffleId } from "@/lib/themes/shuffle";
import { useQREditorStore } from "@/store/editor-store";
import type { ThemeEditorState } from "@/types/editor";

const MAX_SHUFFLES = 50;

interface ShuffleHistory {
  /** Seeds of the current run of shuffles, oldest first */
  seeds: number[];
  /** The look before the run started, restored by the last "Back" */
  origin: ThemeEditorState | null;
}

const useShuffleHistory = create<ShuffleHistory>()(() => ({
  seeds: [],
  origin: null,
}));

/** Applies a new shuffled theme (a fresh seed). */
export function shuffleNext() {
  const editor = useQREditorStore.getState();
  const { seeds, origin } = useShuffleHistory.getState();
  const last = seeds.at(-1);
  // Picking another theme in between starts a new run.
  const continuing =
    last !== undefined && editor.themeState.preset === shuffleId(last);
  const seed = newShuffleSeed();
  useShuffleHistory.setState({
    seeds: continuing ? [...seeds, seed].slice(-MAX_SHUFFLES) : [seed],
    origin: continuing ? origin : editor.themeState,
  });
  editor.applyThemePreset(shuffleId(seed));
}

/** Returns to the previous shuffle, or to the look before the first one. */
export function shuffleBack() {
  const editor = useQREditorStore.getState();
  const { seeds, origin } = useShuffleHistory.getState();
  if (seeds.length > 1) {
    const previous = seeds.slice(0, -1);
    useShuffleHistory.setState({ seeds: previous });
    editor.applyThemePreset(shuffleId(previous.at(-1) as number));
    return;
  }
  if (seeds.length === 1 && origin) {
    useShuffleHistory.setState({ seeds: [], origin: null });
    editor.setThemeState(origin);
  }
}

export function useThemeShuffle() {
  const canGoBack = useShuffleHistory(
    (state) =>
      state.seeds.length > 1 ||
      (state.seeds.length === 1 && state.origin !== null),
  );
  return { shuffle: shuffleNext, back: shuffleBack, canGoBack };
}
