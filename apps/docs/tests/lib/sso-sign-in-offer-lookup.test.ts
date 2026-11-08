// The lookup behind the sign-in panel's SSO offer (packages/auth/ee/sso.ts
// ssoSignInOffered): SSO is offered for a domain exactly when "Sign in with
// SSO" would start there (the plugin gate's own /sign-in/sso lookup), from
// the domain alone, and only on licensed servers. Database reads are stubbed
// with spies; nothing connects anywhere.
import {
  SSO_ERROR,
  SSO_SIGN_IN_PATH,
  ssoGate,
  ssoSignInOffered,
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
type Tables = Record<string, Record<string, (...args: unknown[]) => unknown>>;

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

/** Stubs the reads sso.ts and plan.ts make; returns the provider read. */
function stubDb({
  providers = [] as Row[],
  plan = "business" as "business" | "pro" | "free",
} = {}) {
  const q = database.query as unknown as Tables;
  const providerReads = vi
    .spyOn(q.ssoProvider, "findMany")
    .mockResolvedValue(providers as never);
  vi.spyOn(q.member, "findMany").mockResolvedValue([
    { userId: "u-owner", role: "owner" },
  ] as never);
  vi.spyOn(q.subscription, "findMany").mockResolvedValue(
    (plan === "free"
      ? []
      : [{ productId: plan === "business" ? BUSINESS : "pro-id" }]) as never,
  );
  return providerReads;
}

/** Spies on every read of people, their accounts and sessions. */
function watchAccountReads() {
  const q = database.query as unknown as Tables;
  return ["user", "account", "session", "passkey", "twoFactor"].flatMap(
    (table) =>
      ["findFirst", "findMany"]
        .filter((method) => typeof q[table]?.[method] === "function")
        .map((method) => vi.spyOn(q[table] as Tables[string], method)),
  );
}

/**
 * What the gate's /sign-in/sso hook does with this address: "starts" when it
 * hands the plugin a connection, otherwise its error code.
 */
async function signInWithSso(email: string): Promise<string> {
  const hook = ssoGate().hooks.before.find((entry) =>
    entry.matcher({ path: SSO_SIGN_IN_PATH } as never),
  );
  if (!hook) throw new Error("no /sign-in/sso hook");
  try {
    const result = (await (
      hook.handler as unknown as (ctx: unknown) => Promise<unknown>
    )({ path: SSO_SIGN_IN_PATH, body: { email } })) as {
      context?: { body?: { providerId?: string } };
    };
    return result?.context?.body?.providerId ? "starts" : "passes";
  } catch (error) {
    return (error as { body?: { code?: string } }).body?.code ?? "threw";
  }
}

afterEach(() => vi.restoreAllMocks());

describe("SSO is offered exactly when Sign in with SSO would start", () => {
  const cases: {
    name: string;
    providers: Row[];
    plan?: "business" | "pro" | "free";
    domain: string;
    offered: boolean;
    signIn: string;
  }[] = [
    {
      name: "a verified connection on Business",
      providers: [provider()],
      domain: "acme.com",
      offered: true,
      signIn: "starts",
    },
    {
      name: "a subdomain of the connection's domain",
      providers: [provider()],
      domain: "eu.acme.com",
      offered: true,
      signIn: "starts",
    },
    {
      name: "no connection",
      providers: [],
      domain: "acme.com",
      offered: false,
      signIn: SSO_ERROR.notFound,
    },
    {
      name: "a connection for another domain",
      providers: [provider()],
      domain: "notacme.com",
      offered: false,
      signIn: SSO_ERROR.notFound,
    },
    {
      name: "two connections covering the domain",
      providers: [
        provider(),
        provider({ providerId: "sso-bbbbbbbbbbbb", domain: "eu.acme.com" }),
      ],
      domain: "eu.acme.com",
      offered: false,
      signIn: SSO_ERROR.notFound,
    },
    {
      name: "a workspace on Pro",
      providers: [provider()],
      plan: "pro",
      domain: "acme.com",
      offered: false,
      signIn: SSO_ERROR.unavailable,
    },
    {
      name: "a workspace on the free plan",
      providers: [provider()],
      plan: "free",
      domain: "acme.com",
      offered: false,
      signIn: SSO_ERROR.unavailable,
    },
    {
      name: "an unverified connection",
      providers: [provider({ domainVerified: false })],
      domain: "acme.com",
      offered: false,
      signIn: SSO_ERROR.unavailable,
    },
    {
      name: "a connection without a workspace",
      providers: [provider({ organizationId: null })],
      domain: "acme.com",
      offered: false,
      signIn: SSO_ERROR.unavailable,
    },
  ];

  for (const c of cases) {
    it(c.name, async () => {
      stubDb({ providers: c.providers, plan: c.plan });
      expect(await ssoSignInOffered(c.domain)).toBe(c.offered);
      expect(await signInWithSso(`ana@${c.domain}`)).toBe(c.signIn);
    });
  }
});

describe("the lookup", () => {
  it("reads only connections and the plan, never people or accounts", async () => {
    stubDb({ providers: [provider()] });
    const reads = watchAccountReads();
    expect(reads.length).toBeGreaterThan(0);
    expect(await ssoSignInOffered("acme.com")).toBe(true);
    expect(await ssoSignInOffered("example.com")).toBe(false);
    for (const read of reads) expect(read).not.toHaveBeenCalled();
  });

  it("reads nothing for something that isn't a domain", async () => {
    const providerReads = stubDb({ providers: [provider()] });
    for (const domain of ["", "acme", "acme..com", "a b.com", "-acme.com"]) {
      expect(await ssoSignInOffered(domain), domain).toBe(false);
    }
    expect(providerReads).not.toHaveBeenCalled();
  });

  it("is off, reading nothing, without a licence key", async () => {
    const providerReads = stubDb({ providers: [provider()] });
    const licence = process.env.QRDX_EE_LICENSE;
    delete process.env.QRDX_EE_LICENSE;
    try {
      expect(await ssoSignInOffered("acme.com")).toBe(false);
    } finally {
      process.env.QRDX_EE_LICENSE = licence;
    }
    expect(providerReads).not.toHaveBeenCalled();
    expect(await ssoSignInOffered("acme.com")).toBe(true);
  });
});
