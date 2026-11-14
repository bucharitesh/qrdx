// Translated pages in tests: next-intl's server API and the page locale,
// in English from the real catalog. Use from a test file with
//   vi.mock("next-intl/server", async () => (await import("../support/intl")).intlServer);
//   vi.mock("@/lib/i18n/server", async () => (await import("../support/intl")).i18nServer);
// and render with renderIntl() so client components get the catalog too.
import {
  createFormatter,
  createTranslator,
  NextIntlClientProvider,
} from "next-intl";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import en from "@/messages/en.json";

type Options = string | { locale?: string; namespace?: string } | undefined;

const namespaceOf = (options: Options) =>
  typeof options === "string" ? options : options?.namespace;

export const intlServer = {
  getTranslations: async (options?: Options) =>
    createTranslator({
      locale: "en",
      messages: en,
      namespace: namespaceOf(options) as never,
    }),
  getLocale: async () => "en",
  getMessages: async () => en,
  getFormatter: async () => createFormatter({ locale: "en", timeZone: "UTC" }),
};

export const i18nServer = {
  requireLocale: async () => "en" as const,
};

/** Static markup of `node` inside the English catalog's provider. */
export const renderIntl = (node: ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      {node}
    </NextIntlClientProvider>,
  );
