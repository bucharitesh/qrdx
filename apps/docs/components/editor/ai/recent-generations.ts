"use client";

import { useEffect, useState } from "react";
import type { ThemeStyles } from "@/types/theme";

const STORAGE_KEY = "qrdx:ai-recent-themes";
const MAX_RECENT = 6;
const EVENT = "qrdx:ai-recent-themes";

export interface RecentGeneration {
  id: string;
  styles: ThemeStyles;
  prompt?: string;
}

function read(): RecentGeneration[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? (parsed as RecentGeneration[])
          .filter((item) => item && typeof item.id === "string" && item.styles)
          .slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}

/** Remembers generated themes so a new chat can still reach them. */
export function rememberGenerations(items: RecentGeneration[]) {
  if (!items.length) return;
  try {
    const current = read();
    const known = new Set(current.map((item) => item.id));
    const fresh = items.filter((item) => !known.has(item.id));
    if (!fresh.length) return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([...fresh.reverse(), ...current].slice(0, MAX_RECENT)),
    );
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // Storage may be unavailable; recents are a convenience.
  }
}

export function useRecentGenerations(): RecentGeneration[] {
  const [items, setItems] = useState<RecentGeneration[]>([]);
  useEffect(() => {
    const sync = () => setItems(read());
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  return items;
}
