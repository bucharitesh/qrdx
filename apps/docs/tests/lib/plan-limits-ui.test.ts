// Plan limits in the app (app/(app)/settings/usage/_lib/meters.ts, limit-copy.ts,
// components/limits/limit-request.ts): the 90% boundary, what an unlimited
// or pooled count shows, which plan lifts a cap, the words on each card and
// when the UI blocks. Pure; the real PLAN_LIMITS, no database.
import { describe, expect, it } from "vitest";
import {
  type LimitContext,
  limitCopy,
} from "@/app/(app)/settings/usage/_lib/limit-copy";
import {
  aiArtNote,
  attentionMeters,
  type CheckoutOpen,
  ENFORCED_ON_CREATE,
  type Meter,
  type MeterCaps,
  type MeterId,
  type MeterResult,
  meterGate,
  meterLabel,
  meterLevel,
  NEAR_LIMIT,
  resolveMeterCaps,
  splitUnlimited,
  upgradeAction,
  upgradeTo,
} from "@/app/(app)/settings/usage/_lib/meters";
import {
  limitRequestMeter,
  limitResponse,
} from "@/components/limits/limit-request";
import { PLAN_LIMITS } from "@/lib/plans";

const MB = 1024 * 1024;
const OPEN: CheckoutOpen = { pro: true, business: true };
const CLOSED: CheckoutOpen = { pro: false, business: false };

const meter = (id: MeterId, used: number, limit: number | null): Meter => ({
  id,
  label: meterLabel(id),
  used,
  limit,
  unit: id === "storage" ? "bytes" : "count",
});

const caps = (plan: "free" | "pro" | "business", isTeam = false): MeterCaps =>
  resolveMeterCaps(PLAN_LIMITS, plan, { isTeam });

const context = (
  plan: "free" | "pro" | "business",
  id: MeterId,
  overrides: Partial<LimitContext> = {},
): LimitContext => ({
  plan,
  canUpgrade: true,
  checkoutOpen: OPEN,
  cap: caps(plan)[id],
  ...overrides,
});

describe("the 90% boundary", () => {
  it("warns from 90% of a cap and is full at the cap", () => {
    expect(NEAR_LIMIT).toBe(0.9);
    expect(meterLevel({ used: 8, limit: 10 })).toBe("ok");
    expect(meterLevel({ used: 9, limit: 10 })).toBe("near");
    expect(meterLevel({ used: 10, limit: 10 })).toBe("full");
    expect(meterLevel({ used: 44, limit: 50 })).toBe("ok");
    expect(meterLevel({ used: 45, limit: 50 })).toBe("near");
    expect(meterLevel({ used: 899, limit: 1000 })).toBe("ok");
    expect(meterLevel({ used: 900, limit: 1000 })).toBe("near");
    expect(meterLevel({ used: 45 * MB - 1, limit: 50 * MB })).toBe("ok");
    expect(meterLevel({ used: 45 * MB, limit: 50 * MB })).toBe("near");
  });

  it("never warns about an unlimited count or one not on the plan", () => {
    expect(meterLevel({ used: 1_000_000, limit: null })).toBe("unlimited");
    expect(meterLevel({ used: 0, limit: 0 })).toBe("excluded");
    expect(
      limitCopy(
        meter("dynamicCodes", 500, null),
        context("pro", "dynamicCodes"),
      ),
    ).toBeNull();
    expect(
      limitCopy(meter("customDomains", 0, 0), context("free", "customDomains")),
    ).toBeNull();
    expect(
      limitCopy(meter("dynamicCodes", 8, 10), context("free", "dynamicCodes")),
    ).toBeNull();
  });
});

describe("attentionMeters and splitUnlimited", () => {
  const meters: MeterResult[] = [
    meter("landingPages", 3, 3),
    meter("dynamicCodes", 9, 10),
    meter("savedThemes", 2, 10),
    meter("formResponses", 47, 50),
    meter("storage", 0, null),
    meter("customDomains", 0, 0),
    { id: "oauthApps", label: "OAuth apps", failed: true },
  ];

  it("lists only 90% or more, full first, then the fullest", () => {
    expect(attentionMeters(meters).map((m) => m.id)).toEqual([
      "landingPages",
      "formResponses",
      "dynamicCodes",
    ]);
  });

  it("keeps unlimited counts apart, so they never get a bar", () => {
    const { capped, unlimited } = splitUnlimited(meters);
    expect(unlimited.map((m) => m.id)).toEqual(["storage"]);
    expect(capped.map((m) => m.id)).not.toContain("storage");
    expect(capped.map((m) => m.id)).toContain("oauthApps");
  });

  it("finds nothing to warn about on Business with every count far below", () => {
    expect(
      attentionMeters([
        meter("dynamicCodes", 4000, null),
        meter("storage", 2 * 1024 * MB, 50 * 1024 * MB),
        meter("teamSeats", 40, null),
      ]),
    ).toEqual([]);
  });
});

describe("resolveMeterCaps", () => {
  it("lifts Free's code cap with Pro's unlimited codes", () => {
    expect(caps("free").dynamicCodes).toEqual({
      limit: 10,
      lift: { plan: "pro", limit: null },
    });
    expect(caps("pro").dynamicCodes).toEqual({ limit: null, lift: null });
  });

  it("names the next plan with more, skipping one that adds nothing", () => {
    expect(caps("free").customDomains).toEqual({
      limit: 0,
      lift: { plan: "pro", limit: 5 },
    });
    expect(caps("pro").customDomains).toEqual({
      limit: 5,
      lift: { plan: "business", limit: 25 },
    });
    expect(caps("pro").teamSeats).toEqual({
      limit: 3,
      lift: { plan: "business", limit: null },
    });
    expect(caps("business").storage?.lift).toBeNull();
    expect(caps("business").aiArt).toEqual({ limit: 150, lift: null });
  });

  it("gives a team on Free no shared themes, lifted by Pro", () => {
    expect(caps("free", true).savedThemes).toEqual({
      limit: 0,
      lift: { plan: "pro", limit: null },
    });
    expect(caps("free", false).savedThemes?.limit).toBe(
      PLAN_LIMITS.free.savedThemes,
    );
  });
});

describe("upgrades respect who can buy and what checkout sells", () => {
  it("offers the next plan to owners while checkout sells it", () => {
    expect(upgradeTo("pro", true, OPEN)).toEqual({
      label: "Upgrade to Pro",
      href: "/pricing",
      plan: "pro",
    });
    expect(upgradeTo("pro", true, CLOSED)).toBeNull();
    expect(
      upgradeTo("business", true, { pro: true, business: false }),
    ).toBeNull();
    expect(upgradeTo("pro", false, OPEN)).toBeNull();
    expect(upgradeTo(null, true, OPEN)).toBeNull();
    expect(upgradeTo("free", true, OPEN)).toBeNull();
  });

  it("drops Plan & usage's own upgrade when checkout can't sell it", () => {
    expect(upgradeAction("free", true, CLOSED)).toBeNull();
    expect(
      upgradeAction("pro", true, { pro: true, business: false }),
    ).toBeNull();
    expect(upgradeAction("free", true, OPEN)?.plan).toBe("pro");
  });
});

describe("limitCopy", () => {
  it("Free at 10 of 10 codes: names the plan, the fix and the guarantee", () => {
    const copy = limitCopy(
      meter("dynamicCodes", 10, 10),
      context("free", "dynamicCodes"),
    );
    expect(copy).toMatchObject({
      level: "full",
      value: "10 of 10",
      status: "Limit reached",
      reason:
        "Free includes 10 active dynamic codes. Archive one or upgrade to Pro for unlimited codes. Existing codes keep working.",
      upgrade: { label: "Upgrade to Pro", plan: "pro" },
      blocked: true,
    });
  });

  it("Free at 9 of 10: how many are left", () => {
    expect(
      limitCopy(meter("dynamicCodes", 9, 10), context("free", "dynamicCodes")),
    ).toMatchObject({
      level: "near",
      status: "Almost full",
      reason: "1 active dynamic code left on Free.",
      blocked: false,
    });
  });

  it("asks a team member to ask an owner, with no button", () => {
    const copy = limitCopy(
      meter("dynamicCodes", 10, 10),
      context("free", "dynamicCodes", { canUpgrade: false }),
    );
    expect(copy?.upgrade).toBeNull();
    expect(copy?.reason).toBe(
      "Free includes 10 active dynamic codes. Archive one, or ask a workspace owner to upgrade to Pro. Existing codes keep working.",
    );
  });

  it("doesn't mention an upgrade checkout can't sell", () => {
    const copy = limitCopy(
      meter("dynamicCodes", 10, 10),
      context("free", "dynamicCodes", { checkoutOpen: CLOSED }),
    );
    expect(copy?.upgrade).toBeNull();
    expect(copy?.reason).toBe(
      "Free includes 10 active dynamic codes. Archive one to make room. Existing codes keep working.",
    );
  });

  it("Pro's full team: Business for unlimited seats", () => {
    expect(
      limitCopy(meter("teamSeats", 3, 3), context("pro", "teamSeats"))?.reason,
    ).toBe(
      "Pro includes 3 seats. Revoke a pending invitation or upgrade to Business for unlimited seats.",
    );
  });

  it("Business has nothing above it: only the way to make room", () => {
    const copy = limitCopy(
      meter("customDomains", 25, 25),
      context("business", "customDomains"),
    );
    expect(copy?.upgrade).toBeNull();
    expect(copy?.reason).toBe(
      "Business includes 25 custom domains. Remove one to make room. Connected domains keep working.",
    );
  });

  it("monthly counts say when they start over", () => {
    const responses = {
      ...meter("formResponses", 50, 50),
      resetsAt: "2026-12-01T00:00:00.000Z",
    };
    expect(limitCopy(responses, context("free", "formResponses"))?.reason).toBe(
      "Free includes 50 form responses a month. Upgrade to Pro for 1,000 responses a month. Resets Dec 1. Pages stay live. Forms accept responses again after the reset.",
    );
    const art = {
      ...meter("aiArt", 140, 150),
      resetsAt: "2026-12-01T00:00:00.000Z",
    };
    expect(limitCopy(art, context("business", "aiArt"))?.reason).toBe(
      "10 AI art images left this month on Business. Resets Dec 1.",
    );
  });

  it("storage reads in bytes", () => {
    expect(
      limitCopy(meter("storage", 46 * MB, 50 * MB), context("free", "storage"))
        ?.reason,
    ).toBe("4 MB left on Free.");
    expect(
      limitCopy(meter("storage", 50 * MB, 50 * MB), context("free", "storage"))
        ?.reason,
    ).toBe(
      "Free includes 50 MB of file storage. Delete files you no longer need or upgrade to Pro for 5 GB. Files you've uploaded stay available.",
    );
  });

  it("AI theme requests are the person's own: they may upgrade in any workspace", () => {
    const copy = limitCopy(meter("aiThemes", 5, 5), {
      plan: "pro",
      canUpgrade: false,
      checkoutOpen: OPEN,
      cap: { limit: 5, lift: { plan: "pro", limit: null } },
    });
    expect(copy?.upgrade?.plan).toBe("pro");
  });
});

describe("pooled AI art", () => {
  it("says Business's allowance is the workspace's when it's the lift", () => {
    expect(caps("pro", true).aiArt).toEqual({
      limit: 30,
      lift: { plan: "business", limit: 150, shared: true },
    });
    expect(caps("free").aiArt?.lift).toEqual({ plan: "pro", limit: 30 });
    const art = {
      ...meter("aiArt", 30, 30),
      resetsAt: "2026-12-01T00:00:00.000Z",
    };
    expect(
      limitCopy(art, {
        plan: "pro",
        canUpgrade: true,
        checkoutOpen: OPEN,
        cap: caps("pro", true).aiArt,
      })?.reason,
    ).toBe(
      "Pro includes 30 AI art images a month. Upgrade to Business for 150 images a month, shared by the workspace. Resets Dec 1.",
    );
  });

  it("says whose allowance it is", () => {
    expect(aiArtNote({ pooled: true, isTeam: true })).toBe(
      "Shared by everyone in this workspace.",
    );
    expect(aiArtNote({ pooled: true, isTeam: false })).toBe(
      "Shared by everyone in this workspace.",
    );
    expect(aiArtNote({ pooled: false, isTeam: true })).toBe(
      "Counted for you, not the team.",
    );
    expect(aiArtNote({ pooled: false, isTeam: false })).toBeUndefined();
  });

  it("only Business pools it, and the pooled cap has nothing above it", () => {
    expect(PLAN_LIMITS.business.aiArtPooled).toBe(true);
    expect(PLAN_LIMITS.pro.aiArtPooled).toBe(false);
    expect(caps("business", true).aiArt).toEqual({ limit: 150, lift: null });
  });
});

describe("gating: block only where the server enforces", () => {
  it("blocks a full cap the server refuses past", () => {
    expect(meterGate(meter("dynamicCodes", 10, 10))).toBe("block");
    expect(meterGate(meter("landingPages", 3, 3))).toBe("block");
    expect(meterGate(meter("customDomains", 5, 5))).toBe("block");
  });

  it("only warns about form responses (the public form refuses, not the app)", () => {
    expect(ENFORCED_ON_CREATE.formResponses).toBe(false);
    expect(meterGate(meter("formResponses", 50, 50))).toBe("warn");
  });

  it("warns from 90% and never gates unlimited or excluded counts", () => {
    expect(meterGate(meter("dynamicCodes", 9, 10))).toBe("warn");
    expect(meterGate(meter("dynamicCodes", 8, 10))).toBe("none");
    expect(meterGate(meter("dynamicCodes", 900, null))).toBe("none");
    expect(meterGate(meter("customDomains", 0, 0))).toBe("none");
  });
});

describe("what a LIMIT_REACHED answer shows", () => {
  const freeShell = { caps: caps("free"), isTeam: false };

  it("a card at the cap, counting from the cap when the count is unknown", () => {
    expect(limitRequestMeter({ meterId: "dynamicCodes" }, freeShell)).toEqual({
      id: "dynamicCodes",
      label: "Dynamic QR codes",
      used: 10,
      limit: 10,
      unit: "count",
    });
    expect(
      limitRequestMeter({ meterId: "dynamicCodes", used: 12 }, freeShell)?.used,
    ).toBe(12);
    expect(
      limitRequestMeter(
        { meterId: "savedThemes" },
        { caps: caps("pro", true), isTeam: true },
      ),
    ).toBeNull();
  });

  it("no card for a cap the plan doesn't have", () => {
    expect(
      limitRequestMeter(
        { meterId: "dynamicCodes" },
        { caps: caps("pro"), isTeam: false },
      ),
    ).toBeNull();
    expect(
      limitRequestMeter({ meterId: "customDomains" }, freeShell),
    ).toBeNull();
  });

  it("card in the shell; the message for a fixed cap; the upgrade dialog outside", () => {
    expect(
      limitResponse(
        { meterId: "dynamicCodes" },
        { hosted: true, limits: freeShell },
      ),
    ).toBe("card");
    expect(
      limitResponse(
        { meterId: "teamSeats" },
        {
          hosted: true,
          limits: { caps: caps("business", true), isTeam: true },
        },
      ),
    ).toBe("message");
    expect(
      limitResponse(
        { meterId: "dynamicCodes" },
        { hosted: false, limits: null },
      ),
    ).toBe("upgrade-dialog");
  });

  it("labels a team's themes as shared", () => {
    expect(meterLabel("savedThemes", { isTeam: true })).toBe("Shared themes");
    expect(meterLabel("savedThemes")).toBe("Saved themes");
  });
});
