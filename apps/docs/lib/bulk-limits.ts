// How many codes one batch can make, in one place for the code and the copy
// (docs, compare pages, llms.txt and the tools quote these through
// lib/product-facts.ts). Keep this module light: no React, no "server-only";
// product-facts.ts and client components import it.

/**
 * Dynamic codes in one POST /v1/codes request (an array). The dashboard's CSV
 * import sends its rows in requests of IMPORT_CHUNK_ROWS, below this.
 * Measured locally at about 1 s of database work for 1,000 rows; Web Risk
 * lookups add their own time, bounded by SCREEN_BUDGET_MS in the request.
 */
export const MAX_CODES_PER_REQUEST = 1000;

/** Rows in one CSV file imported in the dashboard (sent in chunks). */
export const MAX_IMPORT_ROWS = 10_000;

/** Rows the dashboard import sends per request. */
export const IMPORT_CHUNK_ROWS = 500;

/**
 * Rows in one file of the free bulk tool (/tools/bulk), which renders every
 * code in the browser and streams them into one ZIP. Bound by time and by the
 * ZIP format (no ZIP64: under 65,535 files and 4 GB), not by memory.
 */
export const MAX_BULK_TOOL_ROWS = 25_000;

/** "1,000": counts as copy writes them. */
export const formatCount = (count: number): string =>
  count.toLocaleString("en-US");
