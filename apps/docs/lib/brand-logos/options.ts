// What the API and MCP tell callers about brand logos (list_options,
// list_qr_styles): how to ask for one, the colors and the popular slugs.

import { baseUrl } from "@/lib/metadata";
import { LOGO_ICON_HELP } from "@/lib/qr-design/logo-icon";
import { BRAND_LOGO_COUNT, SIMPLE_ICONS_VERSION } from "./catalog.generated";
import { POPULAR_BRAND_GROUPS } from "./popular";
import { BRAND_LOGO_COLORS } from "./svg";

export function brandLogoOptions() {
  return {
    count: BRAND_LOGO_COUNT,
    how: LOGO_ICON_HELP,
    colors: BRAND_LOGO_COLORS,
    popular: Object.fromEntries(
      POPULAR_BRAND_GROUPS.map((group) => [group.id, group.slugs]),
    ),
    allSlugs: `${baseUrl.origin}/api/brand-logos lists every brand as [slug, name, hex, aliases]`,
    source: `Simple Icons ${SIMPLE_ICONS_VERSION} (CC0-1.0). The marks are trademarks of their owners; use one to point people to that brand. Brands that asked Simple Icons to remove their marks (LinkedIn, Amazon, Slack, Microsoft and others) aren't available.`,
  };
}
