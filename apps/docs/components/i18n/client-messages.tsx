import { NextIntlClientProvider, useLocale, useMessages } from "next-intl";
import type { ReactNode } from "react";
import { pickMessages } from "@/lib/i18n/messages";

/**
 * Gives the client components inside it the catalog parts they translate
 * ("typeGenerator", "tools.bulk"), in the page's language. The browser gets
 * only those, not the page's whole catalog. A nested provider replaces the
 * root one's messages, so list everything the children read.
 */
export function ClientMessages({
  namespaces,
  children,
}: {
  namespaces: readonly string[];
  children: ReactNode;
}) {
  const messages = useMessages();
  return (
    <NextIntlClientProvider
      locale={useLocale()}
      messages={pickMessages(messages, namespaces)}
    >
      {children}
    </NextIntlClientProvider>
  );
}
