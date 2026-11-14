import "server-only";

// Which language an email goes out in: the recipient's saved language
// (user.locale), else, for codes asked for before there's an account, the
// language the site was in (the language menu's cookie on that request),
// else English.
import { database as db, user } from "@repo/database";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@repo/i18n/config";
import { eq } from "drizzle-orm";
import { type EmailIntl, emailIntl } from "./email";
import { cookieLocale, savedUserLocale } from "./user-locale";

/** The saved language of the account with this address, if any. */
async function localeForAddress(email: string): Promise<Locale | null> {
  try {
    const [row] = await db
      .select({ locale: user.locale })
      .from(user)
      .where(eq(user.email, email.trim().toLowerCase()))
      .limit(1);
    return isLocale(row?.locale) ? row.locale : null;
  } catch {
    return null;
  }
}

/** The language menu's cookie, when this runs inside a request. */
async function requestCookieLocale(): Promise<Locale | null> {
  try {
    return await cookieLocale();
  } catch {
    return null;
  }
}

/** For a code sent to an address (sign-in, a new address): account, else cookie. */
export async function emailIntlForAddress(email: string): Promise<EmailIntl> {
  const locale =
    (await localeForAddress(email)) ??
    (await requestCookieLocale()) ??
    DEFAULT_LOCALE;
  return emailIntl(locale);
}

/** For an email to a known account (notifications): its saved language. */
export async function emailIntlForUser(userId: string): Promise<EmailIntl> {
  return emailIntl((await savedUserLocale(userId)) ?? DEFAULT_LOCALE);
}
