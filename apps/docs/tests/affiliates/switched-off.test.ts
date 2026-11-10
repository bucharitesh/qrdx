// The affiliate program merges switched off. With QRDX_AFFILIATES unset (the
// vitest config drops every QRDX_ variable, and the real
// lib/feature-availability reads the environment here), nothing of it runs:
// no attribution in the user-create hook, no webhook step, no daily release,
// the referral link goes home without a code and without touching the
// database, /affiliates and Settings → Affiliate program are 404s, and the
// settings tab is hidden. No affiliate table is ever read: every one of them
// "doesn't exist" here, so any query would show up as missing_tables.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  // Whatever another suite in this worker set: the switch is off here.
  delete process.env.QRDX_AFFILIATES;
});

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: () => {
    throw new Error("outside a request");
  },
}));

import {
  recordNewUserReferral,
  registerNewUserReferralRecorder,
} from "@repo/auth/referral";
import { REFERRAL_HEADER } from "@repo/auth/referral-keys";
import { GET as referralLink } from "@/app/r/[code]/route";
import { recordSignUpReferral } from "@/lib/affiliates/attribution-hook";
import {
  handleAffiliateWebhook,
  releaseHeldCommissions,
} from "@/lib/affiliates/commissions";
import {
  isFeatureAvailable,
  isPathAvailable,
} from "@/lib/feature-availability";
import { fakeDb, repoDatabase } from "../support/fake-db";
import { polarOrder } from "./seed";

const AFFILIATE_TABLES = [
  "affiliate",
  "affiliateReferral",
  "affiliateCommission",
  "affiliatePayout",
  "affiliateRefundedOrder",
];

const database = repoDatabase.database as Record<
  "select" | "insert" | "update" | "delete",
  (...args: unknown[]) => unknown
>;

beforeEach(() => {
  fakeDb.resetAll();
  fakeDb.missing(...AFFILIATE_TABLES, "subscription");
  for (const method of ["select", "insert", "update", "delete"] as const) {
    vi.spyOn(database, method);
  }
});

function expectNoQueries() {
  for (const method of ["select", "insert", "update", "delete"] as const) {
    expect(database[method]).not.toHaveBeenCalled();
  }
}

describe("QRDX_AFFILIATES unset", () => {
  it("leaves the program off", () => {
    expect(process.env.QRDX_AFFILIATES).toBeUndefined();
    expect(isFeatureAvailable("affiliates")).toBe(false);
  });

  it("attributes nothing in the user-create hook", async () => {
    registerNewUserReferralRecorder(recordSignUpReferral);
    recordNewUserReferral(
      { id: "user_new", email: "new@example.com" },
      { headers: new Headers({ [REFERRAL_HEADER]: "ana-diaz-4k2p" }) },
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expectNoQueries();
  });

  it("runs no webhook step for any event, and no daily release", async () => {
    for (const type of [
      "order.paid",
      "order.refunded",
      "refund.created",
      "refund.updated",
    ]) {
      expect(
        await handleAffiliateWebhook({
          type,
          timestamp: "2026-11-10T00:00:00Z",
          data: polarOrder(),
        }),
      ).toEqual({ status: "skipped", reason: "unavailable" });
    }
    expect(await releaseHeldCommissions()).toBe(0);
    expectNoQueries();
  });

  it("sends a referral link home without a code, sets no cookie and reads nothing", async () => {
    const response = await referralLink(
      new Request("http://localhost:3000/r/ana-diaz-4k2p", {
        headers: { "user-agent": "Mozilla/5.0 (Macintosh) Chrome/130" },
      }),
      { params: Promise.resolve({ code: "ana-diaz-4k2p" }) },
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/");
    expect(response.headers.get("set-cookie")).toBeNull();
    expectNoQueries();
  });

  it("404s /affiliates and Settings → Affiliate program, and hides the tab", async () => {
    const { default: AffiliatesPage } = await import(
      "@/app/(home)/affiliates/page"
    );
    expect(() => AffiliatesPage()).toThrow("NEXT_NOT_FOUND");
    const { default: AffiliateSettingsPage } = await import(
      "@/app/settings/affiliate/page"
    );
    await expect(AffiliateSettingsPage()).rejects.toThrow("NEXT_NOT_FOUND");
    for (const path of [
      "/affiliates",
      "/settings/affiliate",
      "/legal/affiliate-terms",
      "/docs/help/account-and-billing/affiliate-program",
    ]) {
      expect(isPathAvailable(path)).toBe(false);
    }
    expectNoQueries();
  });
});
