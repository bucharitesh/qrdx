// Breadcrumbs resolved against the app's own URL. The JSON-LD helpers live
// in @repo/design-system/components/seo/json-ld, so QRdx's other apps share
// them; everything else imports them from there.

import {
  breadcrumbSchema as breadcrumbSchemaFor,
  type Crumb,
} from "@repo/design-system/components/seo/json-ld";
import { baseUrl } from "@/lib/metadata";

export function breadcrumbSchema(crumbs: Crumb[]) {
  return breadcrumbSchemaFor(crumbs, baseUrl);
}
