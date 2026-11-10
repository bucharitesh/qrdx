// next.config.ts routing for translated pages (no middleware: the proxy
// never runs for public pages). English keeps its unprefixed URLs, which are
// rewritten to `[lang]=en` in the router, so the prerendered HTML is served
// as is. /en and /en/... redirect to the unprefixed URL, so English has one
// address. Short links (/q, /p, /m), the API and docs are never localized.
import { LOCALE_INFO } from "./config";
import { LOCALIZED_PATHS } from "./paths";

const EN = `/${LOCALE_INFO.en.segment}`;

/** /pricing → /en/pricing (beforeFiles). */
export function englishRewrites(): { source: string; destination: string }[] {
  return LOCALIZED_PATHS.map((path) => ({
    source: path,
    destination: path === "/" ? EN : `${EN}${path}`,
  }));
}

/**
 * /en → /, /en/pricing → /pricing (308), on QRdx's own hosts only: on a
 * customer's domain /en is a short link. A page's Open Graph image lives
 * under its route (/en/pricing/opengraph-image-…) and isn't redirected.
 */
export function englishRedirects(platformHosts: string) {
  const has = [{ type: "host" as const, value: platformHosts }];
  return [
    { source: EN, destination: "/", permanent: true, has },
    {
      source: `${EN}/:path((?!.*(?:opengraph|twitter)-image).*)`,
      destination: "/:path",
      permanent: true,
      has,
    },
  ];
}
