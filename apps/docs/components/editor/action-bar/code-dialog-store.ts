import { create } from "zustand";

interface CodeDialogStore {
  open: boolean;
  setOpen: (open: boolean) => void;
}

/**
 * Whether the editor's code dialog is open: the toolbar button, the V
 * shortcut and a playground link's open=code share it.
 */
export const useCodeDialogStore = create<CodeDialogStore>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
