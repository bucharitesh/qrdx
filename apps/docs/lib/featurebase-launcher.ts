"use client";

import { useEffect, useSyncExternalStore } from "react";

// The editor's bottom sheets (the preview's part and frame text sheets) end
// in a row of buttons along the bottom of the screen, where Featurebase's
// floating launcher sits. While one is open the launcher steps aside
// (components/featurebase-script.tsx boots Featurebase with
// hideDefaultLauncher), and it comes back when the last one closes.

let open = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function change(by: number) {
  open = Math.max(0, open + by);
  for (const listener of listeners) listener();
}

/** Hides the Featurebase launcher while the calling sheet is mounted. */
export function useHideFeaturebaseLauncher(active = true) {
  useEffect(() => {
    if (!active) return;
    change(1);
    return () => change(-1);
  }, [active]);
}

/** Whether a sheet wants the Featurebase launcher out of the way. */
export function useFeaturebaseLauncherHidden(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => open > 0,
    () => false,
  );
}
