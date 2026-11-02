import {
  AI_CATALOG_TYPE,
  aiCatalog,
  discoveryPreflight,
  jsonDocument,
} from "@/lib/agents/well-known";
import { baseUrl } from "@/lib/metadata";

// Domain-level discovery of the MCP server (AI Catalog, as the MCP Server
// Card extension describes): an index that points at the server card.
export function GET(request: Request) {
  return jsonDocument(request, aiCatalog(baseUrl), AI_CATALOG_TYPE);
}

export const OPTIONS = discoveryPreflight;
