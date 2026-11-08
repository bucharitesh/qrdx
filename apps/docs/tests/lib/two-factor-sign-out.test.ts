// Two-step verification's lifecycle and the account's sessions, against
// in-memory tables (tests/support/fake-db.ts) and a fake Better Auth whose
// TOTP, backup-code and passkey checks behave like the plugins' (the TOTP
// check swaps the session when it turns 2FA on, as the plugin does).
// Covers: every way of turning it on signs out the account's other sessions
// and keeps this one with its "Confirm it's you"; adding a second method
// signs nobody out; a refused or failed step signs nobody out; a sign-out
// that fails is reported, not hidden; support's reset, once its wait is
// over, signs out every session; and a backup code used in "Confirm it's you" is emailed (and
// never fails the confirmation). Nothing connects to a database.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIRMATION_REQUIRED } from "@/lib/account/confirmation";
import { NO_AUTHENTICATOR_SECRET } from "@/lib/account/two-factor-methods";
import { fakeDb } from "../support/fake-db";

const USER = "user_1";
const EMAIL = "ada@qrdx.test";
const SESSION = "session_1";
const TOTP = "654321";
const DAY = 86_400_000;

const state = vi.hoisted(() => ({
  sessionId: "session_1",
  backupCodes: [] as string[],
  /** The user id the fake passkey assertion belongs to */
  passkeyOwner: "user_1" as string | null,
  /** The fake TOTP check swaps the session but sends no cookie */
  swapWithoutCookie: false,
  /** signOutOtherSessions throws */
  failSignOut: false,
  /** sendBackupCodeUsedNotice throws when it's scheduled */
  failBackupNotice: false,
  /** after() callbacks wait for responseEnds() instead of running at once */
  deferAfter: false,
  afterQueue: [] as (() => unknown)[],
  calls: [] as string[],
  notices: [] as { kind: string; extra?: unknown }[],
  backupNotices: [] as Record<string, unknown>[],
  errors: [] as string[],
  cookies: [] as string[],
  secretSeq: 0,
  codeSeq: 0,
  admin: { id: "admin_1", email: "admin@qrdx.test", name: "Admin" },
  audit: [] as string[],
}));

const authError = (code: string) =>
  Object.assign(new Error(code), { body: { code } });

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({ host: "localhost:3000", "user-agent": "test" }),
  cookies: async () => ({
    set: (name: string) => state.cookies.push(name),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({
  after: (run: () => unknown) => {
    if (state.deferAfter) state.afterQueue.push(run);
    else void run();
  },
}));
vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
  slidingWindow: () => ({}),
}));
vi.mock("@repo/auth/passkey", () => ({ cookiesToSet: () => [] }));
vi.mock("@repo/auth/passkey-rp", () => ({
  passkeyRelyingParty: () => ({ rpID: "localhost", origin: "x" }),
  isPasskeyOrigin: () => true,
}));
vi.mock("@repo/auth/forward-cookies", () => ({
  forwardAuthCookies: async (headers: Headers | undefined) => {
    const cookie = headers?.get("set-cookie");
    if (cookie) state.cookies.push(cookie);
  },
}));
vi.mock("@/lib/feature-availability", () => ({
  isFeatureAvailable: () => true,
}));
vi.mock("@/lib/account/reauth", () => ({ signInCodesAvailable: () => true }));
vi.mock("@/lib/account/linked-sign-ins-server", () => ({
  linkedSignInsFor: async () => [],
  configuredSocialProviders: () => [],
}));
vi.mock("@/lib/delivery-guard", () => ({
  isOutboundDeliveryAllowed: () => false,
}));
vi.mock("@/lib/email/send", () => ({
  sendEmail: async () => ({ sent: true }),
}));
vi.mock("@/lib/shared", () => ({
  logError: (error: Error, context?: { action?: string }) =>
    state.errors.push(`${context?.action}: ${error.message}`),
}));
vi.mock("@/lib/account/two-factor-notice-server", () => ({
  sendTwoFactorNotice: async (
    kind: string,
    _email: string,
    options?: { extra?: unknown },
  ) => {
    state.notices.push({ kind, extra: options?.extra });
  },
  // Records the codes left when it's called: the real one counts them then.
  sendBackupCodeUsedNotice: (args: Record<string, unknown>) => {
    if (state.failBackupNotice) throw new Error("notice exploded");
    state.backupNotices.push({
      ...args,
      headers: undefined,
      codesLeftWhenCalled: state.backupCodes.length,
    });
    return Promise.resolve();
  },
}));
vi.mock("@/lib/account/passkeys-server", () => ({
  sendPasskeyNotice: async ({ change }: { change: string }) => {
    state.calls.push(`passkey-notice:${change}`);
  },
}));
// The attempts counter is one SQL statement in the app; here it always
// allows (the lockout has its own tests in account-confirmation.test.ts).
// Signing out can be made to fail.
vi.mock("@/lib/account/two-factor-server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/account/two-factor-server")>();
  return {
    ...actual,
    reserveCodeAttempt: async (userId: string) => {
      const { fakeDb: db } = await import("../support/fake-db");
      const row = db.find("twoFactor", { userId });
      return row
        ? { ok: true, id: row.id, attempts: 1 }
        : { ok: false, reason: "off" };
    },
    clearCodeFailures: async () => {},
    signOutOtherSessions: (
      ...args: Parameters<typeof actual.signOutOtherSessions>
    ) => {
      if (state.failSignOut) {
        return Promise.reject(new Error("database went away"));
      }
      return actual.signOutOtherSessions(...args);
    },
  };
});

// Support's action runs through the real runAdminAction, with the admin
// check, limits and audit log stubbed.
vi.mock("@/app/admin/_lib/guard", () => ({
  assertAdmin: async () => state.admin,
  requireAdmin: async () => state.admin,
  getAdminUser: async () => state.admin,
}));
vi.mock("@/app/admin/_lib/audit", () => ({
  writeAuditLog: async ({ action }: { action: string }) => {
    state.audit.push(action);
  },
}));
vi.mock("@/lib/request-guards", () => ({ enforceRateLimits: async () => {} }));
vi.mock("@/lib/connected-accounts/server", () => ({
  revokeStoredToken: async () => false,
}));
vi.mock("@/lib/data-connections/server", () => ({
  cleanupDataConnection: async () => false,
}));
vi.mock("@/lib/events/deliveries", () => ({
  claimDueDeliveries: async () => [],
  processClaimed: async () => ({ succeeded: 0, retrying: 0, failed: 0 }),
}));
vi.mock("@/lib/migrate/server/repo", () => ({
  JOB_STORE_PROVIDER: "qrdx-import",
}));
vi.mock("@/lib/account/email-change-server", () => ({
  afterEmailChanged: async () => {},
}));

/** The fake twoFactor and passkey plugins, on the in-memory tables. */
vi.mock("@repo/auth/server", async () => {
  const { fakeDb: db } = await import("../support/fake-db");
  const row = () => db.find("twoFactor", { userId: "user_1" });
  const user = () => db.find("user", { id: "user_1" });
  const newCodes = () => {
    state.codeSeq += 1;
    return [`AAAAA-BBB${state.codeSeq}2`, `CCCCC-DDD${state.codeSeq}3`];
  };
  return {
    auth: {
      api: {
        getSession: async () => ({
          user: { id: "user_1", email: "ada@qrdx.test" },
          session: { id: state.sessionId, createdAt: new Date() },
        }),
        viewBackupCodes: async () => ({ backupCodes: [...state.backupCodes] }),
        enableTwoFactor: async () => {
          state.calls.push("enable");
          const existing = row();
          if (existing && existing.verified !== false) {
            throw authError("TOTP_ALREADY_ENABLED");
          }
          state.secretSeq += 1;
          const data = {
            secret: `enc-secret-${state.secretSeq}`,
            backupCodes: `enc-codes-${state.secretSeq}`,
            verified: false,
          };
          if (existing) Object.assign(existing, data);
          else
            db.seed("twoFactor", [{ id: "tf_1", userId: "user_1", ...data }]);
          state.backupCodes = newCodes();
          return {
            totpURI: `otpauth://totp/QRdx:ada?secret=SECRET${state.secretSeq}&issuer=QRdx`,
            backupCodes: [...state.backupCodes],
          };
        },
        // Like the plugin: confirming an unconfirmed row turns 2FA on when it
        // was off, makes a new session, sets its cookie and deletes the old.
        verifyTOTP: async ({ body }: { body: { code: string } }) => {
          state.calls.push(`totp:${body.code}`);
          const found = row();
          if (!found) throw authError("TOTP_NOT_ENABLED");
          if (body.code !== TOTP) throw authError("INVALID_CODE");
          const headers = new Headers();
          if (found.verified !== true) {
            const owner = user();
            if (owner && !owner.twoFactorEnabled) {
              owner.twoFactorEnabled = true;
              db.seed("session", [
                {
                  id: "session_new",
                  token: "token_new",
                  userId: "user_1",
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  expiresAt: new Date(Date.now() + DAY),
                },
              ]);
              const sessions = db.rows("session");
              sessions.splice(
                sessions.findIndex((entry) => entry.id === state.sessionId),
                1,
              );
              if (!state.swapWithoutCookie) {
                headers.set(
                  "set-cookie",
                  "better-auth.session_token=token_new.sig; Path=/; HttpOnly",
                );
              }
            }
            found.verified = true;
          }
          return { headers, response: { token: "t" } };
        },
        verifyBackupCode: async ({ body }: { body: { code: string } }) => {
          state.calls.push(`backup:${body.code}`);
          const index = state.backupCodes.indexOf(body.code);
          if (index === -1) throw authError("INVALID_BACKUP_CODE");
          state.backupCodes.splice(index, 1);
          return {};
        },
        generatePasskeyAuthenticationOptions: async () => ({
          headers: new Headers(),
          response: {
            challenge: "c",
            allowCredentials: db
              .rows("passkey")
              .map((entry) => ({ id: entry.credentialID })),
          },
        }),
        // Signs in as the passkey's owner, like the plugin.
        verifyPasskeyAuthentication: async () => {
          if (!state.passkeyOwner) throw authError("AUTHENTICATION_FAILED");
          db.seed("session", [
            {
              id: "passkey_session",
              token: "passkey_token",
              userId: state.passkeyOwner,
              createdAt: new Date(),
              updatedAt: new Date(),
              expiresAt: new Date(Date.now() + DAY),
            },
          ]);
          return {
            session: { token: "passkey_token" },
            user: { id: state.passkeyOwner },
          };
        },
        verifyPasskeyRegistration: async () => {
          state.calls.push("passkey-save");
          const id = `pk_${db.rows("passkey").length + 1}`;
          db.seed("passkey", [
            { id, userId: "user_1", name: "Mac", credentialID: `cred_${id}` },
          ]);
          return { id, name: "Mac" };
        },
      },
    },
  };
});

const server = await import("@/lib/account/confirmation-server");
const manage = await import("@/lib/account/two-factor-manage");
const passkeyActions = await import(
  "@/app/settings/account/_lib/passkey-actions"
);
const { resetTwoFactorAction } = await import(
  "@/app/admin/users/support-actions"
);
const reset = await import("@/lib/account/two-factor-reset-server");

/** The account, optionally with 2FA on (passkeys only, or with the app). */
function account({
  on = false,
  app = false,
  passkeys = 0,
}: {
  on?: boolean;
  app?: boolean;
  passkeys?: number;
} = {}) {
  fakeDb.seed("user", [
    { id: USER, email: EMAIL, twoFactorEnabled: on, updatedAt: new Date() },
  ]);
  if (on) {
    fakeDb.seed("twoFactor", [
      {
        id: "tf_1",
        userId: USER,
        secret: app ? "enc-secret-0" : NO_AUTHENTICATOR_SECRET,
        backupCodes: "enc-codes-0",
        verified: app,
      },
    ]);
    state.backupCodes = ["ABCDE-FGH23", "JKLMN-PQR45", "STUVW-XYZ67"];
  }
  for (let i = 1; i <= passkeys; i++) {
    fakeDb.seed("passkey", [
      { id: `pk_${i}`, userId: USER, name: `Key ${i}`, credentialID: `c${i}` },
    ]);
  }
}

const sessionRow = (id: string, userId = USER) => ({
  id,
  token: `token_${id}`,
  userId,
  createdAt: new Date(),
  updatedAt: new Date(),
  expiresAt: new Date(Date.now() + DAY),
});

/** This browser, a phone and a laptop of the account, and someone else's. */
function sessions() {
  fakeDb.seed("session", [
    sessionRow(SESSION),
    sessionRow("session_phone"),
    sessionRow("session_laptop"),
    sessionRow("session_other_person", "user_2"),
  ]);
}

const sessionIds = () =>
  fakeDb
    .rows("session")
    .map((row) => String(row.id))
    .sort();

const confirmedFor = () =>
  fakeDb
    .rows("verification")
    .filter((row) => String(row.identifier).startsWith("qrdx-confirmed-"))
    .map((row) => String(row.identifier));

const confirmNow = () =>
  server.recordConfirmation({ userId: USER, sessionId: state.sessionId });

beforeEach(() => {
  fakeDb.resetAll();
  state.sessionId = SESSION;
  state.backupCodes = [];
  state.passkeyOwner = USER;
  state.swapWithoutCookie = false;
  state.failSignOut = false;
  state.failBackupNotice = false;
  state.deferAfter = false;
  state.afterQueue = [];
  state.calls = [];
  state.notices = [];
  state.backupNotices = [];
  state.errors = [];
  state.cookies = [];
  state.secretSeq = 0;
  state.codeSeq = 0;
  state.audit = [];
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Turning it on signs out the other sessions ─────────────────────────────

describe("turning two-step verification on", () => {
  it("with a first passkey: signs out the account's other sessions, keeps this one and its confirmation", async () => {
    account();
    sessions();
    await confirmNow();
    const result = await passkeyActions.addPasskey({ response: { id: "x" } });
    expect(result).toMatchObject({
      ok: true,
      data: { backupCodes: expect.any(Array), signedOutElsewhere: true },
    });
    expect(fakeDb.find("user", { id: USER })?.twoFactorEnabled).toBe(true);
    expect(sessionIds()).toEqual([SESSION, "session_other_person"]);
    // Still confirmed: the next change in the 10 minutes doesn't ask again.
    expect(confirmedFor()).toEqual([`qrdx-confirmed-${SESSION}`]);
    expect(
      await server.requireRecentConfirmation({
        userId: USER,
        sessionId: SESSION,
        sessionCreatedAt: new Date(),
      }),
    ).toBeNull();
    // The "on" notice says so.
    expect(state.notices).toEqual([
      { kind: "on", extra: { signedOutElsewhere: true } },
    ]);
  });

  it("with an existing passkey (the legacy holders): signs out the others too", async () => {
    account({ passkeys: 1 });
    sessions();
    await confirmNow();
    const result = await manage.turnOnWithExistingPasskey({
      response: { id: "c1" },
    });
    expect(result).toMatchObject({
      ok: true,
      backupCodes: expect.any(Array),
      signedOutElsewhere: true,
    });
    // The plugin's own passkey session went too.
    expect(sessionIds()).toEqual([SESSION, "session_other_person"]);
    expect(confirmedFor()).toEqual([`qrdx-confirmed-${SESSION}`]);
  });

  it("with the authenticator app: keeps the session Better Auth swapped in, with the confirmation, and signs out the rest", async () => {
    account();
    sessions();
    await confirmNow();
    expect(await manage.startAuthenticatorSetup()).toMatchObject({ ok: true });
    const result = await manage.confirmAuthenticatorSetup({ code: TOTP });
    expect(result).toMatchObject({
      ok: true,
      backupCodes: expect.any(Array),
      signedOutElsewhere: true,
    });
    // The swap deleted the old one; the new one is the only one left.
    expect(sessionIds()).toEqual(["session_new", "session_other_person"]);
    expect(confirmedFor()).toEqual(["qrdx-confirmed-session_new"]);
    expect(
      await server.requireRecentConfirmation({
        userId: USER,
        sessionId: "session_new",
        sessionCreatedAt: new Date(),
      }),
    ).toBeNull();
    expect(state.notices).toEqual([
      { kind: "on", extra: { signedOutElsewhere: true } },
    ]);
  });

  it("never signs this person out when the swap's cookie can't be read", async () => {
    account();
    sessions();
    await confirmNow();
    state.swapWithoutCookie = true;
    await manage.startAuthenticatorSetup();
    const result = await manage.confirmAuthenticatorSetup({ code: TOTP });
    // On, but nobody was signed out (the new session can't be told apart),
    // and that's said and logged.
    expect(result).toMatchObject({ ok: true, signedOutElsewhere: false });
    expect(sessionIds()).toContain("session_new");
    expect(sessionIds()).toContain("session_phone");
    expect(state.errors.join("\n")).toMatch(
      /confirmAuthenticatorSetup\.signOutElsewhere: No session to keep/,
    );
    expect(state.notices).toEqual([
      { kind: "on", extra: { signedOutElsewhere: false } },
    ]);
  });

  it("reports a sign-out that failed instead of hiding it: on, flagged, logged", async () => {
    account();
    sessions();
    await confirmNow();
    state.failSignOut = true;
    const result = await passkeyActions.addPasskey({ response: { id: "x" } });
    expect(result).toMatchObject({
      ok: true,
      data: { backupCodes: expect.any(Array), signedOutElsewhere: false },
    });
    expect(fakeDb.find("user", { id: USER })?.twoFactorEnabled).toBe(true);
    expect(state.errors).toContain(
      "account.twoFactor.signOutElsewhere: database went away",
    );
    expect(state.notices).toEqual([
      { kind: "on", extra: { signedOutElsewhere: false } },
    ]);
  });
});

describe("what doesn't sign anyone out", () => {
  it("adding a passkey while it's on", async () => {
    account({ on: true, passkeys: 1 });
    sessions();
    await confirmNow();
    const result = await passkeyActions.addPasskey({ response: { id: "x" } });
    expect(result).toMatchObject({ ok: true, data: { backupCodes: null } });
    expect(sessionIds()).toEqual([
      SESSION,
      "session_laptop",
      "session_other_person",
      "session_phone",
    ]);
  });

  it("adding the authenticator app while it's on", async () => {
    account({ on: true, passkeys: 1 });
    sessions();
    await confirmNow();
    await manage.startAuthenticatorSetup();
    expect(await manage.confirmAuthenticatorSetup({ code: TOTP })).toEqual({
      ok: true,
      backupCodes: null,
    });
    expect(sessionIds()).toHaveLength(4);
    expect(state.notices).toEqual([{ kind: "app-added", extra: undefined }]);
  });

  it("a turn-on without a recent confirmation", async () => {
    account({ passkeys: 1 });
    sessions();
    expect(
      await manage.turnOnWithExistingPasskey({ response: { id: "c1" } }),
    ).toEqual({ ok: false, error: CONFIRMATION_REQUIRED });
    expect(
      await passkeyActions.addPasskey({ response: { id: "x" } }),
    ).toMatchObject({ ok: false, error: CONFIRMATION_REQUIRED });
    expect(sessionIds()).toHaveLength(4);
  });

  it("a wrong first code from the app", async () => {
    account();
    sessions();
    await confirmNow();
    await manage.startAuthenticatorSetup();
    expect(
      await manage.confirmAuthenticatorSetup({ code: "111111" }),
    ).toMatchObject({ ok: false });
    expect(sessionIds()).toHaveLength(4);
    expect(fakeDb.find("user", { id: USER })?.twoFactorEnabled).toBe(false);
  });

  it("another person's passkey trying to turn it on", async () => {
    account({ passkeys: 1 });
    sessions();
    await confirmNow();
    state.passkeyOwner = "user_2";
    expect(
      await manage.turnOnWithExistingPasskey({ response: { id: "x" } }),
    ).toMatchObject({ ok: false });
    expect(sessionIds()).toHaveLength(4);
  });

  it("turning it off", async () => {
    account({ on: true, app: true });
    sessions();
    await confirmNow();
    expect(await manage.turnOffTwoFactor()).toEqual({ ok: true });
    expect(sessionIds()).toHaveLength(4);
  });
});

// ─── Support's reset ─────────────────────────────────────────────────────────

describe("support turning it off", () => {
  // Scheduling and cancelling it are in two-factor-reset.test.ts; this is the
  // reset itself, when the daily cron completes it after the 7 days.
  it("signs out every session of the account, and nobody else's", async () => {
    account({ on: true, app: true });
    sessions();
    fakeDb.seed("verification", [
      {
        id: "v_trust",
        identifier: "trust-device-abc",
        value: USER,
        expiresAt: new Date(Date.now() + DAY),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    await reset.scheduleTwoFactorReset({
      userId: USER,
      admin: state.admin,
      now: new Date(Date.now() - 8 * DAY),
    });
    // Scheduled: nothing changed yet.
    expect(sessionIds()).toHaveLength(4);
    expect(await reset.completeDueTwoFactorResets()).toEqual({
      completed: 1,
      dropped: 0,
      failed: 0,
    });
    expect(sessionIds()).toEqual(["session_other_person"]);
    expect(fakeDb.find("user", { id: USER })?.twoFactorEnabled).toBe(false);
    expect(fakeDb.rows("twoFactor")).toHaveLength(0);
    expect(fakeDb.find("verification", { id: "v_trust" })).toBeUndefined();
    expect(state.notices).toEqual([{ kind: "support-off", extra: undefined }]);
    expect(state.audit).toEqual(["user.reset_two_factor_complete"]);
  });

  it("does nothing when it's already off", async () => {
    account();
    sessions();
    expect(
      await resetTwoFactorAction({ userId: USER, reason: "Ticket 1234" }),
    ).toMatchObject({ ok: false });
    expect(sessionIds()).toHaveLength(4);
  });
});

// ─── A backup code used in "Confirm it's you" ───────────────────────────────

describe("a backup code used to confirm it's you", () => {
  it("emails the account's address, after the confirmation is recorded", async () => {
    account({ on: true, app: true });
    expect(await server.confirmWithCode({ code: "jklmn pqr45" })).toEqual({
      ok: true,
    });
    expect(state.backupNotices).toEqual([
      {
        userId: USER,
        email: EMAIL,
        usedFor: "confirm",
        headers: undefined,
        codesLeftWhenCalled: 2,
      },
    ]);
    expect(state.backupCodes).toEqual(["ABCDE-FGH23", "STUVW-XYZ67"]);
  });

  it("is started when the code is used, before the confirmed action can make new codes", async () => {
    account({ on: true, app: true });
    state.deferAfter = true;
    expect(await server.confirmWithCode({ code: "ABCDE-FGH23" })).toEqual({
      ok: true,
    });
    // The action it confirmed: new backup codes, before the response ends.
    state.backupCodes = ["NEWAA-AAA22", "NEWBB-BBB22", "NEWCC-CCC22"];
    for (const run of state.afterQueue.splice(0)) await run();
    expect(state.backupNotices).toMatchObject([
      { usedFor: "confirm", codesLeftWhenCalled: 2 },
    ]);
  });

  it("an authenticator code or a wrong backup code sends nothing", async () => {
    account({ on: true, app: true });
    expect(await server.confirmWithCode({ code: TOTP })).toEqual({ ok: true });
    expect(await server.confirmWithCode({ code: "ZZZZZ-ZZZ22" })).toMatchObject(
      { ok: false },
    );
    expect(state.backupNotices).toEqual([]);
  });

  it("a notice that fails never fails the confirmation", async () => {
    account({ on: true, app: true });
    state.failBackupNotice = true;
    expect(await server.confirmWithCode({ code: "ABCDE-FGH23" })).toEqual({
      ok: true,
    });
    // A backup code confirms, and strongly (support actions ask for that).
    expect(confirmedFor()).toEqual([
      `qrdx-confirmed-${SESSION}`,
      `qrdx-confirmed-strong-${SESSION}`,
    ]);
    expect(state.errors).toContain("account.backupCodeNotice: notice exploded");
  });
});
