// The AI art style presets for client code, loaded on first use as their own
// chunk. Nothing in the playground imports ./presets directly, so its first
// load doesn't grow with the catalogue; the chunk comes in when the Art tab's
// AI mode (or a link to a style) needs it.

import { useEffect, useState } from "react";

export type AIArtCatalogue = typeof import("./presets");

let loaded: AIArtCatalogue | null = null;
let loading: Promise<AIArtCatalogue> | null = null;

/** The catalogue, imported once; a failed import can be tried again. */
export function loadAIArtPresets(): Promise<AIArtCatalogue> {
  if (loaded) return Promise.resolve(loaded);
  loading ??= import("./presets").then(
    (catalogue) => {
      loaded = catalogue;
      return catalogue;
    },
    (error: unknown) => {
      loading = null;
      throw error;
    },
  );
  return loading;
}

export interface AIArtCatalogueState {
  /** The catalogue once it has loaded, else null */
  catalogue: AIArtCatalogue | null;
  /** The import failed (offline, or a deploy replaced the chunk) */
  failed: boolean;
  retry: () => void;
}

/** Loads the catalogue on mount; immediate when it's already in memory. */
export function useAIArtPresets(): AIArtCatalogueState {
  const [catalogue, setCatalogue] = useState<AIArtCatalogue | null>(loaded);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (attempt === 0 && loaded) return;
    let live = true;
    loadAIArtPresets().then(
      (next) => {
        if (live) setCatalogue(next);
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  return {
    catalogue,
    failed: failed && !catalogue,
    retry: () => {
      setFailed(false);
      setAttempt((count) => count + 1);
    },
  };
}
