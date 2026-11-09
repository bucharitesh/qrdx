// SAML sign-in started at the identity provider (its app dashboard's tile),
// end to end inside Better Auth: a real betterAuth instance (memory adapter,
// no database or network) with the SSO plugin and QRdx's ssoOptions,
// ssoGate and ssoIdpInitiatedLanding, plus the two-step challenge, in the
// order packages/auth/server.ts registers them. A test IdP
// (tests/support/saml-idp.ts) signs each response; it's posted to the ACS
// through auth.handler like a browser would. ssoGate's own reads (the
// connection, the workspace's plan) go through @repo/database and are
// stubbed with spies, as in tests/lib/sso-auth.test.ts.
import { realpathSync } from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { ssoGate, ssoIdpInitiatedLanding, ssoOptions } from "@repo/auth/sso";
import { ssoServiceProviderUrls } from "@repo/auth/sso-rules";
import { database } from "@repo/database";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createTestIdp, type TestSamlResponse } from "../support/saml-idp";

// Read when packages/auth/plan.ts loads, so before the imports.
const BUSINESS = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_QRDX_BUSINESS_MONTHLY_PRODUCT_ID =
    "test-business-monthly";
  return "test-business-monthly";
});

// apps/docs doesn't depend on better-auth or the SSO plugin; load the copies
// @repo/auth uses.
const authModules = path.resolve(
  import.meta.dirname,
  "../../../../packages/auth/node_modules",
);
const betterAuthDir = realpathSync(path.join(authModules, "better-auth"));
const ssoDir = realpathSync(path.join(authModules, "@better-auth/sso"));

const ORIGIN = "http://localhost:3000";
const SECRET = "test-secret-at-least-32-characters-long";
const PROVIDER_ID = "sso-abcdefabcdef";
const DOMAIN = "acme.test";
const urls = ssoServiceProviderUrls(ORIGIN, PROVIDER_ID);
const ACS_PATH = `/sso/saml2/sp/acs/${PROVIDER_ID}`;
const SESSION_COOKIE = "better-auth.session_token";

const idp = createTestIdp();

type Row = Record<string, unknown>;
let auth: any;
let db: Record<string, Row[]>;
let plan: "business" | "pro" = "business";
let domainVerified = true;

function providerRow(): Row {
  return {
    id: "p1",
    providerId: PROVIDER_ID,
    issuer: urls.samlEntityId,
    domain: DOMAIN,
    domainVerified,
    organizationId: "org-1",
    userId: "u-owner",
    oidcConfig: null,
    // As the plugin stores a connection QRdx made (apps/docs/ee/sso/
    // connections.ts samlBody, entered by hand).
    samlConfig: JSON.stringify({
      issuer: urls.samlEntityId,
      entryPoint: "https://idp.acme.test/saml/sso",
      cert: idp.cert,
      idpMetadata: { entityID: idp.entityId, cert: idp.cert },
      identifierFormat:
        "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
    }),
  };
}

/** Stubs ssoGate's reads: the connection, the plan, nobody to add. */
function stubGateReads() {
  const q = database.query as unknown as Record<
    string,
    Record<string, (...args: unknown[]) => unknown>
  >;
  vi.spyOn(q.ssoProvider, "findFirst").mockImplementation(
    async () => providerRow() as never,
  );
  vi.spyOn(q.ssoProvider, "findMany").mockImplementation(
    async () => [providerRow()] as never,
  );
  vi.spyOn(q.member, "findMany").mockResolvedValue([
    { userId: "u-owner", role: "owner" },
  ] as never);
  vi.spyOn(q.subscription, "findMany").mockImplementation(
    async () =>
      [{ productId: plan === "business" ? BUSINESS : "pro-id" }] as never,
  );
  // joinWorkspace and ssoWorkspaceFor find nobody: they do nothing.
  vi.spyOn(q.user, "findFirst").mockResolvedValue(undefined as never);
  vi.spyOn(q.member, "findFirst").mockResolvedValue(undefined as never);
}

beforeAll(async () => {
  const { betterAuth } = await import(`${betterAuthDir}/dist/index.mjs`);
  const { twoFactor } = await import(`${betterAuthDir}/dist/plugins/index.mjs`);
  const { memoryAdapter } = await import(
    `${betterAuthDir}/dist/adapters/memory-adapter/index.mjs`
  );
  const { sso } = await import(`${ssoDir}/dist/index.mjs`);
  const { signInChallenge } = await import("@repo/auth/sign-in-challenge");

  db = {
    user: [],
    session: [],
    account: [],
    verification: [],
    twoFactor: [],
    ssoProvider: [],
  };
  // Postgres refuses a second row with the same primary key; the memory
  // adapter doesn't. The plugin's single-use record of an assertion relies
  // on that (reserveVerificationValue), so the test's database does too.
  const memory = memoryAdapter(db);
  const database = (options: unknown) => {
    const adapter = memory(options);
    return {
      ...adapter,
      create: async (args: { model: string; data: Row }) => {
        const id = args.data?.id;
        if (id && (db[args.model] ?? []).some((row) => row.id === id)) {
          throw new Error(`duplicate key value (${args.model}.id)`);
        }
        return adapter.create(args);
      },
    };
  };
  const twoFactorPlugin = twoFactor({ allowPasswordless: true });
  auth = betterAuth({
    baseURL: ORIGIN,
    secret: SECRET,
    database,
    rateLimit: { enabled: false },
    logger: { disabled: true },
    // The order of packages/auth/server.ts.
    plugins: [
      ssoIdpInitiatedLanding(),
      twoFactorPlugin,
      signInChallenge(twoFactorPlugin, { relyingParty: null }),
      sso(ssoOptions),
      ssoGate(),
    ],
  });
});

beforeEach(() => {
  plan = "business";
  domainVerified = true;
  for (const rows of Object.values(db)) rows.splice(0, rows.length);
  db.ssoProvider.push(providerRow());
  stubGateReads();
});

afterEach(() => vi.restoreAllMocks());

interface Reply {
  status: number;
  location: string | null;
  sessionCookie: string | null;
}

/** The identity provider's form post to the ACS (form-encoded, cross-site). */
async function post(SAMLResponse: string, RelayState?: string): Promise<Reply> {
  const body = new URLSearchParams({ SAMLResponse });
  if (RelayState !== undefined) body.set("RelayState", RelayState);
  const response = await auth.handler(
    new Request(`${ORIGIN}/api/auth${ACS_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "https://idp.acme.test",
        "sec-fetch-site": "cross-site",
      },
      body,
      redirect: "manual",
    }),
  );
  const session = response.headers
    .getSetCookie()
    .find(
      (line: string) =>
        line.startsWith(`${SESSION_COOKIE}=`) && !/max-age=0/i.test(line),
    );
  return {
    status: response.status,
    location: response.headers.get("location"),
    sessionCookie: session ? session.split(";")[0] : null,
  };
}

/** Who the session cookie signs in as, or null. */
async function signedInAs(cookie: string | null): Promise<string | null> {
  if (!cookie) return null;
  const response = await auth.handler(
    new Request(`${ORIGIN}/api/auth/get-session`, { headers: { cookie } }),
  );
  const json = (await response.json()) as { user?: { email?: string } } | null;
  return json?.user?.email ?? null;
}

const tile = (email: string, extra: Partial<TestSamlResponse> = {}): string =>
  idp.response({
    email,
    acs: `${ORIGIN}/api/auth${ACS_PATH}`,
    audience: urls.samlEntityId,
    ...extra,
  });

const sessions = () => db.session.length;

describe("a sign-in started at the identity provider", () => {
  it("signs in and lands on the dashboard without a RelayState", async () => {
    const reply = await post(tile(`ana@${DOMAIN}`));
    expect(reply.status).toBe(302);
    expect(reply.location).toBe("/dashboard");
    expect(await signedInAs(reply.sessionCookie)).toBe(`ana@${DOMAIN}`);
    // A new account, in the verified domain, linked to the connection.
    const user = db.user.find((u) => u.email === `ana@${DOMAIN}`);
    expect(user?.emailVerified).toBe(true);
    expect(
      db.account.some(
        (a) => a.userId === user?.id && a.providerId === PROVIDER_ID,
      ),
    ).toBe(true);
  });

  it("lands on the page its RelayState names", async () => {
    const reply = await post(
      tile(`ana@${DOMAIN}`),
      "/dashboard/acme/codes?folder=launch",
    );
    expect(reply.location).toBe("/dashboard/acme/codes?folder=launch");
    expect(await signedInAs(reply.sessionCookie)).toBe(`ana@${DOMAIN}`);
  });

  it("lands on the dashboard when RelayState isn't a page of the app", async () => {
    for (const relayState of [
      "https://evil.example/",
      "//evil.example",
      "/\\evil.example",
      "/sign-in?next=/x",
      "/api/auth/sign-out",
      "javascript:alert(1)",
      "",
    ]) {
      const reply = await post(tile(`ana@${DOMAIN}`), relayState);
      expect(reply.location, relayState).toBe("/dashboard");
      expect(await signedInAs(reply.sessionCookie), relayState).toBe(
        `ana@${DOMAIN}`,
      );
    }
  });

  it("works with the whole response signed instead of the assertion", async () => {
    for (const sign of ["response", "both"] as const) {
      const reply = await post(tile(`ana@${DOMAIN}`, { sign }));
      expect(await signedInAs(reply.sessionCookie), sign).toBe(`ana@${DOMAIN}`);
    }
  });

  it("is accepted once: the same response again is refused", async () => {
    const response = tile(`ana@${DOMAIN}`);
    const first = await post(response, "/dashboard/acme");
    expect(await signedInAs(first.sessionCookie)).toBe(`ana@${DOMAIN}`);
    const before = sessions();
    const again = await post(response, "/dashboard/acme");
    expect(again.sessionCookie).toBeNull();
    expect(sessions()).toBe(before);
    expect(again.location).toBe(
      "/sign-in?next=%2Fdashboard%2Facme&error=replay_detected",
    );
  });

  it("still asks for the second step, then goes on to the landing", async () => {
    const email = `tess@${DOMAIN}`;
    db.user.push({
      id: "u-tess",
      email,
      name: "Tess",
      emailVerified: true,
      twoFactorEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const before = sessions();
    const reply = await post(tile(email), "/dashboard/acme/codes");
    expect(reply.sessionCookie).toBeNull();
    expect(sessions()).toBe(before);
    // A cross-site POST continues through a GET that can see the trusted-
    // device cookie (packages/auth/sign-in-challenge.ts), then the page.
    const location = new URL(reply.location ?? "", ORIGIN);
    expect(location.pathname).toBe("/api/auth/two-factor/continue");
    expect(location.searchParams.get("next")).toBe("/dashboard/acme/codes");
  });
});

describe("what QRdx refuses before the plugin reads it", () => {
  const refused = "/sign-in?error=unsolicited_response";

  it("an assertion without an ID (nothing to record as used)", async () => {
    const reply = await post(
      tile(`ana@${DOMAIN}`, { assertionId: null, sign: "response" }),
    );
    expect(reply.location).toBe(refused);
    expect(reply.sessionCookie).toBeNull();
    expect(db.user).toEqual([]);
  });

  it("an assertion without an expiry", async () => {
    const reply = await post(tile(`ana@${DOMAIN}`, { notOnOrAfter: null }));
    expect(reply.location).toBe(refused);
    expect(db.user).toEqual([]);
  });

  it("an answer to a request it doesn't name", async () => {
    const reply = await post(
      tile(`ana@${DOMAIN}`, { confirmationInResponseTo: "_req-elsewhere" }),
    );
    expect(reply.location).toBe(refused);
    expect(db.user).toEqual([]);
  });

  it("a response it can't read as one SAML response", async () => {
    const reply = await post(
      Buffer.from(`<!DOCTYPE r><samlp:Response/>`).toString("base64"),
    );
    expect(reply.location).toBe("/sign-in?error=invalid_saml_response");
  });

  it("SHA-1, as for every SAML sign-in", async () => {
    const reply = await post(tile(`ana@${DOMAIN}`, { algorithm: "sha1" }));
    expect(reply.location).toBe("/sign-in?error=sso_weak_signature");
    expect(db.user).toEqual([]);
  });

  it("a connection that isn't verified, or a workspace off Business", async () => {
    domainVerified = false;
    let reply = await post(tile(`ana@${DOMAIN}`));
    expect(reply.location).toBe("/sign-in?error=sso_unavailable");
    domainVerified = true;
    plan = "pro";
    reply = await post(tile(`ana@${DOMAIN}`));
    expect(reply.location).toBe("/sign-in?error=sso_unavailable");
    expect(db.user).toEqual([]);
  });
});

describe("the plugin's own checks still apply", () => {
  /** Refused, with no session and no account made. */
  async function expectRefused(response: string, label: string) {
    const reply = await post(response, "/dashboard/acme");
    expect(reply.sessionCookie, label).toBeNull();
    expect(reply.location ?? "", label).toMatch(
      /^\/sign-in\?next=%2Fdashboard%2Facme&error=/,
    );
    expect(db.user, label).toEqual([]);
  }

  it("refuses an unsigned response", async () => {
    await expectRefused(tile(`ana@${DOMAIN}`, { sign: "none" }), "unsigned");
  });

  it("refuses a response signed by another key", async () => {
    const other = createTestIdp();
    await expectRefused(
      tile(`ana@${DOMAIN}`, {
        signer: { keyPem: other.keyPem, cert: other.cert },
      }),
      "other key",
    );
  });

  it("refuses an edited assertion", async () => {
    await expectRefused(
      tile(`ana@${DOMAIN}`, {
        afterSigning: (xml) =>
          xml.replaceAll(`ana@${DOMAIN}`, `boss@${DOMAIN}`),
      }),
      "edited",
    );
  });

  it("refuses another issuer, audience or recipient", async () => {
    await expectRefused(
      tile(`ana@${DOMAIN}`, { issuer: "https://idp.other.test/saml" }),
      "issuer",
    );
    await expectRefused(
      tile(`ana@${DOMAIN}`, { audience: "https://other-app.test/saml" }),
      "audience",
    );
    await expectRefused(
      idp.response({
        email: `ana@${DOMAIN}`,
        acs: `${ORIGIN}/api/auth/sso/saml2/sp/acs/sso-zzzzzzzzzzzz`,
        audience: urls.samlEntityId,
      }),
      "recipient",
    );
  });

  it("refuses an expired assertion, or one not valid yet", async () => {
    const hour = 60 * 60 * 1000;
    await expectRefused(
      tile(`ana@${DOMAIN}`, {
        notBefore: new Date(Date.now() - 2 * hour),
        notOnOrAfter: new Date(Date.now() - hour),
        confirmationNotOnOrAfter: new Date(Date.now() - hour),
      }),
      "expired",
    );
    await expectRefused(
      tile(`ana@${DOMAIN}`, {
        notBefore: new Date(Date.now() + hour),
        notOnOrAfter: new Date(Date.now() + 2 * hour),
      }),
      "not yet valid",
    );
  });

  it("refuses an address outside the connection's domain", async () => {
    const reply = await post(tile("ana@other.test"), "/dashboard/acme");
    expect(reply.sessionCookie).toBeNull();
    expect(reply.location).toBe(
      "/sign-in?next=%2Fdashboard%2Facme&error=sso_email_outside_domain",
    );
  });
});

describe("a sign-in QRdx started (SP-initiated) is unchanged", () => {
  async function start(callbackURL: string) {
    const response = await auth.handler(
      new Request(`${ORIGIN}/api/auth/sign-in/sso`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN },
        body: JSON.stringify({ email: `ana@${DOMAIN}`, callbackURL }),
      }),
    );
    const { url } = (await response.json()) as { url: string };
    const to = new URL(url);
    const request = inflateRawSync(
      Buffer.from(to.searchParams.get("SAMLRequest") ?? "", "base64"),
    ).toString();
    return {
      requestId: request.match(/\bID="([^"]+)"/)?.[1] ?? "",
      relayState: to.searchParams.get("RelayState") ?? "",
    };
  }

  it("answers its request, with its RelayState, once", async () => {
    const { requestId, relayState } = await start("/dashboard/acme/settings");
    expect(requestId).not.toBe("");
    const answer = tile(`ana@${DOMAIN}`, {
      inResponseTo: requestId,
      confirmationInResponseTo: requestId,
    });
    const reply = await post(answer, relayState);
    expect(reply.location).toBe("/dashboard/acme/settings");
    expect(await signedInAs(reply.sessionCookie)).toBe(`ana@${DOMAIN}`);
    // The request was used up.
    const again = await post(
      tile(`ana@${DOMAIN}`, {
        inResponseTo: requestId,
        confirmationInResponseTo: requestId,
      }),
      relayState,
    );
    expect(again.sessionCookie).toBeNull();
  });

  it("refuses an answer to a request QRdx never made", async () => {
    const reply = await post(
      tile(`ana@${DOMAIN}`, {
        inResponseTo: "_never-sent",
        confirmationInResponseTo: "_never-sent",
      }),
    );
    expect(reply.sessionCookie).toBeNull();
    expect(db.user).toEqual([]);
  });
});

describe("the server's own wiring", () => {
  it("allows them, and lands them before the challenge reads the redirect", async () => {
    const { auth: server } = await import("@repo/auth/server");
    expect(ssoOptions.saml.allowIdpInitiated).toBe(true);
    expect(ssoOptions.saml.idpInitiatedCallbackUrl).toBe("/dashboard");
    const ids = (server.options.plugins as { id: string }[]).map((p) => p.id);
    const landing = ids.indexOf("qrdx-sso-idp-landing");
    expect(landing).toBeGreaterThanOrEqual(0);
    expect(landing).toBeLessThan(ids.indexOf("qrdx-sign-in-challenge"));
    expect(ids.indexOf("qrdx-sso-gate")).toBeGreaterThan(ids.indexOf("sso"));
  });
});
