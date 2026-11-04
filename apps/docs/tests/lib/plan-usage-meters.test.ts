// Plan & usage (/settings/usage): how limits, renewals and upgrades read.
// Pure functions; no database.
import { describe, expect, it } from "vitest";
import {
  type Meter,
  meterLevel,
  meterPercent,
  meterValue,
  renewalLine,
  resetLine,
  type SubscriptionSummary,
  upgradeAction,
} from "@/app/settings/usage/_lib/meters";

const meter = (overrides: Partial<Meter>): Meter => ({
  id: "dynamicCodes",
  label: "Dynamic QR codes",
  used: 0,
  limit: 10,
  unit: "count",
  ...overrides,
});

describe("meterLevel", () => {
  it("reads unlimited, not-included, full and near", () => {
    expect(meterLevel({ used: 4, limit: null })).toBe("unlimited");
    expect(meterLevel({ used: 0, limit: 0 })).toBe("excluded");
    expect(meterLevel({ used: 10, limit: 10 })).toBe("full");
    expect(meterLevel({ used: 12, limit: 10 })).toBe("full");
    expect(meterLevel({ used: 9, limit: 10 })).toBe("near");
    expect(meterLevel({ used: 8, limit: 10 })).toBe("ok");
  });
});

describe("meterPercent", () => {
  it("caps at 100 and is 0 without a cap", () => {
    expect(meterPercent({ used: 3, limit: 10 })).toBe(30);
    expect(meterPercent({ used: 30, limit: 10 })).toBe(100);
    expect(meterPercent({ used: 3, limit: null })).toBe(0);
    expect(meterPercent({ used: 3, limit: 0 })).toBe(0);
  });
});

describe("meterValue", () => {
  it("shows used of limit, with thousands separators", () => {
    expect(meterValue(meter({ used: 3, limit: 10 }), "free")).toBe("3 of 10");
    expect(meterValue(meter({ used: 1200, limit: 10_000 }), "pro")).toBe(
      "1,200 of 10,000",
    );
  });

  it("formats storage in bytes", () => {
    expect(
      meterValue(
        meter({
          unit: "bytes",
          used: 1.5 * 1024 * 1024,
          limit: 50 * 1024 * 1024,
        }),
        "free",
      ),
    ).toBe("1.5 MB of 50 MB");
  });

  it("says unlimited, or that the plan doesn't include it", () => {
    expect(meterValue(meter({ used: 26, limit: null }), "business")).toBe(
      "26 · Unlimited",
    );
    expect(meterValue(meter({ used: 0, limit: 0 }), "free")).toBe(
      "Not on Free",
    );
    // Kept after a downgrade: still counted, still honest.
    expect(meterValue(meter({ used: 2, limit: 0 }), "free")).toBe(
      "2 · Not on Free",
    );
  });
});

describe("resetLine", () => {
  it("names the reset day in UTC, or nothing", () => {
    expect(resetLine("2026-12-01T00:00:00.000Z")).toBe("Resets Dec 1");
    expect(resetLine(undefined)).toBeNull();
    expect(resetLine("not a date")).toBeNull();
  });
});

describe("renewalLine", () => {
  const base: SubscriptionSummary = {
    plan: "pro",
    status: "active",
    interval: "month",
    currentPeriodEnd: "2026-12-02T10:00:00.000Z",
    cancelAtPeriodEnd: false,
    endsAt: null,
  };

  it("gives the renewal date and billing interval", () => {
    expect(renewalLine(base)).toBe(
      "Renews on December 2, 2026 · billed monthly",
    );
    expect(renewalLine({ ...base, interval: "year" })).toBe(
      "Renews on December 2, 2026 · billed yearly",
    );
  });

  it("says when a canceled plan ends, and that codes keep working", () => {
    expect(renewalLine({ ...base, cancelAtPeriodEnd: true })).toBe(
      "Ends on December 2, 2026. Your codes keep working after that.",
    );
    expect(renewalLine({ ...base, endsAt: "2026-11-20T00:00:00.000Z" })).toBe(
      "Ends on November 20, 2026. Your codes keep working after that.",
    );
  });

  it("names a trial's end", () => {
    expect(renewalLine({ ...base, status: "trialing" })).toBe(
      "Trial ends on December 2, 2026",
    );
  });
});

describe("upgradeAction", () => {
  it("points Free and Pro to pricing, and stops at Business", () => {
    expect(upgradeAction("free", true)).toEqual({
      label: "Upgrade to Pro",
      href: "/pricing",
      plan: "pro",
    });
    expect(upgradeAction("pro", true)).toEqual({
      label: "Upgrade to Business",
      href: "/pricing",
      plan: "business",
    });
    expect(upgradeAction("business", true)).toBeNull();
  });

  it("offers nothing to team members who can't change the plan", () => {
    expect(upgradeAction("free", false)).toBeNull();
  });
});
