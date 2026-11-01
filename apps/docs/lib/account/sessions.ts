import { parseUserAgent } from "@/lib/user-agent";

/**
 * Settings → Account → Sessions: what the page shows for each signed-in
 * device. Pure (dates passed in) so the wording is testable; rows come from
 * the session table, tokens never leave the server.
 */

export interface SessionRow {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}

export type SessionDevice = "desktop" | "mobile" | "tablet" | "other";

export interface SessionView {
  id: string;
  device: SessionDevice;
  /** "Chrome on macOS" */
  label: string;
  /** Masked network address, e.g. "203.0.113.*"; null for local or unknown */
  network: string | null;
  /** Approximate location (this device only, from the platform's geo headers) */
  location: string | null;
  /** "Active now", "Active 3 hours ago" */
  lastActive: string;
  /** "Signed in Nov 1, 2026" */
  signedIn: string;
  current: boolean;
}

export interface ApproximateLocation {
  city: string | null;
  country: string | null;
}

const DATE_FORMAT = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeZone: "UTC",
});
const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const COUNTRY_NAMES = new Intl.DisplayNames("en", { type: "region" });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5 minutes ago", "yesterday", "12 days ago", else a date. */
export function formatRelative(date: Date, now: Date): string {
  const elapsed = Math.max(0, now.getTime() - date.getTime());
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) {
    return RELATIVE.format(-Math.floor(elapsed / MINUTE), "minute");
  }
  if (elapsed < DAY)
    return RELATIVE.format(-Math.floor(elapsed / HOUR), "hour");
  if (elapsed < 30 * DAY) {
    return RELATIVE.format(-Math.floor(elapsed / DAY), "day");
  }
  return `on ${DATE_FORMAT.format(date)}`;
}

/** "Chrome on macOS", "Safari", "curl", or "Unknown device". */
export function describeUserAgent(userAgent: string | null): {
  device: SessionDevice;
  label: string;
} {
  const ua = userAgent?.trim() ?? "";
  if (!ua) return { device: "other", label: "Unknown device" };
  const { deviceType, os, browser } = parseUserAgent(ua);
  if (browser && os)
    return { device: deviceType, label: `${browser} on ${os}` };
  if (browser) return { device: deviceType, label: browser };
  if (os) return { device: deviceType, label: `${os} device` };
  // Scripts and API clients ("curl/8.7.1", "node"): their product name.
  const product = /^([A-Za-z][\w.-]{0,39})(?:\/|\s|$)/.exec(ua)?.[1];
  return { device: deviceType, label: product ?? "Unknown device" };
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * The network part of an address: "203.0.113.*" or "2001:db8:85a3:*".
 * Loopback, unspecified and private addresses say nothing useful: null.
 */
export function maskIpAddress(address: string | null): string | null {
  const ip = address?.trim().toLowerCase() ?? "";
  if (!ip) return null;
  const mapped = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  const v4 = IPV4.exec(mapped);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    const local =
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168);
    return local ? null : `${v4[1]}.${v4[2]}.${v4[3]}.*`;
  }
  if (!mapped.includes(":")) return null;
  const groups = mapped.split(":");
  // All zeros (::, 0000:…:0000) or ::1
  if (groups.every((group) => /^0*$/.test(group) || group === "1")) return null;
  // fc00::/7 (unique local) and fe80::/10 (link local)
  if (/^f[cd]/.test(groups[0]) || /^fe[89ab]/.test(groups[0])) return null;
  const prefix = groups
    .slice(0, 3)
    .map((group) => group.replace(/^0+(?=.)/, "") || "0");
  return `${prefix.join(":")}:*`;
}

/** "Berlin, Germany" / "Germany" from platform geo headers, or null. */
export function formatLocation(
  location: ApproximateLocation | null,
): string | null {
  if (!location) return null;
  let country: string | null = null;
  if (location.country) {
    try {
      country = COUNTRY_NAMES.of(location.country) ?? location.country;
    } catch {
      country = location.country;
    }
  }
  const parts = [location.city, country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

/** Live sessions, this device first, then the most recently active. */
export function toSessionViews(
  rows: SessionRow[],
  {
    currentSessionId,
    now,
    currentLocation = null,
  }: {
    currentSessionId: string | null;
    now: Date;
    currentLocation?: ApproximateLocation | null;
  },
): SessionView[] {
  return rows
    .filter((row) => row.expiresAt.getTime() > now.getTime())
    .map((row) => {
      const current = row.id === currentSessionId;
      const { device, label } = describeUserAgent(row.userAgent);
      return {
        id: row.id,
        device,
        label,
        network: maskIpAddress(row.ipAddress),
        location: current ? formatLocation(currentLocation) : null,
        lastActive: current
          ? "Active now"
          : `Active ${formatRelative(row.updatedAt, now)}`,
        signedIn: `Signed in ${DATE_FORMAT.format(row.createdAt)}`,
        current,
        sortKey: row.updatedAt.getTime(),
      };
    })
    .sort(
      (a, b) => Number(b.current) - Number(a.current) || b.sortKey - a.sortKey,
    )
    .map(({ sortKey: _sortKey, ...view }) => view);
}
