// Catalog parts for the editor's client components (components/editor and
// the dialogs around it), wherever they render. A nested provider replaces
// the root one's messages (components/i18n/client-messages.tsx), so each
// list names everything its children read.
import { CHROME_NAMESPACES } from "./messages";

/**
 * The code builder (components/code-builder/code-builder-host.tsx): the New
 * code dialog, the code and barcode builders and the dashboard panels they
 * reuse. The editor mounts it on /playground, and the app's create menu
 * opens it on every signed-in page.
 */
export const CODE_BUILDER_NAMESPACES = [
  "codeBuilder",
  "app.dashboard.codes.newCodeDialog",
  "app.dashboard.codes.codeOptions",
  "app.dashboard.codes.codeQr",
  "app.dashboard.codes.domainPicker",
  "app.dashboard.codes.lifecyclePanelForm",
  "app.dashboard.codes.pixelsPanel",
  "app.dashboard.codes.routingPanel",
  "app.dashboard.codes.slugField",
  "app.dashboard.codes.utmPanel",
  "app.dashboard.codes.utmTemplates",
  "app.dashboard.barcodes.barcodeBuilder",
  "app.dashboard.barcodes.barcodeEditor",
  "barcodeTool",
  // The New code dialog previews hosted-page templates (lib/landing/demo.ts).
  "scanPages.hosted",
] as const;

/** The whole editor: /playground, shared theme links, the dashboard. */
export const EDITOR_NAMESPACES = [
  "editor",
  ...CODE_BUILDER_NAMESPACES,
  "app.shell.whatsNew",
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
  "editor.connections",
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
  "editor.qrPresetSelect",
  "editor.hooks.useImageUpload",
  "editor.connections",
  "nav.themeToggle",
] as const;

/** The AI art studio on /ai/art. */
export const AI_ART_STUDIO_NAMESPACES = [
  "editor.connections",
  "aiArt.aiArtStudio",
  "aiArt.aiArtResult",
  "aiArt.aiArtPresetGallery",
  "editor.art.artLooks",
] as const;

/**
 * The signed-in app (dashboard, settings): everything the root layout gives
 * client components, plus the editor, which the app embeds.
 */
export const APP_NAMESPACES = [
  ...CHROME_NAMESPACES,
  "templateDemo",
  // Includes the code builder, which the create menu opens on every page.
  ...EDITOR_NAMESPACES,
  // The app's frame: sidebar, workspace switcher, command menu.
  "app.shell",
  "app.workspaces",
] as const;

/** The dashboard: the app and its own pages. */
export const DASHBOARD_NAMESPACES = [
  ...APP_NAMESPACES,
  "app.dashboard",
  // Workspace settings (dashboard/<slug>/settings) use the account
  // settings' developer components.
  "app.settings.developers",
  // The page editor's footer (hosted blocks come with the code builder).
  "scanPages.reportAbuse",
] as const;

/** Settings: the app and the settings pages. */
export const SETTINGS_NAMESPACES = [
  ...APP_NAMESPACES,
  "app.settings",
  // Notifications reuse the webhook event picker.
  "app.dashboard.webhooks",
] as const;

/** Sign-in, two-step verification and the session check (signed out). */
export const SIGN_IN_NAMESPACES = [
  ...CHROME_NAMESPACES,
  "app.signIn",
  "app.sessionCheck",
] as const;

/** Team invitations, join links and OAuth consent: the app's frame too. */
export const ACCOUNT_FLOW_NAMESPACES = [
  ...APP_NAMESPACES,
  "app.invite",
  "app.join",
  "app.oauth",
] as const;
