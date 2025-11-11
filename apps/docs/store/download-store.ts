/**
 * Download options store
 * Manages download preferences separately from QR editor
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DownloadOptions } from "@/types/qr";

interface DownloadStore {
  downloadOptions: DownloadOptions;
  setDownloadOptions: (options: DownloadOptions) => void;
  updateDownloadOption: <K extends keyof DownloadOptions>(
    key: K,
    value: DownloadOptions[K],
  ) => void;
}

export const useDownloadStore = create<DownloadStore>()(
  persist(
    (set) => ({
      downloadOptions: {
        format: "png",
        sizePreset: "medium",
        width: 600,
        height: 600,
        filename: undefined,
      },
      setDownloadOptions: (options) => set({ downloadOptions: options }),
      updateDownloadOption: (key, value) =>
        set((state) => ({
          downloadOptions: { ...state.downloadOptions, [key]: value },
        })),
    }),
    {
      name: "qr-download-storage",
      partialize: (state) => ({
        downloadOptions: state.downloadOptions,
      }),
    },
  ),
);
