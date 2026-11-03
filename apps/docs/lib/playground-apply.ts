// Applies a playground link's parameters to the editor, in the hub plan's
// order: the /playground/<id> theme (already applied by the editor) → preset
// or style → type and url → tab, section and open. Kept apart from the hook
// (lib/hooks/use-playground-params.ts) so it can be tested on the stores.
//
// The look changes as one undo step (the editor's Undo brings back the
// previous design). Content isn't part of the editor's undo history, so the
// outcome carries an `undo` that restores both, for the toast's Undo.

import { useCodeDialogStore } from "@/components/editor/action-bar/code-dialog-store";
import { useDownloadDialogStore } from "@/components/editor/action-bar/download-dialog-store";
import { checkUrl } from "@/components/editor/content-forms/url-check";
import type { LinkedDynamicCode } from "@/components/editor/dynamic-link-toggle";
import { toPayload } from "@/components/sections/tools/payload";
import { defaultThemeState } from "@/config/qr";
import type { ControlTab, PlaygroundParams } from "@/lib/playground-links";
import { decodeStyleParam } from "@/lib/playground-style";
import { isDeepEqual } from "@/lib/utils";
import { useQREditorStore } from "@/store/editor-store";
import { usePlaygroundFocusStore } from "@/store/playground-focus-store";
import type { ThemeEditorState } from "@/types/editor";
import {
  CONTENT_TYPES_METADATA,
  type ContentType,
  type QRContentConfig,
  type UrlContent,
} from "@/types/qr-content";

/**
 * Dub and Google Drive forms call account APIs on mount, and a 401 there
 * signs out: signed out, these types open as a plain URL code.
 */
export const SIGNED_IN_TYPES = new Set<ContentType>(["dubsh", "google-drive"]);

/** The playground's dynamic link binding (components/editor/dynamic-link-toggle.tsx). */
export interface DynamicLinkAccess {
  get: () => LinkedDynamicCode | null;
  unlink: () => void;
  link: (code: LinkedDynamicCode) => void;
}

export interface ApplyContext {
  /** On /playground/<themeId>: the theme is the look; preset and style are ignored. */
  themePath: boolean;
  signedIn: boolean;
  /** AI themes work here (aiThemes); otherwise the Generate tab doesn't exist. */
  aiAvailable: boolean;
  /** A built-in preset (not a saved theme, not a shuffle). */
  isBuiltInPreset: (id: string) => boolean;
  presetLabel: (id: string) => string;
  dynamicLink: DynamicLinkAccess;
}

export interface ApplyOutcome {
  /** Parameter names that took effect, for analytics (never their values) */
  applied: string[];
  /** The tab to keep in the address bar, already gated */
  tab: ControlTab | undefined;
  /** Something the user had (a design of their own, content) was replaced */
  replaced: boolean;
  /** "Opened the Classic theme with the WiFi type" */
  message: string | null;
  /** open=download/print asked for a dialog while there is nothing to download yet */
  needsContent: boolean;
  /** Puts back the design and content from before */
  undo: () => void;
}

const typeLabel = (type: ContentType) =>
  CONTENT_TYPES_METADATA.find((meta) => meta.type === type)?.label ?? type;

/** What a URL code encodes: its short link when bound to a dynamic code for this address. */
function urlValue(url: string, code: LinkedDynamicCode | null): string {
  const check = checkUrl(url);
  const encoded =
    check.status === "ok" || check.status === "warning" ? check.url : "";
  if (!encoded) return "";
  return code && code.destinationUrl === url ? code.shortLink : encoded;
}

/** What a content type encodes from the form data stored for it. */
function contentValue(
  type: ContentType,
  configs: Partial<Record<ContentType, QRContentConfig>>,
  code: LinkedDynamicCode | null,
): string {
  if (type === "url") {
    const url = (configs.url as UrlContent | undefined)?.url ?? "";
    return url ? urlValue(url, code) : "";
  }
  return toPayload(type, configs[type]);
}

function withoutPresetStyles(state: ThemeEditorState): ThemeEditorState {
  const { presetStyles: _presetStyles, preset: _preset, ...rest } = state;
  return rest;
}

export function applyPlaygroundParams(
  params: PlaygroundParams,
  context: ApplyContext,
): ApplyOutcome {
  const editor = useQREditorStore.getState();
  const before = {
    themeState: editor.themeState,
    contentType: editor.contentType,
    value: editor.value,
    contentConfigs: editor.contentConfigs,
  };
  const linkedBefore = context.dynamicLink.get();
  const applied: string[] = [];
  let look: string | null = null;
  let content: string | null = null;
  let unlinked = false;

  // 1. The look. A theme path already set it; a valid style beats a preset.
  let lookApplied = false;
  if (!context.themePath) {
    const decoded = params.style ? decodeStyleParam(params.style) : null;
    if (decoded) {
      const next: ThemeEditorState = {
        ...withoutPresetStyles(editor.themeState),
        styles: { ...defaultThemeState.styles, ...decoded.styles },
      };
      if (decoded.preset && context.isBuiltInPreset(decoded.preset)) {
        next.preset = decoded.preset;
      }
      editor.replaceThemeState(next);
      applied.push("style");
      look = "a shared design";
      lookApplied = true;
    } else if (params.preset && context.isBuiltInPreset(params.preset)) {
      editor.applyThemePreset(params.preset);
      applied.push("preset");
      look = `the ${context.presetLabel(params.preset)} theme`;
      lookApplied = true;
    }
  }

  // 2. Content: a web address, or a type (its form data stays in this browser).
  if (params.url) {
    let code = linkedBefore;
    // A dynamic code for another address would send scans elsewhere.
    if (code && code.destinationUrl !== params.url) {
      context.dynamicLink.unlink();
      unlinked = true;
      code = null;
    }
    const value = urlValue(params.url, code);
    if (value) {
      editor.setContentType("url");
      editor.setContentConfig("url", { type: "url", url: params.url });
      editor.setValue(value);
      applied.push("url");
      content = hostOf(params.url);
    }
  } else if (params.type) {
    const type =
      SIGNED_IN_TYPES.has(params.type) && !context.signedIn
        ? "url"
        : params.type;
    if (type !== editor.contentType) {
      const { contentConfigs } = useQREditorStore.getState();
      editor.setContentType(type);
      editor.setValue(contentValue(type, contentConfigs, linkedBefore));
    }
    applied.push("type");
    content = `the ${typeLabel(type)} type`;
  }

  // 3. View: tab, section, open.
  let tab = params.tab;
  if (tab === "ai" && !context.aiAvailable) tab = "customisations";
  if (params.section) {
    usePlaygroundFocusStore.getState().setSection(params.section);
    if (!tab) tab = "customisations";
    applied.push("section");
  }

  let needsContent = false;
  if (params.open === "code") {
    useCodeDialogStore.getState().setOpen(true);
    applied.push("open");
  } else if (params.open === "download" || params.open === "print") {
    const downloads = useDownloadDialogStore.getState();
    downloads.setRequest({
      tab: params.open === "print" ? "print" : "image",
      ...(params.print ? { print: params.print } : {}),
    });
    // Nothing to download while the preview is a sample: the request waits
    // for the first time the dialog opens.
    if (useQREditorStore.getState().value.trim()) downloads.setOpen(true);
    else needsContent = true;
    applied.push("open");
    if (params.print) applied.push("print");
  }

  const after = useQREditorStore.getState();
  const appliedThemeState = after.themeState;
  const contentChanged =
    after.contentType !== before.contentType ||
    after.value !== before.value ||
    after.contentConfigs !== before.contentConfigs;

  const lookReplaced =
    lookApplied &&
    !isDeepEqual(before.themeState.styles, appliedThemeState.styles) &&
    !isDeepEqual(before.themeState.styles, defaultThemeState.styles);
  const contentReplaced =
    before.value.trim() !== "" &&
    (after.contentType !== before.contentType || after.value !== before.value);

  const message =
    look && content
      ? `Opened ${look} with ${content}`
      : look
        ? `Opened ${look}`
        : content
          ? `Opened with ${content}`
          : null;

  const undo = () => {
    const current = useQREditorStore.getState();
    // Only while the look is still the one the link applied.
    if (lookApplied && current.themeState === appliedThemeState) current.undo();
    if (contentChanged) {
      useQREditorStore.setState({
        contentType: before.contentType,
        value: before.value,
        contentConfigs: before.contentConfigs,
      });
    }
    if (unlinked && linkedBefore) context.dynamicLink.link(linkedBefore);
  };

  return {
    applied,
    tab,
    replaced: lookReplaced || contentReplaced,
    message,
    needsContent,
    undo,
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "this link";
  }
}
