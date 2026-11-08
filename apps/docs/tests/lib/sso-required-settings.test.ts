// Settings → Single sign-on → "Require single sign-on for <domain>"
// (ee/sso/connections.ts setSsoRequired, ee/sso/required.ts): who may turn
// it on, what it stores, and what turning it on does to the sessions people
// already have. Against in-memory tables (tests/support/fake-db.ts) that
// evaluate the real queries; Better Auth's organization update is a stand-in
// that writes the workspace's metadata. Nothing connects anywhere.
import {
  SSO_REQUIRED_METADATA_KEY,
  ssoMarkerValue,
  ssoSessionIdentifier,
} from "@repo/auth/sso-required-rules";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  plan: "business" as "business" | "pro",
  updates: [] as Record<string, unknown>[],
  deleted: [] as string[],
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@/lib/plans", () => ({
  getOwnerPlanForOrganization: async () => state.plan,
  getPlanLimits: (plan: string) => ({ sso: plan === "business" }),
}));
vi.mock("@repo/auth/server", async () => {
  const { fakeDb: db } = await import("../support/fake-db");
  return {
    auth: {
      $context: Promise.resolve({ isTrustedOrigin: () => false }),
      api: {
        updateOrganization: async ({
          body,
        }: {
          body: {
            organizationId: string;
            data: { metadata: Record<string, unknown> };
          };
        }) => {
          state.updates.push(body.data.metadata);
          const row = db.find("organization", { id: body.organizationId });
          if (row) row.metadata = JSON.stringify(body.data.metadata);
          return row;
        },
        deleteSSOProvider: async ({
          body,
        }: {
          body: { providerId: string };
        }) => {
          state.deleted.push(body.providerId);
          const rows = db.rows("ssoProvider");
          rows.splice(
            rows.findIndex((r) => r.providerId === body.providerId),
            1,
          );
          return { success: true };
        },
        requestDomainVerification: async () => ({
          domainVerificationToken: "token",
        }),
      },
    },
  };
});

process.env.BETTER_AUTH_URL = "http://localhost:3000";

const { getSsoOverview, setSsoRequired, deleteSsoConnection } = await import(
  "@/ee/sso/connections"
);
const { clearSsoRequirementCache } = await import("@repo/auth/sso-required");

const ORG = "org_acme";
const PROVIDER = "sso-aaaaaaaaaaaa";
const HOUR = 60 * 60 * 1000;
const headers = new Headers();

type Role = "owner" | "admin" | "member" | "billing" | "viewer";
const scope = (userId: string, role: Role) => ({
  userId,
  organizationId: ORG,
  role,
});

function seed({
  verified = true,
  metadata = { ssoJoinRole: "viewer" } as Record<string, unknown>,
} = {}) {
  fakeDb.reset();
  const now = new Date();
  fakeDb.seed("ssoProvider", [
    {
      id: "p1",
      providerId: PROVIDER,
      organizationId: ORG,
      domain: "acme.test",
      domainVerified: verified,
      issuer: "https://idp.acme.test",
      oidcConfig: JSON.stringify({ clientId: "client-1234" }),
      samlConfig: null,
    },
  ]);
  fakeDb.seed("organization", [
    {
      id: ORG,
      name: "Acme",
      slug: "acme",
      createdAt: now,
      metadata: JSON.stringify(metadata),
    },
  ]);
  const people: [string, string, Role | null][] = [
    ["u_owner", "owner@acme.test", "owner"],
    ["u_admin", "admin@acme.test", "admin"],
    ["u_ana", "ana@acme.test", "member"],
    ["u_eu", "eu@eu.acme.test", null],
    ["u_zed", "zed@other.test", "admin"],
    ["u_look", "ana@notacme.test", null],
    // Not an address sign-in treats as at the domain (an underscore isn't
    // allowed in a host name), so not one turning it on signs out.
    ["u_odd", "odd@x_y.acme.test", null],
  ];
  fakeDb.seed(
    "user",
    people.map(([id, email]) => ({
      id,
      email,
      name: id,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })),
  );
  fakeDb.seed(
    "member",
    people
      .filter(([, , role]) => role)
      .map(([userId, , role]) => ({
        id: `m_${userId}`,
        organizationId: ORG,
        userId,
        role,
        createdAt: now,
      })),
  );
  state.plan = "business";
  state.updates = [];
  state.deleted = [];
  clearSsoRequirementCache();
}

/** A session, from SSO (with its marker, `hoursAgo`) or not. */
function session(
  id: string,
  userId: string,
  { sso = null as number | null, provider = PROVIDER } = {},
) {
  const now = Date.now();
  const signedIn = sso === null ? now - 2 * HOUR : now - sso * HOUR;
  fakeDb.seed("session", [
    {
      id,
      userId,
      token: `token_${id}`,
      createdAt: new Date(signedIn),
      updatedAt: new Date(now),
      expiresAt: new Date(now + 6 * 24 * HOUR),
    },
  ]);
  if (sso !== null) {
    fakeDb.seed("verification", [
      {
        id: `v_${id}`,
        identifier: ssoSessionIdentifier(id),
        value: ssoMarkerValue({ userId, providerId: provider }),
        expiresAt: new Date(signedIn + 24 * HOUR),
        createdAt: new Date(signedIn),
        updatedAt: new Date(signedIn),
      },
    ]);
  }
}

const sessionIds = () =>
  fakeDb
    .rows("session")
    .map((row) => row.id)
    .sort();
const metadata = () =>
  JSON.parse(
    String(fakeDb.find("organization", { id: ORG })?.metadata ?? "{}"),
  ) as Record<string, unknown>;
const viewer = (sessionId: string, email: string) => ({ sessionId, email });

async function failure(call: Promise<unknown>) {
  try {
    await call;
  } catch (error) {
    return error as { status: number; code: string; message: string };
  }
  throw new Error("expected a failure");
}

beforeEach(() => seed());

describe("turning it on", () => {
  it("names the connection in the workspace's settings, next to the rest", async () => {
    session("s_owner", "u_owner");
    const result = await setSsoRequired(
      scope("u_owner", "owner"),
      headers,
      viewer("s_owner", "owner@acme.test"),
      true,
    );
    expect(result.on).toBe(true);
    expect(metadata()).toEqual({
      ssoJoinRole: "viewer",
      [SSO_REQUIRED_METADATA_KEY]: PROVIDER,
    });
  });

  it("signs people at the domain out of sessions that didn't come from SSO, and caps the rest at 24 hours", async () => {
    session("s_owner", "u_owner");
    session("s_ana_code", "u_ana");
    session("s_ana_sso", "u_ana", { sso: 3 });
    session("s_ana_old_sso", "u_ana", { sso: 30 });
    session("s_ana_other_idp", "u_ana", {
      sso: 1,
      provider: "sso-bbbbbbbbbbbb",
    });
    session("s_eu", "u_eu");
    session("s_zed", "u_zed");
    session("s_look", "u_look");
    session("s_odd", "u_odd");
    const result = await setSsoRequired(
      scope("u_owner", "owner"),
      headers,
      viewer("s_owner", "owner@acme.test"),
      true,
    );
    // Ana's email-code session, her expired SSO session and one through
    // another connection; the subdomain's too. Owners, other domains and a
    // look-alike domain are left alone.
    expect(result.signedOut).toBe(4);
    expect(sessionIds()).toEqual([
      "s_ana_sso",
      "s_look",
      "s_odd",
      "s_owner",
      "s_zed",
    ]);
    const kept = fakeDb.find("session", { id: "s_ana_sso" });
    const markerEnd = fakeDb.find("verification", {
      identifier: ssoSessionIdentifier("s_ana_sso"),
    })?.expiresAt as Date;
    expect(new Date(kept?.expiresAt as Date).getTime()).toBe(
      markerEnd.getTime(),
    );
  });

  it("an admin at the domain must be signed in with SSO, so it doesn't sign them out", async () => {
    session("s_admin", "u_admin");
    const blocked = await failure(
      setSsoRequired(
        scope("u_admin", "admin"),
        headers,
        viewer("s_admin", "admin@acme.test"),
        true,
      ),
    );
    expect(blocked.code).toBe("REQUIREMENT_BLOCKED");
    expect(blocked.message).toMatch(/sign in with single sign-on/);
    expect(metadata()[SSO_REQUIRED_METADATA_KEY]).toBeUndefined();
    expect(sessionIds()).toEqual(["s_admin"]);

    session("s_admin_sso", "u_admin", { sso: 1 });
    const result = await setSsoRequired(
      scope("u_admin", "admin"),
      headers,
      viewer("s_admin_sso", "admin@acme.test"),
      true,
    );
    expect(result.signedOut).toBe(1);
    expect(sessionIds()).toEqual(["s_admin_sso"]);
  });

  it("an admin elsewhere doesn't need to be", async () => {
    session("s_zed", "u_zed");
    const result = await setSsoRequired(
      scope("u_zed", "admin"),
      headers,
      viewer("s_zed", "zed@other.test"),
      true,
    );
    expect(result.on).toBe(true);
    expect(sessionIds()).toEqual(["s_zed"]);
  });

  it("only owners and admins, only on Business, only once the domain is verified", async () => {
    for (const role of ["member", "billing", "viewer"] as const) {
      const refused = await failure(
        setSsoRequired(
          scope("u_ana", role),
          headers,
          viewer("s", "ana@acme.test"),
          true,
        ),
      );
      expect(refused.status, role).toBe(403);
    }
    state.plan = "pro";
    expect(
      (
        await failure(
          setSsoRequired(
            scope("u_owner", "owner"),
            headers,
            viewer("s", "owner@acme.test"),
            true,
          ),
        )
      ).code,
    ).toBe("PLAN_REQUIRED");
    seed({ verified: false });
    const unverified = await failure(
      setSsoRequired(
        scope("u_owner", "owner"),
        headers,
        viewer("s", "owner@acme.test"),
        true,
      ),
    );
    expect(unverified.message).toBe("Verify acme.test first.");
    expect(state.updates).toEqual([]);
  });
});

describe("turning it off", () => {
  it("takes it out of the settings, keeps the rest, and signs nobody out", async () => {
    seed({
      metadata: {
        ssoJoinRole: "viewer",
        [SSO_REQUIRED_METADATA_KEY]: PROVIDER,
      },
    });
    session("s_ana", "u_ana");
    // On any plan, like removing the connection.
    state.plan = "pro";
    const result = await setSsoRequired(
      scope("u_admin", "admin"),
      headers,
      viewer("s_admin", "admin@acme.test"),
      false,
    );
    expect(result).toEqual({ on: false, signedOut: 0 });
    expect(metadata()).toEqual({ ssoJoinRole: "viewer" });
    expect(sessionIds()).toEqual(["s_ana"]);
  });

  it("removing the connection takes the setting with it", async () => {
    seed({
      metadata: {
        ssoJoinRole: "viewer",
        [SSO_REQUIRED_METADATA_KEY]: PROVIDER,
      },
    });
    await deleteSsoConnection(scope("u_owner", "owner"), headers);
    expect(state.deleted).toEqual([PROVIDER]);
    expect(metadata()).toEqual({ ssoJoinRole: "viewer" });
  });
});

describe("the settings page", () => {
  it("shows whether it's on, and why it can't be turned on yet", async () => {
    session("s_admin", "u_admin");
    let overview = await getSsoOverview(
      scope("u_admin", "admin"),
      headers,
      viewer("s_admin", "admin@acme.test"),
    );
    expect(overview.requirement.on).toBe(false);
    expect(overview.requirement.blocked).toMatch(/sign in with single sign-on/);
    overview = await getSsoOverview(
      scope("u_owner", "owner"),
      headers,
      viewer("s_owner", "owner@acme.test"),
    );
    expect(overview.requirement).toEqual({ on: false, blocked: null });

    seed({
      metadata: { [SSO_REQUIRED_METADATA_KEY]: PROVIDER },
    });
    overview = await getSsoOverview(
      scope("u_owner", "owner"),
      headers,
      viewer("s_owner", "owner@acme.test"),
    );
    expect(overview.requirement).toEqual({ on: true, blocked: null });
    // A setting naming another (removed) connection isn't this one's.
    seed({
      metadata: { [SSO_REQUIRED_METADATA_KEY]: "sso-cccccccccccc" },
    });
    overview = await getSsoOverview(
      scope("u_owner", "owner"),
      headers,
      viewer("s_owner", "owner@acme.test"),
    );
    expect(overview.requirement.on).toBe(false);
  });
});
