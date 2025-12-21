import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DownloadOptions } from "@/types/theme";

interface PreferencesStore {
  chatSuggestionsOpen: boolean;
  setChatSuggestionsOpen: (open: boolean) => void;
  downloadOptions: DownloadOptions;
  setDownloadOptions: (options: DownloadOptions) => void;
  updateDownloadOption: <K extends keyof DownloadOptions>(
    key: K,
    value: DownloadOptions[K],
  ) => void;
}

export const usePreferencesStore = create<PreferencesStore>()(
  persist(
    (set) => ({
      chatSuggestionsOpen: true,
      setChatSuggestionsOpen: (open: boolean) => {
        set({ chatSuggestionsOpen: open });
      },
      downloadOptions: {
        format: "png",
        sizePreset: "medium",
        width: 600,
        height: 600,
        filename: undefined,
        multiplier: 1 ,
        transparent: false,

      },
      setDownloadOptions: (options) => set({ downloadOptions: options }),
      updateDownloadOption: (key, value) =>
        set((state) => ({
          downloadOptions: { ...state.downloadOptions, [key]: value },
        })),
    }),
    {
      name: "preferences-storage",
    },
  ),
);
