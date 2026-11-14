import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { getAppLocale } from "@/lib/i18n/app-locale";
import { LOCALE_INFO } from "@/lib/i18n/config";
import { APP_NAV_CONTENT, APP_NAV_RULES } from "@/lib/i18n/content-rules";
import { loadMessages, pickMessages } from "@/lib/i18n/messages";
import { ClientContent } from "./client-content";
import { DocumentLocale } from "./document-locale";

/**
 * The signed-in app's client components in the person's language
 * (lib/i18n/app-locale.ts): the catalog parts they read, in that language,
 * the app navigation's labels (useContentText) and <html lang> to match.
 * Server components use getAppTranslations().
 * A nested provider replaces the root one's messages, so list everything
 * the children read.
 */
export async function AppMessages({
  namespaces,
  children,
}: {
  namespaces: readonly string[];
  children: ReactNode;
}) {
  const locale = await getAppLocale();
  const messages = await loadMessages(locale);
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={pickMessages(messages, namespaces)}
    >
      <DocumentLocale dir={LOCALE_INFO[locale].dir} locale={locale} />
      <ClientContent
        data={APP_NAV_CONTENT()}
        locale={locale}
        rules={APP_NAV_RULES}
      >
        {children}
      </ClientContent>
    </NextIntlClientProvider>
  );
}
