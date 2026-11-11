import "server-only";

// The signed-in app's language. App URLs carry no language (/dashboard is
// /dashboard in every language), so it comes from the person: their saved
// choice (user.locale, Settings > General), else the language menu's cookie,
// else English. Reading it makes a page dynamic; every page that calls it
// already is (it reads the session).
import { auth } from "@repo/auth/server";
import { headers } from "next/headers";
import type {
  createTranslator,
  Messages,
  NamespaceKeys,
  NestedKeyOf,
} from "next-intl";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { DEFAULT_LOCALE, type Locale } from "./config";
import { requestAppLocale } from "./request-locale";
import { cookieLocale, savedUserLocale } from "./user-locale";

export { cookieLocale, savedUserLocale } from "./user-locale";

/** This request's app language: saved, else the cookie, else English. */
export const getAppLocale = cache(async (): Promise<Locale> => {
  const session = await auth.api
    .getSession({ headers: await headers() })
    .catch(() => null);
  const saved = session ? await savedUserLocale(session.user.id) : null;
  const locale = saved ?? (await cookieLocale()) ?? DEFAULT_LOCALE;
  // Server components rendered after this (useTranslations) follow it.
  requestAppLocale().current = locale;
  return locale;
});

type Namespace = NamespaceKeys<Messages, NestedKeyOf<Messages>>;

/** getTranslations for app pages: in the person's language, not the URL's. */
export async function getAppTranslations<NS extends Namespace = never>(
  namespace?: NS,
): Promise<ReturnType<typeof createTranslator<Messages, NS>>> {
  return getTranslations({ locale: await getAppLocale(), namespace });
}
