// Catalog parts for the editor's client components (components/editor and
// the dialogs around it), wherever they render. A nested provider replaces
// the root one's messages (components/i18n/client-messages.tsx), so each
// list names everything its children read.
import { CHROME_NAMESPACES } from "./messages";

/** The whole editor: /playground, shared theme links, the dashboard. */
export const EDITOR_NAMESPACES = [
  "editor",
  "playground",
  "scanChecker",
  "limits",
  "community",
  "aiArt",
] as const;

/** The playground page: the editor under the site header. */
export const PLAYGROUND_NAMESPACES = [
  ...CHROME_NAMESPACES,
  ...EDITOR_NAMESPACES,
] as const;

/** The content forms embedded in the generator pages (/qr-code-generator/<type>). */
export const CONTENT_FORM_NAMESPACES = [
  "editor.contentForms",
  "editor.dynamicLinkToggle",
  "editor.linkSourceMenu",
] as const;

/** The AI theme chat on /ai. */
export const AI_CHAT_NAMESPACES = [
  "ai.chat",
  "editor.ai",
  "editor.customTextarea",
  "editor.dialogCloseButton",
  "editor.hooks.chatEngine",
  "editor.hooks.useAiEnhancePrompt",
  "editor.mentionList",
  "editor.themeGallery",
  "nav.themeToggle",
] as const;

/** The AI art studio on /ai/art. */
export const AI_ART_STUDIO_NAMESPACES = [
  "aiArt.aiArtStudio",
  "aiArt.aiArtResult",
  "aiArt.aiArtPresetGallery",
] as const;

/**
 * The signed-in app (dashboard, settings): everything the root layout gives
 * client components, plus the editor, which the app embeds.
 */
export const APP_NAMESPACES = [
  ...CHROME_NAMESPACES,
  "barcodeTool",
  "templateDemo",
  ...EDITOR_NAMESPACES,
] as const;
