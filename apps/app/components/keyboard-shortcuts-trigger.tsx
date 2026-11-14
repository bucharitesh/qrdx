"use client";

import { createContext, useContext, useState } from "react";
import { useKeyboardShortcut } from "@/lib/hooks/use-keyboard-shortcuts";
import { useUserSettings } from "@/lib/hooks/use-user-settings";
import { KeyboardShortcutsModal } from "./keyboard-shortcuts-modal";

interface KeyboardShortcutsContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const KeyboardShortcutsContext =
  createContext<KeyboardShortcutsContextType | null>(null);

export function useKeyboardShortcutsModal() {
  const context = useContext(KeyboardShortcutsContext);
  if (!context) {
    throw new Error(
      "useKeyboardShortcutsModal must be used within KeyboardShortcutsTrigger",
    );
  }
  return context;
}

export function KeyboardShortcutsTrigger({
  children,
}: {
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { settings } = useUserSettings();
  const shortcutsEnabled = settings?.keyboardShortcuts ?? true;

  // Open shortcuts modal with "?" key
  useKeyboardShortcut(
    "?",
    () => {
      setOpen(true);
    },
    { enabled: shortcutsEnabled },
  );

  return (
    <KeyboardShortcutsContext.Provider value={{ open, setOpen }}>
      {children}
      <KeyboardShortcutsModal open={open} onOpenChange={setOpen} />
    </KeyboardShortcutsContext.Provider>
  );
}
