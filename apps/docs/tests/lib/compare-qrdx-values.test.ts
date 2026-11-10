// QRdx's side of the compare pages. Design counts are `{facts.*}` tokens
// (lib/product-facts.ts), but prices and plan limits are plain text: they
// live in lib/pricing.ts and the server-only lib/plans.ts, which the content
// schema can't load. These checks keep that text in step with the code.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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
