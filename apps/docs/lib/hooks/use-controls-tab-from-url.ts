"use client";

import { useQueryState } from "nuqs";
import { useAvailability } from "@/components/availability-provider";
import {
  CONTROL_TABS,
  type ControlTab,
  resolveControlTab,
} from "@/lib/playground-links";

export type { ControlTab } from "@/lib/playground-links";
export const DEFAULT_TAB: ControlTab = CONTROL_TABS[0];

/**
 * The editor panel's tab, kept in ?tab=. Links may use the friendlier
 * `design` and `generate`, and `art` opens the Art tab. Without AI on this
 * deployment (aiThemes), the Generate tab doesn't exist: ?tab=ai or
 * ?tab=generate opens Design. Art used to be a Design section, so the old
 * ?tab=customisations&section=art opens the Art tab (lib/hooks/use-playground-params.ts
 * then rewrites the address to ?tab=art).
 */
export const useControlsTabFromUrl = () => {
  const aiAvailable = useAvailability().has("aiThemes");
  const [rawTab, setTab] = useQueryState("tab", {
    defaultValue: DEFAULT_TAB,
    parse: (value: string) => resolveControlTab(value) ?? DEFAULT_TAB,
  });
  const [section] = useQueryState("section");
  const legacyArt =
    section === "art" && (rawTab === "customisations" || rawTab === "settings");

  const tab: ControlTab = legacyArt
    ? "art"
    : rawTab === "ai" && !aiAvailable
      ? "customisations"
      : rawTab;

  const handleSetTab = (next: ControlTab) => {
    if (!CONTROL_TABS.includes(next)) {
      setTab(DEFAULT_TAB);
      return;
    }
    if (next === "ai" && !aiAvailable) return;
    setTab(next);
  };

  return { tab, handleSetTab, aiAvailable };
};
