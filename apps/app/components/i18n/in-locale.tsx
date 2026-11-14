import type { Locale } from "@repo/i18n/config";
import type { ReactNode } from "react";
import { requestAppLocale } from "@/lib/i18n/request-locale";

/**
 * Renders `children` in `locale` where the request has no [lang] segment to
 * say so: a server action that returns cards for a translated page. Server
 * components below it that call useTranslations or useLocale get `locale`
 * (i18n/request.ts reads it), the way the signed-in app's pages do.
 */
export function InLocale({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  requestAppLocale().current = locale;
  return children;
}
