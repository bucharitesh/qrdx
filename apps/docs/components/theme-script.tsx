/** biome-ignore-all lint/security/noDangerouslySetInnerHtml: false positive */
import {
  DEFAULT_FONT_MONO,
  DEFAULT_FONT_SANS,
  DEFAULT_FONT_SERIF,
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
    // ----- FONT LOADING UTILITIES -----
    const DEFAULT_FONT_WEIGHTS = ["400"];

    function extractFontFamily(fontFamilyValue) {
      if (!fontFamilyValue) return null;
      const firstFont = fontFamilyValue.split(",")[0].trim();
      const cleanFont = firstFont.replace(/['"]/g, "");
      const systemFonts = [
        "ui-sans-serif", "ui-serif", "ui-monospace", "system-ui",
        "sans-serif", "serif", "monospace", "cursive", "fantasy"
      ];
      if (systemFonts.includes(cleanFont.toLowerCase())) {
        return null;
      }
      return cleanFont;
    }

    function buildFontCssUrl(family, weights) {
      weights = weights || DEFAULT_FONT_WEIGHTS;
      const encodedFamily = encodeURIComponent(family);
      const weightsParam = weights.join(";");
      return \`https://fonts.googleapis.com/css2?family=\${encodedFamily}:wght@\${weightsParam}&display=swap\`;
    }

    function loadGoogleFont(family, weights) {
      weights = weights || DEFAULT_FONT_WEIGHTS;
      const href = buildFontCssUrl(family, weights);
      const existing = document.querySelector(\`link[href="\${href}"]\`);
      if (existing) return;

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
    }

    // ----- THEME INITIALIZATION -----
    (function() {
      const storageKey = "editor-storage";
      const root = document.documentElement;
      const defaultState = ${JSON.stringify(defaultThemeState)};
      const defaultFontSans = ${JSON.stringify(DEFAULT_FONT_SANS)};
      const defaultFontSerif = ${JSON.stringify(DEFAULT_FONT_SERIF)};
      const defaultFontMono = ${JSON.stringify(DEFAULT_FONT_MONO)};

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

      // Get font families from CSS variables or use defaults
      const getComputedFont = (cssVar, defaultValue) => {
        try {
          const computed = getComputedStyle(root).getPropertyValue(cssVar).trim();
          return computed || defaultValue;
        } catch (e) {
          return defaultValue;
        }
      };

      const fontSans = getComputedFont("--font-sans", defaultFontSans);
      const fontSerif = getComputedFont("--font-serif", defaultFontSerif);
      const fontMono = getComputedFont("--font-mono", defaultFontMono);

      // Load Google fonts immediately
      try {
        [fontSans, fontSerif, fontMono].forEach((fontValue) => {
          const fontFamily = extractFontFamily(fontValue);
          if (fontFamily) {
            loadGoogleFont(fontFamily, DEFAULT_FONT_WEIGHTS);
          }
        });
      } catch (e) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("Theme Script: Failed to load Google fonts:", e);
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
