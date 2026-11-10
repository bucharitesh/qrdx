import "@/styles/styles.css";
import { cn } from "@repo/design-system/lib/utils";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import type { ReactNode } from "react";
import { Provider } from "@/app/providers";
import { ConsentEarlyScript } from "@/components/consent/consent-early-script";
import { SearchHighlightStyle } from "@/components/search-highlight-style";
import { ThemeScript } from "@/components/theme-script";
import { fonts } from "@/lib/fonts";
import { CHROME_NAMESPACES, pickMessages } from "@/lib/i18n/messages";
import { getPublicAvailability } from "@/lib/integration-availability";

/**
 * The <html> document both root layouts render: app/[lang] (translated
 * pages, <html lang> per locale) and app/(app) (everything else, English).
 * Client components get the shared chrome's messages only (navbar, footer,
 * cookie banner); a page adds its own with a nested NextIntlClientProvider.
 */
export async function RootDocument({
  children,
  messages: extra = [],
}: {
  children: ReactNode;
  /** More catalog paths for client components on every page under this root. */
  messages?: readonly string[];
}) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return (
    <html className={cn(fonts)} lang={locale} suppressHydrationWarning>
      <head>
        <ThemeScript />
        <ConsentEarlyScript />
        <SearchHighlightStyle />
        <meta name="darkreader-lock" />
      </head>
      <body className="antialiased font-sans bg-background relative flex min-h-screen flex-col">
        <NextIntlClientProvider
          messages={pickMessages(messages, [...CHROME_NAMESPACES, ...extra])}
        >
          {/* PostHog and Featurebase load from the consent manager in Provider, after consent. */}
          {/* Features, pages and integrations this deployment can't offer (ids only). */}
          <Provider availability={getPublicAvailability()}>{children}</Provider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
