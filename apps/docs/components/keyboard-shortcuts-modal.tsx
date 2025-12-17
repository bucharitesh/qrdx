"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Kbd, KbdGroup } from "@repo/design-system/components/ui/kbd";
import { ScrollArea } from "@repo/design-system/components/ui/scroll-area";
import { Keyboard } from "lucide-react";
import { useKeyboardShortcut } from "@/lib/hooks/use-keyboard-shortcuts";
import { useUserSettings } from "@/lib/hooks/use-user-settings";

interface KeyboardShortcutsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ShortcutItem {
  keys: string[];
  description: string;
}

interface ShortcutCategory {
  title: string;
  shortcuts: ShortcutItem[];
}

const shortcutCategories: ShortcutCategory[] = [
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["1"], description: "Open Content tab" },
      { keys: ["2"], description: "Open Colors tab" },
      { keys: ["3"], description: "Open Patterns tab" },
      { keys: ["4"], description: "Open Frames tab" },
      { keys: ["5"], description: "Open Settings tab" },
      { keys: ["6"], description: "Open AI Generate tab" },
    ],
  },
  {
    title: "Actions",
    shortcuts: [
      { keys: ["S"], description: "Save QR theme" },
      { keys: ["D"], description: "Download QR code" },
      { keys: ["C"], description: "Copy SVG to clipboard" },
      { keys: ["V"], description: "View code" },
      { keys: ["X"], description: "Share QR code" },
      { keys: ["R"], description: "Reset to preset defaults" },
    ],
  },
  {
    title: "Theme & Appearance",
    shortcuts: [
      { keys: ["T"], description: "Apply random theme" },
      { keys: ["L"], description: "Toggle light/dark mode" },
      { keys: ["←"], description: "Previous theme preset" },
      { keys: ["→"], description: "Next theme preset" },
    ],
  },
  {
    title: "Pattern Customization",
    shortcuts: [
      { keys: [","], description: "Cycle dot patterns" },
      { keys: ["."], description: "Cycle corner eye patterns" },
      { keys: ["/"], description: "Cycle internal eye patterns" },
      { keys: ["F"], description: "Cycle frames" },
    ],
  },
  {
    title: "Help",
    shortcuts: [
      { keys: ["?"], description: "Show this shortcuts dialog" },
    ],
  },
];

export function KeyboardShortcutsModal({
  open,
  onOpenChange,
}: KeyboardShortcutsModalProps) {
  const { settings } = useUserSettings();
  const shortcutsEnabled = settings?.keyboardShortcuts ?? true;

  // Close modal on Escape
  useKeyboardShortcut(
    "Escape",
    () => {
      if (open) onOpenChange(false);
    },
    { enabled: open, modal: true, priority: 100 }
  );

  if (!shortcutsEnabled) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="size-5" />
              Keyboard Shortcuts
            </DialogTitle>
            <DialogDescription>
              Keyboard shortcuts are currently disabled. Enable them in settings to use these shortcuts.
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
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Quick reference for all available keyboard shortcuts
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(85vh-120px)] pr-4">
          <div className="space-y-6">
            {shortcutCategories.map((category) => (
              <div key={category.title} className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">
                  {category.title}
                </h3>
                <div className="space-y-2">
                  {category.shortcuts.map((shortcut, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 px-4 py-2.5 transition-colors hover:bg-muted/50"
                    >
                      <span className="text-sm text-muted-foreground">
                        {shortcut.description}
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

        <div className="mt-4 rounded-lg border border-border bg-muted/30 px-4 py-3">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Pro tip:</span> Press{" "}
            <Kbd className="inline-flex mx-1">?</Kbd> anytime to view this dialog
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
