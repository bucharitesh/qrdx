import { defaultQRStyle } from "@/config/qr";
import { useQRPresetStore } from "@/store/qr-preset-store";
import type { QRPreset, QRStyle } from "@/types/qr";

/**
 * Get QR style from preset by ID
 */
export function getPresetQRStyle(id: string): Partial<QRStyle> {
  if (id === "default") {
    return defaultQRStyle;
  }

  const store = useQRPresetStore.getState();
  const preset = store.getPresetById(id);

  if (!preset) {
    return defaultQRStyle;
  }

  return {
    ...defaultQRStyle,
    ...preset.style,
  };
}

/**
 * Create a new preset from current style
 */
export function createPresetFromStyle(
  style: Partial<QRStyle>,
  name: string,
  description?: string,
): QRPreset {
  return {
    id: `custom-${Date.now()}`,
    name,
    description,
    source: "SAVED",
    createdAt: new Date().toISOString(),
    style,
  };
}

/**
 * Check if a preset exists by ID
 */
export function presetExists(id: string): boolean {
  const store = useQRPresetStore.getState();
  return store.getPresetById(id) !== undefined;
}

/**
 * Get all preset IDs
 */
export function getAllPresetIds(): string[] {
  const store = useQRPresetStore.getState();
  return store.getAllPresets().map((p) => p.id);
}
