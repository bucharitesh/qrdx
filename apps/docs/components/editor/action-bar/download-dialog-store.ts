import { create } from "zustand";

interface DownloadDialogStore {
  open: boolean;
  setOpen: (open: boolean) => void;
}

/**
 * Whether the editor's download dialog is open. One dialog serves the toolbar
 * button, the phone's bottom bar and the D shortcut.
 */
export const useDownloadDialogStore = create<DownloadDialogStore>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
