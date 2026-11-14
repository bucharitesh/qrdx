import { create } from "zustand";
import type { DesignSection } from "@/lib/playground-links";

interface PlaygroundFocusStore {
  /** A Design section a playground link asked to open (?section=) */
  section: DesignSection | null;
  setSection: (section: DesignSection | null) => void;
}

/** Hand-off from a playground link to the Design tab; cleared on the next tab change. */
export const usePlaygroundFocusStore = create<PlaygroundFocusStore>()(
  (set) => ({
    section: null,
    setSection: (section) => set({ section }),
  }),
);
