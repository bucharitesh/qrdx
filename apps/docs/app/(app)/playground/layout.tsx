import { cookies } from "next/headers";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { ClientContent } from "@/components/i18n/client-content";
import { PlaygroundShell } from "@/components/playground/playground-shell";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from "@/lib/i18n/config";
import { EDITOR_CONTENT, EDITOR_CONTENT_RULES } from "@/lib/i18n/content-rules";
import { loadMessages, pickMessages } from "@/lib/i18n/messages";
import { PLAYGROUND_NAMESPACES } from "@/lib/i18n/playground";

// Shared theme links, /playground/<themeId>: one URL for every language, so
// the editor speaks the language the visitor last picked (the language
// menu's cookie). These pages render per request anyway (the theme comes
// from the database); /playground itself is prerendered per language in
// app/[lang]/playground.
export default async function SharedThemeLayout({
  children,
}: LayoutProps<"/playground">) {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(saved) ? saved : DEFAULT_LOCALE;
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: "playground" });
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={pickMessages(messages, PLAYGROUND_NAMESPACES)}
    >
      <ClientContent
        data={EDITOR_CONTENT}
        locale={locale}
        rules={EDITOR_CONTENT_RULES}
      >
        <PlaygroundShell heading={t("heading")}>{children}</PlaygroundShell>
      </ClientContent>
    </NextIntlClientProvider>
  );
}
