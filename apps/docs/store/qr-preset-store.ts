import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { QRPreset } from "@/types/qr";
import { builtInPresets } from "@/utils/qr-presets";

/**
 * QR Preset Store Interface
 * Manages built-in and user-saved QR code presets
 */
interface QRPresetStore {
  presets: QRPreset[];
  customPresets: QRPreset[];
  registerPreset: (preset: QRPreset) => void;
  unregisterPreset: (id: string) => void;
  updatePreset: (id: string, preset: Partial<QRPreset>) => void;
  getPresetById: (id: string) => QRPreset | undefined;
  getAllPresets: () => QRPreset[];
  getBuiltInPresets: () => QRPreset[];
  getCustomPresets: () => QRPreset[];
}

/**
 * QR Preset Store
 * Manages QR code style presets with persistence for custom presets
 */
export const useQRPresetStore = create<QRPresetStore>()(
  persist(
    (set, get) => ({
      presets: builtInPresets,
      customPresets: [],

      /**
       * Register a new custom preset
       */
      registerPreset: (preset: QRPreset) => {
        set((state) => {
          // Ensure it has SAVED source
          const newPreset: QRPreset = {
            ...preset,
            source: "SAVED",
            createdAt: preset.createdAt || new Date().toISOString(),
          };

          return {
            customPresets: [...state.customPresets, newPreset],
          };
        });
      },

      /**
       * Remove a preset by ID
       */
      unregisterPreset: (id: string) => {
        set((state) => ({
          customPresets: state.customPresets.filter((p) => p.id !== id),
        }));
      },

      /**
       * Update an existing preset
       */
      updatePreset: (id: string, updates: Partial<QRPreset>) => {
        set((state) => ({
          customPresets: state.customPresets.map((p) =>
            p.id === id ? { ...p, ...updates } : p,
          ),
        }));
      },

      /**
       * Get a preset by ID (searches both built-in and custom)
       */
      getPresetById: (id: string) => {
        const allPresets = [...get().presets, ...get().customPresets];
        return allPresets.find((p) => p.id === id);
      },

      /**
       * Get all presets (built-in + custom)
       */
      getAllPresets: () => {
        return [...get().presets, ...get().customPresets];
      },

      /**
       * Get only built-in presets
       */
      getBuiltInPresets: () => {
        return get().presets;
      },

      /**
       * Get only custom presets
       */
      getCustomPresets: () => {
        return get().customPresets;
      },
    }),
    {
      name: "qr-preset-storage",
      partialize: (state) => ({
        customPresets: state.customPresets,
      }),
    },
  ),
);
