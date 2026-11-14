// Platform limits: plain numbers that more than one part of QRdx enforces or
// quotes (API routes, the dashboard, the editor, and copy through
// apps/app/lib/product-facts.ts). Plan limits and anything that needs a
// lookup stay in the app (apps/app/lib/plans.ts).

// ─── Editor uploads ──────────────────────────────────────────────────────────

export const MAX_IMAGE_FILES = 2;
export const MAX_IMAGE_FILE_SIZE = 4 * 1024 * 1024; // 4MB
export const MAX_SVG_FILE_SIZE = 1 * 1024 * 1024; // 1MB
export const MAX_LOGO_FILE_SIZE = 1 * 1024 * 1024; // 1MB

// ─── AI ──────────────────────────────────────────────────────────────────────

export const AI_PROMPT_CHARACTER_LIMIT = 1000;

export const AI_REQUEST_FREE_TIER_LIMIT = 5;

// Server-side caps for AI routes (base64 images inflate size by ~4/3)
export const AI_PROMPT_SERVER_CHARACTER_LIMIT = AI_PROMPT_CHARACTER_LIMIT * 4;
export const MAX_AI_CHAT_MESSAGES = 50;
export const MAX_AI_REQUEST_BODY_BYTES = 16 * 1024 * 1024; // 16MB

// ─── Themes ──────────────────────────────────────────────────────────────────

export const MAX_FREE_THEMES = 10;

/** Most stops a gradient takes: the editor's picker, style links and the API. */
export const MAX_GRADIENT_STOPS = 16;

export const MAX_TAGS_PER_THEME = 5;

// ─── Batches ─────────────────────────────────────────────────────────────────
// How many codes one batch can make, in one place for the code and the copy
// (docs, compare pages, llms.txt and the tools quote these).

/**
 * Dynamic codes in one POST /v1/codes request (an array). The dashboard's CSV
 * import sends its rows in requests of IMPORT_CHUNK_ROWS, below this.
 * Measured: about 0.2 s for 1,000 rows against a local Postgres. Web Risk
 * lookups add their own time, which the route caps at 20 s (route.ts).
 */
export const MAX_CODES_PER_REQUEST = 1000;

/** Rows in one CSV file imported in the dashboard (sent in chunks). */
export const MAX_IMPORT_ROWS = 10_000;

/** Rows the dashboard import sends per request. */
export const IMPORT_CHUNK_ROWS = 500;

/**
 * Rows in one file of the free bulk tool (/tools/bulk), which renders every
 * code in the browser and streams them into ZIP files (lib/zip-stream.ts),
 * so the page's own memory stays flat (25,000 PNGs at 512 px: about 8.5
 * minutes, JS heap under 160 MB). The browser still holds each ZIP part
 * until it's downloaded, so the cap stays where a normal laptop is
 * comfortable.
 */
export const MAX_BULK_TOOL_ROWS = 10_000;

/**
 * Dynamic codes a new account (its first days, lib/safety/velocity.ts) may
 * create an hour in a paid workspace; free workspaces stay at 30. A paid
 * checkout isn't a throwaway sign-up, but a new customer's volume is still
 * capped while the account is young.
 */
export const NEW_PAID_ACCOUNT_CODES_PER_HOUR = 2000;

// ─── Keyless public endpoints ────────────────────────────────────────────────
// Per-IP rate limits, as copy quotes them (/qr-code-api, /mcp, llms.txt,
// docs). The routes set their own limiters;
// apps/app/tests/lib/public-api-limits.test.ts fails when a route's limit and
// these numbers part ways.

/** GET /v1/qr, the keyless image API (app/api/v1/qr/route.ts). */
export const QR_IMAGE_REQUESTS_PER_MINUTE = 300;

/** Every request to the MCP server (app/api/mcp/route.ts). */
export const MCP_REQUESTS_PER_MINUTE = 120;

/** The MCP design_qr tool, on top of the server's limit (app/api/mcp/tools.ts). */
export const DESIGN_QR_REQUESTS_PER_MINUTE = 20;
