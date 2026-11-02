// Public URLs of QRdx's machine endpoints (REST API, image API, MCP server),
// for llms.txt, the markdown pages and the .well-known documents. Wherever
// QRdx itself runs (qrdx.dev, its previews, local dev) they are the
// production hosts, so nothing published carries a localhost or preview
// address; a self-hosted copy on its own domain gets its own paths. The rule
// is the one lib/mcp-clients.ts applies to the MCP server URL.
import {
  MCP_PUBLIC_URL,
  type McpDeployment,
  mcpServerUrl,
} from "@/lib/mcp-clients";

/** The hosted REST API (api.qrdx.dev/v1 → /api/v1, see next.config.ts). */
export const API_PUBLIC_URL = "https://api.qrdx.dev/v1";

/** True when `origin` is (or stands in for) the hosted service. */
export function isOfficialOrigin(
  origin: string | URL,
  deployment?: McpDeployment,
): boolean {
  return mcpServerUrl(origin, deployment) === MCP_PUBLIC_URL;
}

/** The REST API base URL, without a trailing slash. */
export function apiBaseUrl(
  origin: string | URL,
  deployment?: McpDeployment,
): string {
  return isOfficialOrigin(origin, deployment)
    ? API_PUBLIC_URL
    : new URL("/api/v1", origin).toString();
}

/** A keyless image API URL: `<api>/qr?data=…&…` (values are encoded). */
export function imageApiUrl(
  origin: string | URL,
  params: Record<string, string>,
  deployment?: McpDeployment,
): string {
  const query = new URLSearchParams(params).toString();
  return `${apiBaseUrl(origin, deployment)}/qr${query ? `?${query}` : ""}`;
}

/**
 * Where the MCP Server Card lives: `<streamable-http-url>/server-card`, the
 * location the Server Card extension (SEP-2127) reserves.
 */
export function mcpServerCardUrl(
  origin: string | URL,
  deployment?: McpDeployment,
): string {
  return `${mcpServerUrl(origin, deployment)}/server-card`;
}
