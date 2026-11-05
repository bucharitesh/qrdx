// deleteAccount and sendDeletionCode (actions/account.ts) with two-step
// verification on: one current authenticator or backup code confirms it, and
// no code is emailed or used. The code goes through the real check and
// lockout used to turn it off (checkCurrentCode in
// lib/account/two-factor-manage.ts), against an in-memory twoFactor row and
// fake Better Auth verifiers. With it off, the emailed code is unchanged.
// Nothing connects to a database.
import { beforeEach, describe, expect, it, vi } from "vitest";

const TOTP = "654321";

const state = vi.hoisted(() => ({
  twoFactorEnabled: true,
  codesAvailable: true,
  recentSignIn: true,
  emailCodeOk: true,
  blockers: [] as string[],
  backupCodes: [] as string[],
  row: null as null | {
    id: string;
    failedVerificationCount: number | null;
    lockedUntil: Date | null;
  },
  calls: [] as string[],
}));

const INCREMENT = vi.hoisted(() => Symbol("increment"));

const authError = (code: string) =>
  Object.assign(new Error(code), { body: { code } });

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("@repo/auth/forward-cookies", () => ({
  forwardAuthCookies: async () => {},
}));
vi.mock("@repo/auth/server", () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: { id: "user_1", email: "ada@qrdx.test" },
        session: { createdAt: new Date() },
      }),
      sendVerificationOTP: async () => {
        state.calls.push("send-email-code");
        return { success: true };
      },
      signInEmailOTP: async () => {
        state.calls.push("email-code");
        if (!state.emailCodeOk) throw authError("INVALID_OTP");
        return { token: "verification-token", user: { id: "user_1" } };
      },
      verifyTOTP: async ({ body }: { body: { code: string } }) => {
        state.calls.push(`totp:${body.code}`);
        if (body.code !== TOTP) throw authError("INVALID_CODE");
        return {};
      },
      verifyBackupCode: async ({ body }: { body: { code: string } }) => {
        state.calls.push(`backup:${body.code}`);
        const index = state.backupCodes.indexOf(body.code);
        if (index === -1) throw authError("INVALID_BACKUP_CODE");
        state.backupCodes.splice(index, 1);
        return {};
      },
    },
  },
}));
vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
  slidingWindow: () => ({}),
}));
vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
  sql: () => INCREMENT,
}));
vi.mock("@repo/database", () => {
  const apply = (values: Record<string, unknown>) => {
    const row = state.row as Record<string, unknown> | null;
    if (!row) return;
    for (const [key, value] of Object.entries(values)) {
      row[key] = value === INCREMENT ? Number(row[key] ?? 0) + 1 : value;
    }
  };
  return {
    database: {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () =>
              state.row
                ? [{ id: state.row.id, lockedUntil: state.row.lockedUntil }]
                : [],
          }),
        }),
      }),
      update: () => ({
        set: (values: Record<string, unknown>) => ({
          where: () => {
            apply(values);
            return Object.assign(Promise.resolve(), {
              returning: async () => [
                { failures: state.row?.failedVerificationCount ?? 0 },
              ],
            });
          },
        }),
      }),
      delete: () => ({
        where: async () => {
          state.calls.push("drop-verification-session");
        },
      }),
    },
    session: { token: "session.token" },
    twoFactor: {
      id: "twoFactor.id",
      userId: "twoFactor.userId",
      lockedUntil: "twoFactor.lockedUntil",
      failedVerificationCount: "twoFactor.failedVerificationCount",
    },
  };
});
vi.mock("@/lib/account/deletion-server", () => ({
  AccountDeletionError: class extends Error {},
  loadDeletionFacts: async () => ({}),
  executeAccountDeletion: async () => {
    state.calls.push("delete");
  },
}));
vi.mock("@/lib/account/deletion", () => ({
  isDeleteConfirmed: (value: string) => value === "delete",
  isRecentSignIn: () => state.recentSignIn,
  planAccountDeletion: () => ({ blockers: state.blockers }),
}));
vi.mock("@/lib/account/reauth", () => ({
  signInCodesAvailable: () => state.codesAvailable,
}));
vi.mock("@/lib/account/two-factor-server", () => ({
  // Read from the database in the app; the session's copy is ignored.
  twoFactorEnabledFor: async () => state.twoFactorEnabled,
  forgetTrustedDevices: async () => {},
}));
vi.mock("@/lib/account/two-factor-notice-server", () => ({
  sendTwoFactorNotice: async () => {},
}));
vi.mock("@/lib/auth/sign-in-code", () => ({ sendSignInCode: async () => {} }));
vi.mock("@/lib/shared", () => ({ logError: () => {} }));

const { deleteAccount, sendDeletionCode } = await import("@/actions/account");

beforeEach(() => {
  state.twoFactorEnabled = true;
  state.codesAvailable = true;
  state.recentSignIn = true;
  state.emailCodeOk = true;
  state.blockers = [];
  state.backupCodes = ["ABCDE-FGH23", "JKLMN-PQR45"];
  state.row = { id: "tf_1", failedVerificationCount: 0, lockedUntil: null };
  state.calls = [];
});

const confirm = { confirmation: "delete" };
const WRONG_TOTP = "That code isn't right. Try a new code from your app.";
const LOCKED = "Too many wrong codes in a row. Try again in 15 minutes.";

describe("deleteAccount with two-step verification on", () => {
  it("deletes with an authenticator code alone, no emailed code", async () => {
    expect(await deleteAccount({ ...confirm, twoFactorCode: TOTP })).toEqual({
      ok: true,
    });
    expect(state.calls).toEqual([`totp:${TOTP}`, "delete"]);
  });

  it("deletes with a backup code, which is used up", async () => {
    expect(
      await deleteAccount({ ...confirm, twoFactorCode: "abcde fgh23" }),
    ).toEqual({ ok: true });
    expect(state.calls).toEqual(["backup:ABCDE-FGH23", "delete"]);
    expect(state.backupCodes).toEqual(["JKLMN-PQR45"]);

    state.calls = [];
    const again = await deleteAccount({
      ...confirm,
      twoFactorCode: "ABCDE-FGH23",
    });
    expect(again).toEqual({
      ok: false,
      error: "That backup code isn't right, or it was already used.",
    });
    expect(state.calls).toEqual(["backup:ABCDE-FGH23"]);
  });

  it("refuses a wrong code and counts it toward the lockout", async () => {
    expect(
      await deleteAccount({ ...confirm, twoFactorCode: "111111" }),
    ).toEqual({ ok: false, error: WRONG_TOTP });
    expect(state.row?.failedVerificationCount).toBe(1);
    expect(state.calls).toEqual(["totp:111111"]);

    // 10 wrong in a row lock the codes, and then even a right one waits.
    for (let i = 2; i < 10; i++) {
      await deleteAccount({ ...confirm, twoFactorCode: "111111" });
    }
    expect(
      await deleteAccount({ ...confirm, twoFactorCode: "111111" }),
    ).toEqual({ ok: false, error: LOCKED });
    expect(state.row?.lockedUntil?.getTime()).toBeGreaterThan(Date.now());
    state.calls = [];
    expect(await deleteAccount({ ...confirm, twoFactorCode: TOTP })).toEqual({
      ok: false,
      error: LOCKED,
    });
    expect(state.calls).toEqual([]);
  });

  it("resets the count after a right code", async () => {
    await deleteAccount({ ...confirm, twoFactorCode: "111111" });
    expect(state.row?.failedVerificationCount).toBe(1);
    expect(await deleteAccount({ ...confirm, twoFactorCode: TOTP })).toEqual({
      ok: true,
    });
    expect(state.row?.failedVerificationCount).toBe(0);
  });

  it("refuses an emailed code alone, without using it", async () => {
    const result = await deleteAccount({ ...confirm, code: "123456" });
    expect(result).toEqual({
      ok: false,
      error: "Enter a code from your authenticator app, or a backup code.",
    });
    expect(
      await deleteAccount({ ...confirm, code: "123456", twoFactorCode: "x" }),
    ).toMatchObject({ ok: false });
    expect(state.calls).toEqual([]);
    expect(state.row?.failedVerificationCount).toBe(0);
  });

  it("ignores an emailed code sent along with the right code", async () => {
    expect(
      await deleteAccount({ ...confirm, code: "123456", twoFactorCode: TOTP }),
    ).toEqual({ ok: true });
    expect(state.calls).toEqual([`totp:${TOTP}`, "delete"]);
  });

  it("checks blockers first, so a backup code isn't spent for nothing", async () => {
    state.blockers = ["Transfer or delete the workspace Acme first."];
    expect(
      await deleteAccount({ ...confirm, twoFactorCode: "ABCDE-FGH23" }),
    ).toEqual({
      ok: false,
      error: "Transfer or delete the workspace Acme first.",
    });
    expect(state.calls).toEqual([]);
    expect(state.backupCodes).toContain("ABCDE-FGH23");
  });

  it("needs only the code where emailed codes aren't available", async () => {
    state.codesAvailable = false;
    state.recentSignIn = false;
    expect(await deleteAccount(confirm)).toMatchObject({ ok: false });
    expect(await deleteAccount({ ...confirm, twoFactorCode: TOTP })).toEqual({
      ok: true,
    });
    expect(state.calls).toEqual([`totp:${TOTP}`, "delete"]);
  });

  it("still needs the typed confirmation", async () => {
    expect(
      await deleteAccount({ confirmation: "", twoFactorCode: TOTP }),
    ).toEqual({ ok: false, error: 'Type "delete" to confirm.' });
    expect(state.calls).toEqual([]);
  });
});

describe("sendDeletionCode", () => {
  it("refuses with two-step verification on, and emails nothing", async () => {
    expect(await sendDeletionCode()).toEqual({
      ok: false,
      error:
        "Two-step verification is on, so there's no emailed code. Use a code from your authenticator app, or a backup code.",
    });
    expect(state.calls).toEqual([]);
  });

  it("emails the code with it off", async () => {
    state.twoFactorEnabled = false;
    expect(await sendDeletionCode()).toEqual({ ok: true });
    expect(state.calls).toEqual(["send-email-code"]);
  });

  it("emails nothing where codes can't be delivered", async () => {
    state.twoFactorEnabled = false;
    state.codesAvailable = false;
    expect(await sendDeletionCode()).toMatchObject({ ok: false });
    expect(state.calls).toEqual([]);
  });
});

describe("deleteAccount with two-step verification off", () => {
  beforeEach(() => {
    state.twoFactorEnabled = false;
    state.row = null;
  });

  it("asks for the emailed code, as before", async () => {
    expect(await deleteAccount(confirm)).toEqual({
      ok: false,
      error: "Enter the 6-digit code from the email.",
    });
    expect(await deleteAccount({ ...confirm, code: "123456" })).toEqual({
      ok: true,
    });
    expect(state.calls).toEqual(["email-code", "delete"]);
  });

  it("refuses a wrong emailed code", async () => {
    state.emailCodeOk = false;
    expect(await deleteAccount({ ...confirm, code: "123456" })).toEqual({
      ok: false,
      error: "That code isn't right. Check the email and try again.",
    });
    expect(state.calls).toEqual(["email-code"]);
  });

  it("ignores an authenticator code sent along", async () => {
    expect(
      await deleteAccount({ ...confirm, code: "123456", twoFactorCode: TOTP }),
    ).toEqual({ ok: true });
    expect(state.calls).toEqual(["email-code", "delete"]);
  });

  it("uses the recent sign-in rule where codes can't be delivered", async () => {
    state.codesAvailable = false;
    state.recentSignIn = false;
    expect(await deleteAccount(confirm)).toEqual({
      ok: false,
      error:
        "For your security, sign out and sign in again, then delete your account within 10 minutes.",
    });
    state.recentSignIn = true;
    expect(await deleteAccount(confirm)).toEqual({ ok: true });
    expect(state.calls).toEqual(["delete"]);
  });
});
