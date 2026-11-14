import "server-only";

// A person's language without the session: their saved choice (user.locale)
// and the language menu's cookie. lib/i18n/app-locale.ts adds the session;
// emails (lib/i18n/email-locale.ts) use these directly.
import { database as db, user } from "@repo/database";
import { isLocale, LOCALE_COOKIE, type Locale } from "@repo/i18n/config";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

/**
 * A person's saved language, or null when they haven't chosen one. Also null
 * when the column can't be read (before its SQL is applied), so the app falls
 * back to the cookie instead of failing.
 */
export async function savedUserLocale(userId: string): Promise<Locale | null> {
  try {
    const [row] = await db
      .select({ locale: user.locale })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    return isLocale(row?.locale) ? row.locale : null;
  } catch {
    return null;
  }
}

/** The language menu's cookie, when it names a language. */
export async function cookieLocale(): Promise<Locale | null> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : null;
}
