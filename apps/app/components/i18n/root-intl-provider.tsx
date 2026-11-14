"use client";

// next-intl's provider as a plain client component. Imported from a server
// component, it takes its props as given: unlike next-intl's server version,
// it never reads the request's configuration to fill in formats, `now` or
// the time zone. The root layouts use it so that, on signed-in app pages,
// the request's language is resolved later, from the person
// (lib/i18n/request-locale.ts), instead of fixed to English up front.
export { NextIntlClientProvider as RootIntlProvider } from "next-intl";
