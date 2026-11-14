// Emails in the recipient's language. Email templates render outside any
// request's React tree (react-email), so they take a translator rather than
// reading one from context: `intl` holds the locale (for <html lang>) and a
// translator for the `emails` namespace of messages/<locale>.json. Templates
// default to English, so previews and tests render as before.
// use-intl/core (next-intl's own core) has no React: emails also render in
// node:test suites run with the react-server condition.
import { createTranslator } from "use-intl/core";
import en from "@/messages/en.json";
import { DEFAULT_LOCALE, type Locale } from "./config";
import { loadMessages, type Messages } from "./messages";

export type EmailTranslator = ReturnType<
  typeof createTranslator<Messages, "emails">
>;

export interface EmailIntl {
  locale: Locale;
  t: EmailTranslator;
}

export const ENGLISH_EMAIL: EmailIntl = {
  locale: DEFAULT_LOCALE,
  t: createTranslator({
    locale: DEFAULT_LOCALE,
    messages: en,
    namespace: "emails",
  }),
};

/** A translator for emails in `locale` (English for "en" or a missing catalog). */
export async function emailIntl(locale: Locale): Promise<EmailIntl> {
  if (locale === DEFAULT_LOCALE) return ENGLISH_EMAIL;
  const messages = await loadMessages(locale);
  return {
    locale,
    t: createTranslator({ locale, messages, namespace: "emails" }),
  };
}
