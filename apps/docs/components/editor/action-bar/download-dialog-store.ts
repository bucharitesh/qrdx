import { create } from "zustand";
import type { PrintWidth } from "@/lib/playground-links";

/** How the dialog should open next time: a tab, and a Print-ready width. */
export interface DownloadDialogRequest {
  tab: "image" | "print";
  print?: PrintWidth;
}

interface DownloadDialogStore {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Read once by the dialog when it opens (a playground link's open=print). */
  request: DownloadDialogRequest | null;
  setRequest: (request: DownloadDialogRequest | null) => void;
}

/**
 * Whether the editor's download dialog is open. One dialog serves the toolbar
 * button, the phone's bottom bar and the D shortcut.
 */
export const useDownloadDialogStore = create<DownloadDialogStore>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  request: null,
  setRequest: (request) => set({ request }),
}));
