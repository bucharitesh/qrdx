import { useQREditorStore } from "@/store/editor-store";
import type { QRStyle } from "@/types/qr";

export function applyGeneratedTheme(themeStyles: Partial<QRStyle>) {
  const { style, setStyle } = useQREditorStore.getState();

  // Merge the generated theme styles with the current styles
  const mergedStyles = { ...style, ...themeStyles };

  if (!document.startViewTransition) {
    setStyle(mergedStyles);
  } else {
    document.startViewTransition(() => {
      setStyle(mergedStyles);
    });
  }
}
