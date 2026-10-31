import dns, { type LookupAddress } from "node:dns";
import { BlockList, isIP, type LookupFunction } from "node:net";

// Server-side link resolution must never reach private networks: these ranges
// cover loopback, RFC 1918, CGNAT, link-local (incl. cloud metadata at
// 169.254.169.254 / fd00:ec2::254), multicast, documentation and reserved
// space, and IPv6 forms that embed an IPv4 address (mapped, NAT64, 6to4,
// Teredo), which are blocked whole rather than decoded. Two lists, because a
// BlockList matches IPv4 addresses against IPv4-mapped IPv6 rules too.
const blockedV4 = new BlockList();
const blockedV6 = new BlockList();

for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedV4.addSubnet(network, prefix, "ipv4");
}

for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["::", 96], // IPv4-compatible (deprecated)
  ["::ffff:0:0", 96], // IPv4-mapped
  ["64:ff9b::", 96], // NAT64
  ["64:ff9b:1::", 48], // local-use NAT64
  ["100::", 64], // discard
  ["2001::", 32], // Teredo
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["fec0::", 10], // site-local (deprecated)
  ["ff00::", 8], // multicast
] as const) {
  blockedV6.addSubnet(network, prefix, "ipv6");
}

/** True for any address a server-side fetch must not connect to. */
export function isBlockedAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return blockedV4.check(address, "ipv4");
  if (version === 6) {
    // Zone ids ("fe80::1%eth0") are only valid on link-local addresses.
    if (address.includes("%")) return true;
    return blockedV6.check(address, "ipv6");
  }
  return true;
}

const BLOCKED_HOST_SUFFIXES = [
  "localhost",
  "local",
  "localdomain",
  "internal",
  "intranet",
  "home.arpa",
  "lan",
  "corp",
];

/** URL hostname without IPv6 brackets. */
export function bareHostname(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

export type FetchBlockReason =
  | "unsupported-scheme"
  | "credentials"
  | "port"
  | "private-address";

/**
 * Why a URL may not be fetched from the server, or null when it may (the DNS
 * answer is still checked at connect time by `guardedLookup`).
 */
export function fetchBlockReason(url: URL): FetchBlockReason | null {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "unsupported-scheme";
  }
  if (url.username || url.password) return "credentials";
  // Only the default ports: anything else is how SSRF reaches internal services.
  if (url.port !== "") return "port";
  const host = bareHostname(url).toLowerCase();
  if (isIP(host)) return isBlockedAddress(host) ? "private-address" : null;
  if (!host.includes(".")) return "private-address";
  if (
    BLOCKED_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    )
  ) {
    return "private-address";
  }
  return null;
}

export class BlockedAddressError extends Error {
  readonly code = "EBLOCKED";

  constructor(hostname: string) {
    super(`${hostname} resolves to a private or reserved address`);
    this.name = "BlockedAddressError";
  }
}

type DnsLookup = (
  hostname: string,
  options: dns.LookupAllOptions,
  callback: (
    error: NodeJS.ErrnoException | null,
    addresses: LookupAddress[],
  ) => void,
) => void;

/**
 * `lookup` for http.request: resolves every address and refuses the
 * connection when any of them is private. The socket then connects to the
 * address checked here, so DNS rebinding can't swap it afterwards.
 */
export function createGuardedLookup(
  resolve: DnsLookup = dns.lookup as unknown as DnsLookup,
): LookupFunction {
  return (hostname, options, callback) => {
    resolve(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) {
        callback(error, "", 4);
        return;
      }
      const list = addresses ?? [];
      if (
        list.length === 0 ||
        list.some(({ address }) => isBlockedAddress(address))
      ) {
        callback(new BlockedAddressError(hostname), "", 4);
        return;
      }
      if ((options as dns.LookupOptions).all) {
        (
          callback as unknown as (
            error: null,
            addresses: LookupAddress[],
          ) => void
        )(null, list);
        return;
      }
      const [first] = list as [LookupAddress];
      callback(null, first.address, first.family);
    });
  };
}
