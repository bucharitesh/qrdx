import { defaultThemeState } from "@/config/qr";
import { shuffleSeed, shuffleTheme } from "@/lib/themes/shuffle";
import { useThemePresetStore } from "../store/theme-preset-store";
import type { ThemeStyles } from "../types/theme";

export function getPresetThemeStyles(name: string): ThemeStyles {
  const defaultTheme = defaultThemeState.styles;
  if (name === "default") {
    return defaultTheme;
  }

  // Shuffled themes aren't stored: their id is the seed that composes them.
  const seed = shuffleSeed(name);
  if (seed !== null) {
    return { ...defaultTheme, ...shuffleTheme(seed).styles };
  }

  const store = useThemePresetStore.getState();
  const preset = store.getPreset(name);
  if (!preset) {
    return defaultTheme;
  }

  return {
    ...defaultTheme,
    ...preset.styles,
  };
}

/** Display name for a preset id, including shuffled themes. */
export function getPresetLabel(name: string | null | undefined): string {
  if (!name || name === "default") return "Default";
  const seed = shuffleSeed(name);
  if (seed !== null) return shuffleTheme(seed).name;
  return useThemePresetStore.getState().getPreset(name)?.label ?? name;
}
