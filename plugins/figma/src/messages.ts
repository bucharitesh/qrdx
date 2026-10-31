import { type QRStyle, sanitizeStyle } from "./presets";

// Messages between the UI iframe (ui.tsx) and the main thread (code.ts).

export const PLUGIN_DATA_KEY = "qrdx";
export const MIN_SIZE = 32;
export const MAX_SIZE = 4096;
const MAX_VALUE_LENGTH = 4096;
const MAX_SVG_LENGTH = 8_000_000;

/** Stored on every inserted QR node so it can be edited or replaced later. */
export interface QRMeta extends QRStyle {
  version: 1;
  value: string;
  size: number;
}

export type UIMessage =
  | { type: "ready" }
  | { type: "insert" | "replace"; svg: string; meta: QRMeta };

export interface MainMessage {
  type: "selection";
  /** The selected QR node's settings, or null when no QRdx code is selected. */
  qr: QRMeta | null;
  /** Load these settings into the form (the plugin was relaunched to edit). */
  load: boolean;
}

function toMeta(input: unknown): QRMeta | null {
  if (typeof input !== "object" || input === null) return null;
  const { value, size } = input as Record<string, unknown>;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_VALUE_LENGTH ||
    typeof size !== "number" ||
    !Number.isFinite(size)
  ) {
    return null;
  }
  return {
    ...sanitizeStyle(input),
    version: 1,
    value,
    size: Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(size))),
  };
}

export function parseMeta(pluginData: string): QRMeta | null {
  if (!pluginData) return null;
  try {
    return toMeta(JSON.parse(pluginData));
  } catch {
    return null;
  }
}

export function parseUIMessage(input: unknown): UIMessage | null {
  if (typeof input !== "object" || input === null) return null;
  const message = input as Record<string, unknown>;
  if (message.type === "ready") return { type: "ready" };
  if (message.type !== "insert" && message.type !== "replace") return null;
  const { svg } = message;
  const meta = toMeta(message.meta);
  if (
    !meta ||
    typeof svg !== "string" ||
    !svg.startsWith("<svg") ||
    svg.length > MAX_SVG_LENGTH
  ) {
    return null;
  }
  return { type: message.type, svg, meta };
}
