// Run: cd apps/docs && npx tsx --test components/sections/pricing/plan-content.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlanLimits } from "@/lib/plans";
import {
  buildComparison,
  buildHighlights,
  formatBytes,
  formatDays,
  maxYearlySavingsPercent,
  type PlanLimitsByPlan,
  yearlySavingsPercent,
} from "./plan-content";

// The approved limits (01-DECISIONS-v2); lib/plans.ts can't be imported here
// (server-only + database).
const MB = 1024 * 1024;
const GB = 1024 * MB;
const UNLIMITED = Number.POSITIVE_INFINITY;

const base: PlanLimits = {
  dynamicCodes: 10,
  landingPages: 3,
  landingPageBadge: true,
  whiteLabel: false,
  customCss: false,
  storageBytes: 50 * MB,
  maxFileBytes: 10 * MB,
  analyticsRetentionDays: 90,
  rawScanRetentionDays: 90,
  customDomains: 0,
  teams: false,
  teamMembers: 1,
  folderPermissions: false,
  auditLog: false,
  linkControls: false,
  routing: false,
  pixels: false,
  conversions: false,
  emailAlerts: false,
  webhooks: false,
  formResponsesPerMonth: 50,
  apiRequestsPerDay: 1000,
  bulkApi: false,
  aiArtPerMonth: 3,
  aiArtPooled: false,
  savedThemes: 10,
  teamThemes: false,
  brandKits: 1,
};

const LIMITS: PlanLimitsByPlan = {
  free: base,
  pro: {
    ...base,
    dynamicCodes: UNLIMITED,
    landingPages: UNLIMITED,
    landingPageBadge: false,
    storageBytes: 5 * GB,
    maxFileBytes: 100 * MB,
    analyticsRetentionDays: 3 * 365,
    rawScanRetentionDays: 3 * 365,
    customDomains: 5,
    teams: true,
    teamMembers: 3,
    linkControls: true,
    routing: true,
    pixels: true,
    emailAlerts: true,
    formResponsesPerMonth: 1000,
    apiRequestsPerDay: 10_000,
    bulkApi: true,
    aiArtPerMonth: 30,
    savedThemes: UNLIMITED,
    teamThemes: true,
    brandKits: UNLIMITED,
  },
  business: {
    ...base,
    dynamicCodes: UNLIMITED,
    landingPages: UNLIMITED,
    landingPageBadge: false,
    whiteLabel: true,
    customCss: true,
    storageBytes: 50 * GB,
    maxFileBytes: 250 * MB,
    analyticsRetentionDays: UNLIMITED,
    rawScanRetentionDays: 395,
    customDomains: 25,
    teams: true,
    teamMembers: UNLIMITED,
    folderPermissions: true,
    auditLog: true,
    linkControls: true,
    routing: true,
    pixels: true,
    conversions: true,
    emailAlerts: true,
    webhooks: true,
    formResponsesPerMonth: 10_000,
    apiRequestsPerDay: 100_000,
    bulkApi: true,
    aiArtPerMonth: 150,
    aiArtPooled: true,
    savedThemes: UNLIMITED,
    teamThemes: true,
    brandKits: UNLIMITED,
  },
};

const findRow = (feature: string, currency: "USD" | "INR" = "USD") => {
  for (const group of buildComparison(LIMITS, currency)) {
    const match = group.rows.find((r) => r.feature === feature);
    if (match) return match.values;
  }
  throw new Error(`No row ${feature}`);
};

describe("formatters", () => {
  it("formats sizes and durations", () => {
    assert.equal(formatBytes(50 * MB), "50 MB");
    assert.equal(formatBytes(5 * GB), "5 GB");
    assert.equal(formatBytes(UNLIMITED), "Unlimited");
    assert.equal(formatDays(90), "90 days");
    assert.equal(formatDays(365), "1 year");
    assert.equal(formatDays(3 * 365), "3 years");
    assert.equal(formatDays(UNLIMITED), "Unlimited");
  });
});

describe("yearly savings", () => {
  it("compares the yearly price with 12 monthly payments", () => {
    assert.equal(yearlySavingsPercent("pro", "USD"), 20);
    assert.equal(yearlySavingsPercent("business", "USD"), 20);
    assert.equal(yearlySavingsPercent("pro", "INR"), 37);
    assert.equal(yearlySavingsPercent("business", "INR"), 30);
    assert.equal(maxYearlySavingsPercent("USD"), 20);
    assert.equal(maxYearlySavingsPercent("INR"), 37);
  });
});

describe("buildComparison", () => {
  it("shows prices in the display currency", () => {
    assert.deepEqual(findRow("Price"), {
      free: "$0",
      pro: "$5/mo or $48/yr",
      business: "$15/mo or $144/yr",
    });
    assert.deepEqual(findRow("Price", "INR"), {
      free: "₹0",
      pro: "₹199/mo or ₹1,499/yr",
      business: "₹599/mo or ₹4,999/yr",
    });
  });

  it("matches the approved plan table", () => {
    assert.deepEqual(findRow("Dynamic QR codes"), {
      free: "10",
      pro: "Unlimited",
      business: "Unlimited",
    });
    assert.deepEqual(findRow("Hosted landing pages"), {
      free: '3, with "Made with QRdx" footer',
      pro: "Unlimited, no footer",
      business: "Unlimited, white-label + custom CSS",
    });
    assert.deepEqual(findRow("File storage"), {
      free: "50 MB (10 MB per file)",
      pro: "5 GB (100 MB per file)",
      business: "50 GB (250 MB per file)",
    });
    assert.deepEqual(findRow("Analytics history"), {
      free: "90 days",
      pro: "3 years",
      business: "Unlimited (scan-level for 13 months, then daily totals)",
    });
    assert.deepEqual(findRow("Saved themes"), {
      free: "10",
      pro: "Unlimited, shared with your team",
      business: "Unlimited, shared with your team",
    });
    assert.deepEqual(findRow("Custom domains"), {
      free: false,
      pro: "5",
      business: "25",
    });
    assert.deepEqual(findRow("Team members"), {
      free: "1 (no teams)",
      pro: "3",
      business: "Unlimited",
    });
    assert.deepEqual(findRow("Form responses per month"), {
      free: "50",
      pro: "1,000",
      business: "10,000",
    });
    assert.deepEqual(findRow("API requests per day"), {
      free: "1,000",
      pro: "10,000 + bulk creation",
      business: "100,000 + bulk creation",
    });
    assert.deepEqual(findRow("AI art images per month"), {
      free: "3",
      pro: "30",
      business: "150, pooled per team",
    });
    assert.deepEqual(findRow("Retargeting pixels"), {
      free: false,
      pro: true,
      business: true,
    });
    assert.deepEqual(findRow("Conversion tracking"), {
      free: false,
      pro: false,
      business: true,
    });
    assert.deepEqual(findRow("Webhooks, Zapier and Slack"), {
      free: false,
      pro: false,
      business: true,
    });
  });

  it("marks planned features that aren't built yet", () => {
    assert.deepEqual(findRow("Audit log"), {
      free: false,
      pro: false,
      business: "Coming soon",
    });
  });
});

describe("buildHighlights", () => {
  it("lists the headline limits for each plan", () => {
    const highlights = buildHighlights(LIMITS);
    assert.ok(
      highlights.free.includes("10 dynamic QR codes with scan analytics"),
    );
    assert.ok(highlights.pro.includes("Teams of up to 3 people"));
    assert.ok(highlights.business.includes("25 custom domains"));
  });
});
