import "server-only";

import type { Locale } from "@/lib/i18n/config";
import { TEMPLATE_RULES } from "@/lib/i18n/content-rules";
import { localizeContent } from "@/lib/i18n/content-server";
import { listTemplateDemos } from "@/lib/landing/demo";
import { listTemplates } from "@/lib/landing/templates";

const demos = listTemplateDemos();

/** How many templates the gallery has. */
export const TEMPLATE_COUNT = demos.length;

/**
 * Every page type and every template in `locale`: names and descriptions
 * are translated content, the demo pages themselves stay as written.
 */
export function localizedGallery(locale: Locale) {
  return localizeContent(
    { types: listTemplates(), localDemos: demos },
    locale,
    TEMPLATE_RULES,
  );
}
