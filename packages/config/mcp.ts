// The hosted MCP server's listings: its name in the official MCP Registry
// and the pages that describe it.

/**
 * The server's name in the official MCP Registry, as `server.json` declares
 * it. The registry checks it against a DNS TXT record on qrdx.dev. It
 * replaces io.github.bucharitesh/qrdx, which is deprecated there.
 */
export const MCP_REGISTRY_NAME = "dev.qrdx/qrdx";

/**
 * The registry's record of the latest version. The API takes the name as one
 * path segment, so its slash is encoded: `dev.qrdx%2Fqrdx`.
 */
export const MCP_REGISTRY_URL = `https://registry.modelcontextprotocol.io/v0/servers/${encodeURIComponent(MCP_REGISTRY_NAME)}/versions/latest`;

/** Glama's page for the server, under its registry name. */
export const MCP_GLAMA_URL = `https://glama.ai/mcp/connectors/${MCP_REGISTRY_NAME}`;
