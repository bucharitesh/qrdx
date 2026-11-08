// The sign-in panel's SSO check (ee/sso/sign-in-offer.ts): asked before an
// email code is sent, it says whether the address's domain signs in with
// SSO. Only where SSO is licensed, per IP, from the domain alone, and never
// in the way of the code. The lookup itself (packages/auth/ee/sso.ts
// ssoSignInOffered) is stubbed here; tests/lib/sso-sign-in-offer-lookup.test.ts
// covers it. Nothing connects to a database.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  licensed: true,
  ip: "203.0.113.1",
  offered: true as boolean | Error,
  required: false,
  lookups: [] as string[],
  logged: [] as { message: string; context: unknown }[],
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": state.ip }),
}));
vi.mock("@/lib/feature-availability", () => ({
  isFeatureAvailable: (id: string) => id === "sso" && state.licensed,
}));
vi.mock("@/lib/shared", () => ({
  logError: (error: Error, context: unknown) => {
    state.logged.push({ message: error.message, context });
  },
}));
vi.mock("@repo/auth/sso", () => ({
  ssoSignInOffered: async (domain: string) => {
    state.lookups.push(domain);
    if (state.offered instanceof Error) throw state.offered;
    return state.offered;
  },
}));

vi.mock("@repo/auth/sso-required", () => ({
  ssoRequiredForDomain: async () => state.required,
}));

const { ssoSignInOffer } = await import("@/ee/sso/sign-in-offer");

// The limiter is per IP and lives for the module, so each test signs in
// from addresses of its own.
let nextIp = 1;
const freshIp = () => `198.51.100.${nextIp++}`;

beforeEach(() => {
  state.licensed = true;
  state.ip = freshIp();
  state.offered = true;
  state.required = false;
  state.lookups = [];
  state.logged = [];
});

afterEach(() => vi.useRealTimers());

describe("offering SSO from the email step", () => {
  it("offers it when the address's domain signs in with SSO", async () => {
    expect(await ssoSignInOffer("ana@acme.com")).toEqual({ sso: true });
    state.offered = false;
    expect(await ssoSignInOffer("ana@example.com")).toEqual({ sso: false });
  });

  it("looks up the domain only, never the address", async () => {
    await ssoSignInOffer("  Ana.Lopez@EU.Acme.com ");
    await ssoSignInOffer("someone-else@eu.acme.com");
    expect(state.lookups).toEqual(["eu.acme.com", "eu.acme.com"]);
  });

  it("answers with a yes or no and nothing else (no connection or workspace)", async () => {
    const answer = await ssoSignInOffer("ana@acme.com");
    expect(Object.keys(answer)).toEqual(["sso"]);
  });

  it("says when the domain requires SSO, still from the domain alone", async () => {
    state.required = true;
    expect(await ssoSignInOffer("ana@acme.com")).toEqual({
      sso: true,
      required: true,
    });
    // Never "required" without the offer itself.
    state.offered = false;
    expect(await ssoSignInOffer("ana@acme.com")).toEqual({ sso: false });
  });

  it("doesn't run without a licence key", async () => {
    state.licensed = false;
    expect(await ssoSignInOffer("ana@acme.com")).toEqual({ sso: false });
    expect(state.lookups).toEqual([]);
  });

  it("looks nothing up for something that isn't an address", async () => {
    for (const input of [
      "",
      "acme.com",
      "ana@",
      "ana@acme",
      "a@b@acme.com",
      `${"a".repeat(250)}@acme.com`,
      42,
      null,
      { email: "ana@acme.com" },
    ]) {
      expect(await ssoSignInOffer(input), JSON.stringify(input)).toEqual({
        sso: false,
      });
    }
    expect(state.lookups).toEqual([]);
  });
});

describe("the per-IP limit", () => {
  it("allows 60 checks a minute from one IP, then just lets the code be sent", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // The start of a minute, so all 61 fall in one window.
    vi.setSystemTime(new Date(Date.UTC(2026, 10, 8, 9, 0, 0)));
    const first = state.ip;
    for (let i = 0; i < 60; i++) {
      expect(await ssoSignInOffer("ana@acme.com")).toEqual({ sso: true });
    }
    expect(await ssoSignInOffer("ana@acme.com")).toEqual({ sso: false });
    expect(state.lookups).toHaveLength(60);

    // Another IP isn't held back.
    state.ip = freshIp();
    expect(await ssoSignInOffer("ana@acme.com")).toEqual({ sso: true });

    // Two minutes on, the first IP can check again.
    state.ip = first;
    vi.setSystemTime(new Date(Date.UTC(2026, 10, 8, 9, 2, 0)));
    expect(await ssoSignInOffer("ana@acme.com")).toEqual({ sso: true });
  });
});

describe("when the lookup fails", () => {
  it("offers nothing, so the code is sent, and logs it without the address", async () => {
    state.offered = new Error("connection refused");
    expect(await ssoSignInOffer("ana@acme.com")).toEqual({ sso: false });
    expect(state.logged).toEqual([
      {
        message: "connection refused",
        context: { action: "ssoSignInOffer" },
      },
    ]);
    expect(JSON.stringify(state.logged)).not.toContain("ana@");
  });
});
