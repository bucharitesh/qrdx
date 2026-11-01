import { describe, expect, it } from "vitest";
import {
  describeUserAgent,
  formatLocation,
  formatRelative,
  maskIpAddress,
  type SessionRow,
  toSessionViews,
} from "@/lib/account/sessions";

const NOW = new Date("2026-11-01T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const FIREFOX_ANDROID_TABLET =
  "Mozilla/5.0 (Android 14; Tablet; rv:131.0) Gecko/131.0 Firefox/131.0";

function row(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: "s1",
    createdAt: ago(3 * DAY),
    updatedAt: ago(2 * HOUR),
    expiresAt: new Date(NOW.getTime() + 5 * DAY),
    ipAddress: "203.0.113.24",
    userAgent: CHROME_MAC,
    ...overrides,
  };
}

describe("describeUserAgent", () => {
  it("names browser and OS, with the device type", () => {
    expect(describeUserAgent(CHROME_MAC)).toEqual({
      device: "desktop",
      label: "Chrome on macOS",
    });
    expect(describeUserAgent(SAFARI_IPHONE)).toEqual({
      device: "mobile",
      label: "Safari on iOS",
    });
    expect(describeUserAgent(FIREFOX_ANDROID_TABLET)).toEqual({
      device: "tablet",
      label: "Firefox on Android",
    });
  });

  it("falls back to the client's product name, then to unknown", () => {
    expect(describeUserAgent("curl/8.7.1").label).toBe("curl");
    expect(describeUserAgent(null)).toEqual({
      device: "other",
      label: "Unknown device",
    });
    expect(describeUserAgent("   ").label).toBe("Unknown device");
  });
});

describe("maskIpAddress", () => {
  it("keeps only the network part", () => {
    expect(maskIpAddress("203.0.113.24")).toBe("203.0.113.*");
    expect(maskIpAddress("::ffff:198.51.100.7")).toBe("198.51.100.*");
    expect(maskIpAddress("2001:0db8:85a3:0000:0000:8a2e:0370:7334")).toBe(
      "2001:db8:85a3:*",
    );
  });

  it("hides local, private and unknown addresses", () => {
    for (const address of [
      null,
      "",
      "127.0.0.1",
      "10.1.2.3",
      "192.168.1.20",
      "172.20.0.1",
      "::1",
      "0000:0000:0000:0000:0000:0000:0000:0000",
      "fe80::1",
      "fd12:3456::1",
      "unknown",
    ]) {
      expect(maskIpAddress(address)).toBeNull();
    }
  });
});

describe("formatRelative", () => {
  it("rounds down to the largest whole unit", () => {
    expect(formatRelative(ago(20_000), NOW)).toBe("just now");
    expect(formatRelative(ago(5 * MINUTE), NOW)).toBe("5 minutes ago");
    expect(formatRelative(ago(3 * HOUR + 59 * MINUTE), NOW)).toBe(
      "3 hours ago",
    );
    expect(formatRelative(ago(DAY + HOUR), NOW)).toBe("yesterday");
    expect(formatRelative(ago(12 * DAY), NOW)).toBe("12 days ago");
    expect(formatRelative(new Date("2026-08-15T09:00:00Z"), NOW)).toBe(
      "on Aug 15, 2026",
    );
  });

  it("never says 'in the future' for clock skew", () => {
    expect(formatRelative(new Date(NOW.getTime() + HOUR), NOW)).toBe(
      "just now",
    );
  });
});

describe("formatLocation", () => {
  it("names the country and keeps the city", () => {
    expect(formatLocation({ city: "Berlin", country: "DE" })).toBe(
      "Berlin, Germany",
    );
    expect(formatLocation({ city: null, country: "IN" })).toBe("India");
    expect(formatLocation({ city: null, country: null })).toBeNull();
    expect(formatLocation(null)).toBeNull();
  });
});

describe("toSessionViews", () => {
  it("puts this device first, then the most recently active, and drops expired sessions", () => {
    const views = toSessionViews(
      [
        row({ id: "old", updatedAt: ago(5 * DAY) }),
        row({ id: "expired", expiresAt: ago(MINUTE) }),
        row({ id: "phone", userAgent: SAFARI_IPHONE, updatedAt: ago(HOUR) }),
        row({ id: "this", updatedAt: ago(20 * HOUR) }),
      ],
      {
        currentSessionId: "this",
        now: NOW,
        currentLocation: { city: "Pune", country: "IN" },
      },
    );
    expect(views.map((view) => view.id)).toEqual(["this", "phone", "old"]);
    expect(views[0]).toMatchObject({
      current: true,
      lastActive: "Active now",
      location: "Pune, India",
      network: "203.0.113.*",
      signedIn: "Signed in Oct 29, 2026",
    });
    expect(views[1]).toMatchObject({
      current: false,
      device: "mobile",
      label: "Safari on iOS",
      lastActive: "Active 1 hour ago",
      // Locations are only known for the request being served.
      location: null,
    });
    expect(views[2].lastActive).toBe("Active 5 days ago");
  });

  it("never exposes session tokens", () => {
    const [view] = toSessionViews(
      [{ ...row(), token: "secret-token" } as SessionRow],
      { currentSessionId: null, now: NOW },
    );
    expect(JSON.stringify(view)).not.toContain("secret-token");
    expect(Object.keys(view).sort()).toEqual(
      [
        "current",
        "device",
        "id",
        "label",
        "lastActive",
        "location",
        "network",
        "signedIn",
      ].sort(),
    );
  });
});
