/** biome-ignore-all lint/security/noDangerouslySetInnerHtml: false positive */
import {
  // DEFAULT_FONT_MONO,
  // DEFAULT_FONT_SANS,
  // DEFAULT_FONT_SERIF,
  defaultThemeState,
} from "@/config/qr";

/**
 * Theme script that runs before React hydration to prevent FOUC
 * and ensure QR editor state is available early.
 *
 * This script initializes the QR editor theme state from localStorage
 * independently of Zustand and loads any required Google Fonts.
 */
export function ThemeScript() {
  const scriptContent = `
    // ----- THEME INITIALIZATION -----
    (function() {
      const storageKey = "editor-storage";
      const root = document.documentElement;
      const defaultState = ${JSON.stringify(defaultThemeState)};

      let themeState = null;
      try {
        const persistedStateJSON = localStorage.getItem(storageKey);
        if (persistedStateJSON) {
          const persistedState = JSON.parse(persistedStateJSON);
          // Handle both Zustand format (state.themeState) and direct format
          themeState = persistedState?.state?.themeState || persistedState?.themeState || null;
        }
      } catch (e) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("Theme initialization: Failed to read/parse localStorage:", e);
        }
      }

      // Initialize theme state if not found
      if (!themeState) {
        try {
          const initialState = {
            themeState: defaultState,
            themeCheckpoint: null,
            history: [],
            future: [],
            value: "",
            contentType: "url",
            contentConfigs: {},
          };
          localStorage.setItem(storageKey, JSON.stringify(initialState));
          themeState = defaultState;
        } catch (e) {
          // If localStorage write fails, use default state in memory
          themeState = defaultState;
        }
      }
    })();
  `;

  return (
    <script
      dangerouslySetInnerHTML={{ __html: scriptContent }}
      suppressHydrationWarning
    />
  );
}
