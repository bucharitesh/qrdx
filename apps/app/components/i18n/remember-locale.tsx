"use client";

import { isLocale } from "@repo/i18n/config";
import { useLocale } from "next-intl";
import { useEffect } from "react";
import { rememberPageLocale } from "@/lib/i18n/locale-cookie";

/**
 * Remembers the language of the translated page being read (app/[lang]),
 * so signing up or opening the app from /hi continues in Hindi. Runs after
 * hydration, so the prerendered page stays static. English pages leave the
 * cookie alone; nothing redirects and nothing is shown.
 */
export function RememberLocale() {
  const locale = useLocale();
  useEffect(() => {
    if (isLocale(locale)) rememberPageLocale(locale);
  }, [locale]);
  return null;
}
