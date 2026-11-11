import type { ReactNode } from "react";
import { getAppLocale } from "@/lib/i18n/app-locale";

// Renders again on every navigation (unlike the layout), so the app's
// language is known before the page's server components translate
// (lib/i18n/request-locale.ts).
export default async function AppLocaleTemplate({
  children,
}: {
  children: ReactNode;
}) {
  await getAppLocale();
  return children;
}
