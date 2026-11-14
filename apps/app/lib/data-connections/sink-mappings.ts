// Which field mappings the response-sync settings save. Client-safe.
import type { FormMapping } from "@repo/integrations/src/sinks/mapping";

/** formKey(pageId, formId) is "<pageId>:<formId>". */
const pageOf = (key: string) => key.slice(0, key.indexOf(":"));

/**
 * The mappings to save. The panel loads form pages a page at a time, so it
 * may not have loaded every page: a page it never loaded keeps the mappings
 * saved for it, and a loaded page gets exactly what the panel shows for it
 * (`shown`, empty when the page is left out). A form without a saved
 * mapping is sent with a suggested one when the sync runs.
 */
export function mappingsToSave(
  saved: Record<string, FormMapping>,
  loadedPageIds: ReadonlySet<string>,
  shown: Record<string, FormMapping>,
): Record<string, FormMapping> {
  const result: Record<string, FormMapping> = {};
  for (const [key, mapping] of Object.entries(saved)) {
    if (!loadedPageIds.has(pageOf(key))) result[key] = mapping;
  }
  return { ...result, ...shown };
}
