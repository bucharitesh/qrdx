// The JSON-LD helpers live in @repo/design-system/components/seo/json-ld, so
// QRdx's other apps share them. This path stays for the app's imports and
// resolves breadcrumbs against the app's own URL.

import {
  breadcrumbSchema as breadcrumbSchemaFor,
  type Crumb,
} from "@repo/design-system/components/seo/json-ld";
import { baseUrl } from "@/lib/metadata";

export * from "@repo/design-system/components/seo/json-ld";

export function breadcrumbSchema(crumbs: Crumb[]) {
  return breadcrumbSchemaFor(crumbs, baseUrl);
}
