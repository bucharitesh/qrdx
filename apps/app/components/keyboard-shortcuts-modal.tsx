"use client";

import type { FeatureId } from "@repo/availability";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Kbd, KbdGroup } from "@repo/design-system/components/ui/kbd";
import { ScrollArea } from "@repo/design-system/components/ui/scroll-area";
import { Keyboard } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { useAvailability } from "@/components/availability-provider";
import { SoundSwitch } from "@/components/sound/sound-switch";
import { useKeyboardShortcut } from "@/lib/hooks/use-keyboard-shortcuts";
import { useUserSettings } from "@/lib/hooks/use-user-settings";
import type { Messages } from "@/lib/i18n/messages";

interface KeyboardShortcutsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Labels = Messages["editor"]["keyboardShortcutsModal"];

interface ShortcutItem {
  keys: string[];
  id: keyof Labels["shortcuts"];
  /** Left out where this deployment can't offer the feature */
  feature?: FeatureId;
}

interface ShortcutCategory {
  id: keyof Labels["categories"];
  shortcuts: ShortcutItem[];
}

// Names in messages/en.json: editor.keyboardShortcutsModal.categories and
// .shortcuts, by id.
const shortcutCategories: ShortcutCategory[] = [
  {
    id: "navigation",
    shortcuts: [
      { keys: ["1"], id: "openContentTab" },
      { keys: ["2"], id: "openDesignTab" },
      { keys: ["3"], id: "openArtTab" },
      {
        keys: ["4"],
        id: "openGenerateAiTab",
        feature: "aiThemes",
      },
    ],
  },
  {
    id: "actions",
    shortcuts: [
      { keys: ["S"], id: "saveQrTheme" },
      { keys: ["D"], id: "downloadQrCode" },
      { keys: ["C"], id: "copySvgToClipboard" },
      { keys: ["V"], id: "viewCode" },
      { keys: ["X"], id: "shareQrCode" },
      { keys: ["R"], id: "resetToPresetDefaults" },
    ],
  },
  {
    id: "themeAppearance",
    shortcuts: [
      { keys: ["T"], id: "shuffleANewTheme" },
      { keys: ["L"], id: "toggleLightDarkMode" },
      { keys: ["←"], id: "previousThemePreset" },
      { keys: ["→"], id: "nextThemePreset" },
    ],
  },
  {
    id: "patternCustomization",
    shortcuts: [
      { keys: [","], id: "cycleDotPatterns" },
      { keys: ["."], id: "cycleCornerEyePatterns" },
      { keys: ["/"], id: "cycleInternalEyePatterns" },
      { keys: ["F"], id: "cycleFrames" },
    ],
  },
  {
    // The playground preview's parts (components/editor/part-inline)
    id: "preview",
    shortcuts: [
      { keys: ["Enter"], id: "editAPartOfTheCode" },
      { keys: ["R"], id: "randomLookForThatPart" },
      { keys: ["Delete"], id: "hideTheFocusedLogo" },
      { keys: ["←", "↑", "→", "↓"], id: "moveTheLogoWhileEditing" },
    ],
  },
  {
    id: "help",
    shortcuts: [{ keys: ["?"], id: "showThisShortcutsDialog" }],
  },
];

export function KeyboardShortcutsModal({
  open,
  onOpenChange,
}: KeyboardShortcutsModalProps) {
  const t = useTranslations("editor.keyboardShortcutsModal");
  const { settings } = useUserSettings();
  const shortcutsEnabled = settings?.keyboardShortcuts ?? true;
  const { has } = useAvailability();

  // Close modal on Escape
  useKeyboardShortcut(
    "Escape",
    () => {
      if (open) onOpenChange(false);
    },
    { enabled: open, modal: true, priority: 100 },
  );

  if (!shortcutsEnabled) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="size-5" />
              {t("keyboardShortcuts")}
            </DialogTitle>
            <DialogDescription>
              {t("keyboardShortcutsAreCurrentlyDisabled")}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="size-5" />
            {t("keyboardShortcuts")}
          </DialogTitle>
          <DialogDescription>
            {t("quickReferenceForAllAvailable")}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(85vh-120px)] pr-4">
          <div className="space-y-6">
            {shortcutCategories.map((category) => (
              <div key={category.id} className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">
                  {t(`categories.${category.id}`)}
                </h3>
                <div className="space-y-2">
                  {category.shortcuts
                    .filter(
                      (shortcut) => !shortcut.feature || has(shortcut.feature),
                    )
                    .map((shortcut, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 px-4 py-2.5 transition-colors hover:bg-muted/50"
                      >
                        <span className="text-sm text-muted-foreground">
                          {t(`shortcuts.${shortcut.id}`)}
                        </span>
                        <KbdGroup>
                          {shortcut.keys.map((key, keyIndex) => (
                            <Kbd key={keyIndex}>{key}</Kbd>
                          ))}
                        </KbdGroup>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <SoundSwitch className="mt-4" />

        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {t.rich("proTipPressAnytimeTo", {
              span: (chunks) => (
                <span className="font-semibold text-foreground">{chunks}</span>
              ),
              kbd: (chunks) => <Kbd className="inline-flex mx-1">{chunks}</Kbd>,
            })}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
