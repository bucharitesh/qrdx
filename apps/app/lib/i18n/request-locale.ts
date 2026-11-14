// The language of a page without a [lang] segment, for this request: the
// signed-in app's (lib/i18n/app-locale.ts, getAppLocale), or on hosted
// pages (/p) the scanner's Accept-Language (lib/i18n/scan-pages.ts).
// i18n/request.ts uses it, so server components that call useTranslations
// or getTranslations speak it too. Unset (static pages, route handlers):
// English. Per request, through React's cache.

import type { Locale } from "@repo/i18n/config";
import { cache } from "react";

export const requestAppLocale = cache((): { current?: Locale } => ({}));
