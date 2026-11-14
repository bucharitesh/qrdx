"use client";

import {
  loadCodeIntoEditor,
  useDynamicLinkStore,
} from "@/components/editor/dynamic-link-toggle";
import { useQREditorStore } from "@/store/editor-store";
import type { QRStyle } from "@/types/theme";
import type { CodeBuilderOrigin } from "./store";

/**
 * Where "Open full editor" goes after writing the design: the playground,
 * or nowhere when the builder was opened from it (the editor is already
 * underneath, so the builder just closes).
 */
export function fullEditorDestination(
  origin: CodeBuilderOrigin | undefined,
): string | null {
  return origin === "playground" ? null : "/playground";
}

/**
 * "Open full editor": hands the builder's design to the playground, which
 * the person asked for, so this (and only this) writes the playground's
 * state. An existing code opens bound to its short link, like "Edit design
 * in playground"; a new one opens as a plain URL code to finish there.
 */
export function openInFullEditor(
  input:
    | {
        code: {
          id: string;
          shortLink: string;
          destinationUrl: string;
        };
        style: QRStyle;
        userId: string;
      }
    | { code: null; destination: string; style: QRStyle },
): void {
  if (input.code) {
    loadCodeIntoEditor({ ...input.code, style: input.style }, input.userId);
    return;
  }
  const editor = useQREditorStore.getState();
  // Don't keep showing another code's short link with this design.
  useDynamicLinkStore.getState().unlink();
  editor.setContentType("url");
  editor.setContentConfig("url", { type: "url", url: input.destination });
  editor.setValue(input.destination);
  editor.setThemeState({
    ...useQREditorStore.getState().themeState,
    styles: input.style,
  });
}
