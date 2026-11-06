// Adding a passkey and changing the email with two-step verification on:
// besides the recent sign-in, each needs a current authenticator or backup
// code, through the real check and lockout used to turn it off
// (checkCurrentCode in lib/account/two-factor-manage.ts), against an
// in-memory twoFactor row and fake Better Auth verifiers. Accounts without it
// are never asked. Nothing connects to a database.
import { beforeEach, describe, expect, it, vi } from "vitest";

const TOTP = "654321";

const state = vi.hoisted(() => ({
  twoFactorEnabled: true,
  sessionCreatedAt: new Date(),
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

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ set: () => {} }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("@repo/auth/forward-cookies", () => ({
  forwardAuthCookies: async () => {},
}));
vi.mock("@repo/auth/passkey", () => ({ cookiesToSet: () => [] }));
vi.mock("@repo/auth/email-otp", () => ({
  registerEmailChangeCodeSender: () => {},
}));
vi.mock("@repo/auth/server", () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: { id: "user_1", email: "ada@qrdx.test" },
        session: { createdAt: state.sessionCreatedAt },
      }),
      generatePasskeyRegistrationOptions: async () => {
        state.calls.push("passkey-options");
        return { headers: new Headers(), response: { challenge: "c" } };
      },
      verifyPasskeyRegistration: async () => {
        state.calls.push("passkey-save");
        return { id: "pk_1", name: "Mac" };
      },
      changeEmailEmailOTP: async () => {
        state.calls.push("email-change");
        return { status: true };
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
    },
    twoFactor: {
      id: "twoFactor.id",
      userId: "twoFactor.userId",
      lockedUntil: "twoFactor.lockedUntil",
      failedVerificationCount: "twoFactor.failedVerificationCount",
    },
  };
});
vi.mock("@/lib/account/two-factor-server", () => ({
  // Read from the database in the app; the session's copy is ignored.
  twoFactorEnabledFor: async () => state.twoFactorEnabled,
  forgetTrustedDevices: async () => {},
  // The same rules as the real single UPDATE (as in
  // account-delete-two-factor.test.ts): refuse while locked, an expired lock
  // starts again from 1, the 10th attempt sets the lock.
  reserveCodeAttempt: async () => {
    const row = state.row;
    if (!row) return { ok: false, reason: "off" };
    const now = Date.now();
    if (row.lockedUntil && row.lockedUntil.getTime() > now) {
      return { ok: false, reason: "locked" };
    }
    const attempts = row.lockedUntil
      ? 1
      : (row.failedVerificationCount ?? 0) + 1;
    row.failedVerificationCount = attempts;
    row.lockedUntil = attempts >= 10 ? new Date(now + 15 * 60_000) : null;
    return { ok: true, id: row.id, attempts };
  },
}));
vi.mock("@/lib/account/two-factor-notice-server", () => ({
  sendTwoFactorNotice: async () => {},
}));
vi.mock("@/lib/account/passkeys-server", () => ({
  sendPasskeyNotice: async () => {},
}));
vi.mock("@/lib/account/email-change-server", () => ({
  afterEmailChanged: async () => {},
}));
vi.mock("@/lib/auth/email-change-code", () => ({
  sendEmailChangeCode: async () => {},
}));
vi.mock("@/lib/shared", () => ({ logError: () => {} }));

const { passkeyRegistrationOptions, addPasskey } = await import(
  "@/app/settings/account/_lib/passkey-actions"
);
const { confirmEmailChange } = await import(
  "@/app/settings/account/_lib/email-change-actions"
);

beforeEach(() => {
  state.twoFactorEnabled = true;
  state.sessionCreatedAt = new Date();
  state.backupCodes = ["ABCDE-FGH23", "JKLMN-PQR45"];
  state.row = { id: "tf_1", failedVerificationCount: 0, lockedUntil: null };
  state.calls = [];
});

const ENTER_CODE =
  "Enter a 6-digit code from your authenticator app, or a backup code.";
const WRONG_TOTP = "That code isn't right. Try a new code from your app.";
const LOCKED = "Too many wrong codes in a row. Try again in 15 minutes.";
const change = { newEmail: "new@qrdx.test", code: "123456" };

describe("adding a passkey with two-step verification on", () => {
  it("refuses without a code, before the browser prompt", async () => {
    for (const input of [undefined, {}, { twoFactorCode: "" }]) {
      expect(await passkeyRegistrationOptions(input)).toEqual({
        ok: false,
        error: ENTER_CODE,
      });
    }
    expect(state.calls).toEqual([]);
  });

  it("refuses a wrong code and counts it toward the lockout", async () => {
    expect(
      await passkeyRegistrationOptions({ twoFactorCode: "111111" }),
    ).toEqual({ ok: false, error: WRONG_TOTP });
    expect(state.row?.failedVerificationCount).toBe(1);
    expect(state.calls).toEqual(["totp:111111"]);

    for (let i = 2; i < 10; i++) {
      await passkeyRegistrationOptions({ twoFactorCode: "111111" });
    }
    expect(
      await passkeyRegistrationOptions({ twoFactorCode: "111111" }),
    ).toEqual({ ok: false, error: LOCKED });
    state.calls = [];
    expect(await passkeyRegistrationOptions({ twoFactorCode: TOTP })).toEqual({
      ok: false,
      error: LOCKED,
    });
    expect(state.calls).toEqual([]);
  });

  it("goes ahead with an authenticator code", async () => {
    expect(
      await passkeyRegistrationOptions({ twoFactorCode: TOTP }),
    ).toMatchObject({ ok: true, data: { challenge: "c" } });
    expect(state.calls).toEqual([`totp:${TOTP}`, "passkey-options"]);
  });

  it("goes ahead with a backup code, which is used up", async () => {
    expect(
      await passkeyRegistrationOptions({ twoFactorCode: "abcde fgh23" }),
    ).toMatchObject({ ok: true });
    expect(state.backupCodes).toEqual(["JKLMN-PQR45"]);
    expect(
      await passkeyRegistrationOptions({ twoFactorCode: "ABCDE-FGH23" }),
    ).toMatchObject({ ok: false });
  });

  it("still needs a recent sign-in, checked before the code", async () => {
    state.sessionCreatedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    expect(
      await passkeyRegistrationOptions({ twoFactorCode: "ABCDE-FGH23" }),
    ).toMatchObject({ ok: false, reason: "reauth" });
    expect(state.calls).toEqual([]);
    expect(state.backupCodes).toContain("ABCDE-FGH23");
  });
});

describe("adding a passkey with two-step verification off", () => {
  beforeEach(() => {
    state.twoFactorEnabled = false;
    state.row = null;
  });

  it("never asks for a code, and ignores one sent along", async () => {
    expect(await passkeyRegistrationOptions()).toMatchObject({ ok: true });
    expect(
      await passkeyRegistrationOptions({ twoFactorCode: "111111" }),
    ).toMatchObject({ ok: true });
    expect(await addPasskey({ response: {} })).toEqual({
      ok: true,
      data: { id: "pk_1" },
    });
    expect(state.calls).toEqual([
      "passkey-options",
      "passkey-options",
      "passkey-save",
    ]);
  });
});

describe("changing the email with two-step verification on", () => {
  it("refuses without a code, and leaves the emailed code unused", async () => {
    for (const twoFactorCode of [undefined, "", "x".repeat(100)]) {
      expect(await confirmEmailChange({ ...change, twoFactorCode })).toEqual({
        ok: false,
        error: ENTER_CODE,
        reason: "two-factor",
      });
    }
    expect(state.calls).toEqual([]);
  });

  it("refuses a wrong code, counted toward the lockout", async () => {
    expect(
      await confirmEmailChange({ ...change, twoFactorCode: "111111" }),
    ).toEqual({ ok: false, error: WRONG_TOTP, reason: "two-factor" });
    expect(state.row?.failedVerificationCount).toBe(1);
    expect(state.calls).toEqual(["totp:111111"]);
  });

  it("changes it with an authenticator code", async () => {
    expect(
      await confirmEmailChange({ ...change, twoFactorCode: TOTP }),
    ).toEqual({ ok: true });
    expect(state.calls).toEqual([`totp:${TOTP}`, "email-change"]);
  });

  it("changes it with a backup code, which is used up", async () => {
    expect(
      await confirmEmailChange({ ...change, twoFactorCode: "jklmnpqr45" }),
    ).toEqual({ ok: true });
    expect(state.backupCodes).toEqual(["ABCDE-FGH23"]);
  });

  it("still needs a recent sign-in, checked before the code", async () => {
    state.sessionCreatedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    expect(
      await confirmEmailChange({ ...change, twoFactorCode: "ABCDE-FGH23" }),
    ).toMatchObject({ ok: false, reason: "reauth" });
    expect(state.calls).toEqual([]);
  });
});

describe("changing the email with two-step verification off", () => {
  it("never asks for a code", async () => {
    state.twoFactorEnabled = false;
    state.row = null;
    expect(await confirmEmailChange(change)).toEqual({ ok: true });
    expect(
      await confirmEmailChange({ ...change, twoFactorCode: "111111" }),
    ).toEqual({ ok: true });
    expect(state.calls).toEqual(["email-change", "email-change"]);
  });
});
