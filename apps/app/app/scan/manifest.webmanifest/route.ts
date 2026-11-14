// The English scanner's web app manifest (lib/scanner-app.ts). Other
// languages: app/[lang]/(home)/scan/manifest.webmanifest.
import { manifestResponse } from "@/lib/scanner-app";
import { localizedScannerManifest } from "@/lib/scanner-app-server";

export const dynamic = "force-static";

export async function GET() {
  return manifestResponse(await localizedScannerManifest("en"));
}
