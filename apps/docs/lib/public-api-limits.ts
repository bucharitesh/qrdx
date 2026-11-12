// Per-IP rate limits of the keyless public endpoints, as copy quotes them
// (/qr-code-api, /mcp, llms.txt, docs through lib/product-facts.ts). The
// routes set their own limiters; tests/lib/public-api-limits.test.ts fails
// when a route's limit and these numbers part ways.
//
// Keep this module light (no React, no "server-only"): product-facts.ts
// imports it.

/** GET /v1/qr, the keyless image API (app/api/v1/qr/route.ts). */
export const QR_IMAGE_REQUESTS_PER_MINUTE = 300;

/** Every request to the MCP server (app/api/mcp/route.ts). */
export const MCP_REQUESTS_PER_MINUTE = 120;

/** The MCP design_qr tool, on top of the server's limit (app/api/mcp/tools.ts). */
export const DESIGN_QR_REQUESTS_PER_MINUTE = 20;
