// "Confirm it's you" and the two-step verification methods model, against
// in-memory tables (tests/support/fake-db.ts) and a fake Better Auth whose
// TOTP, backup-code and passkey checks behave like the plugins' (including
// the twoFactor plugin's session path, which doesn't look at `verified`).
// Covers: the 10-minute confirmation per session, each method (passkey,
// authenticator code, backup code, emailed code), which methods each kind of
// account gets (including a dead inbox), the shared lockout, a
// passkey-only account refusing TOTP everywhere, turning on with a passkey
// or an app, adding a second method, removing the last one, and that every
// gated action answers CONFIRMATION_REQUIRED before doing anything.
// Nothing connects to a database.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONFIRMATION_MESSAGES,
  CONFIRMATION_REQUIRED,
  confirmationMethodsFor,
  mailProviderFor,
  maskEmail,
  needsConfirmation,
} from "@/lib/account/confirmation";
import {
  authenticatorSetupStarted,
  hasAuthenticatorApp,
  NO_AUTHENTICATOR_SECRET,
  passkeyReadyForTwoFactor,
  removalTurnsOff,
} from "@/lib/account/two-factor-methods";
import { fakeDb } from "../support/fake-db";

const USER = "user_1";
const EMAIL = "ada@qrdx.test";
const SESSION = "session_1";
const TOTP = "654321";

const state = vi.hoisted(() => ({
  sessionId: "session_1",
  sessionCreatedAt: new Date(),
  codesAvailable: true,
  passkeysHere: true,
  backupCodes: [] as string[],
  /** The user id the fake passkey assertion belongs to (null: refused) */
  passkeyOwner: "user_1" as string | null,
  /** The fake assertion's user verification */
  passkeyUserVerified: true,
  /** A refusal after the assertion checked out (a sign-in rule), if any */
  passkeyRefusal: null as string | null,
  /** Whether each passkey check ran marked as no sign-in */
  passkeyCheckMarked: [] as boolean[],
  attempts: { count: 0, lockedUntil: 0 },
  calls: [] as string[],
  notices: [] as string[],
  logged: [] as string[],
  errors: [] as string[],
  cookies: [] as string[],
  /** linkedSignInsFor's answer: Google, GitHub or SSO the account can use */
  signIns: [] as ("google" | "github" | "sso")[],
  secretSeq: 0,
  codeSeq: 0,
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
    void run();
  },
}));
vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
  slidingWindow: () => ({}),
}));
vi.mock("@repo/auth/passkey", () => ({ cookiesToSet: () => [] }));
vi.mock("@repo/auth/passkey-rp", () => ({
  passkeyRelyingParty: () => ({ rpID: "localhost", origin: "x" }),
  isPasskeyOrigin: () => state.passkeysHere,
}));
vi.mock("@repo/auth/forward-cookies", () => ({
  forwardAuthCookies: async (headers: Headers | undefined) => {
    const cookie = headers?.get("set-cookie");
    if (cookie) state.cookies.push(cookie);
  },
}));
vi.mock("@repo/auth/email-otp", () => ({
  registerEmailChangeCodeSender: () => {},
}));
vi.mock("@/lib/feature-availability", () => ({
  isFeatureAvailable: () => true,
}));
vi.mock("@/lib/account/reauth", () => ({
  signInCodesAvailable: () => state.codesAvailable,
}));
// Which sign-ins are linked is tested in account-confirm-sign-in.test.ts.
vi.mock("@/lib/account/linked-sign-ins-server", () => ({
  linkedSignInsFor: async () => [...state.signIns],
  configuredSocialProviders: () => ["google", "github"],
}));
vi.mock("@/lib/delivery-guard", () => ({
  isOutboundDeliveryAllowed: () => false,
}));
vi.mock("@/lib/email/send", () => ({
  sendEmail: async () => ({ sent: true }),
}));
vi.mock("@/lib/shared", () => ({
  logError: (error: Error) => state.errors.push(error.message),
}));
vi.mock("@/lib/account/two-factor-notice-server", () => ({
  sendTwoFactorNotice: async (kind: string) => {
    state.notices.push(`two-factor:${kind}`);
  },
  sendBackupCodeUsedNotice: async ({ usedFor }: { usedFor: string }) => {
    state.notices.push(`backup-code-used:${usedFor}`);
  },
}));
vi.mock("@/lib/account/passkeys-server", () => ({
  sendPasskeyNotice: async ({ change }: { change: string }) => {
    state.notices.push(`passkey:${change}`);
  },
}));
vi.mock("@/lib/auth/email-change-code", () => ({
  sendEmailChangeCode: async () => {},
}));
vi.mock("@/lib/account/email-change-server", () => ({
  afterEmailChanged: async () => {
    state.notices.push("email-changed");
  },
}));
vi.mock("@/lib/account/deletion-server", () => ({
  AccountDeletionError: class extends Error {},
  loadDeletionFacts: async () => ({
    teams: [],
    subscription: null,
    billingConfigured: true,
    personal: { codes: 0, pages: 0, files: 0, domains: 0 },
  }),
  executeAccountDeletion: async () => {
    state.calls.push("delete-account");
  },
}));
// The attempts counter is one SQL statement in the app; here the same rules
// in memory: refuse while locked, an expired lock starts again from 1, the
// 10th attempt sets the lock.
vi.mock("@/lib/account/two-factor-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/account/two-factor-server")>()),
  reserveCodeAttempt: async (userId: string) => {
    const row = fakeDb.find("twoFactor", { userId });
    if (!row) return { ok: false, reason: "off" };
    const now = Date.now();
    if (state.attempts.lockedUntil > now)
      return { ok: false, reason: "locked" };
    const attempts = state.attempts.lockedUntil ? 1 : state.attempts.count + 1;
    state.attempts.count = attempts;
    state.attempts.lockedUntil = attempts >= 10 ? now + 15 * 60_000 : 0;
    return { ok: true, id: row.id, attempts };
  },
  clearCodeFailures: async () => {
    state.attempts = { count: 0, lockedUntil: 0 };
  },
  releaseCodeAttempt: async () => {
    const count = Math.max(state.attempts.count - 1, 0);
    state.attempts = {
      count,
      lockedUntil: count >= 10 ? state.attempts.lockedUntil : 0,
    };
  },
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
          session: { id: state.sessionId, createdAt: state.sessionCreatedAt },
        }),
        viewBackupCodes: async () => ({ backupCodes: [...state.backupCodes] }),
        enableTwoFactor: async () => {
          state.calls.push("enable");
          const existing = row();
          if (existing && existing.verified !== false) {
            throw authError("TOTP_ALREADY_ENABLED");
          }
          state.secretSeq += 1;
          const secret = `enc-secret-${state.secretSeq}`;
          const codes = newCodes();
          const data = {
            secret,
            backupCodes: `enc-codes-${state.secretSeq}`,
            verified: false,
          };
          if (existing) Object.assign(existing, data);
          else
            db.seed("twoFactor", [{ id: "tf_1", userId: "user_1", ...data }]);
          state.backupCodes = codes;
          return {
            totpURI: `otpauth://totp/QRdx:ada?secret=SECRET${state.secretSeq}&issuer=QRdx`,
            backupCodes: codes,
          };
        },
        // With a session the plugin checks the code against the secret and,
        // for an unconfirmed row, confirms it (turning 2FA on and swapping
        // the session when it was off). It never looks at `verified` first.
        verifyTOTP: async ({ body }: { body: { code: string } }) => {
          state.calls.push(`totp:${body.code}`);
          const found = row();
          if (!found) throw authError("TOTP_NOT_ENABLED");
          if (found.secret === "") throw new Error("decrypt failed");
          if (body.code !== TOTP) throw authError("INVALID_CODE");
          const headers = new Headers();
          if (found.verified !== true) {
            const owner = user();
            if (owner && !owner.twoFactorEnabled) {
              owner.twoFactorEnabled = true;
              db.seed("session", [
                {
                  id: "session_2",
                  token: "token_2",
                  userId: "user_1",
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  expiresAt: new Date(Date.now() + 86_400_000),
                },
              ]);
              headers.set(
                "set-cookie",
                "better-auth.session_token=token_2.sig; Path=/; HttpOnly",
              );
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
        generateBackupCodes: async () => {
          state.calls.push("generate-backup-codes");
          state.backupCodes = newCodes();
          return { backupCodes: [...state.backupCodes] };
        },
        generatePasskeyAuthenticationOptions: async () => {
          state.calls.push("passkey-options");
          return {
            headers: new Headers(),
            response: {
              challenge: "c",
              allowCredentials: db
                .rows("passkey")
                .map((entry) => ({ id: entry.credentialID })),
              userVerification: "preferred",
            },
          };
        },
        // Signs in as the passkey's owner, like the plugin.
        verifyPasskeyAuthentication: async () => {
          state.calls.push("passkey-verify");
          const { isPasskeyCheckWithoutSignIn } = await import(
            "@repo/auth/passkey-check"
          );
          state.passkeyCheckMarked.push(
            isPasskeyCheckWithoutSignIn({
              path: "/passkey/verify-authentication",
            }),
          );
          if (!state.passkeyOwner) throw authError("AUTHENTICATION_FAILED");
          if (!state.passkeyUserVerified) {
            throw authError("PASSKEY_USER_VERIFICATION_REQUIRED");
          }
          // A rule refusing the session the plugin makes, after the
          // assertion checked out.
          if (state.passkeyRefusal) throw authError(state.passkeyRefusal);
          db.seed("session", [
            {
              id: "passkey_session",
              token: "passkey_token",
              userId: state.passkeyOwner,
              createdAt: new Date(),
              updatedAt: new Date(),
              expiresAt: new Date(Date.now() + 86_400_000),
            },
          ]);
          return {
            session: { token: "passkey_token" },
            user: { id: state.passkeyOwner },
          };
        },
        generatePasskeyRegistrationOptions: async () => {
          state.calls.push("passkey-register-options");
          return { headers: new Headers(), response: { challenge: "r" } };
        },
        verifyPasskeyRegistration: async () => {
          state.calls.push("passkey-save");
          const id = `pk_${db.rows("passkey").length + 1}`;
          db.seed("passkey", [
            { id, userId: "user_1", name: "Mac", credentialID: `cred_${id}` },
          ]);
          return { id, name: "Mac" };
        },
        listPasskeys: async () =>
          db.rows("passkey").filter((entry) => entry.userId === "user_1"),
        deletePasskey: async ({ body }: { body: { id: string } }) => {
          state.calls.push(`passkey-delete:${body.id}`);
          const rows = db.rows("passkey");
          rows.splice(
            rows.findIndex((entry) => entry.id === body.id),
            1,
          );
        },
        updatePasskey: async () => {
          state.calls.push("passkey-rename");
        },
        requestEmailChangeEmailOTP: async () => {
          state.calls.push("email-change-request");
        },
        changeEmailEmailOTP: async () => {
          state.calls.push("email-change");
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
const emailActions = await import(
  "@/app/settings/account/_lib/email-change-actions"
);
const { deleteAccount } = await import("@/actions/account");
const { loadTwoFactorMethods } = await import(
  "@/lib/account/two-factor-server"
);

/** The account: `twoFactor` holds the row's facts when it has one. */
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
    state.backupCodes = ["ABCDE-FGH23", "JKLMN-PQR45"];
  }
  for (let i = 1; i <= passkeys; i++) {
    fakeDb.seed("passkey", [
      { id: `pk_${i}`, userId: USER, name: `Key ${i}`, credentialID: `c${i}` },
    ]);
  }
}

const confirmedRows = () =>
  fakeDb
    .rows("verification")
    .filter(
      (row) =>
        String(row.identifier).startsWith("qrdx-confirmed-") &&
        !String(row.identifier).startsWith("qrdx-confirmed-strong-"),
    );
/** Confirmations made with a passkey, an authenticator or a backup code. */
const strongRows = () =>
  fakeDb
    .rows("verification")
    .filter((row) =>
      String(row.identifier).startsWith("qrdx-confirmed-strong-"),
    );
const strongNow = (sessionId = SESSION) =>
  server.hasRecentStrongConfirmation({ userId: USER, sessionId });

async function confirmNow() {
  await server.recordConfirmation({ userId: USER, sessionId: state.sessionId });
}

let info: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fakeDb.resetAll();
  state.sessionId = SESSION;
  state.sessionCreatedAt = new Date();
  state.codesAvailable = true;
  state.passkeysHere = true;
  state.backupCodes = [];
  state.passkeyOwner = USER;
  state.passkeyUserVerified = true;
  state.passkeyRefusal = null;
  state.passkeyCheckMarked = [];
  state.attempts = { count: 0, lockedUntil: 0 };
  state.calls = [];
  state.notices = [];
  state.logged = [];
  state.errors = [];
  state.cookies = [];
  state.signIns = [];
  state.secretSeq = 0;
  state.codeSeq = 0;
  info = vi
    .spyOn(console, "info")
    .mockImplementation((line: unknown) => state.logged.push(String(line)));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  info.mockRestore();
  vi.restoreAllMocks();
});

// ─── Pure rules ──────────────────────────────────────────────────────────────

describe("the confirmation rules", () => {
  it("never offers an emailed code to a two-step account", () => {
    expect(
      confirmationMethodsFor({
        twoFactorOn: true,
        authenticatorApp: true,
        passkeys: 2,
        emailCodes: true,
      }),
    ).toEqual(["passkey", "totp", "backup"]);
    expect(
      confirmationMethodsFor({
        twoFactorOn: true,
        authenticatorApp: false,
        passkeys: 1,
        emailCodes: true,
      }),
    ).toEqual(["passkey", "backup"]);
    expect(
      confirmationMethodsFor({
        twoFactorOn: true,
        authenticatorApp: true,
        passkeys: 0,
        emailCodes: true,
        signIns: ["google", "sso"],
      }),
    ).toEqual(["totp", "backup"]);
  });

  it("without two-step: a passkey, the emailed code, then linked sign-ins", () => {
    expect(
      confirmationMethodsFor({
        twoFactorOn: false,
        authenticatorApp: false,
        passkeys: 3,
        emailCodes: true,
      }),
    ).toEqual(["passkey", "email"]);
    expect(
      confirmationMethodsFor({
        twoFactorOn: false,
        authenticatorApp: false,
        passkeys: 0,
        emailCodes: true,
        signIns: ["sso", "github", "google"],
      }),
    ).toEqual(["email", "google", "github", "sso"]);
    expect(
      confirmationMethodsFor({
        twoFactorOn: false,
        authenticatorApp: false,
        passkeys: 1,
        emailCodes: false,
        signIns: ["github"],
      }),
    ).toEqual(["passkey", "github", "sign-in-again"]);
    expect(
      confirmationMethodsFor({
        twoFactorOn: false,
        authenticatorApp: false,
        passkeys: 0,
        emailCodes: false,
      }),
    ).toEqual(["sign-in-again"]);
  });

  it("recognises both result shapes that ask for it", () => {
    expect(needsConfirmation({ ok: false, error: CONFIRMATION_REQUIRED })).toBe(
      true,
    );
    expect(
      needsConfirmation({
        success: false,
        error: { code: CONFIRMATION_REQUIRED, message: "x" },
      }),
    ).toBe(true);
    expect(needsConfirmation({ ok: false, error: "Something" })).toBe(false);
    expect(needsConfirmation({ ok: true })).toBe(false);
    expect(needsConfirmation(null)).toBe(false);
  });

  it("masks the address and knows the big webmails", () => {
    expect(maskEmail("ritesh@gmail.com")).toBe("r…@gmail.com");
    expect(mailProviderFor("a@gmail.com")?.label).toBe("Open Gmail");
    expect(mailProviderFor("a@Outlook.com")?.label).toBe("Open Outlook");
    expect(mailProviderFor("a@qrdx.test")).toBeNull();
  });

  it("reads the new session's token from Better Auth's Set-Cookie", () => {
    expect(
      server.sessionTokenFromSetCookie(
        "better-auth.session_token=abc123.c2ln; Path=/; HttpOnly, better-auth.dont_remember=; Max-Age=0",
      ),
    ).toBe("abc123");
    expect(
      server.sessionTokenFromSetCookie(
        "__Secure-better-auth.session_token=tok%2Bx.sig; Path=/",
      ),
    ).toBe("tok+x");
    expect(server.sessionTokenFromSetCookie("other=1")).toBeNull();
    // Refreshing the old session while reading it sets its cookie first;
    // the swap's new one comes after and is the one the browser keeps.
    expect(
      server.sessionTokenFromSetCookie(
        "better-auth.session_token=old.c2ln; Path=/; HttpOnly, better-auth.session_token=new.c2ln; Path=/; HttpOnly",
      ),
    ).toBe("new");
  });
});

describe("the methods model", () => {
  it("counts an app only when it's set up and has a secret", () => {
    expect(hasAuthenticatorApp({ verified: true, secret: "enc" })).toBe(true);
    // Rows from before the `verified` column.
    expect(hasAuthenticatorApp({ verified: null, secret: "enc" })).toBe(true);
    expect(hasAuthenticatorApp({ verified: false, secret: "enc" })).toBe(false);
    expect(
      hasAuthenticatorApp({ verified: true, secret: NO_AUTHENTICATOR_SECRET }),
    ).toBe(false);
    expect(hasAuthenticatorApp(null)).toBe(false);
    expect(authenticatorSetupStarted({ verified: false, secret: "enc" })).toBe(
      true,
    );
    expect(
      authenticatorSetupStarted({
        verified: false,
        secret: NO_AUTHENTICATOR_SECRET,
      }),
    ).toBe(false);
  });

  it("knows when removing a method turns it off", () => {
    const on = { on: true, authenticatorApp: false, passkeys: 1 };
    expect(removalTurnsOff(on, "passkey")).toBe(true);
    expect(removalTurnsOff({ ...on, passkeys: 2 }, "passkey")).toBe(false);
    expect(removalTurnsOff({ ...on, authenticatorApp: true }, "passkey")).toBe(
      false,
    );
    expect(
      removalTurnsOff(
        { on: true, authenticatorApp: true, passkeys: 0 },
        "authenticator",
      ),
    ).toBe(true);
    expect(
      removalTurnsOff(
        { on: true, authenticatorApp: true, passkeys: 1 },
        "authenticator",
      ),
    ).toBe(false);
    expect(removalTurnsOff({ ...on, on: false }, "passkey")).toBe(false);
    expect(passkeyReadyForTwoFactor({ on: false, passkeys: 1 })).toBe(true);
    expect(passkeyReadyForTwoFactor({ on: true, passkeys: 1 })).toBe(false);
  });

  it("loads a passkey-only account as on, without an app", async () => {
    account({ on: true, passkeys: 1 });
    expect(await loadTwoFactorMethods(USER)).toEqual({
      on: true,
      authenticatorApp: false,
      passkeys: 1,
      backupCodesLeft: 2,
    });
  });

  it("keeps existing authenticator accounts as they were", async () => {
    account({ on: true, app: true });
    expect(await loadTwoFactorMethods(USER)).toMatchObject({
      on: true,
      authenticatorApp: true,
      passkeys: 0,
    });
  });
});

// ─── The confirmation record ────────────────────────────────────────────────

// The kinds of account #246 shipped with, plus a mailbox that no longer
// works: what each can confirm with. "Dead inbox" means the emailed code is
// useless to them, so they need something else on this list.
describe("what each kind of account can confirm with", () => {
  const session = () => ({
    userId: USER,
    email: EMAIL,
    sessionId: SESSION,
    sessionCreatedAt: new Date(),
    requestHeaders: new Headers({ host: "localhost:3000" }),
  });
  const methods = async () =>
    (await server.loadConfirmationOptions(session())).methods;

  it("1. email codes only: the emailed code", async () => {
    account();
    expect(await methods()).toEqual(["email"]);
  });

  it("2. Google or GitHub linked: the code, or signing in with them again", async () => {
    account();
    state.signIns = ["google", "github"];
    expect(await methods()).toEqual(["email", "google", "github"]);
  });

  it("3. a passkey without two-step: the passkey first", async () => {
    account({ passkeys: 1 });
    expect(await methods()).toEqual(["passkey", "email"]);
  });

  it("4. two-step with passkeys only: passkey or backup code, never email or Google", async () => {
    account({ on: true, passkeys: 1 });
    state.signIns = ["google"];
    expect(await methods()).toEqual(["passkey", "backup"]);
  });

  it("5. two-step with an authenticator app: app or backup code", async () => {
    account({ on: true, app: true });
    expect(await methods()).toEqual(["totp", "backup"]);
  });

  it("6. workspace SSO: the code, or signing in through SSO again", async () => {
    account();
    state.signIns = ["sso"];
    expect(await methods()).toEqual(["email", "sso"]);
  });

  it("dead inbox with a passkey: the passkey works without the mailbox", async () => {
    account({ passkeys: 2 });
    expect((await methods()).filter((method) => method !== "email")).toEqual([
      "passkey",
    ]);
  });

  it("dead inbox with Google linked: signing in with Google works without the mailbox", async () => {
    account();
    state.signIns = ["google"];
    expect((await methods()).filter((method) => method !== "email")).toEqual([
      "google",
    ]);
  });

  it("a passkey this page can't use isn't offered (a preview URL)", async () => {
    account({ passkeys: 1 });
    state.passkeysHere = false;
    expect(await methods()).toEqual(["email"]);
  });
});

describe("a confirmation", () => {
  it("is required, then lasts 10 minutes for this session only", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-07T10:00:00Z") });
    account();
    const session = {
      userId: USER,
      sessionId: SESSION,
      sessionCreatedAt: new Date(),
    };
    expect(await server.requireRecentConfirmation(session)).toEqual({
      ok: false,
      error: CONFIRMATION_REQUIRED,
    });
    await confirmNow();
    expect(await server.requireRecentConfirmation(session)).toBeNull();
    // Another session of the same person isn't confirmed.
    expect(
      await server.requireRecentConfirmation({
        ...session,
        sessionId: "session_other",
      }),
    ).not.toBeNull();
    vi.setSystemTime(new Date("2026-11-07T10:09:59Z"));
    expect(await server.requireRecentConfirmation(session)).toBeNull();
    vi.setSystemTime(new Date("2026-11-07T10:10:01Z"));
    expect(await server.requireRecentConfirmation(session)).not.toBeNull();
  });

  it("doesn't count for another person holding the same session id", async () => {
    account();
    await confirmNow();
    expect(
      await server.requireRecentConfirmation({
        userId: "user_2",
        sessionId: SESSION,
        sessionCreatedAt: new Date(),
      }),
    ).not.toBeNull();
  });

  it("falls back to a recent sign-in only without 2FA and without email", async () => {
    account();
    state.codesAvailable = false;
    const fresh = {
      userId: USER,
      sessionId: SESSION,
      sessionCreatedAt: new Date(Date.now() - 5 * 60_000),
    };
    expect(await server.requireRecentConfirmation(fresh)).toBeNull();
    expect(
      await server.requireRecentConfirmation({
        ...fresh,
        sessionCreatedAt: new Date(Date.now() - 11 * 60_000),
      }),
    ).not.toBeNull();
  });

  it("moves to the new session when Better Auth swaps it", async () => {
    account();
    fakeDb.seed("session", [
      {
        id: "session_2",
        token: "token_2",
        userId: USER,
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000),
      },
    ]);
    await server.recordConfirmation(
      { userId: USER, sessionId: SESSION },
      { strong: "passkey" },
    );
    await server.carryConfirmation(
      { userId: USER, sessionId: SESSION },
      "better-auth.session_token=token_2.sig; Path=/",
    );
    expect(confirmedRows().map((row) => row.identifier)).toEqual([
      "qrdx-confirmed-session_2",
    ]);
    expect(await strongNow("session_2")).toBe(true);
    expect(await strongNow(SESSION)).toBe(false);
  });

  it("is strong only with a passkey, an authenticator or a backup code", async () => {
    account({ on: true, app: true, passkeys: 1 });
    expect(await server.confirmWithCode({ code: TOTP })).toEqual({ ok: true });
    expect(await strongNow()).toBe(true);
    fakeDb.resetAll();
    account({ on: true, passkeys: 1 });
    expect(await server.confirmWithCode({ code: "ABCDE-FGH23" })).toEqual({
      ok: true,
    });
    expect(await strongNow()).toBe(true);
    fakeDb.resetAll();
    account({ passkeys: 1 });
    expect(await server.confirmWithPasskey({ response: { id: "c1" } })).toEqual(
      { ok: true },
    );
    expect(await strongNow()).toBe(true);
  });
});

// ─── Methods ────────────────────────────────────────────────────────────────

describe("confirming with an authenticator or backup code", () => {
  it("accepts a code from the app and records the confirmation", async () => {
    account({ on: true, app: true });
    expect(await server.confirmWithCode({ code: TOTP })).toEqual({ ok: true });
    expect(confirmedRows()).toHaveLength(1);
  });

  it("uses up a backup code", async () => {
    account({ on: true, app: true });
    expect(await server.confirmWithCode({ code: "abcde fgh23" })).toEqual({
      ok: true,
    });
    expect(state.backupCodes).toEqual(["JKLMN-PQR45"]);
  });

  it("refuses a TOTP code on a passkey-only account without checking it", async () => {
    account({ on: true, passkeys: 1 });
    const result = await server.confirmWithCode({ code: TOTP });
    expect(result).toMatchObject({ ok: false });
    expect(state.calls).not.toContain(`totp:${TOTP}`);
    expect(confirmedRows()).toHaveLength(0);
  });

  it("refuses a TOTP code while an app setup is only started", async () => {
    account({ on: true, passkeys: 1 });
    // Step 1 of adding the app made a real secret, not confirmed yet.
    fakeDb.rows("twoFactor")[0].secret = "enc-secret-real";
    const result = await server.confirmWithCode({ code: TOTP });
    expect(result).toMatchObject({ ok: false });
    expect(state.calls).not.toContain(`totp:${TOTP}`);
    // And the pending setup stays unconfirmed.
    expect(fakeDb.rows("twoFactor")[0].verified).toBe(false);
  });

  it("counts wrong codes toward the shared lockout", async () => {
    account({ on: true, app: true });
    for (let i = 0; i < 9; i++) {
      expect(await server.confirmWithCode({ code: "000000" })).toMatchObject({
        ok: false,
        error: expect.stringMatching(/isn't right/),
      });
    }
    expect(await server.confirmWithCode({ code: "000000" })).toMatchObject({
      error: expect.stringMatching(/Too many wrong codes/),
    });
    // Locked: even the right code is refused, unchecked.
    state.calls = [];
    expect(await server.confirmWithCode({ code: TOTP })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Too many wrong codes/),
    });
    expect(state.calls).toEqual([]);
  });

  it("explains a code that can't be one", async () => {
    account({ on: true, app: true });
    expect(await server.confirmWithCode({ code: "12" })).toMatchObject({
      error: expect.stringMatching(/6-digit/),
    });
    expect(await server.confirmWithCode({ code: "OOOOO-00000" })).toMatchObject(
      { error: expect.stringMatching(/ABCDE-FGH23/) },
    );
  });
});

describe("confirming with a passkey", () => {
  it("offers only this person's passkeys, with verification required", async () => {
    account({ on: true, passkeys: 2 });
    const result = await server.startPasskeyConfirmation();
    expect(result).toMatchObject({
      ok: true,
      options: { userVerification: "required" },
    });
  });

  it("works without two-step verification too, and counts no lockout", async () => {
    account({ passkeys: 1 });
    expect(await server.startPasskeyConfirmation()).toMatchObject({
      ok: true,
      options: { userVerification: "required" },
    });
    expect(await server.confirmWithPasskey({ response: { id: "c1" } })).toEqual(
      { ok: true },
    );
    expect(confirmedRows()).toHaveLength(1);
    expect(fakeDb.find("session", { token: "passkey_token" })).toBeUndefined();
    expect(state.attempts.count).toBe(0);
  });

  it("without two-step, still refuses another person's passkey or no verification", async () => {
    account({ passkeys: 1 });
    state.passkeyOwner = "someone_else";
    expect(
      await server.confirmWithPasskey({ response: { id: "x" } }),
    ).toMatchObject({ ok: false });
    state.passkeyOwner = USER;
    state.passkeyUserVerified = false;
    expect(
      await server.confirmWithPasskey({ response: { id: "c1" } }),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/PIN/) });
    expect(confirmedRows()).toHaveLength(0);
  });

  it("needs a passkey of the account's own", async () => {
    account();
    expect(await server.startPasskeyConfirmation()).toMatchObject({
      ok: false,
    });
    expect(await server.confirmWithPasskey({ response: {} })).toMatchObject({
      ok: false,
    });
    expect(state.calls).not.toContain("passkey-verify");
  });

  it("confirms with the person's own passkey; the plugin's session is deleted", async () => {
    account({ on: true, passkeys: 1 });
    expect(await server.confirmWithPasskey({ response: { id: "c1" } })).toEqual(
      {
        ok: true,
      },
    );
    expect(confirmedRows()).toHaveLength(1);
    expect(fakeDb.find("session", { token: "passkey_token" })).toBeUndefined();
  });

  it("refuses another person's passkey, and deletes the session it made", async () => {
    account({ on: true, passkeys: 1 });
    state.passkeyOwner = "someone_else";
    expect(
      await server.confirmWithPasskey({ response: { id: "x" } }),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/passkey/) });
    expect(confirmedRows()).toHaveLength(0);
    expect(fakeDb.find("session", { token: "passkey_token" })).toBeUndefined();
    expect(state.attempts.count).toBe(1);
  });

  it("refuses a passkey that didn't verify the person", async () => {
    account({ on: true, passkeys: 1 });
    state.passkeyUserVerified = false;
    expect(
      await server.confirmWithPasskey({ response: { id: "c1" } }),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/PIN/) });
    expect(confirmedRows()).toHaveLength(0);
  });

  it("is refused while the account is locked", async () => {
    account({ on: true, passkeys: 1 });
    state.attempts = { count: 10, lockedUntil: Date.now() + 60_000 };
    expect(
      await server.confirmWithPasskey({ response: { id: "c1" } }),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/Too many/) });
    expect(state.calls).not.toContain("passkey-verify");
  });

  it("checks the passkey as no sign-in (so single sign-on rules don't refuse it)", async () => {
    account({ on: true, passkeys: 1 });
    expect(await server.confirmWithPasskey({ response: { id: "c1" } })).toEqual(
      { ok: true },
    );
    expect(state.passkeyCheckMarked).toEqual([true]);
    // Outside that check, nothing is marked.
    const { isPasskeyCheckWithoutSignIn } = await import(
      "@repo/auth/passkey-check"
    );
    expect(
      isPasskeyCheckWithoutSignIn({ path: "/passkey/verify-authentication" }),
    ).toBe(false);
  });

  it("an unexpected refusal is a plain failure, never counted toward the lockout", async () => {
    account({ on: true, passkeys: 1 });
    state.attempts = { count: 3, lockedUntil: 0 };
    state.passkeyRefusal = "sso_required";
    expect(await server.confirmWithPasskey({ response: { id: "c1" } })).toEqual(
      { ok: false, error: CONFIRMATION_MESSAGES.passkeyFailed },
    );
    expect(state.attempts).toEqual({ count: 3, lockedUntil: 0 });
    expect(confirmedRows()).toHaveLength(0);
    // Even the attempt that would have locked the account.
    state.attempts = { count: 9, lockedUntil: 0 };
    expect(
      await server.confirmWithPasskey({ response: { id: "c1" } }),
    ).toMatchObject({ ok: false });
    expect(state.attempts).toEqual({ count: 9, lockedUntil: 0 });
    // A passkey that doesn't check out still counts.
    state.passkeyRefusal = null;
    state.passkeyOwner = null;
    await server.confirmWithPasskey({ response: { id: "c1" } });
    expect(state.attempts.count).toBe(10);
  });
});

describe("confirming with an emailed code", () => {
  const sentCode = () => {
    const line = state.logged.find((entry) =>
      entry.includes("QRdx confirmation code for ada@qrdx.test"),
    );
    return line?.match(/: (\d{6})/)?.[1] ?? null;
  };

  it("is for accounts without two-step verification only", async () => {
    account({ on: true, app: true });
    expect(await server.sendConfirmationCode()).toMatchObject({
      ok: false,
      error: expect.stringMatching(/no emailed code/),
    });
    expect(sentCode()).toBeNull();
    expect(await server.confirmWithEmailCode({ code: "123456" })).toMatchObject(
      { ok: false },
    );
  });

  it("sends a code (logged in dev) that confirms once", async () => {
    account();
    expect(await server.sendConfirmationCode()).toEqual({ ok: true });
    const code = sentCode();
    expect(code).toMatch(/^\d{6}$/);
    // Only a hash is stored.
    expect(JSON.stringify(fakeDb.rows("verification"))).not.toContain(
      `"${code}"`,
    );
    expect(await server.confirmWithEmailCode({ code })).toEqual({ ok: true });
    expect(confirmedRows()).toHaveLength(1);
    // An emailed code is never strong: the mailbox is enough for it.
    expect(strongRows()).toHaveLength(0);
    expect(await server.confirmWithEmailCode({ code })).toMatchObject({
      ok: false,
      codeDead: true,
    });
  });

  it("allows 3 tries per code", async () => {
    account();
    await server.sendConfirmationCode();
    const wrong = sentCode() === "000000" ? "111111" : "000000";
    expect(await server.confirmWithEmailCode({ code: wrong })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/isn't right/),
    });
    expect(await server.confirmWithEmailCode({ code: wrong })).toMatchObject({
      ok: false,
    });
    expect(await server.confirmWithEmailCode({ code: wrong })).toMatchObject({
      ok: false,
      codeDead: true,
    });
    expect(
      await server.confirmWithEmailCode({ code: sentCode() }),
    ).toMatchObject({ ok: false, codeDead: true });
  });

  it("expires after 10 minutes", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-07T10:00:00Z") });
    account();
    await server.sendConfirmationCode();
    vi.setSystemTime(new Date("2026-11-07T10:10:01Z"));
    expect(
      await server.confirmWithEmailCode({ code: sentCode() }),
    ).toMatchObject({ ok: false, codeDead: true });
  });

  it("is bound to the session it was sent for", async () => {
    account();
    await server.sendConfirmationCode();
    state.sessionId = "session_other";
    expect(
      await server.confirmWithEmailCode({ code: sentCode() }),
    ).toMatchObject({ ok: false, codeDead: true });
  });
});

// ─── The gates ──────────────────────────────────────────────────────────────

describe("every gated action asks first, and does nothing until confirmed", () => {
  const required = { ok: false, error: CONFIRMATION_REQUIRED };

  it("two-step verification and its methods", async () => {
    account({ on: true, app: true, passkeys: 1 });
    expect(await manage.startAuthenticatorSetup()).toEqual(required);
    expect(await manage.confirmAuthenticatorSetup({ code: TOTP })).toEqual(
      required,
    );
    expect(await manage.removeAuthenticatorApp()).toEqual(required);
    expect(await manage.regenerateBackupCodes()).toEqual(required);
    expect(await manage.turnOffTwoFactor()).toEqual(required);
    expect(await manage.existingPasskeyOptions()).toEqual(required);
    expect(await manage.turnOnWithExistingPasskey({ response: {} })).toEqual(
      required,
    );
    expect(state.calls).toEqual([]);
  });

  it("passkeys", async () => {
    account({ passkeys: 1 });
    expect(await passkeyActions.passkeyRegistrationOptions()).toEqual(required);
    expect(await passkeyActions.addPasskey({ response: {} })).toEqual(required);
    expect(
      await passkeyActions.renamePasskey({ id: "pk_1", name: "New" }),
    ).toEqual(required);
    expect(await passkeyActions.removePasskey({ id: "pk_1" })).toEqual(
      required,
    );
    expect(state.calls).toEqual([]);
  });

  it("the email and deleting the account", async () => {
    account();
    expect(
      await emailActions.requestEmailChange({ newEmail: "new@qrdx.test" }),
    ).toEqual(required);
    expect(
      await emailActions.confirmEmailChange({
        newEmail: "new@qrdx.test",
        code: "123456",
      }),
    ).toEqual(required);
    expect(await deleteAccount({ confirmation: "delete" })).toEqual(required);
    expect(state.calls).toEqual([]);
  });

  it("goes ahead once confirmed, without asking again for 10 minutes", async () => {
    account();
    await confirmNow();
    expect(
      await emailActions.requestEmailChange({ newEmail: "new@qrdx.test" }),
    ).toEqual({ ok: true });
    expect(
      await emailActions.confirmEmailChange({
        newEmail: "new@qrdx.test",
        code: "123456",
      }),
    ).toEqual({ ok: true });
    expect(await deleteAccount({ confirmation: "delete" })).toEqual({
      ok: true,
    });
    expect(state.calls).toEqual([
      "email-change-request",
      "email-change",
      "delete-account",
    ]);
  });

  it("an email change signs out the account's other sessions, not this one", async () => {
    account();
    const sessionRow = (id: string, userId = USER) => ({
      id,
      token: `token_${id}`,
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    fakeDb.seed("session", [
      sessionRow(SESSION),
      sessionRow("session_phone"),
      sessionRow("session_other_person", "user_2"),
    ]);
    await confirmNow();
    expect(
      await emailActions.confirmEmailChange({
        newEmail: "new@qrdx.test",
        code: "123456",
      }),
    ).toEqual({ ok: true });
    expect(
      fakeDb
        .rows("session")
        .map((row) => row.id)
        .sort(),
    ).toEqual([SESSION, "session_other_person"]);
  });

  it("a refused email change signs nobody out", async () => {
    account();
    fakeDb.seed("session", [
      {
        id: "session_phone",
        token: "token_phone",
        userId: USER,
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    ]);
    expect(
      await emailActions.confirmEmailChange({
        newEmail: "new@qrdx.test",
        code: "123456",
      }),
    ).toEqual({ ok: false, error: CONFIRMATION_REQUIRED });
    expect(fakeDb.find("session", { id: "session_phone" })).toBeDefined();
  });

  it("still needs the typed confirmation to delete", async () => {
    account();
    await confirmNow();
    expect(await deleteAccount({ confirmation: "nope" })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/delete/),
    });
    expect(state.calls).toEqual([]);
  });
});

// ─── Turning it on, adding and removing methods ─────────────────────────────

describe("a passkey as the first method", () => {
  it("adding one turns two-step verification on, with backup codes", async () => {
    account();
    await confirmNow();
    const result = await passkeyActions.addPasskey({ response: { id: "x" } });
    expect(result).toMatchObject({
      ok: true,
      data: { backupCodes: ["AAAAA-BBB12", "CCCCC-DDD13"] },
    });
    expect(fakeDb.find("user", { id: USER })?.twoFactorEnabled).toBe(true);
    const row = fakeDb.find("twoFactor", { userId: USER });
    expect(row).toMatchObject({
      secret: NO_AUTHENTICATOR_SECRET,
      verified: false,
    });
    expect(state.notices).toEqual(["passkey:added", "two-factor:on"]);
    // The session stays: nothing was swapped.
    expect(state.cookies).toEqual([]);
  });

  it("then refuses TOTP codes everywhere", async () => {
    account();
    await confirmNow();
    await passkeyActions.addPasskey({ response: { id: "x" } });
    expect(await server.confirmWithCode({ code: TOTP })).toMatchObject({
      ok: false,
    });
    expect(state.calls).not.toContain(`totp:${TOTP}`);
    // The setup step can't be completed without a started setup either.
    expect(
      await manage.confirmAuthenticatorSetup({ code: TOTP }),
    ).toMatchObject({ ok: false, reason: "restart" });
    expect(state.calls).not.toContain(`totp:${TOTP}`);
  });

  it("adding another passkey later leaves the backup codes alone", async () => {
    account({ on: true, passkeys: 1 });
    await confirmNow();
    const result = await passkeyActions.addPasskey({ response: { id: "x" } });
    expect(result).toMatchObject({ ok: true, data: { backupCodes: null } });
    expect(state.calls).not.toContain("enable");
  });

  it("an existing passkey can turn it on (the legacy holders)", async () => {
    account({ passkeys: 1 });
    await confirmNow();
    expect(await manage.existingPasskeyOptions()).toMatchObject({ ok: true });
    const result = await manage.turnOnWithExistingPasskey({
      response: { id: "c1" },
    });
    expect(result).toMatchObject({ ok: true, backupCodes: expect.any(Array) });
    expect(fakeDb.find("user", { id: USER })?.twoFactorEnabled).toBe(true);
    expect(fakeDb.find("session", { token: "passkey_token" })).toBeUndefined();
  });

  it("an existing passkey must be the person's own", async () => {
    account({ passkeys: 1 });
    await confirmNow();
    state.passkeyOwner = "someone_else";
    expect(
      await manage.turnOnWithExistingPasskey({ response: { id: "x" } }),
    ).toMatchObject({ ok: false });
    expect(fakeDb.find("user", { id: USER })?.twoFactorEnabled).toBe(false);
  });
});

describe("an authenticator app", () => {
  it("as the first method turns it on, with codes, and keeps the confirmation", async () => {
    account();
    await confirmNow();
    expect(await manage.startAuthenticatorSetup()).toMatchObject({
      ok: true,
      secret: "SECRET1",
    });
    const result = await manage.confirmAuthenticatorSetup({ code: TOTP });
    expect(result).toMatchObject({ ok: true, backupCodes: expect.any(Array) });
    expect(fakeDb.find("user", { id: USER })?.twoFactorEnabled).toBe(true);
    expect(state.cookies).toHaveLength(1);
    // The swap moved the confirmation to the new session.
    expect(confirmedRows().map((row) => row.identifier)).toEqual([
      "qrdx-confirmed-session_2",
    ]);
    expect(state.notices).toEqual(["two-factor:on"]);
  });

  it("as a second method keeps the backup codes and returns none", async () => {
    account({ on: true, passkeys: 1 });
    await confirmNow();
    expect(await manage.startAuthenticatorSetup()).toMatchObject({ ok: true });
    // The plugin made new codes with the secret; the old ones are back.
    expect(fakeDb.find("twoFactor", { userId: USER })?.backupCodes).toBe(
      "enc-codes-0",
    );
    const result = await manage.confirmAuthenticatorSetup({ code: TOTP });
    expect(result).toEqual({ ok: true, backupCodes: null });
    expect(fakeDb.find("twoFactor", { userId: USER })?.verified).toBe(true);
    expect(state.cookies).toEqual([]);
    // Now it's a method.
    expect(await loadTwoFactorMethods(USER)).toMatchObject({
      on: true,
      authenticatorApp: true,
      passkeys: 1,
    });
  });

  it("refuses a wrong first code", async () => {
    account();
    await confirmNow();
    await manage.startAuthenticatorSetup();
    expect(
      await manage.confirmAuthenticatorSetup({ code: "000000" }),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/isn't right/) });
    expect(fakeDb.find("user", { id: USER })?.twoFactorEnabled).toBe(false);
  });

  it("removed with a passkey left: stays on, the secret is gone", async () => {
    account({ on: true, app: true, passkeys: 1 });
    await confirmNow();
    expect(await manage.removeAuthenticatorApp()).toEqual({
      ok: true,
      turnedOff: false,
    });
    expect(fakeDb.find("twoFactor", { userId: USER })).toMatchObject({
      secret: NO_AUTHENTICATOR_SECRET,
      verified: false,
      backupCodes: "enc-codes-0",
    });
    expect(fakeDb.find("user", { id: USER })?.twoFactorEnabled).toBe(true);
    expect(await server.confirmWithCode({ code: TOTP })).toMatchObject({
      ok: false,
    });
  });

  it("removed as the last method: turns it off", async () => {
    account({ on: true, app: true });
    await confirmNow();
    expect(await manage.removeAuthenticatorApp()).toEqual({
      ok: true,
      turnedOff: true,
    });
    expect(fakeDb.find("user", { id: USER })?.twoFactorEnabled).toBe(false);
    expect(fakeDb.rows("twoFactor")).toHaveLength(0);
    expect(state.notices).toContain("two-factor:off");
  });
});

describe("removing the last passkey", () => {
  it("turns two-step verification off when it was the only method", async () => {
    account({ on: true, passkeys: 1 });
    await confirmNow();
    expect(await passkeyActions.removePasskey({ id: "pk_1" })).toEqual({
      ok: true,
      data: { turnedOff: true },
    });
    expect(fakeDb.find("user", { id: USER })?.twoFactorEnabled).toBe(false);
    expect(fakeDb.rows("twoFactor")).toHaveLength(0);
    expect(state.notices).toEqual(["passkey:removed", "two-factor:off"]);
  });

  it("leaves it on with another passkey or the app", async () => {
    account({ on: true, app: true, passkeys: 1 });
    await confirmNow();
    expect(await passkeyActions.removePasskey({ id: "pk_1" })).toEqual({
      ok: true,
      data: { turnedOff: false },
    });
    expect(fakeDb.find("user", { id: USER })?.twoFactorEnabled).toBe(true);
  });

  it("two removals at once can't leave it on with no method", async () => {
    account({ on: true, passkeys: 2 });
    await confirmNow();
    const results = await Promise.all([
      passkeyActions.removePasskey({ id: "pk_1" }),
      passkeyActions.removePasskey({ id: "pk_2" }),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(fakeDb.rows("passkey")).toHaveLength(0);
    expect(fakeDb.find("user", { id: USER })?.twoFactorEnabled).toBe(false);
    expect(fakeDb.rows("twoFactor")).toHaveLength(0);
  });

  it("an app confirmed in another tab is never wiped by a first passkey", async () => {
    // addPasskey read "off"; meanwhile the app was confirmed and it's on.
    account({ on: true, app: true, passkeys: 1 });
    expect(
      await manage.turnOnWithPasskeys({
        userId: USER,
        email: EMAIL,
        sessionId: SESSION,
        requestHeaders: new Headers(),
      }),
    ).toBeNull();
    expect(fakeDb.find("twoFactor", { userId: USER })).toMatchObject({
      secret: "enc-secret-0",
    });
    expect(state.calls).not.toContain("enable");
  });

  it("with it off, just removes the passkey", async () => {
    account({ passkeys: 1 });
    await confirmNow();
    expect(await passkeyActions.removePasskey({ id: "pk_1" })).toEqual({
      ok: true,
      data: { turnedOff: false },
    });
    expect(state.notices).toEqual(["passkey:removed"]);
  });
});

describe("backup codes and turning it off", () => {
  it("makes new backup codes", async () => {
    account({ on: true, passkeys: 1 });
    await confirmNow();
    expect(await manage.regenerateBackupCodes()).toMatchObject({
      ok: true,
      backupCodes: expect.any(Array),
    });
    expect(state.notices).toEqual(["two-factor:backup-codes"]);
  });

  it("turns it off and keeps the passkeys", async () => {
    account({ on: true, app: true, passkeys: 2 });
    await confirmNow();
    expect(await manage.turnOffTwoFactor()).toEqual({ ok: true });
    expect(fakeDb.find("user", { id: USER })?.twoFactorEnabled).toBe(false);
    expect(fakeDb.rows("twoFactor")).toHaveLength(0);
    expect(fakeDb.rows("passkey")).toHaveLength(2);
    expect(state.notices).toEqual(["two-factor:off"]);
  });
});
