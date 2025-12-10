import type { ColorConfig } from "qrdx/types";
import { colorConfigSchema, getSolidColor } from "qrdx/types";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { defaultThemeState } from "@/config/qr";
import { isDeepEqual } from "@/lib/utils";
import type { ThemeEditorState } from "@/types/editor";
import type { ContentType, QRContentConfig } from "@/types/qr-content";
import { getPresetThemeStyles } from "@/utils/qr-presets-helper";

const MAX_HISTORY_COUNT = 30;
const HISTORY_OVERRIDE_THRESHOLD_MS = 500; // 0.5 seconds

/**
 * History entry for QR editor state
 */
interface QRHistoryEntry {
  state: ThemeEditorState;
  timestamp: number;
}

/**
 * QR Editor Store Interface
 */
interface QREditorStore {
  value: string;
  setValue: (value: string) => void;
  themeState: ThemeEditorState;
  themeCheckpoint: ThemeEditorState | null;
  history: QRHistoryEntry[];
  future: QRHistoryEntry[];
  setThemeState: (state: ThemeEditorState) => void;
  applyThemePreset: (preset: string) => void;
  saveThemeCheckpoint: () => void;
  restoreThemeCheckpoint: () => void;
  resetToCurrentPreset: () => void;
  hasThemeChangedFromCheckpoint: () => boolean;
  hasUnsavedChanges: () => boolean;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  contentType: ContentType;
  setContentType: (contentType: ContentType) => void;

  // Content configurations for each content type
  contentConfigs: Partial<Record<ContentType, QRContentConfig>>;
  setContentConfig: (type: ContentType, config: QRContentConfig) => void;
  getContentConfig: (type: ContentType) => QRContentConfig | undefined;
}

/**
 * QR Editor Store with history and preset management
 */
export const useQREditorStore = create<QREditorStore>()(
  persist(
    (set, get) => ({
      themeState: defaultThemeState,
      themeCheckpoint: null,
      history: [],
      future: [],
      value: "",
      setValue: (value: string) => {
        set({ value });
      },
      contentType: "url",
      setContentType: (contentType: ContentType) => {
        set({ contentType });
      },
      contentConfigs: {},
      setContentConfig: (type: ContentType, config: QRContentConfig) => {
        set((state) => ({
          contentConfigs: {
            ...state.contentConfigs,
            [type]: config,
          },
        }));
      },
      getContentConfig: (type: ContentType) => {
        return get().contentConfigs[type];
      },
      setThemeState: (newState: ThemeEditorState) => {
        const oldThemeState = get().themeState;
        let currentHistory = get().history;
        let currentFuture = get().future;

        // Check if only currentMode changed
        const oldStateWithoutMode = {
          ...oldThemeState,
        };
        const newStateWithoutMode = { ...newState };

        if (isDeepEqual(oldStateWithoutMode, newStateWithoutMode)) {
          // Only currentMode changed
          // Just update themeState without affecting history or future
          set({ themeState: newState });
          return;
        }

        const currentTime = Date.now();

        // If other things changed, or if it's an actual identical state set (though less likely here)
        // Proceed with history logic
        const lastHistoryEntry =
          currentHistory.length > 0
            ? currentHistory[currentHistory.length - 1]
            : null;

        if (
          !lastHistoryEntry ||
          currentTime - lastHistoryEntry.timestamp >=
            HISTORY_OVERRIDE_THRESHOLD_MS
        ) {
          // Add a new history entry
          currentHistory = [
            ...currentHistory,
            { state: oldThemeState, timestamp: currentTime },
          ];
          currentFuture = [];
        }

        if (currentHistory.length > MAX_HISTORY_COUNT) {
          currentHistory.shift(); // Remove the oldest entry
        }

        set({
          themeState: newState,
          history: currentHistory,
          future: currentFuture,
        });
      },
      applyThemePreset: (preset: string) => {
        const currentThemeState = get().themeState;
        const oldHistory = get().history;
        const currentTime = Date.now();

        const newStyles = getPresetThemeStyles(preset);
        const newThemeState: ThemeEditorState = {
          ...currentThemeState,
          preset,
          styles: newStyles,
        };

        const newHistoryEntry = {
          state: currentThemeState,
          timestamp: currentTime,
        };
        const updatedHistory = [...oldHistory, newHistoryEntry];
        if (updatedHistory.length > MAX_HISTORY_COUNT) {
          updatedHistory.shift();
        }

        set({
          themeState: newThemeState,
          themeCheckpoint: newThemeState, // Applying a preset also updates the checkpoint
          history: updatedHistory,
          future: [],
        });
      },
      saveThemeCheckpoint: () => {
        set({ themeCheckpoint: get().themeState });
      },
      restoreThemeCheckpoint: () => {
        const checkpoint = get().themeCheckpoint;
        if (checkpoint) {
          const oldThemeState = get().themeState;
          const oldHistory = get().history;
          const currentTime = Date.now();

          const newHistoryEntry = {
            state: oldThemeState,
            timestamp: currentTime,
          };
          const updatedHistory = [...oldHistory, newHistoryEntry];
          if (updatedHistory.length > MAX_HISTORY_COUNT) {
            updatedHistory.shift();
          }

          set({
            themeState: {
              ...checkpoint,
            },
            history: updatedHistory,
            future: [],
          });
        } else {
          console.warn("No theme checkpoint available to restore to.");
        }
      },
      hasThemeChangedFromCheckpoint: () => {
        const checkpoint = get().themeCheckpoint;
        return !isDeepEqual(get().themeState, checkpoint);
      },
      hasUnsavedChanges: () => {
        const themeState = get().themeState;
        const presetThemeStyles = getPresetThemeStyles(
          themeState.preset ?? "default",
        );
        const stylesChanged = !isDeepEqual(
          themeState.styles,
          presetThemeStyles,
        );
        return stylesChanged;
      },
      resetToCurrentPreset: () => {
        const currentThemeState = get().themeState;

        const presetThemeStyles = getPresetThemeStyles(
          currentThemeState.preset ?? "default",
        );
        const newThemeState: ThemeEditorState = {
          ...currentThemeState,
          styles: presetThemeStyles,
        };

        set({
          themeState: newThemeState,
          themeCheckpoint: newThemeState,
          history: [],
          future: [],
        });
      },
      undo: () => {
        const history = get().history;
        if (history.length === 0) {
          return;
        }

        const currentThemeState = get().themeState;
        const future = get().future;

        const lastHistoryEntry = history[history.length - 1];
        const newHistory = history.slice(0, -1);

        const newFutureEntry = {
          state: currentThemeState,
          timestamp: Date.now(),
        };
        const newFuture = [newFutureEntry, ...future];

        set({
          themeState: {
            ...lastHistoryEntry.state,
          },
          themeCheckpoint: lastHistoryEntry.state,
          history: newHistory,
          future: newFuture,
        });
      },
      redo: () => {
        const future = get().future;
        if (future.length === 0) {
          return;
        }
        const history = get().history;

        const firstFutureEntry = future[0];
        const newFuture = future.slice(1);

        const currentThemeState = get().themeState;

        const newHistoryEntry = {
          state: currentThemeState,
          timestamp: Date.now(),
        };
        const updatedHistory = [...history, newHistoryEntry];
        if (updatedHistory.length > MAX_HISTORY_COUNT) {
          updatedHistory.shift();
        }

        set({
          themeState: {
            ...firstFutureEntry.state,
          },
          themeCheckpoint: firstFutureEntry.state,
          history: updatedHistory,
          future: newFuture,
        });
      },
      canUndo: () => get().history.length > 0,
      canRedo: () => get().future.length > 0,
    }),
    {
      name: "editor-storage",
      merge: (persistedState, currentState) => {
        // Helper function to normalize ColorConfig in a styles object
        const normalizeColorConfig = (
          styles: Record<string, unknown>,
          key: "fgColor" | "eyeColor" | "dotColor" | "bgColor",
          defaultValue: ColorConfig | string | undefined,
        ) => {
          if (styles[key] !== undefined) {
            try {
              // Validate using zod schema
              const validated = colorConfigSchema.safeParse(styles[key]);
              if (validated.success) {
                // Ensure proper structure - if it's an object, make sure it has required fields
                const colorValue = validated.data as ColorConfig;
                if (typeof colorValue === "string") {
                  // String color is valid
                  styles[key] = colorValue;
                } else if (
                  typeof colorValue === "object" &&
                  colorValue !== null
                ) {
                  // For gradients, ensure stops array is valid and has at least 2 items
                  if (
                    "type" in colorValue &&
                    (colorValue.type === "linear" ||
                      colorValue.type === "radial") &&
                    "stops" in colorValue &&
                    Array.isArray(colorValue.stops)
                  ) {
                    // Ensure stops array has at least 2 items
                    if (colorValue.stops.length < 2) {
                      console.warn(
                        `Gradient stops array has less than 2 items for ${key}, using default`,
                      );
                      styles[key] = defaultValue;
                    } else {
                      // For linear gradients, ensure angle is set (default to 0 if missing)
                      if (
                        colorValue.type === "linear" &&
                        "stops" in colorValue &&
                        Array.isArray(colorValue.stops)
                      ) {
                        const stops = colorValue.stops as Array<{
                          color: string;
                          offset: number;
                        }>;
                        // Always create a new object to ensure angle is present
                        const angleValue =
                          "angle" in colorValue &&
                          typeof colorValue.angle === "number"
                            ? colorValue.angle
                            : 0;
                        styles[key] = {
                          type: "linear",
                          stops,
                          angle: angleValue,
                        } as ColorConfig;
                      } else {
                        // Radial gradient - no angle needed
                        styles[key] = colorValue;
                      }
                    }
                  } else if (
                    "type" in colorValue &&
                    colorValue.type === "solid" &&
                    "color" in colorValue
                  ) {
                    // Solid color is valid
                    styles[key] = colorValue;
                  } else {
                    // Invalid structure, use default
                    styles[key] = defaultValue;
                  }
                } else {
                  // Fallback to default
                  styles[key] = defaultValue;
                }
              } else {
                // If validation fails, fall back to default
                console.warn(
                  `Invalid ${key} in persisted state, using default`,
                  validated.error,
                );
                styles[key] = defaultValue;
              }
            } catch (error) {
              console.warn(
                `Error normalizing ${key} from persisted state:`,
                error,
              );
              styles[key] = defaultValue;
            }
          }
        };

        // Helper function to normalize color configs (for backward compatibility)
        const normalizeFgColor = (styles: Record<string, unknown>) => {
          normalizeColorConfig(
            styles,
            "fgColor",
            defaultThemeState.styles.fgColor ?? "#000000",
          );
          normalizeColorConfig(
            styles,
            "bgColor",
            defaultThemeState.styles.bgColor ?? "#ffffff",
          );
          normalizeColorConfig(
            styles,
            "eyeColor",
            getSolidColor(
              defaultThemeState.styles.fgColor,
              "#000000",
            ) as ColorConfig,
          );
          normalizeColorConfig(
            styles,
            "dotColor",
            getSolidColor(
              defaultThemeState.styles.fgColor,
              "#000000",
            ) as ColorConfig,
          );
        };

        // Validate and normalize ColorConfig objects when loading from storage
        if (
          persistedState &&
          typeof persistedState === "object" &&
          "themeState" in persistedState &&
          persistedState.themeState &&
          typeof persistedState.themeState === "object" &&
          "styles" in persistedState.themeState &&
          persistedState.themeState.styles &&
          typeof persistedState.themeState.styles === "object"
        ) {
          normalizeFgColor(
            persistedState.themeState.styles as Record<string, unknown>,
          );
        }

        // Also normalize checkpoint if it exists
        if (
          persistedState &&
          typeof persistedState === "object" &&
          "themeCheckpoint" in persistedState &&
          persistedState.themeCheckpoint &&
          typeof persistedState.themeCheckpoint === "object" &&
          "styles" in persistedState.themeCheckpoint &&
          persistedState.themeCheckpoint.styles &&
          typeof persistedState.themeCheckpoint.styles === "object"
        ) {
          normalizeFgColor(
            persistedState.themeCheckpoint.styles as Record<string, unknown>,
          );
        }

        // Normalize history entries
        if (
          persistedState &&
          typeof persistedState === "object" &&
          "history" in persistedState &&
          Array.isArray(persistedState.history)
        ) {
          persistedState.history.forEach((entry: unknown) => {
            if (
              entry &&
              typeof entry === "object" &&
              "state" in entry &&
              entry.state &&
              typeof entry.state === "object" &&
              "styles" in entry.state &&
              entry.state.styles &&
              typeof entry.state.styles === "object"
            ) {
              normalizeFgColor(entry.state.styles as Record<string, unknown>);
            }
          });
        }

        // Merge persisted state with current state, ensuring persisted state takes precedence
        const mergedState = {
          ...currentState,
          ...(persistedState as Partial<QREditorStore>),
        } as QREditorStore;

        // Ensure themeState is properly merged if it exists in persistedState
        if (
          persistedState &&
          typeof persistedState === "object" &&
          "themeState" in persistedState &&
          persistedState.themeState
        ) {
          mergedState.themeState =
            persistedState.themeState as ThemeEditorState;
        }

        return mergedState;
      },
    },
  ),
);
