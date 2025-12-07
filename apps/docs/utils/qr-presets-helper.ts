import { defaultThemeState } from "@/config/qr";
import { useThemePresetStore } from "../store/theme-preset-store";
import type { ThemeStyles } from "../types/theme";

export function getPresetThemeStyles(name: string): ThemeStyles {
  const defaultTheme = defaultThemeState.styles;
  if (name === "default") {
    return defaultTheme;
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
