// Typed keys and ICU arguments for next-intl, from the namespaces of the
// English catalog the docs read (lib/i18n/messages.ts): a wrong key or a
// missing argument fails `tsc`.
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages";

declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}
