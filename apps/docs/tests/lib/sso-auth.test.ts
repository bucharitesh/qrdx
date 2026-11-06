// Workspace SSO wiring in packages/auth (server.ts, sso.ts) on the real
// Better Auth instance. Database reads are stubbed with spies; nothing
// connects anywhere. The full flows (IdP round trips, DNS) run in
// e2e/sso.e2e.mts.
import { auth } from "@repo/auth/server";
import {
  joinWorkspace,
  SSO_CALLBACK_PATHS,
  SSO_SERVER_ONLY_PATHS,
  SSO_SIGN_IN_PATH,
  SSO_UNUSED_PATHS,
  ssoGate,
  ssoRejoinDomains,
  validateSsoUserInfo,
} from "@repo/auth/sso";
import { database } from "@repo/database";
import { afterEach, describe, expect, it, vi } from "vitest";

// Read when packages/auth/plan.ts loads, so before the imports.
const BUSINESS = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_QRDX_BUSINESS_MONTHLY_PRODUCT_ID =
    "test-business-monthly";
  return "test-business-monthly";
});

type Row = Record<string, unknown>;

function provider(overrides: Row = {}): Row {
  return {
    id: "p1",
    providerId: "sso-abcdefabcdef",
    organizationId: "org-1",
    domain: "acme.com",
    domainVerified: true,
    issuer: "https://idp.acme.com",
    oidcConfig: null,
    samlConfig: null,
    userId: "u-admin",
    ...overrides,
  };
}

/** Stubs the reads sso.ts and plan.ts make. */
function stubDb({
  providers = [] as Row[],
  plan = "business" as "business" | "pro" | "free",
} = {}) {
  const q = database.query as unknown as Record<
    string,
    Record<string, (...args: unknown[]) => unknown>
  >;
  vi.spyOn(q.ssoProvider, "findMany").mockResolvedValue(providers as never);
  vi.spyOn(q.ssoProvider, "findFirst").mockResolvedValue(
    (providers[0] ?? undefined) as never,
  );
  vi.spyOn(q.member, "findMany").mockResolvedValue([
    { userId: "u-owner", role: "owner" },
  ] as never);
  vi.spyOn(q.subscription, "findMany").mockResolvedValue(
    (plan === "free"
      ? []
      : [{ productId: plan === "business" ? BUSINESS : "pro-id" }]) as never,
  );
}

afterEach(() => vi.restoreAllMocks());

async function apiError(call: Promise<unknown>) {
  try {
    await call;
  } catch (error) {
    return error as {
      status?: string;
      statusCode?: number;
      body?: { code?: string; message?: string };
      headers?: Headers;
    };
  }
  throw new Error("expected an error");
}

const endpointPaths = () =>
  Object.values(auth.api as Record<string, { path?: string }>)
    .map((endpoint) => endpoint.path)
    .filter((path): path is string => Boolean(path));

describe("every SSO endpoint is classified", () => {
  it("each plugin path is a sign-in path, server-only, or off", () => {
    const sso = endpointPaths().filter(
      (path) => path.startsWith("/sso/") || path === SSO_SIGN_IN_PATH,
    );
    const classified = new Set([
      SSO_SIGN_IN_PATH,
      ...SSO_CALLBACK_PATHS,
      ...SSO_SERVER_ONLY_PATHS,
      ...SSO_UNUSED_PATHS,
      // Public SP metadata (what the IdP reads).
      "/sso/saml2/sp/metadata",
      // Single logout: refuses every request while saml.enableSingleLogout is unset.
      "/sso/saml2/sp/slo/:providerId",
      "/sso/saml2/logout/:providerId",
    ]);
    expect(sso.filter((path) => !classified.has(path))).toEqual([]);
    for (const path of [...SSO_SERVER_ONLY_PATHS, ...SSO_UNUSED_PATHS]) {
      expect(sso, path).toContain(path);
    }
  });
});

const GET_PATHS = new Set([
  "/sso/providers",
  "/sso/get-provider",
  "/sso/callback",
]);

describe("management is server-only", () => {
  it("is 404 over HTTP but reachable through auth.api", async () => {
    for (const path of [...SSO_SERVER_ONLY_PATHS, ...SSO_UNUSED_PATHS]) {
      const response = await auth.handler(
        new Request(`http://localhost:3000/api/auth${path}`, {
          method: GET_PATHS.has(path) ? "GET" : "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://localhost:3000",
          },
          body: GET_PATHS.has(path)
            ? undefined
            : JSON.stringify({ providerId: "sso-abcdefabcdef" }),
        }),
      );
      expect(response.status, path).toBe(404);
    }
    // auth.api still runs them: without a session they ask for one.
    const error = await apiError(
      auth.api.registerSSOProvider({
        body: {
          providerId: "sso-abcdefabcdef",
          issuer: "https://idp.acme.com",
          domain: "acme.com",
        },
      }),
    );
    expect(error.statusCode).toBe(401);
    expect((await apiError(auth.api.listSSOProviders({}))).statusCode).toBe(
      401,
    );
  });
});

describe("starting an SSO sign-in", () => {
  const start = (body: Row) =>
    apiError(
      auth.api.signInSSO({ body: { callbackURL: "/dashboard", ...body } }),
    );

  it("only takes a work email, never a provider, domain or workspace", async () => {
    stubDb({ providers: [provider()] });
    for (const extra of [
      { providerId: "sso-abcdefabcdef" },
      { domain: "acme.com" },
      { organizationSlug: "acme" },
    ]) {
      const error = await start({ email: "ana@acme.com", ...extra });
      expect(error.body?.code, JSON.stringify(extra)).toBe(
        "SSO_EMAIL_REQUIRED",
      );
    }
    expect((await start({})).body?.code).toBe("SSO_EMAIL_REQUIRED");
  });

  it("says when no verified connection covers the domain", async () => {
    stubDb({ providers: [] });
    const error = await start({ email: "ana@acme.com" });
    expect(error.body?.code).toBe("SSO_NOT_FOUND");
    expect(error.body?.message).toBe("No SSO is set up for acme.com.");
  });

  it("refuses a workspace that isn't on Business", async () => {
    for (const plan of ["pro", "free"] as const) {
      stubDb({ providers: [provider()], plan });
      const error = await start({ email: "ana@eu.acme.com" });
      expect(error.body?.code, plan).toBe("SSO_NOT_AVAILABLE");
    }
  });
});

describe("the IdP's return", () => {
  it("is sent back to sign-in when the plan dropped mid-flow", async () => {
    stubDb({ providers: [provider()], plan: "pro" });
    const error = await apiError(
      auth.api.callbackSSO({
        params: { providerId: "sso-abcdefabcdef" },
        query: { code: "c", state: "s" },
      }),
    );
    expect(error.status).toBe("FOUND");
    expect(error.headers?.get("location")).toBe(
      "/sign-in?error=sso_unavailable",
    );
  });

  it("is refused for an unverified connection", async () => {
    stubDb({ providers: [provider({ domainVerified: false })] });
    const error = await apiError(
      auth.api.callbackSSO({
        params: { providerId: "sso-abcdefabcdef" },
        query: { code: "c", state: "s" },
      }),
    );
    expect(error.headers?.get("location")).toMatch(/error=sso_unavailable/);
  });
});

describe("new accounts from SSO", () => {
  const hooks = (
    ssoGate().init() as unknown as {
      options: {
        databaseHooks: {
          user: {
            create: {
              before: (
                user: Row,
                context: unknown,
              ) => Promise<{ data: Row } | undefined>;
            };
          };
        };
      };
    }
  ).options.databaseHooks;
  const callback = {
    path: "/sso/callback/:providerId",
    params: { providerId: "sso-abcdefabcdef" },
  };

  it("are created verified, for an address in the domain", async () => {
    stubDb({ providers: [provider()] });
    const result = await hooks.user.create.before(
      { email: "ben@eu.acme.com", emailVerified: false },
      callback,
    );
    expect(result?.data.emailVerified).toBe(true);
  });

  it("are refused outside the domain or for an unverified connection", async () => {
    stubDb({ providers: [provider()] });
    await expect(
      hooks.user.create.before({ email: "zed@other.com" }, callback),
    ).rejects.toMatchObject({ body: { code: "sso_email_outside_domain" } });
    stubDb({ providers: [provider({ domainVerified: false })] });
    await expect(
      hooks.user.create.before({ email: "ben@acme.com" }, callback),
    ).rejects.toMatchObject({ body: { code: "sso_email_outside_domain" } });
  });

  it("leave other sign-ups alone", async () => {
    const result = await hooks.user.create.before(
      { email: "zed@other.com" },
      { path: "/sign-in/email-otp", params: {} },
    );
    expect(result).toBeUndefined();
  });
});

describe("what the identity provider says about the address", () => {
  type Check = Parameters<typeof validateSsoUserInfo>[0];
  const check = (
    method: string,
    action: string,
    profile: Row | undefined,
    email = "ana@acme.com",
    context: object = {},
  ) =>
    validateSsoUserInfo(
      {
        user: { email },
        source: {
          method,
          action,
          sso: { providerId: "sso-abcdefabcdef", profile },
        },
      } as Check,
      context as never,
    );

  it("runs on every sign-in, link and new account", () => {
    expect(auth.options.user?.validateUserInfo).toBe(validateSsoUserInfo);
  });

  it("refuses an explicit no, for new accounts, links and returning sign-ins", async () => {
    for (const action of ["create-user", "link-account", "sign-in"]) {
      for (const verified of [false, "false", 0]) {
        expect(
          await check("sso-oidc", action, { email_verified: verified }),
          `${action} ${verified}`,
        ).toMatchObject({ error: "sso_email_unverified" });
      }
      expect(
        await check("sso-saml", action, { email_verified: ["false"] }),
      ).toMatchObject({ error: "sso_email_unverified" });
    }
  });

  it("trusts a yes or silence, as before", async () => {
    for (const action of ["create-user", "link-account", "sign-in"]) {
      expect(await check("sso-oidc", action, { email_verified: true })).toBe(
        undefined,
      );
      expect(await check("sso-oidc", action, { sub: "1" })).toBe(undefined);
      expect(await check("sso-saml", action, { email: "ana@acme.com" })).toBe(
        undefined,
      );
    }
  });

  it("says when no email address came back", async () => {
    expect(
      await check("sso-saml", "create-user", {}, "G-29a5e34a-f01e"),
    ).toMatchObject({ error: "sso_email_missing" });
    expect(await check("sso-saml", "sign-in", {}, "ulla")).toMatchObject({
      error: "sso_email_missing",
    });
  });

  it("leaves other sign-in methods alone", async () => {
    expect(
      await check("oauth", "create-user", { email_verified: false }, "x"),
    ).toBe(undefined);
    expect(
      await check("email-otp", "create-user", undefined, "zed@other.com"),
    ).toBe(undefined);
  });

  it("names a new SAML account from its attributes, never the NameID", async () => {
    stubDb({ providers: [provider()] });
    const { before: beforeCreate } = (
      ssoGate().init() as unknown as {
        options: {
          databaseHooks: {
            user: {
              create: {
                before: (
                  user: Row,
                  context: unknown,
                ) => Promise<{ data: Row } | undefined>;
              };
            };
          };
        };
      }
    ).options.databaseHooks.user.create;
    const acs = (profile?: Row) => {
      const context = {
        path: "/sso/saml2/sp/acs/:providerId",
        params: { providerId: "sso-abcdefabcdef" },
      };
      if (profile)
        check("sso-saml", "create-user", profile, "ivy@acme.com", context);
      return context;
    };
    const named = await beforeCreate(
      { email: "ivy@acme.com", name: "ivy@acme.com" },
      acs({ "urn:oid:2.5.4.42": "Ivy", "urn:oid:2.5.4.4": "Mapped" }),
    );
    expect(named?.data).toMatchObject({
      name: "Ivy Mapped",
      emailVerified: true,
    });
    // An opaque persistent NameID was the plugin's name: dropped, so the
    // account starts with the local part (the app's own create hook).
    const opaque = await beforeCreate(
      { email: "pia@acme.com", name: "G-29a5e34a-f01e" },
      acs({ email: "pia@acme.com" }),
    );
    expect(opaque?.data.name).toBe("");
    // OIDC keeps the plugin's name (the name claim).
    const oidc = await beforeCreate(
      { email: "ben@acme.com", name: "Ben Okafor" },
      {
        path: "/sso/callback/:providerId",
        params: { providerId: "sso-abcdefabcdef" },
      },
    );
    expect(oidc?.data.name).toBe("Ben Okafor");
  });
});

describe("SAML signature algorithms", () => {
  const post = (xml: string) =>
    auth.handler(
      new Request(
        "http://localhost:3000/api/auth/sso/saml2/sp/acs/sso-abcdefabcdef",
        {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            origin: "http://localhost:3000",
          },
          body: new URLSearchParams({
            SAMLResponse: Buffer.from(xml).toString("base64"),
          }),
        },
      ),
    );
  const response = (signature: string, digest: string) =>
    `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"><ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:SignedInfo><ds:SignatureMethod Algorithm="${signature}"/><ds:Reference><ds:DigestMethod Algorithm="${digest}"/></ds:Reference></ds:SignedInfo></ds:Signature></samlp:Response>`;

  it("turns away a POSTed response signed or digested with SHA-1", async () => {
    stubDb({ providers: [provider()] });
    for (const xml of [
      response(
        "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
        "http://www.w3.org/2001/04/xmlenc#sha256",
      ),
      response(
        "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
        "http://www.w3.org/2000/09/xmldsig#sha1",
      ),
    ]) {
      const result = await post(xml);
      expect(result.status).toBe(302);
      expect(result.headers.get("location")).toBe(
        "/sign-in?error=sso_weak_signature",
      );
    }
  });

  it("is also the plugin's own rule", async () => {
    const { ssoOptions } = await import("@repo/auth/sso");
    expect(ssoOptions.saml.algorithms).toMatchObject({
      onDeprecated: "reject",
    });
    expect(ssoOptions.saml.algorithms.allowedSignatureAlgorithms).not.toContain(
      "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
    );
  });
});

describe("joining the workspace at every SSO sign-in", () => {
  type Write = {
    table: unknown;
    values?: Row;
    set?: Row;
    /** The insert was ON CONFLICT DO NOTHING (two sign-ins at once). */
    onConflictDoNothing?: boolean;
  };

  /** Stubs the reads joinWorkspace makes and records its writes. */
  function stubJoin({
    plan = "business" as "business" | "pro" | "free",
    member = null as Row | null,
    invitation = null as Row | null,
    claimed = true,
    email = "ben@acme.com",
  } = {}) {
    stubDb({ providers: [provider()], plan });
    const q = database.query as unknown as Record<
      string,
      Record<string, (...args: unknown[]) => unknown>
    >;
    vi.spyOn(q.user, "findFirst").mockResolvedValue({ email } as never);
    vi.spyOn(q.member, "findFirst").mockResolvedValue(
      (member ?? undefined) as never,
    );
    vi.spyOn(q.invitation, "findFirst").mockResolvedValue(
      (invitation ?? undefined) as never,
    );
    vi.spyOn(q.organization, "findFirst").mockResolvedValue({
      metadata: JSON.stringify({ ssoJoinRole: "viewer" }),
    } as never);
    const writes: Write[] = [];
    vi.spyOn(database, "insert").mockImplementation(((table: unknown) => ({
      // Awaited directly, or through .onConflictDoNothing(); recorded once.
      values: (values: Row) => ({
        // biome-ignore lint/suspicious/noThenProperty: a drizzle-like query
        then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
          writes.push({ table, values });
          return Promise.resolve().then(resolve, reject);
        },
        onConflictDoNothing: async () => {
          writes.push({ table, values, onConflictDoNothing: true });
        },
      }),
    })) as never);
    vi.spyOn(database, "update").mockImplementation(((table: unknown) => ({
      set: (set: Row) => ({
        where: () => {
          writes.push({ table, set });
          const result = Promise.resolve(
            claimed && set.status === "accepted"
              ? [{ role: invitation?.role ?? null }]
              : [],
          );
          return Object.assign(result, { returning: () => result });
        },
      }),
    })) as never);
    return writes;
  }

  it("adds someone who isn't a member with the workspace's join role", async () => {
    const writes = stubJoin();
    await joinWorkspace("u-ben", "sso-abcdefabcdef");
    expect(writes).toHaveLength(1);
    expect(writes[0].values).toMatchObject({
      organizationId: "org-1",
      userId: "u-ben",
      role: "viewer",
    });
    // Two sign-ins at once leave one membership (unique index, manual-sql/0020).
    expect(writes[0].onConflictDoNothing).toBe(true);
  });

  it("never touches an existing member's role", async () => {
    const writes = stubJoin({ member: { id: "m1" } });
    await joinWorkspace("u-ben", "sso-abcdefabcdef");
    expect(writes).toEqual([]);
  });

  it("accepts a pending invitation with its role", async () => {
    const writes = stubJoin({ invitation: { id: "inv-1", role: "admin" } });
    await joinWorkspace("u-ben", "sso-abcdefabcdef");
    expect(writes.map((w) => w.set ?? w.values)).toEqual([
      { status: "accepted" },
      expect.objectContaining({ userId: "u-ben", role: "admin" }),
    ]);
    expect(writes[1].onConflictDoNothing).toBe(true);
  });

  it("adds nobody when another sign-in claimed the invitation first", async () => {
    const writes = stubJoin({
      invitation: { id: "inv-1", role: "admin" },
      claimed: false,
    });
    await joinWorkspace("u-ben", "sso-abcdefabcdef");
    expect(writes.filter((w) => w.values)).toEqual([]);
  });

  it("does nothing off Business or outside the domain", async () => {
    let writes = stubJoin({ plan: "pro" });
    await joinWorkspace("u-ben", "sso-abcdefabcdef");
    expect(writes).toEqual([]);
    vi.restoreAllMocks();
    writes = stubJoin({ email: "zed@other.com" });
    await joinWorkspace("u-zed", "sso-abcdefabcdef");
    expect(writes).toEqual([]);
  });

  it("runs from the session hook on SSO callbacks only", async () => {
    const hooks = (
      ssoGate().init() as unknown as {
        options: {
          databaseHooks: {
            session: {
              create: {
                before: (session: Row, context: unknown) => Promise<unknown>;
              };
            };
          };
        };
      }
    ).options.databaseHooks;
    let writes = stubJoin();
    await hooks.session.create.before(
      { userId: "u-ben" },
      {
        path: "/sso/saml2/sp/acs/:providerId",
        params: { providerId: "sso-abcdefabcdef" },
      },
    );
    expect(writes.some((w) => w.values?.role === "viewer")).toBe(true);
    vi.restoreAllMocks();
    writes = stubJoin();
    await hooks.session.create.before(
      { userId: "u-ben" },
      { path: "/sign-in/email-otp", params: {} },
    );
    expect(writes).toEqual([]);
  });

  it("lists the domains whose people rejoin, only on Business", async () => {
    stubDb({ providers: [provider()] });
    expect(await ssoRejoinDomains("org-1")).toEqual(["acme.com"]);
    vi.restoreAllMocks();
    stubDb({ providers: [provider()], plan: "pro" });
    expect(await ssoRejoinDomains("org-1")).toEqual([]);
    vi.restoreAllMocks();
    stubDb({ providers: [provider({ domainVerified: false })] });
    expect(await ssoRejoinDomains("org-1")).toEqual([]);
  });
});
