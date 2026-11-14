// The channel an account came from (user_acquisition.channel), worked out on
// the server from what its sign-up carried (lib/analytics/landing.ts, already
// cleaned) and whether an affiliate was credited. A client never says its
// own channel. Pure: no database, no request.
//
// First match wins:
//   affiliate     an affiliate was credited with the account
//   plugin        ref is a plugin's tag (Chrome, Figma, Canva, Raycast)
//   mcp           ref=mcp (a link the MCP server returned)
//   bot           ref is a chat bot's tag (Slack, Telegram, Discord)
//   developer     ref=cli or ref=n8n, or the referrer is npm or GitHub
//   ai_assistant  utm_source or the referrer is an AI assistant
//   search        the referrer is a search engine
//   social        the referrer is a social network or community site
//   campaign      any other campaign tag (utm_source, utm_medium, utm_campaign)
//   referral      any other referring site
//   direct        nothing at all
import type { AcquisitionChannel } from "@repo/database";
import { BOT_REFS, DEVELOPER_REFS, MCP_REF, PLUGIN_REFS } from "./handoff-tags";
import type { SignUpLanding } from "./landing";

const DEVELOPER_SITES = ["npmjs.com", "github.com"];

const AI_ASSISTANT_SITES = [
  "chatgpt.com",
  "chat.openai.com",
  "perplexity.ai",
  "claude.ai",
  "gemini.google.com",
  "copilot.microsoft.com",
];
/** utm_source values the assistants (or people) use without a domain. */
const AI_ASSISTANT_SOURCES = new Set([
  "chatgpt",
  "openai",
  "perplexity",
  "claude",
  "gemini",
  "copilot",
]);

const SEARCH_SITES = [
  "bing.com",
  "duckduckgo.com",
  "ecosia.org",
  "search.brave.com",
  "baidu.com",
  // Android's Google app sends its package name as the referrer.
  "com.google.android.googlequicksearchbox",
];
/** google.com, www.google.co.uk, google.de; not mail.google.com or gemini. */
const GOOGLE = /^(?:www\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?$/;
/** yahoo.com, search.yahoo.com, uk.search.yahoo.com, yahoo.co.jp */
const YAHOO = /(?:^|\.)yahoo\.(?:com|co\.[a-z]{2}|[a-z]{2})$/;
/** yandex.ru, yandex.com, yandex.com.tr */
const YANDEX = /(?:^|\.)yandex\.[a-z]{2,3}(?:\.[a-z]{2})?$/;

const SOCIAL_SITES = [
  "x.com",
  "twitter.com",
  "t.co",
  "threads.net",
  "threads.com",
  "linkedin.com",
  "lnkd.in",
  "reddit.com",
  "news.ycombinator.com",
  "producthunt.com",
  "bsky.app",
  "facebook.com",
  "instagram.com",
  "youtube.com",
];

/** `host` is `site` or a subdomain of it. */
function onSite(host: string, site: string): boolean {
  return host === site || host.endsWith(`.${site}`);
}

const onAnySite = (host: string | undefined, sites: readonly string[]) =>
  host !== undefined && sites.some((site) => onSite(host, site));

function isSearchEngine(host: string | undefined): boolean {
  if (host === undefined) return false;
  return (
    GOOGLE.test(host) ||
    YAHOO.test(host) ||
    YANDEX.test(host) ||
    onAnySite(host, SEARCH_SITES)
  );
}

function isAiAssistant(source: string | undefined, host: string | undefined) {
  if (onAnySite(host, AI_ASSISTANT_SITES)) return true;
  if (source === undefined) return false;
  const bare = source.toLowerCase().replace(/^www\./, "");
  return AI_ASSISTANT_SOURCES.has(bare) || onAnySite(bare, AI_ASSISTANT_SITES);
}

const includes = (list: readonly string[], value: string | undefined) =>
  value !== undefined && list.includes(value);

/** The channel for a sign-up, by the rules above. */
export function acquisitionChannel(
  landing: SignUpLanding | null,
  { affiliate }: { affiliate: boolean },
): AcquisitionChannel {
  if (affiliate) return "affiliate";
  const { ref, referrer_host: host, utm_source: source } = landing ?? {};
  if (includes(PLUGIN_REFS, ref)) return "plugin";
  if (ref === MCP_REF) return "mcp";
  if (includes(BOT_REFS, ref)) return "bot";
  if (includes(DEVELOPER_REFS, ref) || onAnySite(host, DEVELOPER_SITES)) {
    return "developer";
  }
  if (isAiAssistant(source, host)) return "ai_assistant";
  if (isSearchEngine(host)) return "search";
  if (onAnySite(host, SOCIAL_SITES)) return "social";
  if (source || landing?.utm_medium || landing?.utm_campaign) {
    return "campaign";
  }
  if (host) return "referral";
  return "direct";
}
