"use client";

// The builder opened over the playground (origin "playground"): what it
// writes back to the editor underneath, and how the playground opens it.
// The playground always mounts a host (playground-host.tsx), so its
// requests go straight to the store.

import type { QrCodeView } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import {
  loadCodeIntoEditor,
  useDynamicLinkStore,
} from "@/components/editor/dynamic-link-toggle";
import { markProgrammaticQrContent } from "@/lib/analytics/react";
import { useQREditorStore } from "@/store/editor-store";
import type { UrlContent } from "@/types/qr-content";
import type { QRStyle } from "@/types/theme";
import {
  builderRequestFor,
  type PlaygroundBuilderRequest,
  pageGalleryRequest,
} from "./playground-request";
import { type CodeBuilderRequest, useCodeBuilderStore } from "./store";

/** Opens the builder over the playground (its host loads on first use). */
export function openPlaygroundBuilder(request: CodeBuilderRequest): void {
  useCodeBuilderStore.getState().open(request);
}

/** The builder request for the playground's code right now (see builderRequestFor). */
export function currentBuilderRequest(
  userId: string | null,
):
  | { ok: true; request: PlaygroundBuilderRequest }
  | { ok: false; reason: string } {
  const editor = useQREditorStore.getState();
  return builderRequestFor({
    contentType: editor.contentType,
    url: (editor.contentConfigs.url as UrlContent | undefined)?.url ?? "",
    style: editor.themeState.styles,
    linked: useDynamicLinkStore.getState().code,
    userId,
  });
}

/** The page gallery with the playground's current design. */
export function currentPageGalleryRequest(
  options: { type?: string | null; template?: string | null } = {},
) {
  return pageGalleryRequest(
    useQREditorStore.getState().themeState.styles,
    options,
  );
}

/**
 * A code created from the playground: the playground's URL code becomes it
 * (encodes its short link, in the design it was saved with).
 */
export function bindCreatedCode(
  code: Pick<QrCodeView, "id" | "shortLink" | "destinationUrl" | "style">,
  userId: string,
): void {
  loadCodeIntoEditor(code, userId);
}

/**
 * A code saved from the playground. When the playground is bound to it, its
 * short link and destination follow the saved code (a new back-half or
 * domain changes what the QR encodes); the design follows only when it was
 * changed in the builder, so unsaved playground edits aren't replaced by
 * the code's older design. Returns whether the playground was updated.
 */
export function syncSavedCode(
  code: Pick<QrCodeView, "id" | "shortLink" | "destinationUrl" | "kind">,
  { style }: { style: QRStyle | null },
): boolean {
  const links = useDynamicLinkStore.getState();
  const linked = links.code;
  if (!linked || linked.id !== code.id || code.kind === "page") return false;
  links.link({
    ...linked,
    shortLink: code.shortLink,
    destinationUrl: code.destinationUrl,
  });
  const editor = useQREditorStore.getState();
  editor.setContentType("url");
  editor.setContentConfig("url", { type: "url", url: code.destinationUrl });
  // QRdx put it there: not a code the visitor generated (qr_generated).
  markProgrammaticQrContent(code.shortLink);
  editor.setValue(code.shortLink);
  if (style) {
    const { themeState } = useQREditorStore.getState();
    editor.setThemeState({ ...themeState, styles: style });
  }
  return true;
}
