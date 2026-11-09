// The stolen-session check on Better Auth's side (packages/auth/
// session-origin.ts), end to end inside Better Auth: a real betterAuth
// instance (memory adapter, no database or network) with the guard, email
// codes and the app's own reader (lib/account/session-origin.ts), driven
// through auth.handler like a browser and through auth.api like the app.
// Covers: where a session starts is recorded (and not when the country is
// unknown); travel or a new browser alone never holds it; both at once do;
// a held session reads as signed out to the browser and to the app's
// session reads, but not to the app's hold-aware ones; every other endpoint
// refuses it except signing out and signing in again; the origin row lives
// as long as the session; and without the app's reader nothing is held.
import { realpathSync } from "node:fs";
import path from "node:path";
import {
  HELD_SESSION_OPEN_PATHS,
  holdAwareQuery,
  registerSessionOriginReader,
  SESSION_ORIGIN_DAYS,
  type SessionOriginReader,
  sessionOriginIdentifier,
} from "@repo/auth/session-origin-rules";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  appSessionOriginReader,
  registerAppSessionOriginReader,
} from "@/lib/account/session-origin";

const betterAuthDir = realpathSync(
  path.resolve(
    import.meta.dirname,
    "../../../../packages/auth/node_modules/better-auth",
  ),
);

const ORIGIN = "http://localhost:3000";
const SECRET = "test-secret-at-least-32-characters-long";
const DAY = 24 * 60 * 60 * 1000;
// The country header the app's reader reads (lib/request-geo.ts).
const COUNTRY = "cf-ipcountry";
const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
// A browser and a system update later: the same family.
const CHROME_MAC_UPDATED =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.7012.88 Safari/537.36";
const FIREFOX_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0";
const CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

interface Reply {
  status: number;
  json: Record<string, unknown> | null;
}

/** A cookie jar over auth.handler, at a place (user agent and country). */
class Browser {
  cookies = new Map<string, string>();
  userAgent = CHROME_MAC;
  country: string | null = "IN";

  constructor(
    private readonly handler: (request: Request) => Promise<Response>,
  ) {}

  at(userAgent: string, country: string | null) {
    this.userAgent = userAgent;
    this.country = country;
    return this;
  }

  headers(): Headers {
    const headers = new Headers({
      origin: ORIGIN,
      cookie: [...this.cookies]
        .map(([name, value]) => `${name}=${value}`)
        .join("; "),
      "user-agent": this.userAgent,
    });
    if (this.country) headers.set(COUNTRY, this.country);
    return headers;
  }

  async request(
    method: "GET" | "POST",
    pathAndQuery: string,
    body?: unknown,
  ): Promise<Reply> {
    const headers = this.headers();
    if (body !== undefined) headers.set("content-type", "application/json");
    const response = await this.handler(
      new Request(`${ORIGIN}/api/auth${pathAndQuery}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "manual",
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
    let json: Record<string, unknown> | null = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: response.status, json };
  }

  /** A copy of this browser's cookies, used somewhere else. */
  stolenBy(userAgent: string, country: string | null): Browser {
    const thief = new Browser(this.handler).at(userAgent, country);
    thief.cookies = new Map(this.cookies);
    return thief;
  }

  async session() {
    return (await this.request("GET", "/get-session")).json as {
      session: { id: string };
      user: { email: string };
    } | null;
  }
}

const sentCodes = new Map<string, string>();
let auth: any;
let db: Record<string, Record<string, unknown>[]>;

beforeAll(async () => {
  const { betterAuth } = await import(`${betterAuthDir}/dist/index.mjs`);
  const { emailOTP } = await import(`${betterAuthDir}/dist/plugins/index.mjs`);
  const { memoryAdapter } = await import(
    `${betterAuthDir}/dist/adapters/memory-adapter/index.mjs`
  );
  const { sessionOriginGuard } = await import("@repo/auth/session-origin");
  db = { user: [], session: [], account: [], verification: [] };
  auth = betterAuth({
    baseURL: ORIGIN,
    secret: SECRET,
    database: memoryAdapter(db),
    rateLimit: { enabled: false },
    plugins: [
      sessionOriginGuard(),
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
  registerAppSessionOriginReader();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function signIn(browser: Browser, email: string) {
  await browser.request("POST", "/email-otp/send-verification-otp", {
    email,
    type: "sign-in",
  });
  const reply = await browser.request("POST", "/sign-in/email-otp", {
    email,
    otp: sentCodes.get(email),
  });
  expect(reply.status).toBe(200);
  const found = await browser.session();
  if (!found) throw new Error("not signed in");
  return found.session.id;
}

const originRows = (sessionId: string) =>
  db.verification.filter(
    (row) => row.identifier === sessionOriginIdentifier(sessionId),
  );

describe("where a session starts", () => {
  it("records the sign-in's country for the session's life", async () => {
    const browser = new Browser(auth.handler);
    const sessionId = await signIn(browser, "start@qrdx.test");
    const rows = originRows(sessionId);
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe("IN");
    const session = db.session.find((row) => row.id === sessionId);
    // The browser family is the session's own user agent.
    expect(session?.userAgent).toBe(CHROME_MAC);
    // As long as a session can last after its sign-in.
    const expires = new Date(rows[0].expiresAt as Date).getTime();
    const created = new Date(session?.createdAt as Date).getTime();
    expect(expires - created).toBe(SESSION_ORIGIN_DAYS * DAY);
  });

  it("records nothing when the request's country is unknown", async () => {
    const browser = new Browser(auth.handler).at(CHROME_MAC, null);
    const sessionId = await signIn(browser, "nowhere@qrdx.test");
    expect(originRows(sessionId)).toEqual([]);
    // So it's never held, wherever it's used next.
    const thief = browser.stolenBy(FIREFOX_WINDOWS, "US");
    expect(await thief.session()).not.toBeNull();
  });
});

describe("a session used somewhere else", () => {
  it("lets travel through: a new country, the same browser updated", async () => {
    const browser = new Browser(auth.handler);
    await signIn(browser, "travel@qrdx.test");
    browser.at(CHROME_MAC_UPDATED, "US");
    expect((await browser.session())?.user.email).toBe("travel@qrdx.test");
    expect((await browser.request("GET", "/list-sessions")).status).toBe(200);
  });

  it("lets a new browser through in the same country", async () => {
    const browser = new Browser(auth.handler);
    await signIn(browser, "newbrowser@qrdx.test");
    const elsewhere = browser.stolenBy(FIREFOX_WINDOWS, "IN");
    expect(await elsewhere.session()).not.toBeNull();
  });

  it("counts the system as part of the browser family", async () => {
    const browser = new Browser(auth.handler);
    await signIn(browser, "system@qrdx.test");
    // Chrome both times, but on Windows and from another country.
    const thief = browser.stolenBy(CHROME_WINDOWS, "US");
    expect(await thief.session()).toBeNull();
  });

  it("holds it when both the country and the browser changed", async () => {
    const browser = new Browser(auth.handler);
    await signIn(browser, "stolen@qrdx.test");
    const thief = browser.stolenBy(FIREFOX_WINDOWS, "US");

    // The browser sees no session...
    expect(await thief.session()).toBeNull();
    // ...nor does the app's ordinary session read...
    expect(await auth.api.getSession({ headers: thief.headers() })).toBeNull();
    // ...but the app's hold-aware read does, to ask "Confirm it's you".
    const seen = await auth.api.getSession({
      headers: thief.headers(),
      query: holdAwareQuery(),
    });
    expect(seen?.user.email).toBe("stolen@qrdx.test");

    // The person who signed in, where they signed in, isn't affected.
    expect((await browser.session())?.user.email).toBe("stolen@qrdx.test");
  });

  it("refuses the held session everywhere else over HTTP", async () => {
    const browser = new Browser(auth.handler);
    await signIn(browser, "refused@qrdx.test");
    const thief = browser.stolenBy(FIREFOX_WINDOWS, "US");

    for (const [method, path, body] of [
      ["GET", "/list-sessions", undefined],
      ["POST", "/update-user", { name: "Mallory" }],
      ["POST", "/revoke-other-sessions", {}],
      ["GET", "/list-accounts", undefined],
    ] as const) {
      const reply = await thief.request(method, path, body);
      expect(reply.status, path).toBe(403);
      expect(reply.json?.code, path).toBe("CONFIRMATION_REQUIRED");
    }
    const user = db.user.find((row) => row.email === "refused@qrdx.test");
    expect(user?.name).not.toBe("Mallory");
    // The person's own browser still works.
    expect((await browser.request("GET", "/list-sessions")).status).toBe(200);
  });

  it("still lets the held browser sign out", async () => {
    const browser = new Browser(auth.handler);
    const sessionId = await signIn(browser, "signout@qrdx.test");
    const thief = browser.stolenBy(FIREFOX_WINDOWS, "US");
    expect((await thief.request("POST", "/sign-out", {})).status).toBe(200);
    expect(db.session.find((row) => row.id === sessionId)).toBeUndefined();
    // Its origin goes with it.
    expect(originRows(sessionId)).toEqual([]);
  });

  it("lets the held browser sign in again, which starts from there", async () => {
    const browser = new Browser(auth.handler);
    await signIn(browser, "again@qrdx.test");
    const elsewhere = browser.stolenBy(FIREFOX_WINDOWS, "US");
    expect(await elsewhere.session()).toBeNull();

    const sessionId = await signIn(elsewhere, "again@qrdx.test");
    expect(originRows(sessionId)[0]?.value).toBe("US");
    expect((await elsewhere.request("GET", "/list-sessions")).status).toBe(200);
  });

  it("never holds when the request's country is unknown", async () => {
    const browser = new Browser(auth.handler);
    await signIn(browser, "unknown@qrdx.test");
    const thief = browser.stolenBy(FIREFOX_WINDOWS, null);
    expect(await thief.session()).not.toBeNull();
    // "XX" is the CDN's own "unknown".
    expect(
      await browser.stolenBy(FIREFOX_WINDOWS, "XX").session(),
    ).not.toBeNull();
  });

  it("never holds a session without an origin (signed in before this)", async () => {
    const browser = new Browser(auth.handler);
    const sessionId = await signIn(browser, "before@qrdx.test");
    db.verification = db.verification.filter(
      (row) => row.identifier !== sessionOriginIdentifier(sessionId),
    );
    expect(
      await browser.stolenBy(FIREFOX_WINDOWS, "US").session(),
    ).not.toBeNull();
  });

  it("ignores an expired origin row", async () => {
    const browser = new Browser(auth.handler);
    const sessionId = await signIn(browser, "expired@qrdx.test");
    const [row] = originRows(sessionId);
    row.expiresAt = new Date(Date.now() - 1000);
    expect(
      await browser.stolenBy(FIREFOX_WINDOWS, "US").session(),
    ).not.toBeNull();
  });
});

describe("the origin row's life", () => {
  it("stays put when a young session is extended", async () => {
    const browser = new Browser(auth.handler);
    const sessionId = await signIn(browser, "young@qrdx.test");
    const session = db.session.find((row) => row.id === sessionId);
    if (!session) throw new Error("no session");
    const [row] = originRows(sessionId);
    const before = new Date(row.expiresAt as Date).getTime();
    // Due for Better Auth's daily refresh.
    session.expiresAt = new Date(Date.now() + 5 * DAY);
    await browser.session();
    expect(new Date(session.expiresAt as Date).getTime()).toBeGreaterThan(
      Date.now() + 6 * DAY,
    );
    expect(new Date(originRows(sessionId)[0].expiresAt as Date).getTime()).toBe(
      before,
    );
  });

  it("follows a session that outlives it", async () => {
    const browser = new Browser(auth.handler);
    const sessionId = await signIn(browser, "old@qrdx.test");
    const session = db.session.find((row) => row.id === sessionId);
    if (!session) throw new Error("no session");
    session.createdAt = new Date(Date.now() - 40 * DAY);
    session.expiresAt = new Date(Date.now() + 5 * DAY);
    await browser.session();
    const [row] = originRows(sessionId);
    expect(new Date(row.expiresAt as Date).getTime()).toBe(
      new Date(session.expiresAt as Date).getTime(),
    );
    // And it's still checked.
    expect(await browser.stolenBy(FIREFOX_WINDOWS, "US").session()).toBeNull();
  });
});

describe("without the app's reader", () => {
  it("holds nothing, records nothing and says so in the log", async () => {
    const browser = new Browser(auth.handler);
    const heldId = await signIn(browser, "wired@qrdx.test");
    const thief = browser.stolenBy(FIREFOX_WINDOWS, "US");
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((line: unknown) => {
      errors.push(String(line));
    });
    registerSessionOriginReader(undefined as unknown as SessionOriginReader);
    expect(await thief.session()).not.toBeNull();
    const fresh = new Browser(auth.handler);
    const sessionId = await signIn(fresh, "unwired@qrdx.test");
    expect(originRows(sessionId)).toEqual([]);
    // Once per process, with no ids or addresses.
    expect(errors.filter((line) => line.includes('"no-reader"'))).toHaveLength(
      1,
    );
    const logged = errors.join(" ");
    for (const secret of ["@qrdx.test", heldId, sessionId]) {
      expect(logged).not.toContain(secret);
    }
  });
});

describe("the app's reader", () => {
  it("reads the country the security emails use and the browser family", () => {
    expect(
      appSessionOriginReader.country(new Headers({ [COUNTRY]: "de" })),
    ).toBe("DE");
    expect(appSessionOriginReader.country(new Headers())).toBeNull();
    expect(appSessionOriginReader.browser(CHROME_MAC)).toBe("Chrome on macOS");
    expect(appSessionOriginReader.browser(CHROME_MAC_UPDATED)).toBe(
      "Chrome on macOS",
    );
  });
});

describe("the real auth server", () => {
  async function loadAuth() {
    const { auth: real } = await import("@repo/auth/server");
    return real as {
      api: Record<string, { path?: string }>;
      options: { plugins?: { id: string }[] };
    };
  }

  it("registers the guard first, so it refuses before anything else runs", async () => {
    const real = await loadAuth();
    expect(real.options.plugins?.[0]?.id).toBe("qrdx-session-origin");
  });

  it("leaves open only paths it has", async () => {
    const real = await loadAuth();
    const registered = new Set(
      Object.values(real.api).map((endpoint) => endpoint.path),
    );
    expect(HELD_SESSION_OPEN_PATHS.filter((p) => !registered.has(p))).toEqual(
      [],
    );
  });
});
