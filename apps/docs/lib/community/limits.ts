// Page sizes and cache times of the read-only community API
// (/v1/community/items and the MCP community tools). Safe to import anywhere.

/** How long a community read is cached, in seconds. */
export const COMMUNITY_API_TTL = 300;

/** Items of each type a search looks through (most popular first). */
export const COMMUNITY_SEARCH_POOL = 500;

export const COMMUNITY_PAGE_MAX = 50;
export const COMMUNITY_PAGE_DEFAULT = 20;
