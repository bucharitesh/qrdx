// How many codes one batch can make, in one place for the code and the copy
// (docs, compare pages, llms.txt and the tools quote these through
// lib/product-facts.ts). Keep this module light: no React, no "server-only";
// product-facts.ts and client components import it.

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
 * so the page's memory stays flat: measured in headless Chrome, 25,000 PNGs
 * at 512 px took about 8.5 minutes with the JS heap under 160 MB. Bound by
 * that time, not by memory.
 */
export const MAX_BULK_TOOL_ROWS = 25_000;

/**
 * Dynamic codes a new account (its first days, lib/safety/velocity.ts) may
 * create an hour in a paid workspace; free workspaces stay at 30. A paid
 * checkout isn't a throwaway sign-up, but a new customer's volume is still
 * capped while the account is young.
 */
export const NEW_PAID_ACCOUNT_CODES_PER_HOUR = 2000;

/** "1,000": counts as copy writes them. */
export const formatCount = (count: number): string =>
  count.toLocaleString("en-US");
