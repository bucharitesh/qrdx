import { create } from "zustand";
import { persist } from "zustand/middleware";
import { defaultQREditorState, getPresetStyle } from "@/config/qr";
import { isDeepEqual } from "@/lib/utils";
import type { QREditorState } from "@/types/editor";
import type { QRPreset, QRStyle } from "@/types/qr";

const MAX_HISTORY_COUNT = 30;
const HISTORY_OVERRIDE_THRESHOLD_MS = 500; // 0.5 seconds

/**
 * History entry for QR editor state
 */
interface QRHistoryEntry {
  style: Partial<QRStyle>;
  value: string;
  timestamp: number;
}

/**
 * QR Editor Store Interface
 */
interface QREditorStore {
  // Current state
  style: Partial<QRStyle>;
  value: string;
  currentPreset?: QRPreset;

  // Checkpoint for unsaved changes
  checkpoint: QREditorState | null;

  // History for undo/redo
  history: QRHistoryEntry[];
  future: QRHistoryEntry[];

  // Actions
  setStyle: (style: Partial<QRStyle>) => void;
  setValue: (value: string) => void;
  applyPreset: (preset: QRPreset) => void;
  saveCheckpoint: () => void;
  restoreCheckpoint: () => void;
  resetToPreset: () => void;
  hasChangedFromCheckpoint: () => boolean;
  hasUnsavedChanges: () => boolean;

  // Undo/Redo
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Reset
  reset: () => void;
}

/**
 * QR Editor Store with history and preset management
 */
export const useQREditorStore = create<QREditorStore>()(
  persist(
    (set, get) => ({
      // Initial state
      style: defaultQREditorState.style,
      value: defaultQREditorState.value,
      currentPreset: undefined,
      checkpoint: null,
      history: [],
      future: [],

      // Update style with history tracking
      setStyle: (newStyle: Partial<QRStyle>) => {
        const currentTime = Date.now();
        const oldStyle = get().style;
        const oldValue = get().value;
        let currentHistory = get().history;

        // Check if style actually changed
        if (isDeepEqual(oldStyle, newStyle)) {
          return;
        }

        const lastHistoryEntry =
          currentHistory.length > 0
            ? currentHistory[currentHistory.length - 1]
            : null;

        // Add to history if enough time has passed or it's the first entry
        if (
          !lastHistoryEntry ||
          currentTime - lastHistoryEntry.timestamp >=
            HISTORY_OVERRIDE_THRESHOLD_MS
        ) {
          currentHistory = [
            ...currentHistory,
            { style: oldStyle, value: oldValue, timestamp: currentTime },
          ];
        }

        // Limit history size
        if (currentHistory.length > MAX_HISTORY_COUNT) {
          currentHistory = currentHistory.slice(1);
        }

        set({
          style: newStyle,
          history: currentHistory,
          future: [],
        });
      },

      // Update value
      setValue: (newValue: string) => {
        set({ value: newValue });
      },

      // Apply preset
      applyPreset: (preset: QRPreset) => {
        const currentTime = Date.now();
        const oldStyle = get().style;
        const oldValue = get().value;
        const oldHistory = get().history;

        const newStyle = { ...defaultQREditorState.style, ...preset.style };

        const newHistoryEntry = {
          style: oldStyle,
          value: oldValue,
          timestamp: currentTime,
        };
        let updatedHistory = [...oldHistory, newHistoryEntry];
        if (updatedHistory.length > MAX_HISTORY_COUNT) {
          updatedHistory = updatedHistory.slice(1);
        }

        const newState: QREditorState = {
          style: newStyle,
          value: get().value,
          preset,
          history: [],
          historyIndex: -1,
        };

        set({
          style: newStyle,
          currentPreset: preset,
          checkpoint: newState,
          history: updatedHistory,
          future: [],
        });
      },

      // Save checkpoint
      saveCheckpoint: () => {
        const currentState: QREditorState = {
          style: get().style,
          value: get().value,
          preset: get().currentPreset,
          history: [],
          historyIndex: -1,
        };
        set({ checkpoint: currentState });
      },

      // Restore checkpoint
      restoreCheckpoint: () => {
        const checkpoint = get().checkpoint;
        if (!checkpoint) {
          console.warn("No checkpoint available to restore");
          return;
        }

        const currentTime = Date.now();
        const oldStyle = get().style;
        const oldValue = get().value;
        const oldHistory = get().history;

        const newHistoryEntry = {
          style: oldStyle,
          value: oldValue,
          timestamp: currentTime,
        };
        let updatedHistory = [...oldHistory, newHistoryEntry];
        if (updatedHistory.length > MAX_HISTORY_COUNT) {
          updatedHistory = updatedHistory.slice(1);
        }

        set({
          style: checkpoint.style,
          value: checkpoint.value,
          currentPreset: checkpoint.preset,
          history: updatedHistory,
          future: [],
        });
      },

      // Reset to current preset
      resetToPreset: () => {
        const currentPreset = get().currentPreset;
        if (!currentPreset) {
          // Reset to default if no preset
          set({
            style: defaultQREditorState.style,
            value: get().value,
            history: [],
            future: [],
          });
          return;
        }

        const presetStyle = getPresetStyle(currentPreset.id);
        const newState: QREditorState = {
          style: presetStyle,
          value: get().value,
          preset: currentPreset,
          history: [],
          historyIndex: -1,
        };

        set({
          style: presetStyle,
          checkpoint: newState,
          history: [],
          future: [],
        });
      },

      // Check if changed from checkpoint
      hasChangedFromCheckpoint: () => {
        const checkpoint = get().checkpoint;
        if (!checkpoint) return false;

        const currentStyle = get().style;
        const currentValue = get().value;

        return (
          !isDeepEqual(currentStyle, checkpoint.style) ||
          currentValue !== checkpoint.value
        );
      },

      // Check for unsaved changes
      hasUnsavedChanges: () => {
        const currentPreset = get().currentPreset;
        const currentStyle = get().style;

        if (!currentPreset) {
          return !isDeepEqual(currentStyle, defaultQREditorState.style);
        }

        const presetStyle = getPresetStyle(currentPreset.id);
        return !isDeepEqual(currentStyle, presetStyle);
      },

      // Undo
      undo: () => {
        const history = get().history;
        if (history.length === 0) return;

        const currentStyle = get().style;
        const currentValue = get().value;
        const future = get().future;

        const lastHistoryEntry = history[history.length - 1];
        const newHistory = history.slice(0, -1);

        const newFutureEntry = {
          style: currentStyle,
          value: currentValue,
          timestamp: Date.now(),
        };

        set({
          style: lastHistoryEntry.style,
          value: lastHistoryEntry.value,
          history: newHistory,
          future: [newFutureEntry, ...future],
        });
      },

      // Redo
      redo: () => {
        const future = get().future;
        if (future.length === 0) return;

        const currentStyle = get().style;
        const currentValue = get().value;
        const history = get().history;

        const firstFutureEntry = future[0];
        const newFuture = future.slice(1);

        const newHistoryEntry = {
          style: currentStyle,
          value: currentValue,
          timestamp: Date.now(),
        };
        let updatedHistory = [...history, newHistoryEntry];
        if (updatedHistory.length > MAX_HISTORY_COUNT) {
          updatedHistory = updatedHistory.slice(1);
        }

        set({
          style: firstFutureEntry.style,
          value: firstFutureEntry.value,
          history: updatedHistory,
          future: newFuture,
        });
      },

      // Can undo/redo
      canUndo: () => get().history.length > 0,
      canRedo: () => get().future.length > 0,

      // Reset to default
      reset: () => {
        set({
          style: defaultQREditorState.style,
          value: defaultQREditorState.value,
          currentPreset: undefined,
          checkpoint: null,
          history: [],
          future: [],
        });
      },
    }),
    {
      name: "qr-editor-storage",
      partialize: (state) => ({
        style: state.style,
        value: state.value,
        currentPreset: state.currentPreset,
      }),
    },
  ),
);
