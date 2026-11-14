"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  frameLibraryVersion,
  loadFrameIndex,
  subscribeFrameLibrary,
} from "./library";

/**
 * Re-renders when more of the frame library loads, and loads the index when
 * `withIndex` (a custom frame to name, a picker to fill). Returns a number
 * that changes with each load, for memo dependencies.
 */
export function useFrameLibrary({
  withIndex = false,
}: {
  withIndex?: boolean;
} = {}): number {
  const current = useSyncExternalStore(
    subscribeFrameLibrary,
    frameLibraryVersion,
    () => 0,
  );
  useEffect(() => {
    if (withIndex) loadFrameIndex().catch(() => {});
  }, [withIndex]);
  return current;
}
