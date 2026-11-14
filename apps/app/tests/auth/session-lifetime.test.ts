// The 30-day session cap (packages/auth/session-lifetime.ts), inside Better
// Auth: a real betterAuth instance on its in-memory adapter (no database or
// network), signed in with an email code and driven through auth.handler and
// auth.api like the browser and the app do. Sessions are aged by moving
// their sign-in time back in the in-memory rows, and every write to the
// session table is counted.
import { realpathSync } from "node:fs";
import path from "node:path";
import {
  clampRefresh,
  clampSessionExpiry,
  SESSION_MAX_DAYS,
  sessionCapAt,
  sessionPastCap,
} from "@repo/auth/session-lifetime";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// apps/app doesn't depend on better-auth itself; load the copy @repo/auth
// uses (the plugin imports better-auth/api from there too).
const betterAuthDir = realpathSync(
  path.resolve(
    import.meta.dirname,
    "../../../../packages/auth/node_modules/better-auth",
  ),
);

const ORIGIN = "http://localhost:3000";
const SECRET = "test-secret-at-least-32-characters-long";
const DAY = 24 * 60 * 60 * 1000;

// ─── A browser: a cookie jar over auth.handler ──────────────────────────────

class Browser {
  cookies = new Map<string, string>();

  constructor(
    private readonly handler: (request: Request) => Promise<Response>,
  ) {}

  cookieHeader() {
    return [...this.cookies]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  async request(method: "GET" | "POST", pathAndQuery: string, body?: unknown) {
    const headers = new Headers({
      origin: ORIGIN,
      cookie: this.cookieHeader(),
    });
    if (body !== undefined) headers.set("content-type", "application/json");
    const response = await this.handler(
      new Request(`${ORIGIN}/api/auth${pathAndQuery}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
    for (const line of response.headers.getSetCookie()) {
      const [pair, ...attributes] = line.split(";");
      const [name, ...rest] = pair.split("=");
      if (attributes.some((a) => /^\s*max-age=0\s*$/i.test(a))) {
        this.cookies.delete(name.trim());
      } else {
        this.cookies.set(name.trim(), rest.join("="));
      }
    }
    const text = await response.text();
    return {
      status: response.status,
      json: text ? (JSON.parse(text) as Record<string, unknown> | null) : null,
    };
  }

  /** Headers as the app's server code passes them to auth.api. */
  headers() {
    return new Headers({ cookie: this.cookieHeader() });
  }
}

// ─── The auth under test ────────────────────────────────────────────────────

const sentCodes = new Map<string, string>();
let auth: any;
let db: Record<string, Record<string, unknown>[]>;
/** Every update written to the session table, in order. */
const sessionWrites: Record<string, unknown>[] = [];

beforeAll(async () => {
  const { betterAuth } = await import(`${betterAuthDir}/dist/index.mjs`);
  const { emailOTP } = await import(`${betterAuthDir}/dist/plugins/index.mjs`);
  const { memoryAdapter } = await import(
    `${betterAuthDir}/dist/adapters/memory-adapter/index.mjs`
  );
  const { sessionLifetime } = await import("@repo/auth/session-lifetime");

  db = { user: [], session: [], account: [], verification: [] };
  const memory = memoryAdapter(db);
  // Counts what reaches the database, after every hook.
  const counted = (options: unknown) => {
    const adapter = memory(options);
    return {
      ...adapter,
      update: async (args: { model: string; update: unknown }) => {
        if (args.model === "session") {
          sessionWrites.push(args.update as Record<string, unknown>);
        }
        return adapter.update(args);
      },
    };
  };
  auth = betterAuth({
    baseURL: ORIGIN,
    secret: SECRET,
    database: counted,
    rateLimit: { enabled: false },
    plugins: [
      sessionLifetime(),
      emailOTP({
        otpLength: 6,
        sendVerificationOTP: async ({
          email,
          otp,
        }: {
          email: string;
          otp: string;
        }) => {
          sentCodes.set(email, otp);
        },
      }),
    ],
  });
});

beforeEach(() => {
  sessionWrites.length = 0;
  vi.useRealTimers();
});

async function signIn(email: string) {
  const browser = new Browser(auth.handler);
  await browser.request("POST", "/email-otp/send-verification-otp", {
    email,
    type: "sign-in",
  });
  const reply = await browser.request("POST", "/sign-in/email-otp", {
    email,
    otp: sentCodes.get(email),
  });
  expect(reply.status).toBe(200);
  const row = db.session.at(-1) as Record<string, unknown>;
  sessionWrites.length = 0;
  return { browser, row };
}

/** Moves the session's sign-in, last refresh and expiry back in time. */
function age(
  row: Record<string, unknown>,
  {
    signedInDaysAgo,
    refreshedDaysAgo,
    expiresInDays,
  }: {
    signedInDaysAgo: number;
    refreshedDaysAgo: number;
    expiresInDays: number;
  },
) {
  const now = Date.now();
  row.createdAt = new Date(now - signedInDaysAgo * DAY);
  row.updatedAt = new Date(now - refreshedDaysAgo * DAY);
  row.expiresAt = new Date(now + expiresInDays * DAY);
}

const sessionOf = async (browser: Browser) =>
  (await browser.request("GET", "/get-session")).json as {
    session: { expiresAt: string };
  } | null;

// ─── The rules ──────────────────────────────────────────────────────────────

describe("the cap", () => {
  const signedIn = new Date("2026-10-01T09:30:00.000Z");

  it("is 30 days after the sign-in", () => {
    expect(SESSION_MAX_DAYS).toBe(30);
    expect(sessionCapAt(signedIn).toISOString()).toBe(
      "2026-10-31T09:30:00.000Z",
    );
    expect(sessionPastCap(signedIn, new Date("2026-10-31T09:29:59.999Z"))).toBe(
      false,
    );
    expect(sessionPastCap(signedIn, new Date("2026-10-31T09:30:00.000Z"))).toBe(
      true,
    );
  });

  it("clamps a later expiry to it and leaves an earlier one alone", () => {
    expect(
      clampSessionExpiry(signedIn, new Date("2026-11-05T00:00:00Z")),
    ).toEqual(new Date("2026-10-31T09:30:00.000Z"));
    expect(
      clampSessionExpiry(signedIn, new Date("2026-10-20T00:00:00Z")),
    ).toEqual(new Date("2026-10-20T00:00:00Z"));
  });

  it("treats a sign-in time it can't read as long gone", () => {
    expect(sessionPastCap("not a date")).toBe(true);
    expect(clampSessionExpiry("not a date", new Date()).getTime()).toBe(0);
  });

  it("clamps a refresh by the session being refreshed, and nothing else", () => {
    const endpoint = {
      context: { session: { session: { createdAt: signedIn } } },
    };
    const later = new Date("2026-11-07T00:00:00Z");
    expect(clampRefresh({ expiresAt: later }, endpoint)).toEqual({
      data: { expiresAt: new Date("2026-10-31T09:30:00.000Z") },
    });
    // Within the cap, other fields, or no session to go by: unchanged.
    expect(
      clampRefresh({ expiresAt: new Date("2026-10-08T00:00:00Z") }, endpoint),
    ).toBeUndefined();
    expect(
      clampRefresh({ activeOrganizationId: "org_1" }, endpoint),
    ).toBeUndefined();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(clampRefresh({ expiresAt: later }, null)).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

// ─── Inside Better Auth ─────────────────────────────────────────────────────

describe("a session in Better Auth", () => {
  it("refreshes as before while the cap is far off", async () => {
    const { browser, row } = await signIn("fresh@qrdx.test");
    age(row, { signedInDaysAgo: 5, refreshedDaysAgo: 2, expiresInDays: 5 });

    const before = Date.now();
    const found = await sessionOf(browser);
    expect(found).not.toBeNull();
    // Better Auth's own refresh: 7 days from now, written once.
    const expires = new Date(found?.session.expiresAt ?? 0).getTime();
    expect(expires).toBeGreaterThanOrEqual(before + 7 * DAY - 1000);
    expect(sessionWrites).toHaveLength(1);
  });

  it("never refreshes past 30 days after the sign-in", async () => {
    const { browser, row } = await signIn("late@qrdx.test");
    age(row, { signedInDaysAgo: 26, refreshedDaysAgo: 2, expiresInDays: 4 });
    const cap = sessionCapAt(row.createdAt as Date).getTime();

    const found = await sessionOf(browser);
    expect(new Date(found?.session.expiresAt ?? 0).getTime()).toBe(cap);
    expect((row.expiresAt as Date).getTime()).toBe(cap);
    expect(sessionWrites).toHaveLength(1);
    expect((sessionWrites[0].expiresAt as Date).getTime()).toBe(cap);
  });

  it("doesn't write on every request once the expiry sits at the cap", async () => {
    const { browser, row } = await signIn("pinned@qrdx.test");
    age(row, { signedInDaysAgo: 27, refreshedDaysAgo: 0.5, expiresInDays: 3 });
    row.expiresAt = sessionCapAt(row.createdAt as Date);

    for (let i = 0; i < 3; i++) {
      expect(await sessionOf(browser)).not.toBeNull();
      expect(
        await auth.api.getSession({ headers: browser.headers() }),
      ).not.toBeNull();
    }
    expect(sessionWrites).toEqual([]);

    // A day after the last write it writes once more (the last-active time),
    // still at the cap.
    row.updatedAt = new Date(Date.now() - 1.5 * DAY);
    await sessionOf(browser);
    await sessionOf(browser);
    expect(sessionWrites).toHaveLength(1);
    expect((row.expiresAt as Date).getTime()).toBe(
      sessionCapAt(row.createdAt as Date).getTime(),
    );
  });

  it("ends 30 days after the sign-in, for the browser and the app", async () => {
    const { browser, row } = await signIn("ended@qrdx.test");
    age(row, {
      signedInDaysAgo: 29.9,
      refreshedDaysAgo: 0.1,
      expiresInDays: 0.1,
    });
    expect(await sessionOf(browser)).not.toBeNull();

    // Past the cap: signed out, the row and the cookie gone.
    row.createdAt = new Date(Date.now() - 30 * DAY - 1000);
    expect(
      await auth.api.getSession({ headers: browser.headers() }),
    ).toBeNull();
    expect(db.session.includes(row)).toBe(false);
  });

  it("refuses a session past the cap even when its row says otherwise", async () => {
    // Refreshed every day for 40 days before the cap existed.
    const { browser, row } = await signIn("legacy@qrdx.test");
    age(row, {
      signedInDaysAgo: 40,
      refreshedDaysAgo: 0.5,
      expiresInDays: 6.5,
    });

    const reply = await browser.request("GET", "/get-session");
    expect(reply.json).toBeNull();
    expect(db.session.includes(row)).toBe(false);
    expect(
      [...browser.cookies.keys()].some((name) =>
        name.includes("session_token"),
      ),
    ).toBe(false);
  });

  it("refuses it on endpoints that read the session themselves", async () => {
    const { browser, row } = await signIn("other@qrdx.test");
    age(row, {
      signedInDaysAgo: 31,
      refreshedDaysAgo: 0.5,
      expiresInDays: 6.5,
    });

    const reply = await browser.request("POST", "/update-user", {
      name: "Changed",
    });
    expect(reply.status).toBe(401);
    const user = db.user.find((u) => u.email === "other@qrdx.test");
    expect(user?.name).not.toBe("Changed");
  });

  it("leaves the session lists without sessions past the cap", async () => {
    const { browser } = await signIn("lists@qrdx.test");
    const { row: old } = await signIn("lists@qrdx.test");
    age(old, {
      signedInDaysAgo: 35,
      refreshedDaysAgo: 0.5,
      expiresInDays: 6.5,
    });
    const user = db.user.find((u) => u.email === "lists@qrdx.test");
    const sessions = await auth.$context.then((ctx: any) =>
      ctx.internalAdapter.listSessions(user?.id),
    );
    // The plain adapter still lists the old row (it's in the database)…
    expect(sessions).toHaveLength(2);
    // …the endpoint, read through the cap, doesn't.
    const listed = (await browser.request("GET", "/list-sessions"))
      .json as unknown as { id: string }[];
    expect(listed.map((s) => s.id)).not.toContain(old.id);
    expect(listed).toHaveLength(1);
  });

  it("wraps the adapter per call, never Better Auth's shared context", async () => {
    // The cap swaps in its wrapper on each call's context; Better Auth copies
    // the context per call (dispatchAuthEndpoint), so the shared one keeps
    // the plain adapter. If an upgrade stopped copying, every later call
    // would share one wrapper and its sessions: this fails first.
    const WRAPPED = Symbol.for("@repo/auth/session-lifetime");
    const plain = (await auth.$context).internalAdapter;
    expect(plain[WRAPPED]).toBeUndefined();
    const { browser } = await signIn("shared@qrdx.test");
    expect(await sessionOf(browser)).not.toBeNull();
    expect(
      await auth.api.getSession({ headers: browser.headers() }),
    ).not.toBeNull();
    await browser.request("POST", "/update-user", { name: "Shared" });
    const after = (await auth.$context).internalAdapter;
    expect(after).toBe(plain);
    expect(after[WRAPPED]).toBeUndefined();
  });

  it("leaves other session updates alone", async () => {
    const { row } = await signIn("update@qrdx.test");
    age(row, { signedInDaysAgo: 28, refreshedDaysAgo: 0.1, expiresInDays: 2 });
    const ctx = await auth.$context;
    const updated = await ctx.internalAdapter.updateSession(row.token, {
      ipAddress: "203.0.113.9",
    });
    expect(updated?.ipAddress).toBe("203.0.113.9");
    expect(sessionWrites).toHaveLength(1);
  });
});
