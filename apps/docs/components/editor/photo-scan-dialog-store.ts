import { create } from "zustand";

interface PhotoScanDialogStore {
  open: boolean;
  setOpen: (open: boolean) => void;
}

/**
 * The editor's "Check a photo of the print" dialog: opened from the scan
 * score popover, the More menu and a playground link's open=photo-check.
 */
export const usePhotoScanDialogStore = create<PhotoScanDialogStore>()(
  (set) => ({
    open: false,
    setOpen: (open) => set({ open }),
  }),
);
