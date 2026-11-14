import {
  API_CATALOG_PATH,
  API_CATALOG_TYPE,
  apiCatalog,
  discoveryPreflight,
  jsonDocument,
} from "@/lib/agents/well-known";
import { baseUrl } from "@/lib/metadata";

// RFC 9727 API catalog. HEAD (answered from GET) carries the Link header
// with rel="api-catalog" that section 2 asks for.
export function GET(request: Request) {
  return jsonDocument(request, apiCatalog(baseUrl), API_CATALOG_TYPE, {
    Link: `<${new URL(API_CATALOG_PATH, baseUrl)}>; rel="api-catalog"`,
  });
}

export const OPTIONS = discoveryPreflight;
