import "@/styles/styles.css";
import { cn } from "@repo/design-system/lib/utils";
import { getLocale, getMessages } from "next-intl/server";
import type { ReactNode } from "react";
import { Provider } from "@/app/providers";
import { ConsentEarlyScript } from "@/components/consent/consent-early-script";
import { RootIntlProvider } from "@/components/i18n/root-intl-provider";
import { SearchHighlightStyle } from "@/components/search-highlight-style";
import { fonts } from "@/lib/fonts";
import { LOCALE_INFO, type Locale } from "@/lib/i18n/config";
import { CHROME_NAMESPACES, pickMessages } from "@/lib/i18n/messages";

/**
 * The <html> document of the docs site: the main app's
 * (apps/app/components/root-document.tsx) without what only the main app
 * has, such as the sign-in dialog, the editor's saved state and the
 * availability context (the docs decide availability on the server).
 */
export async function RootDocument({
  children,
  messages: extra = [],
  locale: given,
}: {
  children: ReactNode;
  /** More catalog paths for client components on every page under this root. */
  messages?: readonly string[];
  /** The document's language, when the page has no [lang] segment. */
  locale?: Locale;
}) {
  const locale = given ?? (await getLocale());
  const messages = await getMessages({ locale });
  return (
    <html
      className={cn(fonts)}
      dir={LOCALE_INFO[locale].dir}
      lang={locale}
      suppressHydrationWarning
    >
      <head>
        <ConsentEarlyScript />
        <SearchHighlightStyle />
        <meta name="darkreader-lock" />
      </head>
      <body className="antialiased font-sans bg-background relative flex min-h-screen flex-col">
        <RootIntlProvider
          locale={locale}
          messages={pickMessages(messages, [...CHROME_NAMESPACES, ...extra])}
          timeZone="UTC"
        >
          {/* PostHog and Featurebase load from the consent manager in Provider, after consent. */}
          <Provider>{children}</Provider>
        </RootIntlProvider>
      </body>
    </html>
  );
}
