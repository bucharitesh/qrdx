import { create } from "zustand";
import type { CodeLang } from "@/lib/playground-links";

interface CodeDialogStore {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** The tab to show when the dialog opens (a link's open=code&lang=…) */
  lang: CodeLang | null;
  /** Opens the dialog, on `lang` when given. */
  openWith: (lang?: CodeLang | null) => void;
}

/**
 * Whether the editor's Get code dialog is open: the toolbar button, the V
 * shortcut and a playground link's open=code share it.
 */
export const useCodeDialogStore = create<CodeDialogStore>()((set) => ({
  open: false,
  // Closing forgets the tab, so V opens on React again.
  setOpen: (open) => set(open ? { open } : { open, lang: null }),
  lang: null,
  openWith: (lang = null) => set({ open: true, lang }),
}));
