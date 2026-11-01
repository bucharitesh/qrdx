"use client";

import { toast } from "@repo/design-system";
import { useTheme } from "next-themes";
import { getAllTemplates, getQRData, getSVGString } from "qrdx";
import { patterns as cornerEyeDotPatterns } from "@/components/playground/corner-eye-dot-pattern-selector";
import { patterns as cornerEyePatterns } from "@/components/playground/corner-eye-pattern-selector";
import { patterns as bodyPatterns } from "@/components/playground/pattern-selector";
import { track } from "@/lib/analytics";
import { DEFAULT_QR_LOGO } from "@/lib/constants";
import { useControlsTabFromUrl } from "@/lib/hooks/use-controls-tab-from-url";
import { useKeyboardShortcut } from "@/lib/hooks/use-keyboard-shortcuts";
import { shuffleNext } from "@/lib/hooks/use-theme-shuffle";
import { useUserSettings } from "@/lib/hooks/use-user-settings";
import { soundEvent } from "@/lib/sound/emit";
import { useQREditorStore } from "@/store/editor-store";
import { useThemePresetStore } from "@/store/theme-preset-store";

interface UsePlaygroundShortcutsOptions {
  onSave?: () => void;
  onShare?: () => void;
  onDownload?: () => void;
  onCode?: () => void;
  onReset?: () => void;
}

export function usePlaygroundShortcuts({
  onSave,
  onShare,
  onDownload,
  onCode,
  onReset,
}: UsePlaygroundShortcutsOptions = {}) {
  const { themeState, setThemeState, applyThemePreset, value } =
    useQREditorStore();
  const { getAllPresets } = useThemePresetStore();
  const { setTheme, theme } = useTheme();
  const { handleSetTab } = useControlsTabFromUrl();
  const { settings } = useUserSettings();

  // Check if keyboard shortcuts are enabled
  const shortcutsEnabled = settings?.keyboardShortcuts ?? true;

  // Save shortcut (S)
  useKeyboardShortcut(
    "s",
    () => {
      onSave?.();
    },
    { enabled: shortcutsEnabled },
  );

  // Shuffle a new theme from the generator (T)
  useKeyboardShortcut(
    "t",
    () => {
      shuffleNext();
      soundEvent("shuffle");
    },
    { enabled: shortcutsEnabled },
  );

  // Toggle theme light/dark (L)
  useKeyboardShortcut(
    "l",
    () => {
      setTheme(theme === "dark" ? "light" : "dark");
    },
    { enabled: shortcutsEnabled },
  );

  // Cycle theme prev (ArrowLeft)
  useKeyboardShortcut(
    "ArrowLeft",
    () => {
      const presets = getAllPresets();
      const presetNames = ["default", ...Object.keys(presets)];
      const currentIndex = presetNames.indexOf(themeState.preset || "default");
      const prevIndex =
        (currentIndex - 1 + presetNames.length) % presetNames.length;
      applyThemePreset(presetNames[prevIndex]);
      track("theme_applied", {
        method: "preset",
        preset: presetNames[prevIndex],
      });
      soundEvent("apply");
    },
    { enabled: shortcutsEnabled },
  );

  // Cycle theme next (ArrowRight)
  useKeyboardShortcut(
    "ArrowRight",
    () => {
      const presets = getAllPresets();
      const presetNames = ["default", ...Object.keys(presets)];
      const currentIndex = presetNames.indexOf(themeState.preset || "default");
      const nextIndex = (currentIndex + 1) % presetNames.length;
      applyThemePreset(presetNames[nextIndex]);
      track("theme_applied", {
        method: "preset",
        preset: presetNames[nextIndex],
      });
      soundEvent("apply");
    },
    { enabled: shortcutsEnabled },
  );

  // Reset (R)
  useKeyboardShortcut(
    "r",
    () => {
      onReset?.();
    },
    { enabled: shortcutsEnabled },
  );

  // Download (D)
  useKeyboardShortcut(
    "d",
    () => {
      onDownload?.();
    },
    { enabled: shortcutsEnabled },
  );

  // Copy SVG (C)
  useKeyboardShortcut(
    "c",
    async () => {
      try {
        const qrProps = {
          ...getQRData({
            value,
            fgColor: themeState.styles.fgColor,
            bgColor: themeState.styles.bgColor,
            eyeColor: themeState.styles.eyeColor,
            dotColor: themeState.styles.dotColor,
            bodyPattern: themeState.styles.bodyPattern,
            hideLogo: !themeState.styles.showLogo,
            logo: themeState.styles.customLogo ?? DEFAULT_QR_LOGO,
          }),
          level: themeState.styles.level,
          cornerEyePattern: themeState.styles.cornerEyePattern,
          cornerEyeDotPattern: themeState.styles.cornerEyeDotPattern,
          templateId: themeState.styles.templateId,
          margin: themeState.styles.margin,
          frame: themeState.styles.frame,
        };

        const svgContent = await getSVGString(qrProps);
        await navigator.clipboard.writeText(svgContent);
        track("qr_copied", { format: "svg", source: "playground" });
        toast.success("SVG copied to clipboard");
        soundEvent("copy");
      } catch (error) {
        console.error("Error copying SVG:", error);
        toast.error("Failed to copy SVG");
      }
    },
    { enabled: shortcutsEnabled },
  );

  // View Code (V)
  useKeyboardShortcut(
    "v",
    () => {
      onCode?.();
    },
    { enabled: shortcutsEnabled },
  );

  // Share (X)
  useKeyboardShortcut(
    "x",
    () => {
      onShare?.();
    },
    { enabled: shortcutsEnabled },
  );

  // Cycle dot pattern (,)
  useKeyboardShortcut(
    ",",
    () => {
      const currentPattern = themeState.styles.bodyPattern || "circle";
      const currentIndex = bodyPatterns.findIndex(
        (p) => p.id === currentPattern,
      );
      const nextIndex = (currentIndex + 1) % bodyPatterns.length;
      setThemeState({
        ...themeState,
        styles: {
          ...themeState.styles,
          bodyPattern: bodyPatterns[nextIndex].id,
        },
      });
      soundEvent("tick");
    },
    { enabled: shortcutsEnabled },
  );

  // Cycle corner eye pattern (.)
  useKeyboardShortcut(
    ".",
    () => {
      const currentPattern = themeState.styles.cornerEyePattern;
      const currentIndex = cornerEyePatterns.findIndex(
        (p) => p.id === currentPattern,
      );
      const nextIndex = (currentIndex + 1) % cornerEyePatterns.length;
      setThemeState({
        ...themeState,
        styles: {
          ...themeState.styles,
          cornerEyePattern: cornerEyePatterns[nextIndex].id,
        },
      });
      soundEvent("tick");
    },
    { enabled: shortcutsEnabled },
  );

  // Cycle internal eye pattern (/)
  useKeyboardShortcut(
    "/",
    () => {
      const currentPattern = themeState.styles.cornerEyeDotPattern || "circle";
      const currentIndex = cornerEyeDotPatterns.findIndex(
        (p) => p.id === currentPattern,
      );
      const nextIndex = (currentIndex + 1) % cornerEyeDotPatterns.length;
      setThemeState({
        ...themeState,
        styles: {
          ...themeState.styles,
          cornerEyeDotPattern: cornerEyeDotPatterns[nextIndex].id,
        },
      });
      soundEvent("tick");
    },
    { enabled: shortcutsEnabled },
  );

  // Cycle frames (F)
  useKeyboardShortcut(
    "f",
    () => {
      const templates = getAllTemplates();
      const currentTemplate = themeState.styles.templateId;
      const currentIndex = templates.findIndex((t) => t.id === currentTemplate);
      const nextIndex = (currentIndex + 1) % templates.length;
      setThemeState({
        ...themeState,
        styles: {
          ...themeState.styles,
          templateId: templates[nextIndex].id,
        },
      });
      soundEvent("tick");
    },
    { enabled: shortcutsEnabled },
  );

  // Tab switching: 1 Content, 2 Design, 3 Generate (AI)
  useKeyboardShortcut("1", () => handleSetTab("content"), {
    enabled: shortcutsEnabled,
  });
  useKeyboardShortcut("2", () => handleSetTab("customisations"), {
    enabled: shortcutsEnabled,
  });
  useKeyboardShortcut("3", () => handleSetTab("ai"), {
    enabled: shortcutsEnabled,
  });
}
