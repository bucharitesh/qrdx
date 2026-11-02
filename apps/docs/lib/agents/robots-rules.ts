// robots.txt groups (app/robots.ts). Every crawler named here is welcome on
// public pages; the app, API and machine paths stay out.

/** Search engines, named so their group is explicit. */
export const SEARCH_CRAWLERS = [
  "Googlebot",
  "Bingbot",
  "Applebot",
  "DuckDuckBot",
] as const;

/**
 * AI crawlers, search indexes and assistants fetching a page for a user,
 * all welcome on public pages. Training opt-outs that are only robots tokens
 * (Google-Extended, Applebot-Extended) are listed as allowed too.
 */
export const AI_CRAWLERS = [
  // OpenAI
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  // Anthropic
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "anthropic-ai",
  // Perplexity
  "PerplexityBot",
  "Perplexity-User",
  // Google and Apple AI use
  "Google-Extended",
  "Applebot-Extended",
  // Others
  "CCBot",
  "meta-externalagent",
  "Amazonbot",
  "DuckAssistBot",
  "MistralAI-User",
  "cohere-ai",
] as const;

/**
 * Signed-in app, API and machine paths: nothing to index. Hosted pages (/p)
 * aren't listed: they carry their own noindex, which crawlers have to fetch
 * the page to see. Crawlers obey only their most specific group, so every
 * group repeats this list.
 */
export const DISALLOW = [
  "/api/",
  "/admin",
  "/settings",
  "/oauth",
  "/dashboard",
  "/invite",
  "/q/",
  "/m/",
];
