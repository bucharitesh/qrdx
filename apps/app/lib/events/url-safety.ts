import { type LookupAddress, lookup } from "node:dns";
import { BlockList, isIP } from "node:net";

// Webhook and chat URLs are entered by customers and fetched by our servers,
// so they must never reach private networks (SSRF). URLs are checked when
// saved, and every connection re-checks the resolved address (DNS rebinding).

export const MAX_WEBHOOK_URL_LENGTH = 2048;

const blocked = new BlockList();
// IPv4: "this network", private, carrier-grade NAT, loopback, link-local
// (cloud metadata), IETF/test ranges, benchmarking, multicast, reserved.
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
  blocked.addSubnet(network, prefix, "ipv4");
}
// IPv6: unspecified, loopback, IPv4-compatible, local-use NAT64, discard,
// Teredo, documentation, 6to4, ULA, link-local, site-local, multicast.
// (v4-mapped and NAT64 forms are unwrapped below; the tunnelling ranges embed
// an IPv4 address too and are blocked whole, like app/api/scan/check/_lib/ssrf.ts.)
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 32],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(network, prefix, "ipv6");
}

/** IPv4 embedded in ::ffff:a.b.c.d, ::a.b.c.d or 64:ff9b::a.b.c.d. */
function embeddedIpv4(address: string): string | null {
  const lower = address.toLowerCase();
  const dotted = lower.match(
    /^(?:::ffff:|::|64:ff9b::)(\d{1,3}(?:\.\d{1,3}){3})$/,
  );
  if (dotted?.[1]) return dotted[1];
  const hex = lower.match(
    /^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/,
  );
  if (hex?.[1] && hex[2]) {
    const high = Number.parseInt(hex[1], 16);
    const low = Number.parseInt(hex[2], 16);
    return [high >> 8, high & 255, low >> 8, low & 255].join(".");
  }
  return null;
}

/** True for addresses webhooks must never connect to. */
export function isBlockedAddress(address: string): boolean {
  const unbracketed = address.replace(/^\[|\]$/g, "").split("%")[0] ?? "";
  const family = isIP(unbracketed);
  if (family === 4) return blocked.check(unbracketed, "ipv4");
  if (family === 6) {
    const v4 = embeddedIpv4(unbracketed);
    if (v4) return isBlockedAddress(v4);
    return blocked.check(unbracketed, "ipv6");
  }
  return true;
}

const BLOCKED_HOST_SUFFIXES = [
  "localhost",
  ".localhost",
  ".local",
  ".internal",
  ".home.arpa",
  ".lan",
  ".intranet",
  ".corp",
];

export type UrlCheck = { ok: true; url: URL } | { ok: false; message: string };

/** Static checks for a webhook target (no DNS): public https host names only. */
export function checkWebhookUrl(value: string): UrlCheck {
  const trimmed = value.trim();
  if (!trimmed) return { ok: false, message: "Enter the endpoint URL." };
  if (trimmed.length > MAX_WEBHOOK_URL_LENGTH) {
    return { ok: false, message: "The URL is too long." };
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, message: "Enter a full URL, starting with https://" };
  }
  if (url.protocol !== "https:") {
    return { ok: false, message: "Webhook URLs must use https://" };
  }
  if (url.username || url.password) {
    return {
      ok: false,
      message: "Remove the user name and password from the URL.",
    };
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (isIP(host.replace(/^\[|\]$/g, ""))) {
    return { ok: false, message: "Use a host name, not an IP address." };
  }
  if (!host.includes(".")) {
    return { ok: false, message: "Use a public host name." };
  }
  if (
    BLOCKED_HOST_SUFFIXES.some(
      (suffix) => host === suffix.replace(/^\./, "") || host.endsWith(suffix),
    )
  ) {
    return { ok: false, message: "Use a public host name." };
  }
  url.hash = "";
  return { ok: true, url };
}

const SLACK_HOSTS = new Set(["hooks.slack.com"]);
const DISCORD_HOSTS = new Set([
  "discord.com",
  "discordapp.com",
  "canary.discord.com",
  "ptb.discord.com",
]);

/** Slack incoming webhook: https://hooks.slack.com/services/T…/B…/… */
export function checkSlackWebhookUrl(value: string): UrlCheck {
  const base = checkWebhookUrl(value);
  if (!base.ok) return base;
  const { url } = base;
  if (
    !SLACK_HOSTS.has(url.hostname.toLowerCase()) ||
    url.port ||
    !/^\/services\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/?$/.test(
      url.pathname,
    )
  ) {
    return {
      ok: false,
      message:
        "Paste a Slack incoming webhook URL (https://hooks.slack.com/services/…).",
    };
  }
  url.search = "";
  return { ok: true, url };
}

/** Discord channel webhook: https://discord.com/api/webhooks/<id>/<token> */
export function checkDiscordWebhookUrl(value: string): UrlCheck {
  const base = checkWebhookUrl(value);
  if (!base.ok) return base;
  const { url } = base;
  if (
    !DISCORD_HOSTS.has(url.hostname.toLowerCase()) ||
    url.port ||
    !/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)
  ) {
    return {
      ok: false,
      message:
        "Paste a Discord webhook URL (https://discord.com/api/webhooks/…).",
    };
  }
  url.search = "";
  return { ok: true, url };
}

/** Hides the secret part of a chat webhook URL for display. */
export function maskChatWebhookUrl(value: string): string {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    const last = parts.pop() ?? "";
    return `${url.host}/${[...parts, `${last.slice(0, 4)}…`].join("/")}`;
  } catch {
    return "Invalid URL";
  }
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/**
 * `lookup` for node:http(s) that refuses private addresses, so a host name
 * can't be pointed at internal services after it was validated.
 */
export function safeLookup(
  hostname: string,
  options: { all?: boolean; family?: number | string } | number,
  callback: LookupCallback,
): void {
  const all = typeof options === "object" && options.all === true;
  lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) {
      callback(error, all ? [] : "");
      return;
    }
    const allowed = addresses.filter(
      (entry) => !isBlockedAddress(entry.address),
    );
    if (allowed.length === 0 || allowed.length !== addresses.length) {
      const blockedError: NodeJS.ErrnoException = new Error(
        `${hostname} resolves to a private or reserved address`,
      );
      blockedError.code = "EBLOCKEDADDRESS";
      callback(blockedError, all ? [] : "");
      return;
    }
    if (all) {
      callback(null, allowed);
      return;
    }
    const first = allowed[0] as LookupAddress;
    callback(null, first.address, first.family);
  });
}
