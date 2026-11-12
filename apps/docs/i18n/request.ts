// next-intl's request configuration (wired in next.config.ts). The locale
// comes from the `[lang]` root param (next/root-params), so translated pages
// stay statically rendered: nothing here reads headers or cookies. Pages
// under app/(app) have no `[lang]` and render in English.
import { lang } from "next/root-params";
import { getRequestConfig } from "next-intl/server";
import {
  DEFAULT_LOCALE,
  isLocale,
  type Locale,
  localeFromSegment,
} from "@/lib/i18n/config";
import { loadMessages } from "@/lib/i18n/messages";
import { requestAppLocale } from "@/lib/i18n/request-locale";

async function segmentLocale(): Promise<Locale> {
  try {
    const segment = localeFromSegment(await lang());
    if (segment) return segment;
  } catch {
    // Route handlers and server actions have no root params.
  }
  // App pages (no [lang]): the person's language, once the app's layout or
  // template has read it (lib/i18n/request-locale.ts); else English.
  return requestAppLocale().current ?? DEFAULT_LOCALE;
}

export default getRequestConfig(async ({ locale: requested }) => {
  const locale = isLocale(requested) ? requested : await segmentLocale();
  return {
    locale,
    messages: await loadMessages(locale),
    // Static HTML must not depend on the server's clock zone.
    timeZone: "UTC",
    // Missing keys already fall back to English (loadMessages); anything
    // else (a bad ICU argument) is a bug the tests and i18n:check catch.
    onError(error) {
      if (process.env.NODE_ENV !== "production") console.error(error);
    },
  };
});
