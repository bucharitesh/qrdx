import { baseUrl } from "@/lib/metadata";
import { SHORT_LINK_BASE } from "@/lib/short-links";

// Pure helpers shared by the dashboard, the short-link route and proxy.ts.

/**
 * Set by proxy.ts when it rewrites `https://<custom-domain>/<slug>` to
 * `/q/<slug>`: the id of the verified custom domain the scan arrived on.
 */
export const CUSTOM_DOMAIN_HEADER = "x-qrdx-custom-domain";

const MAX_HOSTNAME_LENGTH = 253;
const LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TLD_PATTERN = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;

function toHostname(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `https://${value}`)
      .hostname;
  } catch {
    return null;
  }
}

/** QRdx's own hosts: they and their subdomains are never custom domains. */
const OWN_HOSTS: ReadonlySet<string> = new Set(
  [
    "qrdx.dev",
    baseUrl.hostname,
    toHostname(SHORT_LINK_BASE),
    toHostname(process.env.NEXT_PUBLIC_APP_URL),
    toHostname(process.env.VERCEL_PROJECT_PRODUCTION_URL),
    toHostname(process.env.VERCEL_BRANCH_URL),
    toHostname(process.env.VERCEL_URL),
  ].filter((host): host is string => Boolean(host)),
);

/** Hosting platforms and special-use names (RFC 6761 and friends). */
const RESERVED_SUFFIXES = [
  "vercel.app",
  "vercel.dev",
  "vercel.com",
  "vercel-dns.com",
  "now.sh",
  "example.com",
  "example.net",
  "example.org",
  "arpa",
  "example",
  "internal",
  "invalid",
  "local",
  "localdomain",
  "localhost",
  "onion",
  "test",
];

const matchesSuffix = (hostname: string, suffix: string) =>
  hostname === suffix || hostname.endsWith(`.${suffix}`);

/** True for QRdx's own hosts, hosting platforms and special-use names. */
export function isPlatformHostname(hostname: string): boolean {
  return (
    [...OWN_HOSTS].some((host) => matchesSuffix(hostname, host)) ||
    RESERVED_SUFFIXES.some((suffix) => matchesSuffix(hostname, suffix))
  );
}

/** A lowercase, ASCII (punycode) DNS name with at least two labels and a real TLD. */
export function isDnsHostname(hostname: string): boolean {
  if (hostname.length === 0 || hostname.length > MAX_HOSTNAME_LENGTH) {
    return false;
  }
  const labels = hostname.split(".");
  return (
    labels.length >= 2 &&
    labels.every((label) => LABEL_PATTERN.test(label)) &&
    TLD_PATTERN.test(labels[labels.length - 1] as string)
  );
}

export type HostnameResult =
  | { ok: true; hostname: string }
  | { ok: false; error: string };

/**
 * Normalizes what a user typed ("https://Go.Brand.com/", "bücher.de") to the
 * hostname stored in custom_domain, or explains why it can't be used.
 */
export function parseCustomHostname(input: string): HostnameResult {
  const fail = (error: string): HostnameResult => ({ ok: false, error });

  let value = input.trim().toLowerCase();
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  value = (value.split(/[/?#]/, 1)[0] ?? "").replace(/\.$/, "");
  if (!value) return fail("Enter a domain, for example go.yourbrand.com");
  if (value.startsWith("[") || IPV4_PATTERN.test(value)) {
    return fail("Use a domain name, not an IP address");
  }
  if (/[\s@:\\]/.test(value)) {
    return fail("Enter only the domain, without a port, user name or path");
  }

  let hostname: string;
  try {
    // Converts internationalized names to punycode (bücher.de → xn--bcher-kva.de).
    hostname = new URL(`http://${value}`).hostname;
  } catch {
    return fail("That isn't a valid domain name");
  }

  if (IPV4_PATTERN.test(hostname)) {
    return fail("Use a domain name, not an IP address");
  }
  if (!hostname.includes(".")) {
    return fail("Enter a full domain, for example go.yourbrand.com");
  }
  if (!isDnsHostname(hostname)) return fail("That isn't a valid domain name");
  if (isPlatformHostname(hostname)) {
    return fail(`${hostname} can't be used. Enter a domain you own.`);
  }
  return { ok: true, hostname };
}

/**
 * Hostname a request was sent to, from the Host header (lowercase, no port).
 * null for IP literals and anything that isn't a DNS name.
 */
export function requestHostname(hostHeader: string | null): string | null {
  if (!hostHeader || hostHeader.startsWith("[")) return null;
  const hostname = hostHeader.split(":", 1)[0]?.toLowerCase().replace(/\.$/, "");
  return hostname && isDnsHostname(hostname) ? hostname : null;
}
