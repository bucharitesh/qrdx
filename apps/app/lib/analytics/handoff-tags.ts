// The `ref` tags QRdx's own links carry: where a visit came from, for
// analytics (lib/playground-links.ts handoffSource, lib/analytics/channel.ts).
// Client-safe, no imports.
//
// Affiliate links use the same `ref` parameter (lib/affiliates/terms.ts), so
// every tag here is also reserved as an affiliate code
// (lib/affiliates/rules.ts) and never read as a referral: an affiliate can't
// be credited for the people a plugin or bot sends.

/** The browser and design-tool plugins (plugins/*). */
export const PLUGIN_REFS = [
  "chrome-extension",
  "figma-plugin",
  "canva-app",
  "raycast-extension",
] as const;

/** Links the MCP server returns (app/api/mcp). */
export const MCP_REF = "mcp";

/** Links in the chat bots' replies (lib/slack-bot, lib/chat-bots). */
export const BOT_REFS = ["slack-bot", "telegram-bot", "discord-bot"] as const;

/** Links printed by the CLI and the n8n node's docs link. */
export const DEVELOPER_REFS = ["cli", "n8n"] as const;

/**
 * The site's own: the 404 page's playground link, the "Made with QRdx"
 * badge on hosted pages and the template demo's badge.
 */
export const SITE_REFS = [
  "not-found",
  "made-with-qrdx",
  "template-demo",
] as const;

export type ChatBotRef = (typeof BOT_REFS)[number];

const HANDOFF_TAGS: ReadonlySet<string> = new Set([
  ...PLUGIN_REFS,
  MCP_REF,
  ...BOT_REFS,
  ...DEVELOPER_REFS,
  ...SITE_REFS,
]);

/** Every tag above, for the affiliate program's reserved words. */
export const QRDX_HANDOFF_TAGS: readonly string[] = [...HANDOFF_TAGS];

/** True for one of QRdx's own `ref` tags (lower-case, as links carry them). */
export function isHandoffTag(value: string): boolean {
  return HANDOFF_TAGS.has(value);
}
