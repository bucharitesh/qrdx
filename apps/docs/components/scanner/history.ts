// Scan history lives only in this browser's IndexedDB. Nothing is sent anywhere.

import { createStore, get, set, type UseStore, update } from "idb-keyval";

export interface HistoryEntry {
  id: string;
  value: string;
  format: string;
  kind: string;
  scannedAt: number;
  source: "camera" | "image";
}

const KEY = "entries";
const MAX_ENTRIES = 500;
const PREFERENCE_KEY = "qrdx-scan-history";

let store: UseStore | null = null;

function historyStore(): UseStore {
  store ??= createStore("qrdx-scanner", "history");
  return store;
}

export async function loadHistory(): Promise<HistoryEntry[]> {
  try {
    return (await get<HistoryEntry[]>(KEY, historyStore())) ?? [];
  } catch {
    // Private browsing or blocked storage: run without history.
    return [];
  }
}

/** Adds entries (newest first) and returns the stored list. */
export async function addToHistory(
  entries: HistoryEntry[],
): Promise<HistoryEntry[] | null> {
  let next: HistoryEntry[] = [];
  try {
    await update<HistoryEntry[]>(
      KEY,
      (current = []) => {
        next = [...entries, ...current].slice(0, MAX_ENTRIES);
        return next;
      },
      historyStore(),
    );
    return next;
  } catch {
    return null;
  }
}

export async function removeFromHistory(
  id: string,
): Promise<HistoryEntry[] | null> {
  let next: HistoryEntry[] = [];
  try {
    await update<HistoryEntry[]>(
      KEY,
      (current = []) => {
        next = current.filter((entry) => entry.id !== id);
        return next;
      },
      historyStore(),
    );
    return next;
  } catch {
    return null;
  }
}

export async function clearHistory(): Promise<boolean> {
  try {
    await set(KEY, [], historyStore());
    return true;
  } catch {
    return false;
  }
}

export function readHistoryPreference(): boolean {
  try {
    return localStorage.getItem(PREFERENCE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function writeHistoryPreference(enabled: boolean): void {
  try {
    localStorage.setItem(PREFERENCE_KEY, enabled ? "on" : "off");
  } catch {
    // Storage blocked; the toggle still applies for this visit.
  }
}

export function createEntryId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
