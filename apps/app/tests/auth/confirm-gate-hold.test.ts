// The HTTP confirm gate (packages/auth/confirm-gate.ts) refuses a held
// session itself (the stolen-session check, packages/auth/session-origin.ts),
// even when the session has a confirmation on record: the guard lets a
// request through when its own check fails, so the gate doesn't rely on it,
// and a hold check that fails in the gate refuses.
//
// A real betterAuth (memory adapter) with the gate, driven through
// auth.handler like a browser. /unlink-account is one of the gated
// endpoints. The confirmation is the app's `verification` row, in the fake
// database (tests/support/fake-db.ts) where the gate reads it.
import { realpathSync } from "node:fs";
import path from "node:path";
import { confirmedIdentifier } from "@repo/auth/confirm-sign-in-rules";
import {
  registerSessionOriginReader,
  sessionOriginIdentifier,
} from "@repo/auth/session-origin-rules";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { registerAppSessionOriginReader } from "@/lib/account/session-origin";
import { fakeDb } from "../support/fake-db";

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);

const betterAuthDir = realpathSync(
  path.resolve(
    import.meta.dirname,
    "../../../../packages/auth/node_modules/better-auth",
  ),
);

const ORIGIN = "http://localhost:3000";
const SECRET = "test-secret-at-least-32-characters-long";
const COUNTRY = "cf-ipcountry";
const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const FIREFOX_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0";
const GATED = "/unlink-account";

interface Reply {
  status: number;
  json: Record<string, unknown> | null;
}

class Browser {
  cookies = new Map<string, string>();
  constructor(
    private readonly handler: (request: Request) => Promise<Response>,
    private readonly userAgent = CHROME_MAC,
    private readonly country = "IN",
  ) {}

  async request(
    method: "GET" | "POST",
    route: string,
    body?: unknown,
  ): Promise<Reply> {
    const headers = new Headers({
      origin: ORIGIN,
      cookie: [...this.cookies].map(([n, v]) => `${n}=${v}`).join("; "),
      "user-agent": this.userAgent,
      [COUNTRY]: this.country,
    });
    if (body !== undefined) headers.set("content-type", "application/json");
    const response = await this.handler(
      new Request(`${ORIGIN}/api/auth${route}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const [name, ...rest] = pair.split("=");
      this.cookies.set(name.trim(), rest.join("="));
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

  stolenBy(userAgent: string, country: string): Browser {
    const thief = new Browser(this.handler, userAgent, country);
    thief.cookies = new Map(this.cookies);
    return thief;
  }
}

type Memory = Record<string, Record<string, unknown>[]>;
const sentCodes = new Map<string, string>();
const instances = {} as Record<
  "gateOnly" | "guardAndGate",
  { auth: any; memory: Memory }
>;

beforeAll(async () => {
  const { betterAuth } = await import(`${betterAuthDir}/dist/index.mjs`);
  const { emailOTP } = await import(`${betterAuthDir}/dist/plugins/index.mjs`);
  const { memoryAdapter } = await import(
    `${betterAuthDir}/dist/adapters/memory-adapter/index.mjs`
  );
  const { confirmGate } = await import("@repo/auth/confirm-gate");
  const { sessionOriginGuard } = await import("@repo/auth/session-origin");
  for (const name of ["gateOnly", "guardAndGate"] as const) {
    const memory: Memory = {
      user: [],
      session: [],
      account: [],
      verification: [],
    };
    const auth = betterAuth({
      baseURL: ORIGIN,
      secret: SECRET,
      database: memoryAdapter(memory),
      rateLimit: { enabled: false },
      plugins: [
        ...(name === "guardAndGate" ? [sessionOriginGuard()] : []),
        confirmGate(),
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
    instances[name] = { auth, memory };
  }
});

beforeEach(() => {
  fakeDb.reset();
  registerAppSessionOriginReader();
});

/** Signs in from India in Chrome on macOS, and confirms it's them. */
async function signedInAndConfirmed(
  name: keyof typeof instances,
  email: string,
) {
  const { auth, memory } = instances[name];
  const browser = new Browser(auth.handler);
  await browser.request("POST", "/email-otp/send-verification-otp", {
    email,
    type: "sign-in",
  });
  await browser.request("POST", "/sign-in/email-otp", {
    email,
    otp: sentCodes.get(email),
  });
  const session = memory.session.at(-1) as { id: string; userId: string };
  // Where it started: the guard records it; without the guard, as it would.
  if (
    !memory.verification.some(
      (row) => row.identifier === sessionOriginIdentifier(session.id),
    )
  ) {
    memory.verification.push({
      id: `origin_${session.id}`,
      identifier: sessionOriginIdentifier(session.id),
      value: "IN",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  fakeDb.seed("verification", [
    {
      id: `confirmed_${session.id}`,
      identifier: confirmedIdentifier(session.id),
      value: session.userId,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  ]);
  return browser;
}

const unlink = (browser: Browser) =>
  browser.request("POST", GATED, { providerId: "google" });

describe("the confirm gate and a held session", () => {
  it("refuses a held session even with a confirmation on record", async () => {
    const browser = await signedInAndConfirmed("gateOnly", "held@qrdx.test");
    const thief = browser.stolenBy(FIREFOX_WINDOWS, "US");
    const reply = await unlink(thief);
    expect(reply.status).toBe(403);
    expect(reply.json?.code).toBe("CONFIRMATION_REQUIRED");
  });

  it("lets the person who confirmed through, where they are", async () => {
    const browser = await signedInAndConfirmed("gateOnly", "own@qrdx.test");
    const reply = await unlink(browser);
    expect(reply.json?.code).not.toBe("CONFIRMATION_REQUIRED");
  });

  it("refuses when the hold check fails, where the guard lets the request through", async () => {
    const browser = await signedInAndConfirmed(
      "guardAndGate",
      "broken@qrdx.test",
    );
    const thief = browser.stolenBy(FIREFOX_WINDOWS, "US");
    // The place can't be read: every hold check throws.
    registerSessionOriginReader({
      country: () => {
        throw new Error("geo lookup failed");
      },
      browser: () => "unknown",
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    // The guard logs and lets an ungated request through...
    expect((await thief.request("GET", "/list-sessions")).status).toBe(200);
    // ...the gate doesn't.
    const reply = await unlink(thief);
    expect(reply.status).toBe(403);
    expect(reply.json?.code).toBe("CONFIRMATION_REQUIRED");
    expect(
      errors.mock.calls.some((call) =>
        String(call[0]).includes("hold-check-failed"),
      ),
    ).toBe(true);
    errors.mockRestore();
  });
});
