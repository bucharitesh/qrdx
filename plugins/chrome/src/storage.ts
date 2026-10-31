import { DEFAULT_STYLE, type QRStyle, sanitizeStyle } from "./presets";

// Everything is stored locally (chrome.storage.local / .session); nothing is synced.
const STYLE_KEY = "style";
const PENDING_KEY = "pending";
// A context-menu value older than this is stale (e.g. the popup never opened).
const PENDING_TTL_MS = 2 * 60 * 1000;

export const EXPORT_SIZES = [256, 512, 1024, 2048] as const;
const DEFAULT_EXPORT_SIZE = 512;

export interface Preferences extends QRStyle {
  size: number;
}

export type PendingSource = "link" | "image" | "selection";

export interface PendingValue {
  value: string;
  source: PendingSource;
  createdAt: number;
}

const PENDING_SOURCES: readonly string[] = ["link", "image", "selection"];

export async function loadPreferences(): Promise<Preferences> {
  try {
    const data = await chrome.storage.local.get(STYLE_KEY);
    const raw = data[STYLE_KEY] as { size?: unknown } | undefined;
    const size = EXPORT_SIZES.find((option) => option === raw?.size);
    return { ...sanitizeStyle(raw), size: size ?? DEFAULT_EXPORT_SIZE };
  } catch {
    return { ...DEFAULT_STYLE, size: DEFAULT_EXPORT_SIZE };
  }
}

export function savePreferences(preferences: Preferences): Promise<void> {
  return chrome.storage.local.set({ [STYLE_KEY]: preferences });
}

function parsePending(input: unknown): PendingValue | null {
  if (typeof input !== "object" || input === null) return null;
  const { value, source, createdAt } = input as Record<string, unknown>;
  if (
    typeof value !== "string" ||
    typeof source !== "string" ||
    !PENDING_SOURCES.includes(source) ||
    typeof createdAt !== "number" ||
    Date.now() - createdAt > PENDING_TTL_MS
  ) {
    return null;
  }
  return { value, source: source as PendingSource, createdAt };
}

export function setPendingValue(value: string, source: PendingSource) {
  const pending: PendingValue = { value, source, createdAt: Date.now() };
  return chrome.storage.session.set({ [PENDING_KEY]: pending });
}

/** Reads and clears the value a context-menu click left for the popup. */
export async function takePendingValue(): Promise<PendingValue | null> {
  const data = await chrome.storage.session.get(PENDING_KEY);
  if (data[PENDING_KEY] === undefined) return null;
  await chrome.storage.session.remove(PENDING_KEY);
  return parsePending(data[PENDING_KEY]);
}

/** Calls back when a context-menu value arrives after the popup opened. */
export function onPendingValue(callback: (pending: PendingValue) => void) {
  const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
    const pending = parsePending(changes[PENDING_KEY]?.newValue);
    if (!pending) return;
    callback(pending);
    chrome.storage.session.remove(PENDING_KEY).catch(() => undefined);
  };
  chrome.storage.session.onChanged.addListener(listener);
  return () => chrome.storage.session.onChanged.removeListener(listener);
}

/** The active tab's URL. Readable thanks to activeTab when the user opened the popup. */
export async function getActiveTabUrl(): Promise<string> {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const url = tab?.url ?? "";
    // Opened as a standalone window (context-menu fallback): that tab is the popup itself.
    return url.startsWith(chrome.runtime.getURL("")) ? "" : url;
  } catch {
    return "";
  }
}
