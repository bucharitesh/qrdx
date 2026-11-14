// Where the hosted service lives. The running app's own origin and its
// short-link origin depend on the environment: ./origins.ts.

/** The production domain. */
export const CANONICAL_HOST = "qrdx.dev";
/** The hosted service, for links and copy that must point at it whatever the environment. */
export const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}`;

/** The REST and image API (api.qrdx.dev/v1 → /api/v1, apps/app/next.config.ts). */
export const API_HOST = `api.${CANONICAL_HOST}`;
const API_ORIGIN = `https://${API_HOST}`;
/** The hosted REST API's base URL, without a trailing slash. */
export const API_BASE_URL = `${API_ORIGIN}/v1`;

/** The MCP server (mcp.qrdx.dev/mcp → /api/mcp, apps/app/next.config.ts). */
export const MCP_HOST = `mcp.${CANONICAL_HOST}`;
/** The hosted MCP server's public endpoint. */
export const MCP_ENDPOINT = `https://${MCP_HOST}/mcp`;

/** The shadcn registry: `npx shadcn@latest add <url>/qr-code.json`. */
export const SHADCN_REGISTRY_URL = `${CANONICAL_ORIGIN}/r`;

/** qrdx.dev or one of its subdomains (www, api, mcp). */
export function isQrdxHost(host: string): boolean {
  return host === CANONICAL_HOST || host.endsWith(`.${CANONICAL_HOST}`);
}
