// A translated scanner's share target, when its service worker isn't there
// to answer (app/scan/share/route.ts). The body is never read.
import { notFound } from "next/navigation";
import { localeFromSegment } from "@/lib/i18n/config";
import { sharedRedirect } from "@/lib/scanner-app";

async function redirect(
  request: Request,
  { params }: RouteContext<"/[lang]/scan/share">,
) {
  const locale = localeFromSegment((await params).lang);
  if (!locale) notFound();
  return sharedRedirect(request, locale);
}

export const POST = redirect;
export const GET = redirect;
