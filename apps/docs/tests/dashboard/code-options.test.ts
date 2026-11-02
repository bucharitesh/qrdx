import { describe, expect, it } from "vitest";
import {
  CODE_OPTION_ANCHORS,
  CODE_OPTION_IDS,
  CODE_OPTION_LIMITS,
  codeOptionStatus,
  codeOptionsFor,
  formatPlanList,
  resolveCodeOptionPlans,
} from "@/app/dashboard/codes/_lib/code-options";
import {
  codeTabHref,
  resolveCodeTab,
} from "@/app/dashboard/codes/_lib/code-tabs";
import { cheapestPlanWith, PLAN_LIMITS, PLANS, plansWith } from "@/lib/plans";
import type { PixelConfig, RoutingConfig } from "@/lib/redirect/routing";

describe("code option plans", () => {
  it("names the cheapest plan from lib/plans.ts, never a fixed one", () => {
    const { options } = resolveCodeOptionPlans(PLAN_LIMITS, PLANS, "free");
    for (const id of CODE_OPTION_IDS) {
      const key = CODE_OPTION_LIMITS[id];
      const cheapest = PLANS.find((plan) => PLAN_LIMITS[plan][key]);
      expect(options[id].requiredPlan).toBe(
        cheapest === "free" ? null : (cheapest ?? null),
      );
      expect(options[id].plans).toEqual(
        PLANS.filter((plan) => PLAN_LIMITS[plan][key]),
      );
    }
  });

  it("marks what the workspace's plan includes", () => {
    for (const plan of PLANS) {
      const resolved = resolveCodeOptionPlans(PLAN_LIMITS, PLANS, plan);
      expect(resolved.plan).toBe(plan);
      for (const id of CODE_OPTION_IDS) {
        expect(resolved.options[id].included).toBe(
          PLAN_LIMITS[plan][CODE_OPTION_LIMITS[id]],
        );
      }
    }
  });

  it("follows a change to the limits table", () => {
    const limits = {
      free: {
        ...PLAN_LIMITS.free,
        routing: true,
        linkControls: false,
        pixels: false,
        conversions: false,
      },
      pro: {
        ...PLAN_LIMITS.pro,
        routing: true,
        linkControls: false,
        pixels: true,
        conversions: false,
      },
      business: {
        ...PLAN_LIMITS.business,
        routing: true,
        linkControls: true,
        pixels: true,
        conversions: true,
      },
    };
    const { options } = resolveCodeOptionPlans(limits, PLANS, "pro");
    expect(options.utm).toEqual({
      plans: ["free", "pro", "business"],
      requiredPlan: null,
      included: true,
    });
    expect(options.password.requiredPlan).toBe("business");
    expect(options.password.included).toBe(false);
    expect(options.pixels.requiredPlan).toBe("pro");
  });

  it("names the plans for the cap, custom domains and back-halves from lib/plans.ts", () => {
    const { upgrades } = resolveCodeOptionPlans(PLAN_LIMITS, PLANS, "free");
    expect(upgrades.unlimitedCodes).toBe(
      PLANS.find((plan) => !Number.isFinite(PLAN_LIMITS[plan].dynamicCodes)) ??
        null,
    );
    expect(upgrades.customDomains).toEqual(
      PLANS.filter((plan) => PLAN_LIMITS[plan].customDomains > 0),
    );
    expect(upgrades.customSlugs).toEqual(
      PLANS.filter((plan) => PLAN_LIMITS[plan].customSlugs),
    );

    const changed = {
      free: { ...PLAN_LIMITS.free },
      pro: { ...PLAN_LIMITS.pro, dynamicCodes: 500, customDomains: 0 },
      business: { ...PLAN_LIMITS.business },
    };
    const moved = resolveCodeOptionPlans(changed, PLANS, "free").upgrades;
    expect(moved.unlimitedCodes).toBe("business");
    expect(moved.customDomains).toEqual(["business"]);
  });

  it("joins plan names for the note above a panel", () => {
    expect(formatPlanList(["pro", "business"])).toBe("Pro and Business");
    expect(formatPlanList(["business"])).toBe("Business");
    expect(formatPlanList(["free", "pro", "business"])).toBe(
      "Free, Pro and Business",
    );
    expect(formatPlanList([])).toBe("");
  });
});

describe("options per code kind", () => {
  it("offers routing and tagging only on website links", () => {
    expect(codeOptionsFor("redirect")).toEqual([
      "utm",
      "routing",
      "ab",
      "password",
      "schedule",
      "conversions",
    ]);
    expect(codeOptionsFor("page")).toEqual(["password", "schedule", "pixels"]);
  });

  it("links every option to a Settings tab anchor", () => {
    for (const id of CODE_OPTION_IDS) {
      expect(CODE_OPTION_ANCHORS[id]).toMatch(/^[a-z]+$/);
    }
  });
});

const rule = (
  type: "redirect" | "split",
  enabled = true,
): RoutingConfig["rules"][number] => ({
  id: `${type}-${enabled}`,
  enabled,
  conditions: [],
  action:
    type === "redirect"
      ? { type, url: "https://example.com/a" }
      : {
          type,
          variants: [
            { id: "a", url: "https://example.com/a", weight: 50 },
            { id: "b", url: "https://example.com/b", weight: 50 },
          ],
        },
});

const pixels = (patch: Partial<PixelConfig>): Partial<PixelConfig> => ({
  consent: "auto",
  conversions: false,
  ...patch,
});

describe("codeOptionStatus", () => {
  it("is all off without settings", () => {
    const status = codeOptionStatus(null, null);
    expect(Object.values(status).every((on) => !on)).toBe(true);
  });

  it("tells routing rules from A/B splits and skips disabled rules", () => {
    const status = codeOptionStatus(
      {
        routing: {
          rules: [rule("redirect", false), rule("split")],
        },
        utm: null,
        pixels: null,
      },
      null,
    );
    expect(status.routing).toBe(false);
    expect(status.ab).toBe(true);
  });

  it("counts UTM fields and custom parameters", () => {
    const base = { routing: null, pixels: null };
    expect(codeOptionStatus({ ...base, utm: { params: [] } }, null).utm).toBe(
      false,
    );
    expect(
      codeOptionStatus({ ...base, utm: { source: "qr", params: [] } }, null)
        .utm,
    ).toBe(true);
    expect(
      codeOptionStatus(
        { ...base, utm: { params: [{ key: "ref", value: "poster" }] } },
        null,
      ).utm,
    ).toBe(true);
  });

  it("reads pixels and conversions separately", () => {
    const base = { routing: null, utm: null };
    const meta = codeOptionStatus(
      { ...base, pixels: pixels({ meta: "1234567" }) },
      null,
    );
    expect(meta.pixels).toBe(true);
    expect(meta.conversions).toBe(false);
    const sales = codeOptionStatus(
      { ...base, pixels: pixels({ conversions: true }) },
      null,
    );
    expect(sales.pixels).toBe(false);
    expect(sales.conversions).toBe(true);
  });

  it("reads password and dates from the lifecycle view", () => {
    expect(
      codeOptionStatus(null, {
        hasPassword: true,
        startsAt: null,
        expiresAt: null,
      }),
    ).toMatchObject({ password: true, schedule: false });
    expect(
      codeOptionStatus(null, {
        hasPassword: false,
        startsAt: null,
        expiresAt: "2026-12-01T00:00:00.000Z",
      }),
    ).toMatchObject({ password: false, schedule: true });
  });
});

describe("code page tabs", () => {
  it("opens Overview by default", () => {
    expect(resolveCodeTab({})).toBe("overview");
    expect(resolveCodeTab({ tab: "nope" })).toBe("overview");
  });

  it("honors the tab parameter", () => {
    expect(resolveCodeTab({ tab: "settings" })).toBe("settings");
    expect(resolveCodeTab({ tab: ["analytics", "settings"] })).toBe(
      "analytics",
    );
    expect(resolveCodeTab({ tab: "overview", range: "30d" })).toBe("overview");
  });

  it("keeps old analytics links on Analytics", () => {
    expect(resolveCodeTab({ range: "30d" })).toBe("analytics");
    expect(resolveCodeTab({ tz: "Europe/Paris" })).toBe("analytics");
  });

  it("builds tab links", () => {
    expect(codeTabHref("c 1", "overview")).toBe("/dashboard/codes/c%201");
    expect(codeTabHref("c1", "analytics", { params: { range: "7d" } })).toBe(
      "/dashboard/codes/c1?tab=analytics&range=7d",
    );
    expect(codeTabHref("c1", "settings", { hash: "utm" })).toBe(
      "/dashboard/codes/c1?tab=settings#utm",
    );
  });
});

describe("plansWith / cheapestPlanWith (lib/plans.ts)", () => {
  it("reads plan names for upgrade copy from the limits table", () => {
    expect(plansWith((limits) => limits.customSlugs)).toEqual(
      PLANS.filter((plan) => PLAN_LIMITS[plan].customSlugs),
    );
    expect(cheapestPlanWith((limits) => limits.conversions)).toBe(
      PLANS.find((plan) => PLAN_LIMITS[plan].conversions),
    );
    expect(
      cheapestPlanWith((limits) => !Number.isFinite(limits.dynamicCodes)),
    ).toBe(
      PLANS.find((plan) => !Number.isFinite(PLAN_LIMITS[plan].dynamicCodes)),
    );
    expect(cheapestPlanWith(() => false)).toBeNull();
    expect(plansWith(() => false)).toEqual([]);
  });
});
