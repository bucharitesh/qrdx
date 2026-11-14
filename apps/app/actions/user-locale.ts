"use server";

import { auth } from "@repo/auth/server";
import { database as db } from "@repo/database";
import { user } from "@repo/database/schema";
import {
  isLocale,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
} from "@repo/i18n/config";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";

/** Why a change didn't save: a message key in app.settings.general.language. */
export type UpdateUserLocaleError = "signIn" | "invalid" | "failed";

/**
 * Saves the app's and the emails' language for the signed-in person
 * (user.locale), and sets the language menu's cookie to match, so the public
 * pages' links follow it too.
 */
export async function updateUserLocale(
  locale: string,
): Promise<{ ok: true } | { ok: false; error: UpdateUserLocaleError }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, error: "signIn" };
  if (!isLocale(locale)) return { ok: false, error: "invalid" };
  try {
    await db
      .update(user)
      .set({ locale, updatedAt: new Date() })
      .where(eq(user.id, session.user.id));
  } catch (error) {
    console.error("Could not save the language", error);
    return { ok: false, error: "failed" };
  }
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
  });
  return { ok: true };
}
