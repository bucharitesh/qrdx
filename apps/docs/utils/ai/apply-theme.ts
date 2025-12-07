import { useQREditorStore } from "@/store/editor-store";
import type { ThemeStyles } from "@/types/theme";

export function applyGeneratedTheme(themeStyles: Partial<ThemeStyles>) {
  const { themeState, setThemeState } = useQREditorStore.getState();

  // Merge the generated theme styles with the current styles
  const mergedStyles = { ...themeState.styles, ...themeStyles };

  const newThemeState = {
    ...themeState,
    styles: mergedStyles,
  };

  if (!document.startViewTransition) {
    setThemeState(newThemeState);
  } else {
    document.startViewTransition(() => {
      setThemeState(newThemeState);
    });
  }
}
