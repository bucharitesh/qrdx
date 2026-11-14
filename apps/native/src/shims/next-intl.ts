// The scanner components import their hooks from next-intl; outside Next,
// the same hooks come from use-intl (which next-intl wraps).
export { useFormatter, useLocale, useTranslations } from "use-intl";
