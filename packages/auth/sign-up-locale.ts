import "server-only";
import * as schema from "@repo/database";
import { database as db, eq } from "@repo/database";

// A new account starts in the language the site was in when it signed up:
// the language menu's cookie (apps/docs/lib/i18n/config.ts, LOCALE_COOKIE),
// sent with the email-code request and with the Google or GitHub callback.
// The app validates the code against its languages when it reads it
// (apps/docs/lib/i18n/app-locale.ts), so this only keeps well-formed codes.

const LOCALE_COOKIE = "NEXT_LOCALE";
/** "es", "pt-BR", "zh-Hans": a language and an optional region or script. */
const LOCALE_CODE = /^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/;

interface SignUpContext {
  headers?: Pick<Headers, "get"> | null;
  request?: { headers?: Pick<Headers, "get"> } | null;
}

/** The language cookie of the sign-up request, when it holds a code. */
export function signUpLocale(
  context: SignUpContext | null | undefined
): string | null {
  const cookie =
    (context?.headers ?? context?.request?.headers)?.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name !== LOCALE_COOKIE) continue;
    const code = decodeURIComponent(value.join("="));
    return LOCALE_CODE.test(code) ? code : null;
  }
  return null;
}

/**
 * Saves the sign-up's language on the new account (user.locale). Never
 * throws: before packages/database/manual-sql/2026-11-11-user-locale.sql is
 * applied the column doesn't exist, and the account just has no language.
 */
export async function saveSignUpLocale(
  userId: string,
  context: SignUpContext | null | undefined
): Promise<void> {
  const locale = signUpLocale(context);
  if (!locale) return;
  try {
    await db
      .update(schema.user)
      .set({ locale })
      .where(eq(schema.user.id, userId));
  } catch (error) {
    console.error("Could not save the new account's language", error);
  }
}
