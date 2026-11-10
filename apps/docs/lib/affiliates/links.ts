import { baseUrl } from "@/lib/metadata";
import { AFFILIATE_LINK_PREFIX } from "./terms";

/** The app's own origin: NEXT_PUBLIC_APP_URL, else the deployment's URL. */
function appOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Validated by lib/env.ts; fall through just in case.
    }
  }
  return baseUrl.origin;
}

/** "https://qrdx.dev/r/ana-diaz-4k2p" */
export function referralLink(code: string): string {
  return `${appOrigin()}${AFFILIATE_LINK_PREFIX}${encodeURIComponent(code)}`;
}

/** "qrdx.dev/r/ana-diaz-4k2p", for copy. */
export function referralLinkLabel(code: string): string {
  return referralLink(code).replace(/^https?:\/\//, "");
}
