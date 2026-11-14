// How a new account found QRdx (lib/analytics/acquisition.ts and the
// recorder in lib/analytics/sign-up-hook.ts), against the in-memory
// database: what the sign-up carried is cleaned again on the server, the
// channel is worked out there (never taken from the browser), an affiliate's
// credit makes it "affiliate", and nothing here can stop or slow a sign-up,
// including the table not existing yet.
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
  type NewUserSignUp,
  recordNewUser,
  registerNewUserRecorder,
} from "@repo/auth/referral";
import { LANDING_HEADER, REFERRAL_HEADER } from "@repo/auth/referral-keys";
import {
  recordAcquisition,
  signUpLandingOf,
} from "@/lib/analytics/acquisition";
import { encodeLandingHeader } from "@/lib/analytics/landing";
import { recordNewUserSignUp } from "@/lib/analytics/sign-up-hook";
import { resetAffiliateDb, seedAffiliate } from "../affiliates/seed";
import { fakeDb } from "../support/fake-db";

const NEW_USER = { id: "user_new", email: "carla@example.com" };
const rows = () => fakeDb.rows("userAcquisition");

beforeEach(() => {
  state.programOn = true;
  resetAffiliateDb();
  fakeDb.unique("userAcquisition", "userId");
  const at = new Date("2026-11-13T00:00:00Z");
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
  registerNewUserRecorder(recordNewUserSignUp);
});

const signUp = (overrides: Partial<NewUserSignUp>): NewUserSignUp => ({
  userId: NEW_USER.id,
  email: NEW_USER.email,
  headers: null,
  oauthReferralCode: null,
  oauthLanding: null,
  ...overrides,
});

describe("what a sign-up carried", () => {
  it("reads the email-code header, cleaned again", () => {
    const header = encodeLandingHeader({
      referrer_host: "WWW.Google.com",
      landing_path: "/qr-code-generator/wifi?ssid=home",
      signup_path: "/playground",
    });
    expect(
      signUpLandingOf(
        signUp({ headers: new Headers({ [LANDING_HEADER]: header }) }),
      ),
    ).toEqual({
      referrer_host: "www.google.com",
      landing_path: "/qr-code-generator/wifi",
      signup_path: "/playground",
    });
  });

  it("reads a Google or GitHub sign-up's OAuth state, cleaned again", () => {
    expect(
      signUpLandingOf(
        signUp({
          oauthLanding: {
            referrer_host: "chatgpt.com",
            utm_source: "ana@example.com",
            landing_path: "/invite/inv_secret",
            channel: "affiliate",
          },
        }),
      ),
    ).toEqual({ referrer_host: "chatgpt.com", landing_path: "/invite" });
  });

  it("is nothing without either", () => {
    expect(signUpLandingOf(signUp({ headers: new Headers() }))).toBeNull();
  });
});

describe("recording it with the new account", () => {
  it("works out the channel on the server and keeps hosts, tags and paths only", async () => {
    // A browser can claim any channel; it isn't read.
    const header = encodeURIComponent(
      JSON.stringify({
        channel: "affiliate",
        referrer_host: "news.ycombinator.com",
        landing_path: "/blog/open-source-qr",
        signup_path: "/playground",
        utm_campaign: "show-hn",
      }),
    );
    recordNewUser(NEW_USER, {
      headers: new Headers({ [LANDING_HEADER]: header }),
    });
    await vi.waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toMatchObject({
      userId: NEW_USER.id,
      channel: "social",
      referrerHost: "news.ycombinator.com",
      utmSource: null,
      utmMedium: null,
      utmCampaign: "show-hn",
      refTag: null,
      landingPath: "/blog/open-source-qr",
      signupPath: "/playground",
    });
  });

  it("says affiliate when the sign-up's referral counted", async () => {
    recordNewUser(NEW_USER, {
      headers: new Headers({
        [REFERRAL_HEADER]: "ana-diaz-4k2p",
        [LANDING_HEADER]: encodeLandingHeader({
          referrer_host: "www.youtube.com",
          landing_path: "/",
          ref: "ana-diaz-4k2p",
        }),
      }),
    });
    await vi.waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toMatchObject({
      channel: "affiliate",
      referrerHost: "www.youtube.com",
      refTag: "ana-diaz-4k2p",
    });
    expect(fakeDb.rows("affiliateReferral")).toHaveLength(1);
  });

  it("records an affiliate's credit even when the visit carried nothing else", async () => {
    recordNewUser(NEW_USER, {
      headers: new Headers({ [REFERRAL_HEADER]: "ana-diaz-4k2p" }),
    });
    await vi.waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toMatchObject({
      channel: "affiliate",
      referrerHost: null,
      landingPath: null,
    });
  });

  it("isn't affiliate when the code didn't count (program off, unknown code)", async () => {
    state.programOn = false;
    recordNewUser(NEW_USER, {
      headers: new Headers({
        [REFERRAL_HEADER]: "ana-diaz-4k2p",
        [LANDING_HEADER]: encodeLandingHeader({ landing_path: "/" }),
      }),
    });
    await vi.waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toMatchObject({ channel: "direct" });
    expect(fakeDb.rows("affiliateReferral")).toEqual([]);
  });

  it("writes no row when nothing was carried (Do Not Track, an older page)", async () => {
    recordNewUser(NEW_USER, { headers: new Headers() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(rows()).toEqual([]);
    expect(
      await recordAcquisition({
        userId: NEW_USER.id,
        landing: null,
        affiliate: false,
      }),
    ).toBe("nothing_carried");
  });

  it("keeps the first row: an account is recorded once", async () => {
    const landing = { landing_path: "/" };
    expect(
      await recordAcquisition({
        userId: NEW_USER.id,
        landing,
        affiliate: false,
      }),
    ).toBe("recorded");
    expect(
      await recordAcquisition({
        userId: NEW_USER.id,
        landing: { referrer_host: "github.com" },
        affiliate: false,
      }),
    ).toBe("already_recorded");
    expect(rows()).toEqual([
      expect.objectContaining({ channel: "direct", landingPath: "/" }),
    ]);
  });
});

describe("never in the sign-up's way", () => {
  it("skips the write, warning once, until the table exists", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fakeDb.missing("userAcquisition");
    const write = () =>
      recordAcquisition({
        userId: NEW_USER.id,
        landing: { landing_path: "/" },
        affiliate: false,
      });
    expect(await write()).toBe("missing_table");
    expect(await write()).toBe("missing_table");
    expect(warn.mock.calls.length).toBeLessThanOrEqual(1);
    warn.mockRestore();
  });

  it("never throws from the user-create hook", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    fakeDb.missing("userAcquisition", "affiliate", "affiliateReferral");
    expect(() =>
      recordNewUser(NEW_USER, {
        headers: new Headers({
          [REFERRAL_HEADER]: "ana-diaz-4k2p",
          [LANDING_HEADER]: "%%%not-encoded",
        }),
      }),
    ).not.toThrow();
    expect(() => recordNewUser(NEW_USER, null)).not.toThrow();
    error.mockRestore();
  });
});
