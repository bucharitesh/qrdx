// QRdx's own hosts, as next.config's `has: host` conditions name them:
// qrdx.dev and its subdomains, Vercel deployments, local development and
// the deployment's own app URL (a self-hosted one). Customers' custom
// domains are none of these. Pure: next.config.ts and proxy.ts import it,
// so a rule and the proxy's view of the same request always agree.

/** A regex source (alternatives, unanchored) for a `has: host` condition. */
export function platformHostsPattern(appUrl: string): string {
  const appHostname = new URL(appUrl).hostname;
  return [
    "(?:.+\\.)?(?:qrdx\\.dev|vercel\\.app)",
    "localhost",
    "127\\.0\\.0\\.1",
    appHostname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  ].join("|");
}

/**
 * Whether a Host header matches `pattern` the way Next matches a `has: host`
 * condition: the hostname without its port, lower-cased, matched whole.
 */
export function hostMatcher(pattern: string): (host: string | null) => boolean {
  const matcher = new RegExp(`^(?:${pattern})$`);
  return (host) => {
    const hostname = host?.split(":", 1)[0]?.toLowerCase();
    return hostname ? matcher.test(hostname) : false;
  };
}
