// Until packages/database/manual-sql/2026-11-10-affiliates.sql is applied,
// every affiliate query hits a missing table (Postgres 42P01). None of that
// may reach a person: sign-up still works and records nothing, the pages'
// loaders say "not ready" instead of failing, the referral link still
// redirects, the data export and the daily cron carry on. (The webhook's
// side is in webhook-route.test.ts.)
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@/lib/feature-availability", () => ({
  isFeatureAvailable: (id: string) => id === "affiliates",
}));

import { REFERRAL_HEADER } from "@repo/auth/referral-keys";
import { GET as referralLink } from "@/app/r/[code]/route";
import {
  attributeNewUser,
  referralCandidatesFrom,
} from "@/lib/affiliates/attribution";
import {
  handleAffiliateWebhook,
  releaseHeldCommissions,
} from "@/lib/affiliates/commissions";
import {
  exportAffiliateData,
  listAffiliatesForAdmin,
  loadAffiliateDashboard,
  loadAffiliateForAdmin,
  recordReferralClick,
} from "@/lib/affiliates/program";
import { fakeDb } from "../support/fake-db";
import { CUSTOMER, polarOrder, resetAffiliateDb } from "./seed";

const BROWSER =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

let warnings: ReturnType<typeof vi.spyOn>;
let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetAffiliateDb();
  fakeDb.missing(
    "affiliate",
    "affiliateReferral",
    "affiliateCommission",
    "affiliatePayout",
  );
  warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("with no affiliate tables", () => {
  it("sign-up: attribution records nothing and never throws", async () => {
    const candidates = referralCandidatesFrom({
      headers: new Headers({ [REFERRAL_HEADER]: "ana-diaz-4k2p" }),
    });
    await expect(
      attributeNewUser({
        userId: CUSTOMER.id,
        email: CUSTOMER.email,
        candidates,
      }),
    ).resolves.toEqual({ status: "skipped", reason: "missing_tables" });
    // A warning that says what to apply, not an error per sign-up.
    expect(errors).not.toHaveBeenCalled();
  });

  it("the webhook's affiliate step resolves with nothing recorded", async () => {
    await expect(
      handleAffiliateWebhook({ type: "order.paid", data: polarOrder() }),
    ).resolves.toEqual({ status: "skipped", reason: "missing_tables" });
    await expect(
      handleAffiliateWebhook({
        type: "refund.created",
        data: {
          id: "refund_1",
          status: "succeeded",
          amount: 100,
          order_id: "order_1",
        },
      }),
    ).resolves.toEqual({ status: "skipped", reason: "missing_tables" });
  });

  it("Settings → Affiliate program and the admin pages get 'not ready'", async () => {
    await expect(loadAffiliateDashboard(CUSTOMER.id)).resolves.toEqual({
      ready: false,
    });
    await expect(listAffiliatesForAdmin()).resolves.toEqual({ ready: false });
    await expect(loadAffiliateForAdmin("aff_1")).resolves.toEqual({
      ready: false,
    });
  });

  it("a referral link still redirects (home, without a code) and counts nothing", async () => {
    expect(await recordReferralClick("ana-diaz-4k2p")).toBeNull();
    const response = await referralLink(
      new Request("http://localhost:3000/r/ana-diaz-4k2p", {
        headers: { "user-agent": BROWSER },
      }),
      { params: Promise.resolve({ code: "ana-diaz-4k2p" }) },
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/");
    expect(response.headers.get("set-cookie")).toBe(null);
  });

  it("the data export and the daily cron carry on", async () => {
    await expect(exportAffiliateData(CUSTOMER.id)).resolves.toBe(null);
    await expect(releaseHeldCommissions()).resolves.toBe(0);
  });

  it("only ever logs the missing tables as a warning", () => {
    expect(errors).not.toHaveBeenCalled();
    // Once per process, so it may have been logged by an earlier test file.
    expect(warnings.mock.calls.length).toBeLessThanOrEqual(1);
  });
});

describe("the referral link, once the tables exist", () => {
  beforeEach(() => {
    resetAffiliateDb();
  });

  const open = (code: string, userAgent = BROWSER) =>
    referralLink(
      new Request(`http://localhost:3000/r/${code}`, {
        headers: { "user-agent": userAgent },
      }),
      { params: Promise.resolve({ code }) },
    );

  it("sends an approved affiliate's visitors home with the code, counting the visit and setting no cookie", async () => {
    const { seedAffiliate } = await import("./seed");
    seedAffiliate();
    const response = await open("ANA-DIAZ-4K2P");
    expect(response.headers.get("location")).toBe("/?ref=ana-diaz-4k2p");
    expect(response.headers.get("set-cookie")).toBe(null);
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(fakeDb.find("affiliate", { id: "aff_1" })?.clickCount).toBe(1);
  });

  it("doesn't count bots, and drops the code of an affiliate who isn't approved", async () => {
    const { seedAffiliate } = await import("./seed");
    seedAffiliate();
    seedAffiliate({
      id: "aff_2",
      userId: "user_x",
      code: "pending-one",
      status: "pending",
    });
    const bot = await open(
      "ana-diaz-4k2p",
      "Googlebot/2.1 (+http://www.google.com/bot.html)",
    );
    expect(bot.headers.get("location")).toBe("/?ref=ana-diaz-4k2p");
    expect(fakeDb.find("affiliate", { id: "aff_1" })?.clickCount).toBe(0);
    const pending = await open("pending-one");
    expect(pending.headers.get("location")).toBe("/");
    expect(fakeDb.find("affiliate", { id: "aff_2" })?.clickCount).toBe(0);
    expect((await open("not a code")).headers.get("location")).toBe("/");
  });
});
