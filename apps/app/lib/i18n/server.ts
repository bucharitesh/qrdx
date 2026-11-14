import "server-only";

import { notFound } from "next/navigation";
import { lang } from "next/root-params";
import { type Locale, localeFromSegment } from "./config";

/**
 * The locale of a page under app/[lang], or a 404 for a first segment that
 * isn't one (/pricng, /wp-login.php). Pages call it rather than the root
 * layout, so app/[lang]/not-found.tsx renders the 404 inside the layout.
 */
export async function requireLocale(): Promise<Locale> {
  const locale = localeFromSegment(await lang());
  if (!locale) notFound();
  return locale;
}
