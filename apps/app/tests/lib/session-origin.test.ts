// The stolen-session check on the app's side (lib/account/session-origin*.ts,
// proxy.ts, app/(app)/(auth)/session-check), against in-memory tables
// (tests/support/fake-db.ts) and a fake Better Auth whose getSession hands
// back the session as it is (its hold for ordinary reads is tested in
// tests/auth/session-origin.test.ts). Covers: what counts as the same
// browser; the check page's `next`; the hold decision on stored origins;
// "Confirm it's you" for a held session (it always asks, an earlier
// confirmation doesn't count, and confirming moves the origin); the check
// page's action and page; and the proxy sending held page loads to it.
// Nothing connects to a database.
import { sessionOriginIdentifier } from "@repo/auth/session-origin-rules";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONFIRMATION_REASONS,
  CONFIRMATION_REQUIRED,
} from "@/lib/account/confirmation";
import {
  browserFamily,
  SESSION_CHECK_PATH,
  sessionCheckNext,
  sessionCheckPath,
} from "@/lib/account/session-origin";
import { fakeDb } from "../support/fake-db";

const USER = "user_1";
const EMAIL = "ada@qrdx.test";
const SESSION = "session_1";
const COUNTRY = "cf-ipcountry";
const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const CHROME_MAC_UPDATED =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.7012.88 Safari/537.36";
const FIREFOX_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0";
const SAFARI_IPHONE_17 =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const SAFARI_IPHONE_18 =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";

const state = vi.hoisted(() => ({
  signedIn: true,
  /** This deployment can email codes */
  codesAvailable: true,
  /** The request's user agent and country */
  userAgent: "",
  country: null as string | null,
  /** What getSession was asked, to check the reads that must see a hold */
  queries: [] as unknown[],
  logged: [] as string[],
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
const requestHeaders = () => {
  const headers = new Headers({ host: "localhost:3000" });
  if (state.userAgent) headers.set("user-agent", state.userAgent);
  if (state.country) headers.set("cf-ipcountry", state.country);
  return headers;
};
vi.mock("next/headers", () => ({
  headers: async () => requestHeaders(),
  cookies: async () => ({ set: () => {}, get: () => undefined }),
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (run: () => unknown) => {
    void run();
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
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
vi.mock("@/lib/account/reauth", () => ({
  signInCodesAvailable: () => state.codesAvailable,
}));
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
  logError: (error: Error) => state.errors.push(error.message),
}));
vi.mock("@/lib/account/two-factor-notice-server", () => ({
  sendTwoFactorNotice: async () => {},
  sendBackupCodeUsedNotice: async () => {},
}));
vi.mock("@/app/(app)/dashboard/domains/_lib/host-routing", () => ({
  routeCustomDomain: async () => null,
}));
// The page's client part; the page itself is what's tested.
vi.mock("@/app/(app)/(auth)/session-check/session-check", () => ({
  SessionCheck: (props: unknown) => ({ type: "SessionCheck", props }),
}));
/** The session row as it is, held or not (Better Auth's side holds it). */
vi.mock("@repo/auth/server", async () => {
  const { fakeDb: db } = await import("../support/fake-db");
  return {
    auth: {
      api: {
        getSession: async ({ query }: { query?: unknown }) => {
          state.queries.push(query);
          const row = db.find("session", { id: "session_1" });
          if (!(state.signedIn && row)) return null;
          return {
            user: { id: "user_1", email: "ada@qrdx.test" },
            session: {
              id: row.id,
              createdAt: row.createdAt,
              userAgent: row.userAgent,
            },
          };
        },
      },
    },
  };
});

const server = await import("@/lib/account/confirmation-server");
const origin = await import("@/lib/account/session-origin-server");
const { checkSession } = await import(
  "@/app/(app)/(auth)/session-check/_lib/actions"
);
const { default: checkPage } = await import(
  "@/app/(app)/(auth)/session-check/page"
);
const { default: proxy } = await import("@/proxy");

const DAY = 24 * 60 * 60 * 1000;

/** Ada signed in from Chrome on macOS in India. */
function signedIn({ country = "IN" as string | null } = {}) {
  const now = Date.now();
  fakeDb.seed("user", [
    { id: USER, email: EMAIL, twoFactorEnabled: false, updatedAt: new Date() },
  ]);
  fakeDb.seed("session", [
    {
      id: SESSION,
      token: "token_1",
      userId: USER,
      userAgent: CHROME_MAC,
      createdAt: new Date(now),
      updatedAt: new Date(now),
      expiresAt: new Date(now + 7 * DAY),
    },
  ]);
  if (country) {
    fakeDb.seed("verification", [
      {
        id: "origin_1",
        identifier: sessionOriginIdentifier(SESSION),
        value: country,
        expiresAt: new Date(now + 30 * DAY),
        createdAt: new Date(now),
        updatedAt: new Date(now),
      },
    ]);
  }
}

/** The request comes from here. */
function at(userAgent: string, country: string | null) {
  state.userAgent = userAgent;
  state.country = country;
}

const originRows = () =>
  fakeDb
    .rows("verification")
    .filter((row) => row.identifier === sessionOriginIdentifier(SESSION));

const sentCode = () => {
  const line = state.logged.find((entry) =>
    entry.includes(`QRdx confirmation code for ${EMAIL}`),
  );
  return line?.match(/: (\d{6})/)?.[1] ?? null;
};

beforeEach(() => {
  fakeDb.resetAll();
  state.signedIn = true;
  state.codesAvailable = true;
  state.queries = [];
  state.logged = [];
  state.errors = [];
  at(CHROME_MAC, "IN");
  vi.spyOn(console, "info").mockImplementation((line: unknown) => {
    state.logged.push(String(line));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the browser family", () => {
  it("ignores browser and system versions", () => {
    expect(browserFamily(CHROME_MAC)).toBe("Chrome on macOS");
    expect(browserFamily(CHROME_MAC_UPDATED)).toBe(browserFamily(CHROME_MAC));
    expect(browserFamily(SAFARI_IPHONE_18)).toBe(
      browserFamily(SAFARI_IPHONE_17),
    );
  });

  it("tells browsers and systems apart", () => {
    expect(browserFamily(FIREFOX_WINDOWS)).toBe("Firefox on Windows");
    expect(browserFamily(SAFARI_IPHONE_17)).toBe("Safari on iOS");
    expect(browserFamily(FIREFOX_WINDOWS)).not.toBe(browserFamily(CHROME_MAC));
  });

  it("gives scripts and a missing user agent a family of their own", () => {
    expect(browserFamily("curl/8.7.1")).toBe("curl");
    expect(browserFamily("curl/8.10.0")).toBe("curl");
    expect(browserFamily(null)).toBe("Unknown device");
    expect(browserFamily("")).not.toBe(browserFamily(CHROME_MAC));
  });
});

describe("the check page's way back", () => {
  it("keeps a same-site path and refuses anything else", () => {
    expect(sessionCheckNext("/dashboard/acme/codes?tab=all")).toBe(
      "/dashboard/acme/codes?tab=all",
    );
    expect(sessionCheckNext("https://evil.example")).toBe("/dashboard");
    expect(sessionCheckNext("//evil.example")).toBe("/dashboard");
    expect(sessionCheckNext(undefined)).toBe("/dashboard");
    // Never itself (a loop) or the sign-in page.
    expect(sessionCheckNext(`${SESSION_CHECK_PATH}?next=/x`)).toBe(
      "/dashboard",
    );
    expect(sessionCheckNext("/sign-in")).toBe("/dashboard");
    expect(sessionCheckPath("/settings/account")).toBe(
      "/session-check?next=%2Fsettings%2Faccount",
    );
  });
});

describe("holding a session", () => {
  const held = () =>
    origin.isSessionHeld(
      { id: SESSION, userAgent: CHROME_MAC },
      requestHeadersNow(),
    );
  const requestHeadersNow = () => {
    const headers = new Headers({ "user-agent": state.userAgent });
    if (state.country) headers.set(COUNTRY, state.country);
    return headers;
  };

  it("needs both a new country and a new browser family", async () => {
    signedIn();
    at(CHROME_MAC, "IN");
    expect(await held()).toBe(false);
    at(CHROME_MAC_UPDATED, "US");
    expect(await held()).toBe(false);
    at(FIREFOX_WINDOWS, "IN");
    expect(await held()).toBe(false);
    at(FIREFOX_WINDOWS, "US");
    expect(await held()).toBe(true);
  });

  it("never holds without a country, now or at sign-in", async () => {
    signedIn();
    at(FIREFOX_WINDOWS, null);
    expect(await held()).toBe(false);
    fakeDb.resetAll();
    signedIn({ country: null });
    at(FIREFOX_WINDOWS, "US");
    expect(await held()).toBe(false);
  });

  it("ignores an expired origin", async () => {
    signedIn();
    const [row] = originRows();
    row.expiresAt = new Date(Date.now() - 1000);
    at(FIREFOX_WINDOWS, "US");
    expect(await held()).toBe(false);
  });
});

describe("Confirm it's you for a held session", () => {
  it("is what the session reads say, for the dialog and the gated actions", async () => {
    signedIn();
    at(FIREFOX_WINDOWS, "US");
    const session = await server.currentSession();
    expect(session?.held).toBe(true);
    // The dialog's read sees the session; it asked to.
    expect(state.queries.at(-1)).toEqual(
      expect.objectContaining({
        [Symbol.for("@repo/auth/session-hold-aware")]: true,
      }),
    );
    at(CHROME_MAC, "US");
    expect((await server.currentSession())?.held).toBe(false);
  });

  it("always asks, even after a confirmation made before the hold", async () => {
    signedIn();
    // Ada confirmed from her own browser a minute ago...
    await server.recordConfirmation(
      { userId: USER, sessionId: SESSION },
      { strong: "passkey" },
    );
    // ...and her cookie turns up elsewhere.
    at(FIREFOX_WINDOWS, "US");
    const session = await server.currentSession();
    if (!session) throw new Error("no session");
    expect(await server.requireRecentConfirmation(session)).toEqual({
      ok: false,
      error: CONFIRMATION_REQUIRED,
    });
    expect(await server.hasRecentConfirmation(session)).toBe(false);
    expect(await server.hasRecentStrongConfirmation(session)).toBe(false);
    expect(await server.confirmedSession("Signed out")).toEqual({
      ok: false,
      error: CONFIRMATION_REQUIRED,
    });
    // At home it still counts.
    at(CHROME_MAC, "IN");
    const home = await server.currentSession();
    if (!home) throw new Error("no session");
    expect(await server.requireRecentConfirmation(home)).toBeNull();
  });

  it("doesn't count a fresh sign-in where codes can't be emailed", async () => {
    // Without email, a sign-in in the last 10 minutes counts as confirming;
    // a copy of that sign-in used elsewhere must not.
    state.codesAvailable = false;
    signedIn();
    at(CHROME_MAC, "IN");
    const home = await server.currentSession();
    if (!home) throw new Error("no session");
    expect(await server.requireRecentConfirmation(home)).toBeNull();
    at(FIREFOX_WINDOWS, "US");
    const copy = await server.currentSession();
    if (!copy) throw new Error("no session");
    expect(await server.requireRecentConfirmation(copy)).toEqual({
      ok: false,
      error: CONFIRMATION_REQUIRED,
    });
  });

  it("lets the session go once answered, from where it is now", async () => {
    signedIn();
    at(FIREFOX_WINDOWS, "US");
    expect(await server.sendConfirmationCode()).toEqual({ ok: true });
    expect(await server.confirmWithEmailCode({ code: sentCode() })).toEqual({
      ok: true,
    });
    // Where it is now is where it started.
    expect(originRows().map((row) => row.value)).toEqual(["US"]);
    expect(fakeDb.find("session", { id: SESSION })?.userAgent).toBe(
      FIREFOX_WINDOWS,
    );
    const session = await server.currentSession();
    expect(session?.held).toBe(false);
    if (!session) throw new Error("no session");
    expect(await server.requireRecentConfirmation(session)).toBeNull();
    // Back home, both have changed again: it asks again.
    at(CHROME_MAC, "IN");
    expect((await server.currentSession())?.held).toBe(true);
  });

  it("keeps the origin row as long as the session can last", async () => {
    signedIn();
    at(FIREFOX_WINDOWS, "US");
    await origin.moveSessionOrigin(
      { sessionId: SESSION, userId: USER },
      requestHeaders(),
    );
    const [row] = originRows();
    const created = new Date(
      fakeDb.find("session", { id: SESSION })?.createdAt as Date,
    ).getTime();
    expect(new Date(row.expiresAt as Date).getTime()).toBe(created + 30 * DAY);
  });

  it("forgets the country when it's unknown where the session is now", async () => {
    signedIn();
    at(FIREFOX_WINDOWS, null);
    await origin.moveSessionOrigin(
      { sessionId: SESSION, userId: USER },
      requestHeaders(),
    );
    expect(originRows()).toEqual([]);
  });

  it("moves nothing for a session that's gone, or someone else's", async () => {
    signedIn();
    at(FIREFOX_WINDOWS, "US");
    await origin.moveSessionOrigin(
      { sessionId: SESSION, userId: "user_2" },
      requestHeaders(),
    );
    expect(originRows().map((row) => row.value)).toEqual(["IN"]);
    expect(fakeDb.find("session", { id: SESSION })?.userAgent).toBe(CHROME_MAC);
  });

  it("says why in the dialog", () => {
    expect(CONFIRMATION_REASONS["continue-session"]).toMatch(
      /different country and a different browser/,
    );
  });
});

describe("the check page", () => {
  const page = (params: Record<string, string>) =>
    checkPage({ searchParams: Promise.resolve(params) });

  it("asks while the session is held", async () => {
    signedIn();
    at(FIREFOX_WINDOWS, "US");
    expect(await checkSession()).toEqual({
      ok: false,
      error: CONFIRMATION_REQUIRED,
    });
    const shown = (await page({ next: "/dashboard/acme" })) as unknown as {
      props: { next: string; returning: boolean };
    };
    expect(shown.props).toMatchObject({
      next: "/dashboard/acme",
      returning: false,
    });
  });

  it("goes straight on when it isn't held", async () => {
    signedIn();
    at(CHROME_MAC, "US");
    expect(await checkSession()).toEqual({ ok: true });
    await expect(page({ next: "/dashboard/acme" })).rejects.toThrow(
      "redirect /dashboard/acme",
    );
    await expect(page({ next: "https://evil.example" })).rejects.toThrow(
      "redirect /dashboard",
    );
  });

  it("stays to finish signing in again, then goes on", async () => {
    signedIn();
    at(CHROME_MAC, "US");
    const shown = (await page({
      next: "/settings/account",
      confirm: "signed-in",
    })) as unknown as { props: { returning: boolean } };
    expect(shown.props.returning).toBe(true);
  });

  it("sends a signed-out browser to sign in", async () => {
    state.signedIn = false;
    expect(await checkSession()).toMatchObject({ ok: false });
    await expect(page({ next: "/dashboard/acme" })).rejects.toThrow(
      "redirect /sign-in?next=%2Fdashboard%2Facme",
    );
  });
});

describe("proxy.ts", () => {
  const visit = (
    path: string,
    init?: ConstructorParameters<typeof NextRequest>[1],
  ) => proxy(new NextRequest(`http://localhost:3000${path}`, init));

  it("sends a held session's page loads to the check, and back after", async () => {
    signedIn();
    at(FIREFOX_WINDOWS, "US");
    for (const path of [
      "/dashboard/acme/codes?view=grid",
      "/settings/account",
      "/admin/users",
    ]) {
      const response = await visit(path);
      expect(response.headers.get("location"), path).toBe(
        `http://localhost:3000${sessionCheckPath(path)}`,
      );
    }
  });

  it("lets server actions through to their own checks", async () => {
    signedIn();
    at(FIREFOX_WINDOWS, "US");
    const response = await visit("/dashboard/acme/codes", {
      method: "POST",
      headers: { "next-action": "abc123" },
    });
    expect(response.headers.get("location")).toBeNull();
  });

  it("lets everyone else through as before", async () => {
    signedIn();
    at(CHROME_MAC_UPDATED, "US");
    expect((await visit("/dashboard/acme")).headers.get("location")).toBeNull();
    // Signed out: app pages go to sign in, admin pages decide for themselves.
    state.signedIn = false;
    expect((await visit("/dashboard/acme")).headers.get("location")).toBe(
      "http://localhost:3000/sign-in?next=%2Fdashboard%2Facme",
    );
    expect((await visit("/admin")).headers.get("location")).toBeNull();
  });

  it("reads the session hold-aware, so a held one isn't sent to sign in", async () => {
    signedIn();
    at(FIREFOX_WINDOWS, "US");
    await visit("/dashboard/acme");
    expect(state.queries).toEqual([
      expect.objectContaining({
        [Symbol.for("@repo/auth/session-hold-aware")]: true,
      }),
    ]);
  });
});
