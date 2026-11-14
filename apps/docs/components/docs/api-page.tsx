import type { GeneratedPageProps } from "fumadocs-openapi";
import { apiReference } from "@/lib/api-reference";
import { APIPageClient } from "./api-page.client";

/**
 * `<OpenAPIPage />` of the generated API reference pages
 * (content/docs/developers/api): the operation, its samples and Try it.
 */
export async function APIPage(props: GeneratedPageProps) {
  const { bundled } = await apiReference.getSchema(props.document);
  return <APIPageClient {...props} payload={{ bundled }} />;
}
