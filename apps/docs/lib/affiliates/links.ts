import { appOrigin } from "@repo/config/origins";
import { AFFILIATE_LINK_PREFIX } from "./terms";

/** "https://qrdx.dev/r/ana-diaz-4k2p" */
export function referralLink(code: string): string {
  return `${appOrigin()}${AFFILIATE_LINK_PREFIX}${encodeURIComponent(code)}`;
}

/** "qrdx.dev/r/ana-diaz-4k2p", for copy. */
export function referralLinkLabel(code: string): string {
  return referralLink(code).replace(/^https?:\/\//, "");
}
