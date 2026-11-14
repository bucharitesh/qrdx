// next-intl's request configuration (wired in next.config.ts). The locale
// comes from the `[lang]` root param (next/root-params), so the docs stay
// statically rendered: nothing here reads headers or cookies.
import { lang } from "next/root-params";
import { getRequestConfig } from "next-intl/server";
import {
  DEFAULT_LOCALE,
  isLocale,
  type Locale,
  localeFromSegment,
} from "@/lib/i18n/config";
import { loadMessages } from "@/lib/i18n/messages";

async function segmentLocale(): Promise<Locale> {
  try {
    const segment = localeFromSegment(await lang());
    if (segment) return segment;
  } catch {
    // Route handlers have no root params.
  }
  return DEFAULT_LOCALE;
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
