import { create } from "zustand";

interface CommunitySheetStore {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Set by "Publish to community…" in the More menu: the sheet opens on its publish flow. */
  publishRequested: boolean;
  requestPublish: () => void;
  clearPublishRequest: () => void;
}

/**
 * The editor's community sheet (themes over the preview): opened from the
 * theme picker's "Discover more themes", the More menu and a playground
 * link's open=community.
 */
export const useCommunitySheetStore = create<CommunitySheetStore>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  publishRequested: false,
  requestPublish: () => set({ open: true, publishRequested: true }),
  clearPublishRequest: () => set({ publishRequested: false }),
}));
