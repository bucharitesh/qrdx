import { env } from "@/env";
import { AFFILIATE_LINK_PREFIX } from "./terms";

/** The app's own origin, from NEXT_PUBLIC_APP_URL. */
function appOrigin(): string {
  return new URL(env.NEXT_PUBLIC_APP_URL).origin;
}

/** "https://qrdx.dev/r/ana-diaz-4k2p" */
export function referralLink(code: string): string {
  return `${appOrigin()}${AFFILIATE_LINK_PREFIX}${encodeURIComponent(code)}`;
}

/** "qrdx.dev/r/ana-diaz-4k2p", for copy. */
export function referralLinkLabel(code: string): string {
  return referralLink(code).replace(/^https?:\/\//, "");
}
