// The language cookie, written in the browser. Client-safe: no server
// imports. The language menus write it when someone picks a language, and
// every translated (prefixed) page writes it when it's viewed, so a visitor
// who arrived on /hi from a search result signs up and opens the app in
// Hindi. Nothing redirects on it: the app reads it (lib/i18n/user-locale.ts)
// only when the person hasn't saved a language (user.locale), and shared
// theme links read it for the editor's language.
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  type Locale,
} from "@repo/i18n/config";

/** The `document` this module reads and writes (a fake one in tests). */
interface CookieJar {
  cookie: string;
}

const browserJar = (): CookieJar | undefined =>
  typeof document === "undefined" ? undefined : document;

/** `NEXT_LOCALE=hi; path=/; max-age=…; samesite=lax`, the one format everyone writes. */
export function localeCookieString(locale: Locale): string {
  return `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
}

/** The cookie's current value, or undefined when it isn't set. */
export function readLocaleCookie(
  jar: CookieJar | undefined = browserJar(),
): string | undefined {
  if (!jar) return undefined;
  for (const part of jar.cookie.split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === LOCALE_COOKIE) {
      return part.slice(index + 1).trim();
    }
  }
  return undefined;
}

/** Remembers `locale` for a year. Blocked cookies are ignored. */
export function rememberLocale(
  locale: Locale,
  jar: CookieJar | undefined = browserJar(),
): void {
  if (!jar) return;
  try {
    jar.cookie = localeCookieString(locale);
  } catch {
    // Cookies blocked: links still open the language.
  }
}

/**
 * On a page in `locale`: remembers it when it's a translated language and
 * isn't the cookie's value already. English pages are shared with visitors
 * who never chose a language, so they leave the cookie alone. Returns
 * whether it wrote.
 */
export function rememberPageLocale(
  locale: Locale,
  jar: CookieJar | undefined = browserJar(),
): boolean {
  if (!jar || locale === DEFAULT_LOCALE) return false;
  if (readLocaleCookie(jar) === locale) return false;
  rememberLocale(locale, jar);
  return true;
}
