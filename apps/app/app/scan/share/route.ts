// The installed scanner's share target (lib/scanner-app.ts). The service
// worker (public/scan-sw.js) answers these posts on the device, so shared
// images never reach the server. This only runs when it isn't installed yet
// (storage cleared, first launch offline): the body is never read, and the
// scanner opens and asks for the image again.
import { sharedRedirect } from "@/lib/scanner-app";

export function POST(request: Request) {
  return sharedRedirect(request, "en");
}

export function GET(request: Request) {
  return sharedRedirect(request, "en");
}
