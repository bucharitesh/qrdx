// Typed keys and ICU arguments for next-intl, from the English catalog the
// main app keeps (apps/docs/messages/en.json): a wrong key or a missing
// argument fails `tsc`.
import type { Locale } from "@/lib/i18n/config";
import type en from "../../docs/messages/en.json";

declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof en;
  }
}
