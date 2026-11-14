// How far back each plan's scan analytics reach (lib/scan-history.ts, read by
// lib/plans.ts), the planned raw-scan threshold beside it, and the promise the
// copy makes: scans are kept as long as their code exists, so an upgrade
// shows the older ones again.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PLAN_LIMITS, PLANS, UNLIMITED } from "@/lib/plans";
import { PRODUCT_FACTS } from "@/lib/product-facts";
import {
  FREE_SCAN_HISTORY_YEARS,
  SCAN_HISTORY_DAYS,
  scanHistoryLabel,
  scanHistoryYears,
} from "@/lib/scan-history";

const app = join(import.meta.dirname, "..", "..");

describe("scan history by plan", () => {
  it("is 1 year on Free and unlimited on Pro and Business", () => {
    expect(PLAN_LIMITS.free.analyticsRetentionDays).toBe(365);
    expect(PLAN_LIMITS.pro.analyticsRetentionDays).toBe(UNLIMITED);
    expect(PLAN_LIMITS.business.analyticsRetentionDays).toBe(UNLIMITED);
  });

  it("comes from lib/scan-history.ts, which copy quotes", () => {
    for (const plan of PLANS) {
      expect(PLAN_LIMITS[plan].analyticsRetentionDays, plan).toBe(
        SCAN_HISTORY_DAYS[plan],
      );
    }
    expect(FREE_SCAN_HISTORY_YEARS).toBe(1);
    expect(PRODUCT_FACTS.freeScanHistoryYears).toBe(FREE_SCAN_HISTORY_YEARS);
  });

  it("never gets shorter on a more expensive plan", () => {
    for (const [index, plan] of PLANS.entries()) {
      if (index === 0) continue;
      const cheaper = PLANS[index - 1] as (typeof PLANS)[number];
      expect(PLAN_LIMITS[plan].analyticsRetentionDays).toBeGreaterThanOrEqual(
        PLAN_LIMITS[cheaper].analyticsRetentionDays,
      );
    }
  });

  it("keeps the planned raw-scan threshold coherent", () => {
    for (const [index, plan] of PLANS.entries()) {
      const window = PLAN_LIMITS[plan].analyticsRetentionDays;
      const raw = PLAN_LIMITS[plan].rawScanRetentionDays;
      // A finite window is raw scans all the way back: rollups, once built,
      // would only touch scans the plan doesn't show.
      if (Number.isFinite(window))
        expect(raw, plan).toBeGreaterThanOrEqual(window);
      // A pricier plan never rolls scans up sooner.
      if (index > 0) {
        const cheaper = PLANS[index - 1] as (typeof PLANS)[number];
        expect(raw, plan).toBeGreaterThanOrEqual(
          PLAN_LIMITS[cheaper].rawScanRetentionDays,
        );
      }
    }
    // Both keep the whole history, so they share one threshold.
    expect(PLAN_LIMITS.pro.rawScanRetentionDays).toBe(
      PLAN_LIMITS.business.rawScanRetentionDays,
    );
  });
});

describe("scanHistoryLabel", () => {
  it("writes days, years and unlimited as English copy does", () => {
    expect(scanHistoryLabel(365)).toBe("1 year");
    expect(scanHistoryLabel(3 * 365)).toBe("3 years");
    expect(scanHistoryLabel(90)).toBe("90 days");
    expect(scanHistoryLabel(1)).toBe("1 day");
    expect(scanHistoryLabel(UNLIMITED)).toBe("unlimited");
    expect(scanHistoryYears(730)).toBe(2);
    expect(scanHistoryYears(90)).toBeNull();
    expect(scanHistoryYears(UNLIMITED)).toBeNull();
  });
});

describe("scans are kept as long as their code exists", () => {
  /** Every TypeScript file of the app's server code. */
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        return name === "node_modules" ? [] : sources(path);
      }
      return /\.tsx?$/.test(name) ? [path] : [];
    });

  it("has no code that deletes scans by age or plan", () => {
    // Scans go only with their code (qr_scan.qr_code_id ON DELETE CASCADE),
    // which the owner deletes. A purge or rollup job would show up here, and
    // the copy saying older scans come back after an upgrade must change.
    const deleting = ["app", "lib", "ee", "scripts"]
      .flatMap((dir) => sources(join(app, dir)))
      .filter((file) =>
        /\.delete\(\s*qrScan\b|DELETE\s+FROM\s+"?qr_scan"?/i.test(
          readFileSync(file, "utf8"),
        ),
      );
    expect(deleting).toEqual([]);
  });
});
