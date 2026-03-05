import { defaultThemeState } from "@/config/qr";
import type { ThemeStyles } from "@/types/theme";

export function mergeThemeStylesWithDefaults(themeStyles: ThemeStyles) {
  const mergedStyles = {
    ...defaultThemeState.styles,
    ...themeStyles,
  };
  return mergedStyles;
}
