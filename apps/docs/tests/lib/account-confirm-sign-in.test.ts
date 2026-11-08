// "Confirm it's you" by signing in again with a linked Google, GitHub or
// workspace SSO account (lib/account/confirmation-sign-in-server.ts and
// packages/auth/confirm-sign-in.ts), against in-memory tables
// (tests/support/fake-db.ts). Covers: which sign-ins are offered, starting
// one (the row, the cookie, the refusals), Better Auth's hooks on the way
// back (no new account, no sign-in as anyone else), and finishing it (the
// new session gets its 10 minutes, the old one is signed out, everything is
// single use, and a late, unfinished or different-account sign-in counts for
// nothing). Nothing connects to a database or a provider.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONFIRM_RETURNED,
  CONFIRMATION_MESSAGES,
  confirmReturnPath,
  confirmSignInErrorMessage,
  readConfirmReturn,
} from "@/lib/account/confirmation";
import { fakeDb } from "../support/fake-db";

const USER = "user_1";
const EMAIL = "ada@qrdx.test";
const OLD_SESSION = "session_old";
const COOKIE = "qrdx_confirm_sign_in";

const state = vi.hoisted(() => ({
  /** The browser's session as getSession reads it */
  session: {
    userId: "user_1",
    email: "ada@qrdx.test",
    id: "session_old",
    createdAt: new Date(),
  } as { userId: string; email: string; id: string; createdAt: Date } | null,
  /** The browser's cookie jar (name → value) */
  jar: new Map<string, string>(),
  setOptions: new Map<string, Record<string, unknown>>(),
  codesAvailable: true,
  env: {
    GOOGLE_CLIENT_ID: "g",
    GOOGLE_CLIENT_SECRET: "g",
    GITHUB_CLIENT_ID: "h",
    GITHUB_CLIENT_SECRET: "h",
  } as Record<string, string | undefined>,
  ssoAvailable: true,
  ssoConfirms: false,
  startAllowed: true,
  errors: [] as string[],
}));

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
    get: (name: string) => {
      const value = state.jar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string, options: Record<string, unknown>) => {
      state.jar.set(name, value);
      state.setOptions.set(name, options);
    },
    delete: (name: string) => {
      state.jar.delete(name);
    },
  }),
}));
vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: ({ prefix }: { prefix: string }) => ({
    limit: async () => ({
      success: prefix === "qrdx:confirm-sign-in" ? state.startAllowed : true,
    }),
  }),
  slidingWindow: () => ({}),
}));
vi.mock("@repo/auth/passkey", () => ({ cookiesToSet: () => [] }));
vi.mock("@repo/auth/passkey-rp", () => ({
  passkeyRelyingParty: () => ({ rpID: "localhost", origin: "x" }),
  isPasskeyOrigin: () => true,
}));
vi.mock("@repo/auth/keys", () => ({ keys: () => state.env }));
vi.mock("@repo/auth/sso", () => ({
  ssoConfirmsFor: async () => state.ssoConfirms,
}));
vi.mock("@/lib/feature-availability", () => ({
  isFeatureAvailable: (feature: string) =>
    feature === "sso" ? state.ssoAvailable : true,
}));
vi.mock("@/lib/account/reauth", () => ({
  signInCodesAvailable: () => state.codesAvailable,
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
vi.mock("@repo/auth/server", () => ({
  auth: {
    api: {
      getSession: async () =>
        state.session
          ? {
              user: { id: state.session.userId, email: state.session.email },
              session: {
                id: state.session.id,
                createdAt: state.session.createdAt,
              },
            }
          : null,
    },
  },
}));

const hooks = await import("@repo/auth/confirm-sign-in");
const server = await import("@/lib/account/confirmation-sign-in-server");
const { linkedSignInsFor } = await import(
  "@/lib/account/linked-sign-ins-server"
);

function account({
  on = false,
  linked = [] as string[],
}: {
  on?: boolean;
  linked?: string[];
} = {}) {
  fakeDb.seed("user", [
    { id: USER, email: EMAIL, twoFactorEnabled: on, updatedAt: new Date() },
    {
      id: "user_2",
      email: "bob@qrdx.test",
      twoFactorEnabled: false,
      updatedAt: new Date(),
    },
  ]);
  if (on) {
    fakeDb.seed("twoFactor", [
      {
        id: "tf_1",
        userId: USER,
        secret: "enc-secret-0",
        backupCodes: "enc-codes-0",
        verified: true,
      },
    ]);
  }
  fakeDb.seed(
    "account",
    linked.map((providerId, index) => ({
      id: `acc_${index}`,
      userId: USER,
      providerId,
      accountId: `${providerId}-ada`,
    })),
  );
  fakeDb.seed("session", [
    {
      id: OLD_SESSION,
      token: "token_old",
      userId: USER,
      createdAt: new Date(Date.now() - 3 * 86_400_000),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  ]);
}

const intentRows = () =>
  fakeDb
    .rows("verification")
    .filter((row) =>
      String(row.identifier).startsWith("qrdx-confirm-sign-in-"),
    );
const confirmedRows = () =>
  fakeDb
    .rows("verification")
    .filter((row) => String(row.identifier).startsWith("qrdx-confirmed-"));

/**
 * What Better Auth does on the provider's callback when it signs the person
 * in: the hooks run (with the cookie, as a Lax cookie on a top-level GET),
 * and on a yes a new session is made and becomes the browser's.
 */
async function providerSignsIn(
  userId: string,
  path = "/callback/google",
): Promise<boolean> {
  const ctx = { path, getCookie: (name: string) => state.jar.get(name) };
  if (!(await hooks.allowSessionCreation(userId, ctx))) return false;
  const id = `session_new_${userId}`;
  fakeDb.seed("session", [
    {
      id,
      token: `token_${id}`,
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  ]);
  state.session = {
    userId,
    email: userId === USER ? EMAIL : "bob@qrdx.test",
    id,
    createdAt: new Date(),
  };
  return true;
}

beforeEach(() => {
  fakeDb.resetAll();
  state.session = {
    userId: USER,
    email: EMAIL,
    id: OLD_SESSION,
    createdAt: new Date(Date.now() - 3 * 86_400_000),
  };
  state.jar = new Map();
  state.setOptions = new Map();
  state.codesAvailable = true;
  state.env = {
    GOOGLE_CLIENT_ID: "g",
    GOOGLE_CLIENT_SECRET: "g",
    GITHUB_CLIENT_ID: "h",
    GITHUB_CLIENT_SECRET: "h",
  };
  state.ssoAvailable = true;
  state.ssoConfirms = false;
  state.startAllowed = true;
  state.errors = [];
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Pure rules ──────────────────────────────────────────────────────────────

describe("the rules", () => {
  it("names the row by a hash, never the cookie's value", () => {
    const identifier = hooks.confirmSignInIdentifier("secret-nonce");
    expect(identifier).toMatch(/^qrdx-confirm-sign-in-[\w-]{43}$/);
    expect(identifier).not.toContain("secret-nonce");
    expect(hooks.confirmSignInIdentifier("secret-nonce")).toBe(identifier);
    expect(hooks.confirmSignInIdentifier("other")).not.toBe(identifier);
  });

  it("reads only its own intents", () => {
    expect(
      hooks.parseConfirmSignInIntent(
        JSON.stringify({ userId: "u", provider: "google", fromSessionId: "s" }),
      ),
    ).toEqual({ userId: "u", provider: "google", fromSessionId: "s" });
    expect(hooks.parseConfirmSignInIntent("not json")).toBeNull();
    expect(hooks.parseConfirmSignInIntent('{"userId":1}')).toBeNull();
  });

  it("knows the sign-in callbacks", () => {
    for (const path of [
      "/callback/google",
      "/callback/github",
      "/sso/callback/acme",
      "/sso/saml2/sp/acs/acme",
    ]) {
      expect(hooks.isSignInCallbackPath(path)).toBe(true);
    }
    for (const path of [
      "/sign-in/email-otp",
      "/passkey/verify-authentication",
      "/sign-in/social",
      undefined,
    ]) {
      expect(hooks.isSignInCallbackPath(path)).toBe(false);
    }
  });

  it("reads the cookie from the Cookie header when there's no getter", () => {
    // Better Auth's database hooks get the endpoint's outer context: the
    // path and headers, without better-call's getCookie.
    const headers = new Headers({
      cookie: `a=1; ${COOKIE}=nonce-123; b=2`,
    });
    expect(
      hooks.confirmSignInNonce({ path: "/callback/google", headers }),
    ).toBe("nonce-123");
    expect(
      hooks.confirmSignInNonce({
        path: "/callback/google",
        request: new Request("https://qrdx.dev/api/auth/callback/google", {
          headers,
        }),
      }),
    ).toBe("nonce-123");
    expect(
      hooks.confirmSignInNonce({
        path: "/callback/google",
        headers: new Headers({ cookie: `x${COOKIE}=no; ${COOKIE}x=no` }),
      }),
    ).toBeNull();
    expect(hooks.allowUserCreation({ path: "/callback/github", headers })).toBe(
      false,
    );
  });

  it("comes back to the same page, without old outcomes", () => {
    expect(
      confirmReturnPath(
        "https://qrdx.dev/settings/account?tab=x&error=old&confirm=sign-in-failed#top",
        CONFIRM_RETURNED,
      ),
    ).toBe("/settings/account?tab=x&confirm=signed-in");
    expect(
      readConfirmReturn(
        "https://qrdx.dev/settings/account?tab=x&confirm=sign-in-failed&error=unable_to_create_user&error_description=y",
      ),
    ).toEqual({
      failed: true,
      error: "unable_to_create_user",
      cleanPath: "/settings/account?tab=x",
    });
    expect(
      readConfirmReturn("https://qrdx.dev/settings/account?confirm=what"),
    ).toBeNull();
    expect(readConfirmReturn("https://qrdx.dev/settings/account")).toBeNull();
  });

  it("explains the hooks' refusals as an account that isn't linked", () => {
    const refusal = hooks.confirmSignInRefused();
    expect(refusal.body?.code).toBe("confirm_sign_in_wrong_account");
    expect(confirmSignInErrorMessage(refusal.body?.code ?? null)).toBe(
      CONFIRMATION_MESSAGES.signInNotLinked,
    );
    expect(confirmSignInErrorMessage("unable_to_create_user")).toBe(
      CONFIRMATION_MESSAGES.signInNotLinked,
    );
    expect(confirmSignInErrorMessage("unable_to_create_session")).toBe(
      CONFIRMATION_MESSAGES.signInNotLinked,
    );
    expect(confirmSignInErrorMessage("access_denied")).toBe(
      CONFIRMATION_MESSAGES.signInFailed,
    );
    expect(confirmSignInErrorMessage(null)).toBe(
      CONFIRMATION_MESSAGES.signInFailed,
    );
  });

  it("counts only a new sign-in by the same person, made after asking, within 10 minutes", () => {
    const now = new Date("2026-11-08T10:00:00Z");
    const asked = new Date("2026-11-08T09:58:00Z");
    const intent = { userId: USER, fromSessionId: OLD_SESSION };
    const fresh = {
      userId: USER,
      sessionId: "new",
      sessionCreatedAt: new Date("2026-11-08T09:59:00Z"),
    };
    const problem = (session: typeof fresh, rowCreatedAt = asked) =>
      server.signInConfirmationProblem({ intent, rowCreatedAt, session, now });
    expect(problem(fresh)).toBeNull();
    expect(problem({ ...fresh, userId: "user_2" })).toBe(
      CONFIRMATION_MESSAGES.signInDifferentAccount,
    );
    // Came back with the session it had: no new sign-in happened.
    expect(problem({ ...fresh, sessionId: OLD_SESSION })).toBe(
      CONFIRMATION_MESSAGES.signInFailed,
    );
    // A session from before asking (a stolen, recent one) doesn't count.
    expect(
      problem({
        ...fresh,
        sessionCreatedAt: new Date("2026-11-08T09:57:59Z"),
      }),
    ).toBe(CONFIRMATION_MESSAGES.signInFailed);
    expect(
      problem(
        { ...fresh, sessionCreatedAt: new Date("2026-11-08T09:49:00Z") },
        new Date("2026-11-08T09:48:00Z"),
      ),
    ).toBe(CONFIRMATION_MESSAGES.signInFailed);
  });
});

// ─── Which sign-ins are offered ──────────────────────────────────────────────

describe("the sign-ins that can confirm", () => {
  it("are the linked Google and GitHub accounts this server offers", async () => {
    account({ linked: ["github", "google", "credential"] });
    expect(await linkedSignInsFor({ userId: USER, email: EMAIL })).toEqual([
      "google",
      "github",
    ]);
    state.env = { ...state.env, GITHUB_CLIENT_SECRET: undefined };
    expect(await linkedSignInsFor({ userId: USER, email: EMAIL })).toEqual([
      "google",
    ]);
  });

  it("aren't offered when nothing is linked", async () => {
    account();
    expect(await linkedSignInsFor({ userId: USER, email: EMAIL })).toEqual([]);
  });

  it("include SSO only with the licence and a connection the person uses", async () => {
    account();
    state.ssoConfirms = true;
    expect(await linkedSignInsFor({ userId: USER, email: EMAIL })).toEqual([
      "sso",
    ]);
    state.ssoAvailable = false;
    expect(await linkedSignInsFor({ userId: USER, email: EMAIL })).toEqual([]);
  });
});

// ─── Starting ────────────────────────────────────────────────────────────────

describe("starting a sign-in to confirm", () => {
  it("notes who asked and sets an HttpOnly, Lax cookie for 10 minutes", async () => {
    account({ linked: ["google"] });
    const result = await server.startSignInConfirmation({
      provider: "google",
    });
    expect(result).toEqual({ ok: true, email: EMAIL });
    const nonce = state.jar.get(COOKIE);
    expect(nonce).toMatch(/^[\w-]{43}$/);
    expect(state.setOptions.get(COOKIE)).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    const [row] = intentRows();
    expect(row?.identifier).toBe(
      hooks.confirmSignInIdentifier(nonce as string),
    );
    expect(JSON.parse(String(row?.value))).toEqual({
      userId: USER,
      provider: "google",
      fromSessionId: OLD_SESSION,
    });
    const minutes =
      (new Date(row?.expiresAt as Date).getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(9.9);
    expect(minutes).toBeLessThanOrEqual(10);
  });

  it("is refused for a sign-in that isn't linked or isn't a provider", async () => {
    account({ linked: ["google"] });
    for (const provider of ["github", "sso", "passkey", "email", 42]) {
      expect(await server.startSignInConfirmation({ provider })).toMatchObject({
        ok: false,
      });
    }
    expect(intentRows()).toHaveLength(0);
    expect(state.jar.has(COOKIE)).toBe(false);
  });

  it("is never offered with two-step verification on", async () => {
    account({ on: true, linked: ["google"] });
    expect(
      await server.startSignInConfirmation({ provider: "google" }),
    ).toEqual({ ok: false, error: CONFIRMATION_MESSAGES.signInUnavailable });
    expect(intentRows()).toHaveLength(0);
  });

  it("needs a session, and respects the per-person limit", async () => {
    account({ linked: ["google"] });
    state.startAllowed = false;
    expect(
      await server.startSignInConfirmation({ provider: "google" }),
    ).toEqual({ ok: false, error: CONFIRMATION_MESSAGES.rateLimited });
    state.startAllowed = true;
    state.session = null;
    expect(
      await server.startSignInConfirmation({ provider: "google" }),
    ).toEqual({ ok: false, error: CONFIRMATION_MESSAGES.signedOut });
    expect(intentRows()).toHaveLength(0);
  });

  it("starts SSO for the person's own address", async () => {
    account();
    state.ssoConfirms = true;
    expect(await server.startSignInConfirmation({ provider: "sso" })).toEqual({
      ok: true,
      email: EMAIL,
    });
  });
});

// ─── Better Auth's hooks on the way back ─────────────────────────────────────

describe("on the provider's callback", () => {
  it("no account is made while confirming", async () => {
    account({ linked: ["google"] });
    await server.startSignInConfirmation({ provider: "google" });
    const ctx = {
      path: "/callback/google",
      getCookie: (name: string) => state.jar.get(name),
    };
    expect(hooks.allowUserCreation(ctx)).toBe(false);
    // Other sign-ups, and the same browser without the cookie, are untouched.
    expect(
      hooks.allowUserCreation({ ...ctx, path: "/sign-in/email-otp" }),
    ).toBe(true);
    expect(
      hooks.allowUserCreation({
        path: "/callback/google",
        getCookie: () => null,
      }),
    ).toBe(true);
    expect(hooks.allowUserCreation(null)).toBe(true);
  });

  it("only the person who asked is signed in", async () => {
    account({ linked: ["google"] });
    await server.startSignInConfirmation({ provider: "google" });
    expect(await providerSignsIn("user_2")).toBe(false);
    // Still the session it had.
    expect(state.session?.id).toBe(OLD_SESSION);
    expect(await providerSignsIn(USER)).toBe(true);
  });

  it("an expired or used intent holds nothing back", async () => {
    account({ linked: ["google"] });
    await server.startSignInConfirmation({ provider: "google" });
    vi.useFakeTimers({ now: Date.now() + 11 * 60_000 });
    expect(
      await hooks.allowSessionCreation("user_2", {
        path: "/callback/google",
        getCookie: (name: string) => state.jar.get(name),
      }),
    ).toBe(true);
  });
});

// ─── Finishing ───────────────────────────────────────────────────────────────

describe("finishing on the page it came back to", () => {
  it("confirms the new session and signs out the one it replaced", async () => {
    account({ linked: ["google"] });
    await server.startSignInConfirmation({ provider: "google" });
    expect(await providerSignsIn(USER)).toBe(true);
    expect(
      await server.finishSignInConfirmation({ failed: false, error: null }),
    ).toEqual({ ok: true });
    expect(confirmedRows()).toEqual([
      expect.objectContaining({
        identifier: `qrdx-confirmed-session_new_${USER}`,
        value: USER,
      }),
    ]);
    expect(fakeDb.find("session", { id: OLD_SESSION })).toBeUndefined();
    expect(intentRows()).toHaveLength(0);
    expect(state.jar.has(COOKIE)).toBe(false);
  });

  it("is single use", async () => {
    account({ linked: ["google"] });
    await server.startSignInConfirmation({ provider: "google" });
    const nonce = state.jar.get(COOKIE) as string;
    await providerSignsIn(USER);
    await server.finishSignInConfirmation({ failed: false, error: null });
    // The same cookie again (copied before it was cleared).
    state.jar.set(COOKIE, nonce);
    expect(
      await server.finishSignInConfirmation({ failed: false, error: null }),
    ).toEqual({ ok: false, error: CONFIRMATION_MESSAGES.signInFailed });
  });

  it("counts nothing when the browser came back without signing in", async () => {
    account({ linked: ["google"] });
    await server.startSignInConfirmation({ provider: "google" });
    // ?confirm=signed-in typed by hand: still the old session.
    expect(
      await server.finishSignInConfirmation({ failed: false, error: null }),
    ).toEqual({ ok: false, error: CONFIRMATION_MESSAGES.signInFailed });
    expect(confirmedRows()).toHaveLength(0);
    expect(fakeDb.find("session", { id: OLD_SESSION })).toBeDefined();
  });

  it("counts nothing for a different account (SAML, where the hooks can't see the cookie)", async () => {
    account();
    state.ssoConfirms = true;
    await server.startSignInConfirmation({ provider: "sso" });
    // The ACS is a cross-site POST: no cookie, so the hook lets it through.
    expect(
      await hooks.allowSessionCreation("user_2", {
        path: "/sso/saml2/sp/acs/acme",
        getCookie: () => null,
      }),
    ).toBe(true);
    state.session = {
      userId: "user_2",
      email: "bob@qrdx.test",
      id: "session_bob",
      createdAt: new Date(),
    };
    expect(
      await server.finishSignInConfirmation({ failed: false, error: null }),
    ).toEqual({
      ok: false,
      error: CONFIRMATION_MESSAGES.signInDifferentAccount,
    });
    expect(confirmedRows()).toHaveLength(0);
    // Not the other account's to sign out.
    expect(fakeDb.find("session", { id: OLD_SESSION })).toBeDefined();
  });

  it("counts nothing after 10 minutes", async () => {
    account({ linked: ["google"] });
    await server.startSignInConfirmation({ provider: "google" });
    await providerSignsIn(USER);
    vi.useFakeTimers({ now: Date.now() + 11 * 60_000 });
    expect(
      await server.finishSignInConfirmation({ failed: false, error: null }),
    ).toEqual({ ok: false, error: CONFIRMATION_MESSAGES.signInExpired });
    expect(confirmedRows()).toHaveLength(0);
  });

  it("without the cookie (another browser) counts nothing", async () => {
    account({ linked: ["google"] });
    await server.startSignInConfirmation({ provider: "google" });
    await providerSignsIn(USER);
    state.jar.delete(COOKIE);
    expect(
      await server.finishSignInConfirmation({ failed: false, error: null }),
    ).toEqual({ ok: false, error: CONFIRMATION_MESSAGES.signInFailed });
    expect(confirmedRows()).toHaveLength(0);
  });

  it("after a refused sign-in, uses everything up and says why", async () => {
    account({ linked: ["google"] });
    await server.startSignInConfirmation({ provider: "google" });
    expect(
      await server.finishSignInConfirmation({
        failed: true,
        error: "unable_to_create_user",
      }),
    ).toEqual({ ok: false, error: CONFIRMATION_MESSAGES.signInNotLinked });
    expect(intentRows()).toHaveLength(0);
    expect(state.jar.has(COOKIE)).toBe(false);
    expect(confirmedRows()).toHaveLength(0);
  });

  it("refuses input it doesn't expect", async () => {
    expect(
      await server.finishSignInConfirmation({ failed: "no", error: 1 }),
    ).toEqual({ ok: false, error: CONFIRMATION_MESSAGES.signInFailed });
  });
});
