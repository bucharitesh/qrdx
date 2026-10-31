import { create } from "zustand";
import { getThemes } from "@/actions/qr-themes";
import type { ThemeScopeKind } from "@/app/dashboard/themes/_lib/theme";
import type { ThemePreset } from "@/types/theme";
import { defaultPresets } from "@/utils/qr-presets";

/** Saved themes also carry where they live and what the user may do with them. */
export type StoredPreset = ThemePreset & {
  scope?: ThemeScopeKind;
  canEdit?: boolean;
};

interface ThemePresetStore {
  presets: Record<string, StoredPreset>;
  /** Saved theme preselected in the active workspace, if any */
  defaultPresetId: string | null;
  registerPreset: (name: string, preset: StoredPreset) => void;
  unregisterPreset: (name: string) => void;
  updatePreset: (name: string, preset: StoredPreset) => void;
  getPreset: (name: string) => StoredPreset | undefined;
  getAllPresets: () => Record<string, StoredPreset>;
  loadSavedPresets: () => Promise<void>;
  unloadSavedPresets: () => void;
}

const withoutSaved = (presets: Record<string, StoredPreset>) =>
  Object.fromEntries(
    Object.entries(presets).filter(([, preset]) => preset.source !== "SAVED"),
  );

// Switching workspaces quickly can resolve loads out of order; the last one wins.
let loadId = 0;

export const useThemePresetStore = create<ThemePresetStore>()((set, get) => ({
  presets: defaultPresets,
  defaultPresetId: null,
  registerPreset: (name: string, preset: StoredPreset) => {
    set((state) => ({
      presets: {
        ...state.presets,
        [name]: preset,
      },
    }));
  },
  unregisterPreset: (name: string) => {
    set((state) => {
      const { [name]: _, ...remainingPresets } = state.presets;
      return {
        presets: remainingPresets,
        defaultPresetId:
          state.defaultPresetId === name ? null : state.defaultPresetId,
      };
    });
  },
  loadSavedPresets: async () => {
    const id = ++loadId;
    try {
      const savedThemes = await getThemes();
      if (id !== loadId) return;

      const savedPresets: Record<string, StoredPreset> = {};
      for (const theme of savedThemes) {
        savedPresets[theme.id] = {
          label: theme.name,
          styles: theme.style,
          source: "SAVED",
          createdAt: new Date(theme.createdAt).toISOString(),
          scope: theme.scope,
          canEdit: theme.canEdit,
        };
      }

      set((state) => ({
        presets: { ...withoutSaved(state.presets), ...savedPresets },
        defaultPresetId:
          savedThemes.find((theme) => theme.isActiveDefault)?.id ?? null,
      }));
    } catch (error) {
      console.error("Failed to load saved presets:", error);
    }
  },
  unloadSavedPresets: () => {
    loadId++;
    set({ presets: defaultPresets, defaultPresetId: null });
  },
  updatePreset: (name: string, preset: StoredPreset) => {
    set((state) => ({
      presets: {
        ...state.presets,
        [name]: { ...state.presets[name], ...preset },
      },
    }));
  },
  getPreset: (name: string) => {
    return get().presets[name];
  },
  getAllPresets: () => {
    return get().presets;
  },
}));
