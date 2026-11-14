// A translated scanner's web app manifest (/hi/scan/manifest.webmanifest):
// its own app, scoped to /hi/scan (lib/scanner-app.ts). English is served
// at /scan/manifest.webmanifest (app/scan), where /en/... redirects.

import { localeFromSegment } from "@repo/i18n/config";
import { notFound } from "next/navigation";
import { localeParams } from "@/lib/i18n/static-params";
import { manifestResponse } from "@/lib/scanner-app";
import { localizedScannerManifest } from "@/lib/scanner-app-server";

export const dynamic = "force-static";

export function generateStaticParams() {
  return localeParams();
}

export async function GET(
  _request: Request,
  { params }: RouteContext<"/[lang]/scan/manifest.webmanifest">,
) {
  const locale = localeFromSegment((await params).lang);
  if (!locale) notFound();
  return manifestResponse(await localizedScannerManifest(locale));
}
