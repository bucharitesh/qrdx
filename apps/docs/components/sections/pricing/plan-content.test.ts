// Run: cd apps/docs && npx tsx --test components/sections/pricing/plan-content.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlanLimits } from "@/lib/plans";
import {
  buildComparison,
  buildHighlights,
  buildPricingDescription,
  buildPricingIntro,
  buildUpgradeHighlights,
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
  customSlugs: false,
  teams: false,
  teamMembers: 1,
  folderPermissions: false,
  sso: false,
  requireTwoFactor: false,
  auditLog: false,
  linkControls: false,
  routing: false,
  pixels: false,
  conversions: false,
  emailAlerts: false,
  webhooks: false,
  oauthApps: 1,
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
    customSlugs: true,
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
    customSlugs: true,
    teams: true,
    teamMembers: UNLIMITED,
    folderPermissions: true,
    sso: true,
    requireTwoFactor: true,
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
      business: "Unlimited",
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
    assert.deepEqual(findRow("Custom back-halves"), {
      free: false,
      pro: true,
      business: true,
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
    assert.deepEqual(findRow("Single sign-on"), {
      free: false,
      pro: false,
      business: true,
    });
  });

  it("only sells features that are built", () => {
    // Business has folderPermissions set, but it isn't built.
    const rows = buildComparison(LIMITS, "USD").flatMap((group) => group.rows);
    const features = rows.map((r) => r.feature);
    assert.ok(!features.includes("Folder permissions"));
    const cells = rows.flatMap((r) => Object.values(r.values));
    assert.ok(cells.every((cell) => !/soon/i.test(String(cell))));
    const lines = Object.values(buildHighlights(LIMITS)).flat();
    assert.ok(
      lines.every((line) => !/coming soon|folder permission/i.test(line)),
    );
  });

  it("lists the audit log on Business only where it's available", () => {
    assert.deepEqual(findRow("Audit log"), {
      free: false,
      pro: false,
      business: true,
    });
    assert.ok(
      buildHighlights(LIMITS).business.includes("Audit log with CSV export"),
    );
    const features = buildComparison(LIMITS, "USD", { auditLog: false })
      .flatMap((group) => group.rows)
      .map((row) => row.feature);
    assert.ok(!features.includes("Audit log"));
    assert.ok(
      !buildHighlights(LIMITS, { auditLog: false }).business.some((line) =>
        /audit log/i.test(line),
      ),
    );
  });

  it("drops the AI art row only where AI art isn't available", () => {
    const features = (aiArt?: boolean) =>
      buildComparison(LIMITS, "USD", aiArt === undefined ? {} : { aiArt })
        .flatMap((group) => group.rows)
        .map((row) => row.feature);
    assert.ok(features().includes("AI art images per month"));
    assert.ok(features(true).includes("AI art images per month"));
    assert.ok(!features(false).includes("AI art images per month"));
    assert.equal(features(false).length, features(true).length - 1);
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
    assert.ok(highlights.business.includes("Single sign-on (SAML and OIDC)"));
    assert.ok(!highlights.pro.some((line) => /single sign-on/i.test(line)));
  });

  it("only sells AI art where it's available", () => {
    const art = (lines: string[]) =>
      lines.some((line) => line.includes("AI art"));
    assert.ok(art(buildHighlights(LIMITS).business));
    assert.ok(!art(buildHighlights(LIMITS, { aiArt: false }).business));
  });
});

describe("features this deployment can't offer", () => {
  const rows = (options: Parameters<typeof buildComparison>[2]) =>
    buildComparison(LIMITS, "USD", options).flatMap((group) => group.rows);
  const features = (options: Parameters<typeof buildComparison>[2]) =>
    rows(options).map((row) => row.feature);

  it("drops each feature's comparison row only when it's off", () => {
    const cases = {
      aiThemes: "AI theme generations",
      customDomains: "Custom domains",
      fileStorage: "File storage",
      emailAlerts: "Email digests and alerts",
    } as const;
    for (const [option, feature] of Object.entries(cases)) {
      assert.ok(features({}).includes(feature), feature);
      assert.ok(features({ [option]: true }).includes(feature), feature);
      assert.ok(!features({ [option]: false }).includes(feature), feature);
      assert.equal(
        features({ [option]: false }).length,
        features({}).length - 1,
        feature,
      );
    }
  });

  it("drops Tag Manager from the pixels hint without custom domains", () => {
    const hint = (customDomains: boolean) =>
      rows({ customDomains }).find(
        (row) => row.feature === "Retargeting pixels",
      )?.hint;
    assert.match(hint(true) ?? "", /GTM/);
    assert.doesNotMatch(hint(false) ?? "", /GTM/);
  });

  it("keeps custom domains and storage off the plan cards when off", () => {
    const off = buildHighlights(LIMITS, {
      customDomains: false,
      fileStorage: false,
    });
    const lines = Object.values(off).flat();
    assert.ok(lines.every((line) => !/custom domain/i.test(line)));
    assert.ok(lines.every((line) => !/storage/i.test(line)));
    assert.ok(off.pro.includes("1,000 form responses a month"));
    assert.ok(buildHighlights(LIMITS).pro.includes("5 custom domains"));
  });

  it("builds the pricing intro and description from what's offered", () => {
    assert.equal(
      buildPricingIntro(),
      "Static QR codes are free forever. Paid plans add unlimited dynamic codes, longer analytics, custom domains and teams.",
    );
    assert.equal(
      buildPricingIntro({ customDomains: false }),
      "Static QR codes are free forever. Paid plans add unlimited dynamic codes, longer analytics and teams.",
    );
    assert.match(
      buildPricingDescription(),
      /analytics history, custom domains and teams/,
    );
    assert.doesNotMatch(
      buildPricingDescription({ customDomains: false }),
      /custom domain/,
    );
  });

  it("keeps custom domains out of the upgrade dialog when off", () => {
    const on = Object.values(buildUpgradeHighlights()).flat();
    const off = Object.values(
      buildUpgradeHighlights({ customDomains: false }),
    ).flat();
    assert.ok(on.some((line) => /custom domains/.test(line)));
    assert.ok(off.every((line) => !/custom domain/i.test(line)));
    assert.ok(off.includes("Teams of up to 3"));
    assert.ok(off.includes("Unlimited team members"));
  });
});
