import type { ThemeEditorState } from "@/types/editor";

// export const DEFAULT_FONT_SANS =
//   "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'";

// export const DEFAULT_FONT_SERIF =
//   'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif';

// export const DEFAULT_FONT_MONO =
//   'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

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
