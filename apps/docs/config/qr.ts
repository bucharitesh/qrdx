import type { ThemeEditorState } from "@/types/editor";

/**
 * Default QR code style
 */
export const defaultThemeState: ThemeEditorState = {
  styles: {
    bgColor: "#ffffff",
    fgColor: "#000000",
    eyeColor: "#000000",
    dotColor: "#000000",
    bodyPattern: "circle",
    cornerEyePattern: "gear",
    cornerEyeDotPattern: "circle",
    level: "Q",
  },
};
