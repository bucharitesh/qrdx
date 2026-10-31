/**
 * Offline URL heuristics (no network, safe on server and client): dangerous
 * schemes, IP literals and private hosts, lookalike (homoglyph) domains and
 * known URL shorteners. "block" signals are never acceptable destinations;
 * "warn" signals are legitimate often enough that they only raise suspicion
 * (lib/safety/velocity.ts holds them for review on new accounts).
 */

export type UrlSignal =
  /** Not an absolute URL */
  | "invalid"
  /** javascript:, data:, vbscript:, file:, blob: */
  | "dangerous-scheme"
  /** Any other non-http(s) scheme (mailto:, tel:, ...) */
  | "non-http"
  /** user:password@host, a classic way to disguise the real host */
  | "credentials"
  /** The host is an IPv4/IPv6 address instead of a domain */
  | "ip-address"
  /** localhost, private/link-local addresses, .local/.internal names */
  | "private-network"
  /** An internationalized domain that imitates Latin letters */
  | "homoglyph"
  /** A known URL shortener, which hides the real destination */
  | "shortener";

export type UrlSeverity = "block" | "warn" | "ok";

export interface UrlAnalysis {
  /** Parsed URL, null when invalid */
  url: URL | null;
  /** ASCII (punycode) hostname */
  hostname: string | null;
  /** Hostname with punycode labels decoded, for display */
  displayHostname: string | null;
  signals: UrlSignal[];
  severity: UrlSeverity;
}

const BLOCKING_SIGNALS: ReadonlySet<UrlSignal> = new Set([
  "invalid",
  "dangerous-scheme",
]);

export const URL_SIGNAL_LABELS: Record<UrlSignal, string> = {
  invalid: "Not a valid web address",
  "dangerous-scheme": "Uses a scheme that can run code (javascript:, data:)",
  "non-http": "Not a web (http/https) link",
  credentials: "Contains a username or password before the host",
  "ip-address": "Points to a bare IP address instead of a domain",
  "private-network": "Points to a local or private network address",
  homoglyph: "Domain uses lookalike characters from another alphabet",
  shortener: "Goes through a URL shortener that hides the final destination",
};

const DANGEROUS_SCHEMES = new Set([
  "javascript:",
  "data:",
  "vbscript:",
  "file:",
  "blob:",
]);

/** Shorteners and ad-link services whose links hide the real destination. */
export const URL_SHORTENER_HOSTS: ReadonlySet<string> = new Set([
  "adf.ly",
  "bc.vc",
  "bit.do",
  "bit.ly",
  "bitly.com",
  "bl.ink",
  "buff.ly",
  "clck.ru",
  "cli.re",
  "cutt.ly",
  "did.li",
  "dlvr.it",
  "goo.gl",
  "is.gd",
  "j.mp",
  "lnkd.in",
  "ouo.io",
  "ow.ly",
  "qrco.de",
  "rb.gy",
  "rebrand.ly",
  "s.id",
  "short.gy",
  "shorte.st",
  "shorturl.at",
  "snip.ly",
  "soo.gd",
  "t.co",
  "t.ly",
  "tiny.cc",
  "tinyurl.com",
  "trib.al",
  "u.to",
  "v.gd",
  "x.co",
  "zpr.io",
]);

// ─── Punycode (RFC 3492) ─────────────────────────────────────────────────────

const BASE = 36;
const T_MIN = 1;
const T_MAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 128;
const MAX_INT = 0x7fffffff;

function adapt(delta: number, numPoints: number, firstTime: boolean): number {
  let d = firstTime ? Math.floor(delta / DAMP) : delta >> 1;
  d += Math.floor(d / numPoints);
  let k = 0;
  while (d > ((BASE - T_MIN) * T_MAX) >> 1) {
    d = Math.floor(d / (BASE - T_MIN));
    k += BASE;
  }
  return k + Math.floor(((BASE - T_MIN + 1) * d) / (d + SKEW));
}

function digitOf(codePoint: number): number {
  if (codePoint >= 0x30 && codePoint <= 0x39) return codePoint - 22;
  if (codePoint >= 0x41 && codePoint <= 0x5a) return codePoint - 0x41;
  if (codePoint >= 0x61 && codePoint <= 0x7a) return codePoint - 0x61;
  return BASE;
}

/** Decodes one punycode label (without "xn--"); null when malformed. */
export function decodePunycode(input: string): string | null {
  const output: number[] = [];
  const basic = Math.max(0, input.lastIndexOf("-"));
  for (let j = 0; j < basic; j++) {
    const codePoint = input.charCodeAt(j);
    if (codePoint >= 0x80) return null;
    output.push(codePoint);
  }

  let n = INITIAL_N;
  let bias = INITIAL_BIAS;
  let i = 0;
  for (let index = basic > 0 ? basic + 1 : 0; index < input.length; ) {
    const oldI = i;
    for (let w = 1, k = BASE; ; k += BASE) {
      if (index >= input.length) return null;
      const digit = digitOf(input.charCodeAt(index++));
      if (digit >= BASE || digit > Math.floor((MAX_INT - i) / w)) return null;
      i += digit * w;
      const t = k <= bias ? T_MIN : k >= bias + T_MAX ? T_MAX : k - bias;
      if (digit < t) break;
      if (w > Math.floor(MAX_INT / (BASE - t))) return null;
      w *= BASE - t;
    }
    const length = output.length + 1;
    bias = adapt(i - oldI, length, oldI === 0);
    if (Math.floor(i / length) > MAX_INT - n) return null;
    n += Math.floor(i / length);
    i %= length;
    output.splice(i++, 0, n);
  }
  try {
    return String.fromCodePoint(...output);
  } catch {
    return null;
  }
}

/** Hostname with every punycode label decoded (labels that fail stay as-is). */
export function toDisplayHostname(hostname: string): string {
  return hostname
    .split(".")
    .map((label) =>
      label.startsWith("xn--")
        ? (decodePunycode(label.slice(4)) ?? label)
        : label,
    )
    .join(".");
}

// ─── Homoglyphs ──────────────────────────────────────────────────────────────

// Non-Latin letters that render (almost) like a Latin letter in most fonts.
const LATIN_LOOKALIKES = new Set([
  // Cyrillic
  "а",
  "с",
  "ԁ",
  "е",
  "һ",
  "і",
  "ј",
  "к",
  "ӏ",
  "о",
  "р",
  "ԛ",
  "ѕ",
  "у",
  "ү",
  "х",
  "ԝ",
  "ь",
  // Greek
  "α",
  "ε",
  "ι",
  "κ",
  "ν",
  "ο",
  "ρ",
  "υ",
  "χ",
  // Armenian
  "ս",
  "օ",
  "հ",
  "ո",
  // Latin letters that imitate other Latin letters
  "ɑ",
  "ɡ",
  "ı",
  "ȷ",
  "ɩ",
  "ʟ",
  "ɪ",
]);

const SCRIPTS = {
  latin: /\p{Script=Latin}/u,
  cyrillic: /\p{Script=Cyrillic}/u,
  greek: /\p{Script=Greek}/u,
  armenian: /\p{Script=Armenian}/u,
} as const;
const LETTER = /\p{L}/u;

function scriptsOf(label: string): Set<keyof typeof SCRIPTS | "other"> {
  const found = new Set<keyof typeof SCRIPTS | "other">();
  for (const char of label) {
    if (!LETTER.test(char)) continue;
    const script = (Object.keys(SCRIPTS) as (keyof typeof SCRIPTS)[]).find(
      (name) => SCRIPTS[name].test(char),
    );
    found.add(script ?? "other");
  }
  return found;
}

/**
 * True for a decoded IDN label that imitates Latin text: Latin mixed with
 * Cyrillic/Greek/Armenian, or a label made only of lookalike letters
 * (e.g. Cyrillic "аррӏе" for "apple").
 */
export function isHomoglyphLabel(label: string): boolean {
  if (/^\p{ASCII}*$/u.test(label)) return false;
  const scripts = scriptsOf(label);
  const confusableScripts = ["cyrillic", "greek", "armenian"].filter((name) =>
    scripts.has(name as keyof typeof SCRIPTS),
  ).length;
  if (scripts.has("latin") && confusableScripts > 0) return true;
  if (confusableScripts > 1) return true;

  const letters = [...label].filter((char) => LETTER.test(char));
  return (
    letters.length > 0 &&
    letters.every((char) => /[a-z]/.test(char) || LATIN_LOOKALIKES.has(char))
  );
}

function hasHomoglyphs(hostname: string): boolean {
  const labels = hostname.split(".");
  const tld = labels.at(-1) ?? "";
  return labels.some((label, index) => {
    if (!label.startsWith("xn--")) return false;
    const decoded = decodePunycode(label.slice(4));
    if (decoded === null) return true;
    // A whole-word lookalike under a non-Latin TLD (e.g. .рф) is normal text.
    if (index !== labels.length - 1 && tld.startsWith("xn--")) {
      const scripts = scriptsOf(decoded);
      return scripts.has("latin") && scripts.size > 1;
    }
    return isHomoglyphLabel(decoded);
  });
}

// ─── Hosts ───────────────────────────────────────────────────────────────────

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function isPrivateIpv4(hostname: string): boolean {
  const match = IPV4.exec(hostname);
  if (!match) return false;
  const [a, b] = [Number(match[1]), Number(match[2])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string): boolean {
  const value = address.toLowerCase();
  if (value === "::" || value === "::1") return true;
  // fc00::/7 (unique local) and fe80::/10 (link-local); URL drops leading zeros.
  if (/^f[cd][0-9a-f]{2}:/.test(value)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(value)) return true;
  // IPv4-mapped (::ffff:a.b.c.d or ::ffff:7f00:1)
  const mapped = /^::ffff:(.+)$/.exec(value)?.[1];
  if (mapped) {
    if (IPV4.test(mapped)) return isPrivateIpv4(mapped);
    const [high = "", low = ""] = mapped.split(":");
    const n = (Number.parseInt(high, 16) << 16) | Number.parseInt(low, 16);
    return isPrivateIpv4(
      [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join("."),
    );
  }
  return false;
}

const PRIVATE_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".intranet",
  ".lan",
  ".home.arpa",
];

export function isShortenerHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return URL_SHORTENER_HOSTS.has(host);
}

// ─── Analysis ────────────────────────────────────────────────────────────────

export function analyzeUrl(input: string): UrlAnalysis {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return {
      url: null,
      hostname: null,
      displayHostname: null,
      signals: ["invalid"],
      severity: "block",
    };
  }

  const signals: UrlSignal[] = [];
  const protocol = url.protocol.toLowerCase();
  if (DANGEROUS_SCHEMES.has(protocol)) {
    signals.push("dangerous-scheme");
  } else if (protocol !== "http:" && protocol !== "https:") {
    signals.push("non-http");
  }

  // URL already lowercases hosts, applies IDNA and normalizes numeric IPv4 forms.
  const hostname = url.hostname.replace(/\.$/, "");
  if (signals.length === 0) {
    if (!hostname) signals.push("invalid");
    if (url.username || url.password) signals.push("credentials");

    const ipv6 = hostname.startsWith("[") ? hostname.slice(1, -1) : null;
    if (ipv6 !== null || IPV4.test(hostname)) {
      signals.push("ip-address");
      if (ipv6 !== null ? isPrivateIpv6(ipv6) : isPrivateIpv4(hostname)) {
        signals.push("private-network");
      }
    } else if (
      hostname === "localhost" ||
      !hostname.includes(".") ||
      PRIVATE_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
    ) {
      signals.push("private-network");
    }

    if (hasHomoglyphs(hostname)) signals.push("homoglyph");
    if (isShortenerHost(hostname)) signals.push("shortener");
  }

  const unique = [...new Set(signals)];
  return {
    url,
    hostname: hostname || null,
    displayHostname: hostname ? toDisplayHostname(hostname) : null,
    signals: unique,
    severity: unique.some((signal) => BLOCKING_SIGNALS.has(signal))
      ? "block"
      : unique.length > 0
        ? "warn"
        : "ok",
  };
}
