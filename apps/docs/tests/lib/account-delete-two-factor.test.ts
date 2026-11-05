// deleteAccount (actions/account.ts) with two-step verification on: a current
// authenticator or backup code is needed on top of the emailed code, through
// the same check as turning it off (checkCurrentCode, mocked here). An
// authenticator code is checked before the emailed code; a backup code, used
// up when right, only after it. Nothing connects to a database.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  twoFactorEnabled: true,
  codesAvailable: true,
  emailCodeOk: true,
  secondFactorOk: true,
  calls: [] as string[],
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@repo/auth/server", () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: {
          id: "user_1",
          email: "ada@qrdx.test",
          twoFactorEnabled: state.twoFactorEnabled,
        },
        session: { createdAt: new Date() },
      }),
      signInEmailOTP: async () => {
        state.calls.push("email-code");
        if (!state.emailCodeOk) {
          throw Object.assign(new Error("bad"), {
            body: { code: "INVALID_OTP" },
          });
        }
        return { token: "verification-token", user: { id: "user_1" } };
      },
    },
  },
}));
vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
  slidingWindow: () => ({}),
}));
vi.mock("drizzle-orm", () => ({ eq: () => ({}) }));
vi.mock("@repo/database", () => ({
  database: {
    delete: () => ({
      where: async () => {
        state.calls.push("drop-verification-session");
      },
    }),
  },
  session: { token: "session.token" },
}));
vi.mock("@/lib/account/deletion-server", () => ({
  AccountDeletionError: class extends Error {},
  loadDeletionFacts: async () => ({}),
  executeAccountDeletion: async () => {
    state.calls.push("delete");
  },
}));
vi.mock("@/lib/account/deletion", () => ({
  isDeleteConfirmed: (value: string) => value === "delete",
  isRecentSignIn: () => true,
  planAccountDeletion: () => ({ blockers: [] }),
}));
vi.mock("@/lib/account/reauth", () => ({
  signInCodesAvailable: () => state.codesAvailable,
}));
vi.mock("@/lib/account/two-factor-manage", () => ({
  checkCurrentCode: async (_user: unknown, code: string) => {
    state.calls.push(`second-factor:${code}`);
    return state.secondFactorOk
      ? { ok: true }
      : { ok: false, error: "That code isn't right." };
  },
}));
vi.mock("@/lib/shared", () => ({ logError: () => {} }));

const { deleteAccount } = await import("@/actions/account");

beforeEach(() => {
  state.twoFactorEnabled = true;
  state.codesAvailable = true;
  state.emailCodeOk = true;
  state.secondFactorOk = true;
  state.calls = [];
});

const base = { confirmation: "delete", code: "123456" };

describe("deleteAccount with two-step verification on", () => {
  it("needs a second-factor code, before using the emailed code", async () => {
    const result = await deleteAccount(base);
    expect(result).toEqual({
      ok: false,
      error: "Enter a code from your authenticator app, or a backup code.",
    });
    expect(
      await deleteAccount({ ...base, twoFactorCode: "not a code" }),
    ).toMatchObject({ ok: false });
    expect(state.calls).toEqual([]);
  });

  it("checks an authenticator code before the emailed code", async () => {
    const result = await deleteAccount({ ...base, twoFactorCode: "654321" });
    expect(result).toEqual({ ok: true });
    expect(state.calls).toEqual([
      "second-factor:654321",
      "email-code",
      "delete",
    ]);
  });

  it("stops on a wrong authenticator code without using the emailed one", async () => {
    state.secondFactorOk = false;
    const result = await deleteAccount({ ...base, twoFactorCode: "654321" });
    expect(result).toEqual({ ok: false, error: "That code isn't right." });
    expect(state.calls).toEqual(["second-factor:654321"]);
  });

  it("checks a backup code only after the emailed code", async () => {
    const result = await deleteAccount({
      ...base,
      twoFactorCode: "abcde fgh23",
    });
    expect(result).toEqual({ ok: true });
    expect(state.calls).toEqual([
      "email-code",
      "second-factor:abcde fgh23",
      "delete",
    ]);
  });

  it("doesn't spend a backup code on a wrong emailed code", async () => {
    state.emailCodeOk = false;
    const result = await deleteAccount({
      ...base,
      twoFactorCode: "ABCDE-FGH23",
    });
    expect(result).toMatchObject({ ok: false });
    expect(state.calls).toEqual(["email-code"]);
  });

  it("asks for a new emailed code when the backup code is wrong", async () => {
    state.secondFactorOk = false;
    const result = await deleteAccount({
      ...base,
      twoFactorCode: "ABCDE-FGH23",
    });
    expect(result).toEqual({
      ok: false,
      error: "That code isn't right.",
      codeExpired: true,
    });
    expect(state.calls).toContain("drop-verification-session");
    expect(state.calls).not.toContain("delete");
  });

  it("needs the code too where emailed codes aren't available", async () => {
    state.codesAvailable = false;
    expect(await deleteAccount({ confirmation: "delete" })).toMatchObject({
      ok: false,
    });
    const result = await deleteAccount({
      confirmation: "delete",
      twoFactorCode: "654321",
    });
    expect(result).toEqual({ ok: true });
    expect(state.calls).toEqual(["second-factor:654321", "delete"]);
  });
});

describe("deleteAccount with two-step verification off", () => {
  it("asks only for the emailed code, as before", async () => {
    state.twoFactorEnabled = false;
    expect(await deleteAccount(base)).toEqual({ ok: true });
    expect(state.calls).toEqual(["email-code", "delete"]);
  });
});
