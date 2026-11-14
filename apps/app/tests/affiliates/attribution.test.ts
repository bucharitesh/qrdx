// Referrals at sign-up (lib/affiliates/attribution.ts and the bridge in
// packages/auth/referral.ts), against the in-memory database: a code carried
// with the sign-up itself (same visit only: a cookie is never read), only
// approved affiliates, an affiliate's earlier random code still counting,
// never self-referral, the first valid referral wins and is never replaced,
// and the bridge never stops a sign-up.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ programOn: true }));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@/lib/feature-availability", () => ({
  isFeatureAvailable: (id: string) => id === "affiliates" && state.programOn,
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  // No request here: run the task now.
  after: () => {
    throw new Error("outside a request");
  },
}));

import {
  noteSignUpState,
  recordNewUser,
  registerNewUserRecorder,
} from "@repo/auth/referral";
import { OAUTH_REFERRAL_KEY, REFERRAL_HEADER } from "@repo/auth/referral-keys";
import {
  attributeNewUser,
  referralCandidatesFrom,
} from "@/lib/affiliates/attribution";
import { recordSignUpReferral } from "@/lib/affiliates/attribution-hook";
import { fakeDb, repoDatabase } from "../support/fake-db";
import { AFFILIATE_USER, resetAffiliateDb, seedAffiliate } from "./seed";

const NEW_USER = { id: "user_new", email: "carla@example.com" };

const headers = (values: Record<string, string>) => new Headers(values);
const referrals = () => fakeDb.rows("affiliateReferral");

beforeEach(() => {
  state.programOn = true;
  resetAffiliateDb();
  const at = new Date("2026-11-10T00:00:00Z");
  fakeDb.seed("user", [
    {
      ...NEW_USER,
      name: "Carla",
      emailVerified: true,
      createdAt: at,
      updatedAt: at,
    },
  ]);
  seedAffiliate();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("what a sign-up carries", () => {
  it("reads the code from the header an email-code sign-up sends, with no cookie", () => {
    expect(
      referralCandidatesFrom({
        headers: headers({ [REFERRAL_HEADER]: "ana-diaz-4k2p" }),
      }),
    ).toEqual([{ code: "ana-diaz-4k2p", via: "link" }]);
  });

  it("reads the code a Google or GitHub sign-up carried in the OAuth state", () => {
    expect(
      referralCandidatesFrom({
        headers: null,
        oauthReferralCode: "ANA-DIAZ-4K2P",
      }),
    ).toEqual([{ code: "ana-diaz-4k2p", via: "link" }]);
  });

  // D-C1: no cookie. One left over from an earlier version of the program,
  // or set by anyone else, counts for nothing.
  it("never reads a code from a cookie", () => {
    expect(
      referralCandidatesFrom({
        headers: headers({ cookie: "theme=dark; qrdx_ref=first-one; other=1" }),
      }),
    ).toEqual([]);
    expect(
      referralCandidatesFrom({
        headers: headers({
          cookie: "qrdx_ref=first-one",
          [REFERRAL_HEADER]: "second-one",
        }),
      }),
    ).toEqual([{ code: "second-one", via: "link" }]);
  });

  it("drops malformed codes and repeats", () => {
    expect(
      referralCandidatesFrom({
        headers: headers({ [REFERRAL_HEADER]: "same-code" }),
        oauthReferralCode: "SAME-code",
      }),
    ).toEqual([{ code: "same-code", via: "link" }]);
    expect(
      referralCandidatesFrom({
        headers: headers({ [REFERRAL_HEADER]: "<script>" }),
        oauthReferralCode: 42,
      }),
    ).toEqual([]);
    expect(referralCandidatesFrom({ headers: headers({}) })).toEqual([]);
  });
});

describe("attributing a new account", () => {
  const attribute = (codes: { code: string; via: "link" }[]) =>
    attributeNewUser({
      userId: NEW_USER.id,
      email: NEW_USER.email,
      candidates: codes,
    });

  it("records an approved affiliate's code for the new account", async () => {
    expect(await attribute([{ code: "ana-diaz-4k2p", via: "link" }])).toEqual({
      status: "attributed",
      affiliateId: "aff_1",
      via: "link",
    });
    expect(referrals()).toEqual([
      expect.objectContaining({
        affiliateId: "aff_1",
        referredUserId: NEW_USER.id,
        attributedVia: "link",
      }),
    ]);
    expect(referrals()[0]?.firstPaidAt ?? null).toBe(null);
  });

  it("ignores codes of affiliates who aren't approved, and unknown codes", async () => {
    for (const status of ["pending", "rejected", "suspended"]) {
      resetAffiliateDb();
      seedAffiliate({ status });
      expect(await attribute([{ code: "ana-diaz-4k2p", via: "link" }])).toEqual(
        {
          status: "skipped",
          reason: "not_approved",
        },
      );
    }
    expect(await attribute([{ code: "nobody-1234", via: "link" }])).toEqual({
      status: "skipped",
      reason: "not_approved",
    });
    expect(referrals()).toEqual([]);
  });

  it("refuses self-referral: the same email under another spelling", async () => {
    const result = await attributeNewUser({
      userId: NEW_USER.id,
      email: "Ana.Diaz+second@gmail.com",
      candidates: [{ code: "ana-diaz-4k2p", via: "link" }],
    });
    expect(result).toEqual({ status: "skipped", reason: "self_referral" });
    expect(referrals()).toEqual([]);
  });

  it("refuses self-referral: someone already in one of the affiliate's workspaces", async () => {
    const at = new Date("2026-11-10T00:00:00Z");
    fakeDb.seed("member", [
      {
        id: "m1",
        organizationId: "org_ana",
        userId: AFFILIATE_USER.id,
        role: "owner",
        createdAt: at,
      },
      {
        id: "m2",
        organizationId: "org_ana",
        userId: NEW_USER.id,
        role: "member",
        createdAt: at,
      },
    ]);
    expect(await attribute([{ code: "ana-diaz-4k2p", via: "link" }])).toEqual({
      status: "skipped",
      reason: "self_referral",
    });
  });

  it("the first valid code wins: an unknown one falls through to the next", async () => {
    expect(
      await attribute([
        { code: "nobody-1234", via: "link" },
        { code: "ana-diaz-4k2p", via: "link" },
      ]),
    ).toMatchObject({ status: "attributed", via: "link" });
  });

  // D-C3: the random code keeps working after the affiliate chose their own.
  it("still counts the affiliate's earlier random code after they chose one", async () => {
    fakeDb.rows("affiliate")[0] = {
      ...fakeDb.rows("affiliate")[0],
      code: "ana-picks",
      previousCode: "k7q2mx9p",
      codeChangedAt: new Date("2026-11-01T00:00:00Z"),
    };
    expect(await attribute([{ code: "k7q2mx9p", via: "link" }])).toEqual({
      status: "attributed",
      affiliateId: "aff_1",
      via: "link",
    });
  });

  it("never re-attributes an account that already has a referral", async () => {
    seedAffiliate({ id: "aff_2", userId: "user_other", code: "other-code" });
    await attribute([{ code: "ana-diaz-4k2p", via: "link" }]);
    expect(await attribute([{ code: "other-code", via: "link" }])).toEqual({
      status: "skipped",
      reason: "already_referred",
    });
    expect(referrals()).toHaveLength(1);
    expect(referrals()[0]?.affiliateId).toBe("aff_1");
  });

  it("does nothing where the program is off", async () => {
    state.programOn = false;
    expect(await attribute([{ code: "ana-diaz-4k2p", via: "link" }])).toEqual({
      status: "skipped",
      reason: "unavailable",
    });
    expect(referrals()).toEqual([]);
  });
});

describe("the bridge from Better Auth's user hooks", () => {
  it("hands the new account and its request to the app, which records the referral", async () => {
    registerNewUserRecorder(recordSignUpReferral);
    recordNewUser(NEW_USER, {
      headers: headers({ [REFERRAL_HEADER]: "ana-diaz-4k2p" }),
    });
    await vi.waitFor(() => expect(referrals()).toHaveLength(1));
    expect(referrals()[0]).toMatchObject({ attributedVia: "link" });
  });

  it("keeps a Google or GitHub sign-up's code from the before hook for the after hook", async () => {
    const seen: unknown[] = [];
    registerNewUserRecorder((signUp) => seen.push(signUp));
    const ctx = { headers: headers({}) };
    // Outside an OAuth callback there's no state: nothing is kept.
    await noteSignUpState(ctx);
    recordNewUser(NEW_USER, ctx);
    expect(seen).toEqual([
      expect.objectContaining({
        userId: NEW_USER.id,
        oauthReferralCode: null,
        oauthLanding: null,
      }),
    ]);
    expect(OAUTH_REFERRAL_KEY).toBe("referralCode");
  });

  it("never throws, even when the app's recorder does", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    registerNewUserRecorder(() => {
      throw new Error("boom");
    });
    expect(() => recordNewUser(NEW_USER, null)).not.toThrow();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
    registerNewUserRecorder(recordSignUpReferral);
  });

  // A0: with the program off, the user-create hook does nothing at all.
  it("does nothing at all, not even a lookup, where the program is off", async () => {
    state.programOn = false;
    const database = repoDatabase.database as {
      select: (...args: unknown[]) => unknown;
      insert: (...args: unknown[]) => unknown;
    };
    const select = vi.spyOn(database, "select");
    const insert = vi.spyOn(database, "insert");
    registerNewUserRecorder(recordSignUpReferral);
    recordNewUser(NEW_USER, {
      headers: headers({ [REFERRAL_HEADER]: "ana-diaz-4k2p" }),
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(select).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(referrals()).toEqual([]);
    select.mockRestore();
    insert.mockRestore();
  });

  it("records nothing when the sign-up carried no code", () => {
    registerNewUserRecorder(recordSignUpReferral);
    recordNewUser(NEW_USER, { headers: headers({}) });
    expect(referrals()).toEqual([]);
  });
});
