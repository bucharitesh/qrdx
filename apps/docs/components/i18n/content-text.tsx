"use client";

import { createContext, type ReactNode, useCallback, useContext } from "react";

// Client side of the TypeScript-copy translations (lib/i18n/content.ts): a
// server component wraps client components in <ClientContent> with the data
// they display, and they translate those strings with useContentText().

const ContentText = createContext<Record<string, string>>({});

export function ContentTextProvider({
  translations,
  children,
}: {
  /** English → translation, from contentTranslations(). */
  translations: Record<string, string>;
  children: ReactNode;
}) {
  return (
    <ContentText.Provider value={translations}>{children}</ContentText.Provider>
  );
}

/**
 * `tc(english)`: the page language's version of a string from TypeScript
 * data (a format's summary, a field hint), or the English when there's none.
 */
export function useContentText(): (english: string) => string {
  const translations = useContext(ContentText);
  return useCallback(
    (english: string) => translations[english] ?? english,
    [translations],
  );
}
