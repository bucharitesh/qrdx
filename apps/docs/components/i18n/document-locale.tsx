"use client";

import { useEffect } from "react";

/**
 * Sets <html lang> and <html dir> to the signed-in app's language. App pages
 * share the English root layout (their URLs carry no language), so the
 * document is marked up after it loads; leaving the app restores it.
 */
export function DocumentLocale({
  locale,
  dir,
}: {
  locale: string;
  dir: "ltr" | "rtl";
}) {
  useEffect(() => {
    const root = document.documentElement;
    const before = { lang: root.lang, dir: root.dir };
    root.lang = locale;
    root.dir = dir;
    return () => {
      root.lang = before.lang;
      root.dir = before.dir;
    };
  }, [locale, dir]);
  return null;
}
