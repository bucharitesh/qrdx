// QRdx's side of the compare pages. Design counts are `{facts.*}` tokens
// (lib/product-facts.ts), but prices and plan limits are plain text: they
// live in lib/pricing.ts and the server-only lib/plans.ts, which the content
// schema can't load. These checks keep that text in step with the code.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AI_ART_PRESETS } from "@/components/sections/ai-art/presets";
import { PLAN_LIMITS, UNLIMITED } from "@/lib/plans";
import { type BillingInterval, PAID_PLANS, PRICING } from "@/lib/pricing";
import { QR_TYPES } from "@/lib/qr-types-content";

const COMPARE = join(import.meta.dirname, "..", "..", "content", "compare");

const pages = readdirSync(COMPARE).filter((file) => file.endsWith(".mdx"));

const unquote = (value: string) => value.trim().replace(/^"(.*)"$/, "$1");

/** qrdxPlan and every tableRows `qrdx:` string, keyed by feature. */
function qrdxValues(text: string): Map<string, string> {
  const values = new Map<string, string>();
  let feature = "";
  for (const line of text.split("\n")) {
    const plan = /^qrdxPlan:\s*(.+)$/.exec(line);
    if (plan) values.set("qrdxPlan", unquote(plan[1] as string));
    const row = /^\s+- feature:\s*(.+)$/.exec(line);
    if (row) feature = unquote(row[1] as string);
    const cell = /^\s+qrdx:\s*(".*")\s*$/.exec(line);
    if (cell && feature) values.set(feature, unquote(cell[1] as string));
  }
  return values;
}

const usd = (plan: "pro" | "business", interval: BillingInterval) =>
  `$${PRICING[plan][interval].amounts.USD}`;

describe("compare pages", () => {
  const prices: Record<"mo" | "yr", string[]> = {
    mo: PAID_PLANS.map((plan) => usd(plan, "month")),
    yr: PAID_PLANS.map((plan) => usd(plan, "year")),
  };

  it.each(pages)("%s quotes QRdx prices from lib/pricing.ts", (file) => {
    const text = readFileSync(join(COMPARE, file), "utf8");
    for (const [feature, value] of qrdxValues(text)) {
      for (const match of value.matchAll(/(\$\d+)\/(mo|yr)\b/g)) {
        const [, amount, unit] = match as unknown as [
          string,
          string,
          "mo" | "yr",
        ];
        expect(prices[unit], `${feature}: ${value}`).toContain(amount);
      }
    }
  });
});

describe.each(["qr-io.mdx", "qr-code-creator.mdx"])(
  "%s (trial-then-paid compare page)",
  (file) => {
    const text = readFileSync(join(COMPARE, file), "utf8");
    const rows = qrdxValues(text);
    const { free, pro, business } = PLAN_LIMITS;
    const years = (days: number) => days / 365;
    const count = (n: number) => n.toLocaleString("en-US");

    it("states plan limits and prices that match the code", () => {
      expect(pro.dynamicCodes).toBe(UNLIMITED);
      expect(pro.landingPages).toBe(UNLIMITED);
      expect(business.analyticsRetentionDays).toBe(UNLIMITED);
      expect(business.teamMembers).toBe(UNLIMITED);
      expect(business.whiteLabel).toBe(true);

      expect(rows.get("qrdxPlan")).toBe(
        `Free · Pro from ${usd("pro", "month")}/mo`,
      );
      expect(rows.get("Price")).toBe(
        `Free; Pro ${usd("pro", "month")}/mo or ${usd("pro", "year")}/yr; Business ${usd("business", "month")}/mo or ${usd("business", "year")}/yr`,
      );
      expect(rows.get("QR types")).toBe(`${QR_TYPES.length} static types`);
      expect(rows.get("Dynamic (editable) codes")).toBe(
        `${free.dynamicCodes} free; unlimited on Pro`,
      );
      expect(rows.get("Scan analytics")).toBe(
        `${free.analyticsRetentionDays} days free; ${years(pro.analyticsRetentionDays)} years on Pro; unlimited on Business`,
      );
      expect(rows.get("Team members")).toBe(
        `${pro.teamMembers} on Pro, unlimited on Business`,
      );
      expect(rows.get("API")).toBe(
        `${count(free.apiRequestsPerDay)} requests a day free; ${count(pro.apiRequestsPerDay)} on Pro`,
      );
    });

    it("uses the same numbers in the highlights and the body", () => {
      for (const phrase of [
        `QRdx Free has no time limit and includes ${free.dynamicCodes} dynamic codes and ${free.landingPages} hosted pages.`,
        `The Free plan adds ${free.dynamicCodes} dynamic codes and ${free.landingPages} hosted pages.`,
        `Pro (${usd("pro", "month")}/mo or ${usd("pro", "year")}/yr) makes both unlimited`,
        `Business (${usd("business", "month")}/mo or ${usd("business", "year")}/yr) adds unlimited team members and white-label pages`,
        `QRdx Pro is ${usd("pro", "month")} a month or ${usd("pro", "year")} a year for unlimited dynamic codes`,
        `The QRdx REST API allows ${count(free.apiRequestsPerDay)} requests a day on Free and ${count(pro.apiRequestsPerDay)} on Pro`,
      ]) {
        expect(text).toContain(phrase);
      }
    });
  },
);

describe("QR.io compare page", () => {
  const text = readFileSync(join(COMPARE, "qr-io.mdx"), "utf8");
  const { free } = PLAN_LIMITS;

  it("states hosted-page limits and Business pricing that match the code", () => {
    expect(qrdxValues(text).get("Hosted pages")).toBe(
      `${free.landingPages} free; unlimited on Pro`,
    );
    expect(text).toContain(
      `Business is ${usd("business", "month")} a month or ${usd("business", "year")} a year with unlimited team members.`,
    );
  });
});

describe("QR Code Creator compare page", () => {
  const text = readFileSync(join(COMPARE, "qr-code-creator.mdx"), "utf8");
  const { free } = PLAN_LIMITS;

  it("only says scans are unlimited while no plan limit caps them", () => {
    // Retention is the only scan-related limit; a scan cap would show up here.
    const scanLimits = Object.keys(free).filter((key) => /scan/i.test(key));
    expect(scanLimits).toEqual(["rawScanRetentionDays"]);
    expect(qrdxValues(text).get("Scans")).toBe("Unlimited on every plan");
  });

  it("uses the Free dynamic-code limit in the body", () => {
    expect(text).toContain(
      `QRdx Free has ${free.dynamicCodes}, although they don't expire.`,
    );
  });
});

describe("LatestQR compare page", () => {
  const text = readFileSync(join(COMPARE, "latestqr.mdx"), "utf8");
  const rows = qrdxValues(text);
  const { free, pro, business } = PLAN_LIMITS;
  const years = (days: number) => days / 365;

  it("states plan limits and prices that match the code", () => {
    expect(pro.dynamicCodes).toBe(UNLIMITED);
    expect(pro.landingPages).toBe(UNLIMITED);
    expect(business.analyticsRetentionDays).toBe(UNLIMITED);
    expect(business.teamMembers).toBe(UNLIMITED);
    expect(business.whiteLabel).toBe(true);

    expect(rows.get("qrdxPlan")).toBe(
      `Free · Pro from ${usd("pro", "month")}/mo`,
    );
    expect(rows.get("Price")).toBe(
      `Free; Pro ${usd("pro", "month")}/mo or ${usd("pro", "year")}/yr; Business ${usd("business", "month")}/mo or ${usd("business", "year")}/yr`,
    );
    expect(rows.get("QR types")).toBe(`${QR_TYPES.length} static types`);
    expect(rows.get("Dynamic (editable) codes")).toBe(
      `${free.dynamicCodes} free; unlimited on Pro`,
    );
    expect(rows.get("Scan analytics")).toBe(
      `${free.analyticsRetentionDays} days free; ${years(pro.analyticsRetentionDays)} years on Pro; unlimited on Business`,
    );
    expect(rows.get("Hosted pages")).toBe(
      `${free.landingPages} free; unlimited on Pro`,
    );
  });

  it("uses the same numbers in the highlights and the body", () => {
    for (const phrase of [
      `The Free plan includes ${free.dynamicCodes}, and Pro makes them unlimited.`,
      `keeps ${free.analyticsRetentionDays} days of history on Free, ${years(pro.analyticsRetentionDays)} years on Pro and all of it on Business`,
      `The Free plan adds ${free.dynamicCodes} dynamic codes and ${free.landingPages} hosted pages.`,
      `Pro (${usd("pro", "month")}/mo or ${usd("pro", "year")}/yr) makes both unlimited`,
      `Business (${usd("business", "month")}/mo or ${usd("business", "year")}/yr) adds unlimited team members and white-label pages`,
    ]) {
      expect(text).toContain(phrase);
    }
  });
});

describe("QR Code AI compare page", () => {
  const text = readFileSync(join(COMPARE, "qrcode-ai.mdx"), "utf8");
  const rows = qrdxValues(text);
  const { free, pro, business } = PLAN_LIMITS;
  const years = (days: number) => days / 365;
  const perDay = (requests: number) => requests.toLocaleString("en-US");

  it("states plan limits and prices that match the code", () => {
    expect(pro.dynamicCodes).toBe(UNLIMITED);
    expect(pro.landingPages).toBe(UNLIMITED);
    expect(business.analyticsRetentionDays).toBe(UNLIMITED);
    expect(business.teamMembers).toBe(UNLIMITED);
    expect(business.whiteLabel).toBe(true);
    expect(business.aiArtPooled).toBe(true);

    expect(rows.get("qrdxPlan")).toBe(
      `Free · Pro from ${usd("pro", "month")}/mo`,
    );
    expect(rows.get("Price")).toBe(
      `Free; Pro ${usd("pro", "month")}/mo or ${usd("pro", "year")}/yr; Business ${usd("business", "month")}/mo or ${usd("business", "year")}/yr`,
    );
    expect(rows.get("QR types")).toBe(`${QR_TYPES.length} static types`);
    expect(rows.get("Dynamic (editable) codes")).toBe(
      `${free.dynamicCodes} free; unlimited on Pro`,
    );
    expect(rows.get("Scan analytics")).toBe(
      `${free.analyticsRetentionDays} days free; ${years(pro.analyticsRetentionDays)} years on Pro; unlimited on Business`,
    );
    expect(rows.get("Hosted pages")).toBe(
      `${free.landingPages} free; unlimited on Pro`,
    );
    expect(rows.get("AI art")).toBe(
      `${free.aiArtPerMonth} images a month free; ${pro.aiArtPerMonth} on Pro; ${business.aiArtPerMonth} shared on Business`,
    );
    expect(rows.get("Custom domains")).toBe(
      `${pro.customDomains} on Pro; ${business.customDomains} on Business`,
    );
  });

  it("uses the same numbers in the highlights and the body", () => {
    for (const phrase of [
      `QRdx Free includes ${free.dynamicCodes} dynamic codes with no time limit.`,
      `QRdx Pro is ${usd("pro", "month")}/mo or ${usd("pro", "year")}/yr, and Business is ${usd("business", "month")}/mo or ${usd("business", "year")}/yr.`,
      `its Free plan keeps up to ${free.dynamicCodes} dynamic codes working with no time limit`,
      `The Free plan adds ${free.dynamicCodes} dynamic codes, ${free.landingPages} hosted pages and ${free.aiArtPerMonth} AI art images a month, with no trial.`,
      `Pro (${usd("pro", "month")}/mo or ${usd("pro", "year")}/yr) makes codes and pages unlimited`,
      `Business (${usd("business", "month")}/mo or ${usd("business", "year")}/yr) adds unlimited team members and white-label pages`,
      `${free.aiArtPerMonth} images a month on Free and ${pro.aiArtPerMonth} on Pro, from a much shorter list of style presets`,
      `keeps ${free.analyticsRetentionDays} days of scan history on Free, ${years(pro.analyticsRetentionDays)} years on Pro and all of it on Business`,
      `(${perDay(free.apiRequestsPerDay)} requests a day on Free, ${perDay(pro.apiRequestsPerDay)} on Pro)`,
    ]) {
      expect(text).toContain(phrase);
    }
  });

  it("stays true where it says QR Code AI is ahead", () => {
    // "a much shorter list of style presets" than its 1,200+ templates
    expect(text).toContain("advertises 1,200+ templates");
    expect(AI_ART_PRESETS.length).toBeLessThan(1200 / 10);
    // The help page is the source for "No uptime SLA yet"
    expect(rows.get("Uptime commitment")).toBe("No uptime SLA yet");
    expect(
      readFileSync(join(COMPARE, "..", "docs", "help", "contact.mdx"), "utf8"),
    ).toContain("QRdx doesn't offer an uptime SLA yet");
  });
});

describe("MyQRCode compare page", () => {
  const text = readFileSync(join(COMPARE, "myqrcode.mdx"), "utf8");
  const rows = qrdxValues(text);
  const { free, pro, business } = PLAN_LIMITS;
  const years = (days: number) => days / 365;

  it("states plan limits and prices that match the code", () => {
    expect(pro.dynamicCodes).toBe(UNLIMITED);
    expect(pro.landingPages).toBe(UNLIMITED);
    expect(business.analyticsRetentionDays).toBe(UNLIMITED);
    expect(business.teamMembers).toBe(UNLIMITED);
    expect(business.whiteLabel).toBe(true);
    // "custom domains and white-label pages need Pro or Business"
    expect(free.customDomains).toBe(0);
    expect(pro.customDomains).toBeGreaterThan(0);
    expect(free.whiteLabel).toBe(false);
    expect(pro.whiteLabel).toBe(false);
    // "QRdx bills monthly or yearly, and yearly works out cheaper"
    for (const plan of PAID_PLANS) {
      expect(PRICING[plan].year.amounts.USD).toBeLessThan(
        12 * PRICING[plan].month.amounts.USD,
      );
    }
    // The REST API row says every plan, Free included
    expect(free.apiRequestsPerDay).toBeGreaterThan(0);

    expect(rows.get("qrdxPlan")).toBe(
      `Free · Pro from ${usd("pro", "month")}/mo`,
    );
    expect(rows.get("Price")).toBe(
      `Free; Pro ${usd("pro", "month")}/mo or ${usd("pro", "year")}/yr; Business ${usd("business", "month")}/mo or ${usd("business", "year")}/yr`,
    );
    expect(rows.get("QR types")).toBe(`${QR_TYPES.length} static types`);
    expect(rows.get("Dynamic (editable) codes")).toBe(
      `${free.dynamicCodes} free; unlimited on Pro`,
    );
    expect(rows.get("Scan analytics")).toBe(
      `${free.analyticsRetentionDays} days free; ${years(pro.analyticsRetentionDays)} years on Pro; unlimited on Business`,
    );
  });

  it("uses the same numbers in the metadata, highlights and body", () => {
    for (const phrase of [
      `QRdx has a free plan, Pro at ${usd("pro", "month")}/mo`,
      `QRdx Free has no time limit and includes ${free.dynamicCodes} dynamic codes and ${free.landingPages} hosted pages`,
      `QRdx Pro is ${usd("pro", "month")}/mo or ${usd("pro", "year")}/yr with unlimited dynamic codes and hosted pages.`,
      `title: Monthly billing from ${usd("pro", "month")}`,
      `The Free plan adds ${free.dynamicCodes} dynamic codes and ${free.landingPages} hosted pages.`,
      `Pro (${usd("pro", "month")}/mo or ${usd("pro", "year")}/yr) makes both unlimited`,
      `Business (${usd("business", "month")}/mo or ${usd("business", "year")}/yr) adds unlimited team members and white-label pages`,
      `the Free plan includes ${free.dynamicCodes} dynamic codes.`,
    ]) {
      expect(text).toContain(phrase);
    }
  });
});

describe("Pageloot compare page", () => {
  const text = readFileSync(join(COMPARE, "pageloot.mdx"), "utf8");
  const rows = qrdxValues(text);
  const { free, pro, business } = PLAN_LIMITS;
  const years = (days: number) => days / 365;

  it("states plan limits and prices that match the code", () => {
    expect(pro.dynamicCodes).toBe(UNLIMITED);
    expect(pro.landingPages).toBe(UNLIMITED);
    expect(business.dynamicCodes).toBe(UNLIMITED);
    expect(business.landingPages).toBe(UNLIMITED);
    expect(business.analyticsRetentionDays).toBe(UNLIMITED);
    expect(business.teamMembers).toBe(UNLIMITED);
    expect(business.whiteLabel).toBe(true);
    // Smart routing is a Pro feature; the REST API is on every plan
    expect(free.routing).toBe(false);
    expect(pro.routing).toBe(true);
    expect(free.apiRequestsPerDay).toBeGreaterThan(0);

    expect(rows.get("qrdxPlan")).toBe(
      `Free · Pro from ${usd("pro", "month")}/mo`,
    );
    expect(rows.get("Price")).toBe(
      `Free; Pro ${usd("pro", "month")}/mo or ${usd("pro", "year")}/yr; Business ${usd("business", "month")}/mo or ${usd("business", "year")}/yr`,
    );
    expect(rows.get("Dynamic (editable) codes")).toBe(
      `${free.dynamicCodes} free; unlimited on Pro`,
    );
    expect(rows.get("Scan history")).toBe(
      `${free.analyticsRetentionDays} days free; ${years(pro.analyticsRetentionDays)} years on Pro; unlimited on Business`,
    );
    expect(rows.get("Team members")).toBe(
      `${free.teamMembers} free; ${pro.teamMembers} on Pro; unlimited on Business`,
    );
    expect(rows.get("Hosted pages")).toBe(
      `${free.landingPages} free; unlimited on Pro`,
    );
  });

  it("uses the same numbers in the metadata, highlights and body", () => {
    for (const phrase of [
      `QRdx has a free plan with ${free.dynamicCodes} dynamic codes and unlimited codes on ${usd("pro", "month")}/mo Pro.`,
      `unlimited dynamic codes from ${usd("pro", "month")}/mo.`,
      `title: Unlimited dynamic codes from ${usd("pro", "month")}`,
      `QRdx Pro is ${usd("pro", "month")}/mo or ${usd("pro", "year")}/yr with unlimited dynamic codes and hosted pages.`,
      `QRdx Free has no time limit and includes ${free.dynamicCodes} dynamic codes and ${free.landingPages} hosted pages.`,
      `The Free plan adds ${free.dynamicCodes} dynamic codes and ${free.landingPages} hosted pages.`,
      `Pro (${usd("pro", "month")}/mo or ${usd("pro", "year")}/yr) makes both unlimited`,
      `Business (${usd("business", "month")}/mo or ${usd("business", "year")}/yr) adds unlimited team members and white-label pages`,
      `QRdx keeps ${free.analyticsRetentionDays} days on Free, ${years(pro.analyticsRetentionDays)} years on Pro and everything on Business.`,
      `QRdx Free includes ${free.dynamicCodes} dynamic codes with no time limit.`,
    ]) {
      expect(text).toContain(phrase);
    }
  });
});
