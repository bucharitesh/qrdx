"use client";

import { createContext, type ReactNode, useContext, useMemo } from "react";
import { useQREditorStore } from "@/store/editor-store";
import type { QRStyle } from "@/types/theme";

// The design pickers (dots, eyes, border, error correction, frame, frame
// labels, art) were written for the playground and edit its saved editor
// state (store/editor-store.ts, persisted as "editor-storage"). Other
// surfaces, such as the dashboard's code builder, keep a design of their own:
// they wrap the same pickers in a QRStyleScopeProvider, and the pickers then
// read and write that design instead. Outside a provider nothing changes.

interface StyleScope {
  style: QRStyle;
  setStyle: (next: QRStyle) => void;
  /** What the code encodes, for previews that score the real content */
  value: string;
}

const StyleScopeContext = createContext<StyleScope | null>(null);

/**
 * Points the design pickers inside it at `style`: they render it and report
 * every change to `onChange`, and never touch the playground's saved state.
 */
export function QRStyleScopeProvider({
  style,
  onChange,
  value = "",
  children,
}: {
  style: QRStyle;
  onChange: (next: QRStyle) => void;
  value?: string;
  children: ReactNode;
}) {
  const scope = useMemo(
    () => ({ style, setStyle: onChange, value }),
    [style, onChange, value],
  );
  return (
    <StyleScopeContext.Provider value={scope}>
      {children}
    </StyleScopeContext.Provider>
  );
}

/**
 * The design a picker edits: its scope's inside a QRStyleScopeProvider, else
 * the playground's editor state.
 */
export function useEditableStyle(): {
  style: QRStyle;
  setStyle: (next: QRStyle) => void;
  scoped: boolean;
} {
  const scope = useContext(StyleScopeContext);
  // Inside a scope the selectors return null, so editor changes don't
  // re-render scoped pickers.
  const themeState = useQREditorStore((state) =>
    scope ? null : state.themeState,
  );
  const setThemeState = useQREditorStore((state) => state.setThemeState);
  if (scope) {
    return { style: scope.style, setStyle: scope.setStyle, scoped: true };
  }
  const editor = themeState ?? useQREditorStore.getState().themeState;
  return {
    style: editor.styles,
    setStyle: (styles) => setThemeState({ ...editor, styles }),
    scoped: false,
  };
}

/** What the code encodes: the scope's value inside a provider, else the editor's. */
export function useEditorValue(): string {
  const scope = useContext(StyleScopeContext);
  const value = useQREditorStore((state) => (scope ? null : state.value));
  return scope ? scope.value : (value ?? "");
}
