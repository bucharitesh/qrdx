// Discovery documents for agents and API clients:
//
// - MCP Server Card (SEP-2127, final; schema v1): who the MCP server is and
//   how to connect, served at <streamable-http-url>/server-card.
// - AI Catalog (/.well-known/ai-catalog.json): the domain-level index MCP
//   discovery tells clients to fetch; it points at the server card.
// - API catalog (RFC 9727, /.well-known/api-catalog): the REST API with its
//   OpenAPI document and docs, plus the MCP endpoint.
//
// Pure functions of the origin, so they're testable; the route handlers wrap
// them with jsonDocument() for headers, ETags and CORS.
import { createHash } from "node:crypto";
import { SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/server";
import { MCP_SERVER_INFO } from "@/app/api/mcp/tools";
import { owner, repo } from "@/lib/github";
import { type McpDeployment, mcpServerUrl } from "@/lib/mcp-clients";
import { apiBaseUrl, isOfficialOrigin, mcpServerCardUrl } from "./hosts";

export const SERVER_CARD_SCHEMA =
  "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json";
export const SERVER_CARD_TYPE = "application/mcp-server-card+json";
export const AI_CATALOG_TYPE = "application/ai-catalog+json";
export const API_CATALOG_PATH = "/.well-known/api-catalog";
export const API_CATALOG_TYPE =
  'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"';
export const OPENAPI_PATH = "/openapi.json";
export const OPENAPI_TYPE = "application/vnd.oai.openapi+json;version=3.1";

/** The domain that publishes these documents: qrdx.dev for the hosted service. */
export function publisherHost(
  origin: string | URL,
  deployment?: McpDeployment,
): string {
  return isOfficialOrigin(origin, deployment)
    ? "qrdx.dev"
    : new URL(origin).hostname;
}

/** Page URLs: qrdx.dev for the hosted service (also from local dev). */
function siteUrl(
  origin: string | URL,
  path: string,
  deployment?: McpDeployment,
): string {
  const base = isOfficialOrigin(origin, deployment)
    ? "https://qrdx.dev"
    : origin;
  return new URL(path, base).toString();
}

const reverseDns = (host: string) => host.split(".").reverse().join(".");

export interface ServerCard {
  $schema: string;
  name: string;
  version: string;
  description: string;
  title?: string;
  websiteUrl?: string;
  repository?: { url: string; source: string; subfolder?: string };
  icons?: { src: string; mimeType?: string; sizes?: string[] }[];
  remotes?: {
    type: "streamable-http" | "sse";
    url: string;
    supportedProtocolVersions?: string[];
  }[];
}

/** The MCP Server Card. It matches what `initialize` reports at runtime. */
export function serverCard(
  origin: string | URL,
  deployment?: McpDeployment,
): ServerCard {
  return {
    $schema: SERVER_CARD_SCHEMA,
    name: `${reverseDns(publisherHost(origin, deployment))}/${MCP_SERVER_INFO.name}`,
    version: MCP_SERVER_INFO.version,
    title: "QRdx",
    description:
      "Design scan-checked QR codes for any content, plus payloads and community frames. Key optional.",
    websiteUrl: siteUrl(origin, "/mcp", deployment),
    repository: {
      url: `https://github.com/${owner}/${repo}`,
      source: "github",
      subfolder: "apps/docs/app/api/mcp",
    },
    icons: [
      {
        src: siteUrl(origin, "/web-app-manifest-512x512.png", deployment),
        mimeType: "image/png",
        sizes: ["512x512"],
      },
      {
        src: siteUrl(origin, "/favicon.svg", deployment),
        mimeType: "image/svg+xml",
        sizes: ["any"],
      },
    ],
    remotes: [
      {
        type: "streamable-http",
        url: mcpServerUrl(origin, deployment),
        supportedProtocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
      },
    ],
  };
}

/** The AI Catalog: one entry, the MCP server, by reference to its card. */
export function aiCatalog(origin: string | URL, deployment?: McpDeployment) {
  const host = publisherHost(origin, deployment);
  return {
    specVersion: "1.0",
    host: {
      displayName: "QRdx",
      identifier: host,
      documentationUrl: siteUrl(
        origin,
        "/docs/developers/ai-agents",
        deployment,
      ),
    },
    entries: [
      {
        identifier: `urn:air:${host}:mcp:${MCP_SERVER_INFO.name}`,
        type: SERVER_CARD_TYPE,
        url: mcpServerCardUrl(origin, deployment),
        tags: ["qr-code", "image", "no-auth"],
      },
    ],
  };
}

/** The RFC 9727 API catalog (Linkset). */
export function apiCatalog(origin: string | URL, deployment?: McpDeployment) {
  const doc = (path: string) => [
    { href: siteUrl(origin, path, deployment), type: "text/html" },
  ];
  return {
    linkset: [
      {
        anchor: apiBaseUrl(origin, deployment),
        "service-desc": [
          {
            href: siteUrl(origin, OPENAPI_PATH, deployment),
            type: OPENAPI_TYPE,
          },
        ],
        "service-doc": doc("/docs/developers/rest-api"),
      },
      {
        anchor: mcpServerUrl(origin, deployment),
        "service-desc": [
          {
            href: mcpServerCardUrl(origin, deployment),
            type: SERVER_CARD_TYPE,
          },
        ],
        "service-doc": doc("/docs/developers/mcp"),
      },
    ],
  };
}

/** Public, read-only metadata: any site may fetch it (SEP-2127 discovery). */
export const DISCOVERY_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, If-None-Match",
  "Access-Control-Expose-Headers": "ETag, Link",
  "Access-Control-Max-Age": "86400",
};

/**
 * A discovery document: pretty JSON with its media type, an hour of caching,
 * a strong ETag (304 when `If-None-Match` matches) and open CORS.
 */
export function jsonDocument(
  request: Request,
  body: unknown,
  contentType: string,
  extraHeaders: Record<string, string> = {},
): Response {
  const text = `${JSON.stringify(body, null, 2)}\n`;
  const etag = `"${createHash("sha256").update(text).digest("base64url").slice(0, 27)}"`;
  const headers = {
    ...DISCOVERY_CORS_HEADERS,
    "Cache-Control": "public, max-age=3600",
    ETag: etag,
    ...extraHeaders,
  };
  const match = request.headers
    .get("if-none-match")
    ?.split(",")
    .map((tag) => tag.trim().replace(/^W\//, ""));
  if (match?.includes(etag) || match?.includes("*")) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(text, {
    headers: { ...headers, "Content-Type": contentType },
  });
}

/** CORS preflight for the discovery documents. */
export function discoveryPreflight(): Response {
  return new Response(null, { status: 204, headers: DISCOVERY_CORS_HEADERS });
}
