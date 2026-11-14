import "@/styles/styles.css";
import { cn } from "@repo/design-system/lib/utils";
import { LOCALE_INFO, type Locale } from "@repo/i18n/config";
import { CHROME_NAMESPACES, pickMessages } from "@repo/i18n/messages";
import { getLocale, getMessages } from "next-intl/server";
import type { ReactNode } from "react";
import { Provider } from "@/app/providers";
import { ConsentEarlyScript } from "@/components/consent/consent-early-script";
import { RootIntlProvider } from "@/components/i18n/root-intl-provider";
import { ThemeScript } from "@/components/theme-script";
import { fonts } from "@/lib/fonts";
import { getPublicAvailability } from "@/lib/integration-availability";

/**
 * The <html> document both root layouts render: app/[lang] (translated
 * pages, <html lang> and <html dir> per locale) and app/(app) (everything
 * else, English).
 * Client components get the shared chrome's messages only (navbar, footer,
 * cookie banner); a page adds its own with a nested NextIntlClientProvider.
 */
export async function RootDocument({
  children,
  messages: extra = [],
  locale: given,
}: {
  children: ReactNode;
  /** More catalog paths for client components on every page under this root. */
  messages?: readonly string[];
  /**
   * The document's language when the root has no [lang] segment. Passed
   * explicitly, so the request's own language (the app's, for signed-in
   * pages: lib/i18n/request-locale.ts) is resolved later, by the pages.
   */
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
        <ThemeScript />
        <ConsentEarlyScript />
        <meta name="darkreader-lock" />
      </head>
      <body className="antialiased font-sans bg-background relative flex min-h-screen flex-col">
        <RootIntlProvider
          locale={locale}
          messages={pickMessages(messages, [...CHROME_NAMESPACES, ...extra])}
          timeZone="UTC"
        >
          {/* PostHog and Featurebase load from the consent manager in Provider, after consent. */}
          {/* Features, pages and integrations this deployment can't offer (ids only). */}
          <Provider availability={getPublicAvailability()}>{children}</Provider>
        </RootIntlProvider>
      </body>
    </html>
  );
}
