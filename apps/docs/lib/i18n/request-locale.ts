// The signed-in app's language for this request, once something has read it
// (lib/i18n/app-locale.ts, getAppLocale). i18n/request.ts uses it for pages
// without a [lang] segment, so server components that call useTranslations
// or getTranslations speak the app's language too. Unset (static pages,
// route handlers): English. Per request, through React's cache.
import { cache } from "react";
import type { Locale } from "./config";

export const requestAppLocale = cache((): { current?: Locale } => ({}));
