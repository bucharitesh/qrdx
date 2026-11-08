// "Require two-step verification" for a workspace (Business):
//
// - the rules (packages/auth/workspace-two-factor-rules.ts) and the server
//   check (packages/auth/workspace-two-factor.ts), on in-memory tables;
// - the app's guard (lib/scope.ts, for real): a session that names a
//   workspace shutting it out is refused, the default passes over it, and
//   the [workspace] layout's peek says so instead of throwing;
// - Better Auth's workspace endpoints over HTTP (the plugin's decision);
// - the Team page's action (owners and admins, Business, two-step
//   verification on yourself, "Confirm it's you");
// - moving a code into a workspace that shuts you out.
//
// Nothing connects to a database or a provider: Better Auth is a fake that
// reads the session from the test and records what it's asked to do.
import { ownWorkspaceId } from "@repo/auth/own-workspace-id";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => {
  // packages/auth/plan.ts reads the Business products when it loads.
  process.env.NEXT_PUBLIC_QRDX_BUSINESS_MONTHLY_PRODUCT_ID =
    "prod_business_monthly";
  return {
    /** The signed-in session (null: signed out) */
    session: null as null | {
      userId: string;
      id: string;
      activeOrganizationId: string | null;
    },
    /** The request's headers (x-qrdx-workspace names the open workspace) */
    headers: {} as Record<string, string>,
    /** The app's plan for the team (lib/plans.ts) */
    plan: "business" as "free" | "pro" | "business",
    calls: [] as string[],
    errors: [] as string[],
  };
});

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
    new Headers({ host: "localhost:3000", ...state.headers }),
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
  slidingWindow: () => ({}),
}));
vi.mock("@repo/auth/passkey", () => ({ cookiesToSet: () => [] }));
vi.mock("@repo/auth/passkey-rp", () => ({
  passkeyRelyingParty: () => ({ rpID: "localhost", origin: "x" }),
  isPasskeyOrigin: () => true,
}));
vi.mock("@/lib/feature-availability", () => ({
  isFeatureAvailable: () => true,
}));
vi.mock("@/lib/account/reauth", () => ({ signInCodesAvailable: () => true }));
vi.mock("@/lib/account/linked-sign-ins-server", () => ({
  linkedSignInsFor: async () => [],
  configuredSocialProviders: () => [],
}));
vi.mock("@/lib/delivery-guard", () => ({
  isOutboundDeliveryAllowed: () => false,
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: async () => ({}) }));
vi.mock("@/lib/shared", () => ({
  logError: (error: Error) => state.errors.push(error.message),
}));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getOwnerPlanForOrganization: async () => state.plan,
}));

/** Better Auth: the session from the test; workspace updates are recorded. */
vi.mock("@repo/auth/server", async () => {
  const { fakeDb: db } = await import("../support/fake-db");
  return {
    auth: {
      api: {
        getSession: async () => {
          if (!state.session) return null;
          const user = db
            .rows("user")
            .find((row) => row.id === state.session?.userId);
          return {
            user: { id: user?.id, name: user?.name, email: user?.email },
            session: {
              id: state.session.id,
              createdAt: new Date(Date.now() - 86_400_000),
              activeOrganizationId: state.session.activeOrganizationId,
            },
          };
        },
        updateOrganization: async ({
          body,
        }: {
          body: { organizationId: string; data: { metadata: unknown } };
        }) => {
          state.calls.push(`updateOrganization ${JSON.stringify(body)}`);
          const row = db
            .rows("organization")
            .find((org) => org.id === body.organizationId);
          if (row) row.metadata = JSON.stringify(body.data.metadata);
          return row;
        },
      },
    },
  };
});

const rules = await import("@repo/auth/workspace-two-factor-rules");
const server = await import("@repo/auth/workspace-two-factor");
const scopeLib = await import("@/lib/scope");
const appRules = await import("@/lib/workspace-two-factor");
const { plansWith } = await import("@/lib/plans");
const confirmation = await import("@/lib/account/confirmation-server");
const { setTwoFactorRequirement } = await import(
  "@/app/dashboard/team/_lib/two-factor-requirement-actions"
);
const { OWN_TWO_FACTOR_FIRST } = await import(
  "@/app/dashboard/team/_lib/two-factor-requirement"
);
const move = await import("@/app/dashboard/codes/_lib/move-workspace");

const ADA = "user_ada"; // owner, two-step on, pays for Business
const BOB = "user_bob"; // member, two-step off
const CY = "user_cy"; // admin, two-step off
const TEAM = "org_team";
const OTHER = "org_other"; // another team of Bob's, no requirement

function seed({ required = true }: { required?: boolean } = {}) {
  const now = new Date();
  fakeDb.seed("user", [
    { id: ADA, name: "Ada", email: "ada@qrdx.test", twoFactorEnabled: true },
    { id: BOB, name: "Bob", email: "bob@qrdx.test", twoFactorEnabled: false },
    { id: CY, name: "Cy", email: "cy@qrdx.test", twoFactorEnabled: false },
  ]);
  fakeDb.seed("organization", [
    {
      id: TEAM,
      name: "Team",
      slug: "team",
      createdAt: now,
      metadata: JSON.stringify({
        ssoJoinRole: "viewer",
        ...(required ? { requireTwoFactor: true } : {}),
      }),
    },
    { id: OTHER, name: "Other", slug: "other", createdAt: now },
    ...[ADA, BOB, CY].map((id) => ({
      id: ownWorkspaceId(id),
      name: `${id} own`,
      slug: `${id.replace("_", "-")}-own`,
      createdAt: now,
    })),
  ]);
  fakeDb.seed("member", [
    { id: "m1", organizationId: TEAM, userId: ADA, role: "owner" },
    { id: "m2", organizationId: TEAM, userId: BOB, role: "member" },
    { id: "m3", organizationId: TEAM, userId: CY, role: "admin" },
    { id: "m4", organizationId: OTHER, userId: BOB, role: "owner" },
    ...[ADA, BOB, CY].map((id) => ({
      id: `own_${id}`,
      organizationId: ownWorkspaceId(id),
      userId: id,
      role: "owner",
    })),
  ]);
  fakeDb.seed("subscription", [
    {
      id: "sub_ada",
      userId: ADA,
      productId: "prod_business_monthly",
      status: "active",
    },
  ]);
}

/** The team drops to Pro: its paying owner's subscription changes. */
function dropToPro() {
  state.plan = "pro";
  const row = fakeDb.rows("subscription").find((s) => s.id === "sub_ada");
  if (row) row.productId = "prod_pro_monthly";
}

function signIn(
  userId: string,
  { slug, active = null }: { slug?: string; active?: string | null } = {},
) {
  state.session = {
    userId,
    id: `session_${userId}`,
    activeOrganizationId: active,
  };
  state.headers = slug ? { "x-qrdx-workspace": slug } : {};
}

const confirm = (userId: string) =>
  confirmation.recordConfirmation({ userId, sessionId: `session_${userId}` });

const teamMetadata = () =>
  JSON.parse(
    String(fakeDb.rows("organization").find((o) => o.id === TEAM)?.metadata),
  );

beforeEach(() => {
  fakeDb.reset();
  seed();
  state.session = null;
  state.headers = {};
  state.plan = "business";
  state.calls = [];
  state.errors = [];
});

// ─── The rules ────────────────────────────────────────────────────────────────

describe("the setting in the workspace's metadata", () => {
  it("reads it from Better Auth's JSON string or an object, and nothing else", () => {
    expect(rules.twoFactorRequiredIn('{"requireTwoFactor":true}')).toBe(true);
    expect(rules.twoFactorRequiredIn({ requireTwoFactor: true })).toBe(true);
    for (const value of [
      null,
      "",
      "not json",
      "[]",
      '{"requireTwoFactor":"true"}',
      '{"requireTwoFactor":1}',
      { requireTwoFactor: false },
    ]) {
      expect(rules.twoFactorRequiredIn(value)).toBe(false);
    }
  });

  it("changes only its own key", () => {
    expect(
      rules.withTwoFactorRequired('{"ssoJoinRole":"viewer"}', true),
    ).toEqual({ ssoJoinRole: "viewer", requireTwoFactor: true });
    expect(
      rules.withTwoFactorRequired(
        '{"ssoJoinRole":"viewer","requireTwoFactor":true}',
        false,
      ),
    ).toEqual({ ssoJoinRole: "viewer" });
    expect(rules.withTwoFactorRequired("garbage", true)).toEqual({
      requireTwoFactor: true,
    });
  });

  it("comes with Business only, the plan the server checks", () => {
    expect(plansWith((limits) => limits.requireTwoFactor)).toEqual([
      "business",
    ]);
  });
});

describe("which Better Auth endpoints act on a workspace", () => {
  it("leaves making, listing, switching, leaving and answering invitations alone", () => {
    for (const path of [
      "/organization/create",
      "/organization/check-slug",
      "/organization/list",
      "/organization/set-active",
      "/organization/leave",
      "/organization/get-invitation",
      "/organization/accept-invitation",
      "/organization/reject-invitation",
      "/organization/list-user-invitations",
    ]) {
      expect(rules.organizationPathActsOnWorkspace(path)).toBe(false);
    }
  });

  it("covers every other workspace endpoint, including new ones", () => {
    for (const path of [
      "/organization/update",
      "/organization/delete",
      "/organization/get-full-organization",
      "/organization/list-members",
      "/organization/invite-member",
      "/organization/cancel-invitation",
      "/organization/list-invitations",
      "/organization/remove-member",
      "/organization/update-member-role",
      "/organization/get-active-member",
      "/organization/has-permission",
      "/organization/some-future-endpoint",
    ]) {
      expect(rules.organizationPathActsOnWorkspace(path)).toBe(true);
    }
    expect(rules.organizationPathActsOnWorkspace("/get-session")).toBe(false);
  });
});

// ─── The server check ────────────────────────────────────────────────────────

describe("who a workspace shuts out", () => {
  it("a member without two-step verification, while it's on and on Business", async () => {
    expect(await server.lacksRequiredTwoFactor(BOB, TEAM)).toBe(true);
    expect(await server.lacksRequiredTwoFactor(CY, TEAM)).toBe(true);
  });

  it("nobody with two-step verification on", async () => {
    expect(await server.lacksRequiredTwoFactor(ADA, TEAM)).toBe(false);
  });

  it("nobody when the setting is off", async () => {
    fakeDb.reset();
    seed({ required: false });
    expect(await server.lacksRequiredTwoFactor(BOB, TEAM)).toBe(false);
    expect(await server.workspaceRequiresTwoFactor(TEAM)).toBe(false);
  });

  it("nobody once the workspace isn't on Business: the setting stays, but doesn't apply", async () => {
    dropToPro();
    expect(await server.workspaceRequiresTwoFactor(TEAM)).toBe(false);
    expect(await server.lacksRequiredTwoFactor(BOB, TEAM)).toBe(false);
    // Back on Business, it applies again.
    const row = fakeDb.rows("subscription").find((s) => s.id === "sub_ada");
    if (row) row.productId = "prod_business_monthly";
    expect(await server.lacksRequiredTwoFactor(BOB, TEAM)).toBe(true);
  });

  it("nobody when the paying subscription has ended", async () => {
    const row = fakeDb.rows("subscription").find((s) => s.id === "sub_ada");
    if (row) row.status = "canceled";
    expect(await server.lacksRequiredTwoFactor(BOB, TEAM)).toBe(false);
  });

  it("reads the person's switch from the database", async () => {
    const bob = fakeDb.rows("user").find((u) => u.id === BOB);
    if (bob) bob.twoFactorEnabled = true;
    expect(await server.lacksRequiredTwoFactor(BOB, TEAM)).toBe(false);
  });
});

// ─── The app's guard (lib/scope.ts) ──────────────────────────────────────────

describe("opening a workspace with a session", () => {
  it("refuses a member without two-step verification in the workspace the URL names", async () => {
    signIn(BOB, { slug: "team" });
    await expect(scopeLib.getActiveScope()).rejects.toBeInstanceOf(
      scopeLib.TwoFactorRequiredError,
    );
    await expect(scopeLib.getActiveWorkspace()).rejects.toMatchObject({
      status: 403,
      code: "TWO_FACTOR_REQUIRED",
    });
  });

  it("refuses a route given the workspace by the request's own headers", async () => {
    signIn(BOB);
    const headers = new Headers({ "x-qrdx-workspace": "team" });
    await expect(scopeLib.getActiveScope(headers)).rejects.toMatchObject({
      code: "TWO_FACTOR_REQUIRED",
    });
  });

  it("lets the layout see it, to show what to do (and nothing else)", async () => {
    signIn(BOB, { slug: "team" });
    const peek = await scopeLib.peekActiveWorkspace();
    expect(peek.shutOut).toBe(true);
    expect(peek.workspace).toMatchObject({ slug: "team", name: "Team" });
  });

  it("opens it for a member with two-step verification", async () => {
    signIn(ADA, { slug: "team" });
    await expect(scopeLib.getActiveScope()).resolves.toMatchObject({
      organizationId: TEAM,
      role: "owner",
    });
    expect((await scopeLib.peekActiveWorkspace()).shutOut).toBe(false);
  });

  it("an admin without it is refused too", async () => {
    signIn(CY, { slug: "team" });
    await expect(scopeLib.getActiveScope()).rejects.toMatchObject({
      code: "TWO_FACTOR_REQUIRED",
    });
  });

  it("their other workspaces work as usual", async () => {
    signIn(BOB, { slug: "other" });
    await expect(scopeLib.getActiveScope()).resolves.toMatchObject({
      organizationId: OTHER,
    });
  });

  it("without a workspace in the URL, passes over it to one they can open", async () => {
    // The session's workspace is the team (last opened before it was required).
    signIn(BOB, { active: TEAM });
    const scope = await scopeLib.getActiveScope();
    expect(scope.organizationId).toBe(ownWorkspaceId(BOB));
    expect((await scopeLib.peekActiveWorkspace()).shutOut).toBe(false);
  });

  it("refuses when every workspace of theirs shuts them out; the peek points at the first", async () => {
    // Bob's own workspace requires it too.
    fakeDb.rows("member").push({
      id: "m5",
      organizationId: OTHER,
      userId: ADA,
      role: "billing",
    });
    for (const org of fakeDb.rows("organization")) {
      if (org.id === OTHER || org.id === ownWorkspaceId(BOB)) {
        org.metadata = '{"requireTwoFactor":true}';
      }
    }
    fakeDb.rows("member").push({
      id: "m6",
      organizationId: ownWorkspaceId(BOB),
      userId: ADA,
      role: "billing",
    });
    signIn(BOB, { active: TEAM });
    await expect(scopeLib.getActiveScope()).rejects.toMatchObject({
      code: "TWO_FACTOR_REQUIRED",
    });
    const peek = await scopeLib.peekActiveWorkspace();
    expect(peek).toMatchObject({ shutOut: true });
    expect(peek.workspace.id).toBe(TEAM);
  });

  it("opens again once the workspace leaves Business", async () => {
    dropToPro();
    signIn(BOB, { slug: "team" });
    await expect(scopeLib.getActiveScope()).resolves.toMatchObject({
      organizationId: TEAM,
    });
  });

  it("a workspace they aren't in is still a 404, never a 2FA answer", async () => {
    signIn(BOB, { slug: "ada-own" });
    await expect(scopeLib.getActiveScope()).rejects.toBeInstanceOf(
      scopeLib.WorkspaceNotFoundError,
    );
  });
});

// ─── Better Auth's endpoints over HTTP ───────────────────────────────────────

describe("Better Auth's workspace endpoints over HTTP", () => {
  const http = (path: string, body: unknown = {}, query: unknown = {}) => ({
    http: true,
    path,
    body,
    query,
  });
  const as =
    (userId: string, active: string | null = null) =>
    async () => ({
      user: { id: userId },
      session: { activeOrganizationId: active },
    });

  it("refuses a member it shuts out, by id, slug, invitation or the session's workspace", async () => {
    fakeDb.seed("invitation", [
      { id: "inv_1", organizationId: TEAM, email: "x@qrdx.test" },
    ]);
    for (const request of [
      http("/organization/get-full-organization", {}, { organizationId: TEAM }),
      http("/organization/list-members", {}, { organizationSlug: "team" }),
      http("/organization/cancel-invitation", { invitationId: "inv_1" }),
      http("/organization/invite-member", {
        email: "y@qrdx.test",
        role: "member",
        organizationId: TEAM,
      }),
      http("/organization/remove-member", { memberIdOrEmail: "m1" }),
    ]) {
      await expect(
        server.checkWorkspaceTwoFactorGate(request, as(BOB, TEAM)),
      ).rejects.toMatchObject({ body: { code: "TWO_FACTOR_REQUIRED" } });
    }
  });

  it("lets through someone with two-step verification, and other workspaces", async () => {
    await expect(
      server.checkWorkspaceTwoFactorGate(
        http("/organization/list-members", {}, { organizationId: TEAM }),
        as(ADA),
      ),
    ).resolves.toBeUndefined();
    // Named explicitly, another workspace isn't refused for the session's.
    await expect(
      server.checkWorkspaceTwoFactorGate(
        http("/organization/list-members", {}, { organizationId: OTHER }),
        as(BOB, TEAM),
      ),
    ).resolves.toBeUndefined();
  });

  it("never tells someone outside the workspace about its setting", async () => {
    const outsider = "user_dee";
    fakeDb.rows("user").push({ id: outsider, twoFactorEnabled: false });
    await expect(
      server.checkWorkspaceTwoFactorGate(
        http("/organization/list-members", {}, { organizationId: TEAM }),
        as(outsider),
      ),
    ).resolves.toBeUndefined();
  });

  it("lets anyone leave it, switch to it or answer an invitation", async () => {
    for (const path of [
      "/organization/leave",
      "/organization/set-active",
      "/organization/accept-invitation",
    ]) {
      await expect(
        server.checkWorkspaceTwoFactorGate(
          http(path, { organizationId: TEAM }),
          as(BOB, TEAM),
        ),
      ).resolves.toBeUndefined();
    }
  });

  it("refuses the workspace's metadata over HTTP, even from someone it lets in", async () => {
    for (const metadata of [{ requireTwoFactor: false }, {}]) {
      await expect(
        server.checkWorkspaceTwoFactorGate(
          http("/organization/update", {
            organizationId: TEAM,
            data: { metadata },
          }),
          as(ADA),
        ),
      ).rejects.toMatchObject({
        body: { code: server.WORKSPACE_SETTINGS_IN_APP },
      });
    }
    // A rename by someone it lets in still works.
    await expect(
      server.checkWorkspaceTwoFactorGate(
        http("/organization/update", {
          organizationId: TEAM,
          data: { name: "Renamed" },
        }),
        as(ADA),
      ),
    ).resolves.toBeUndefined();
  });

  it("doesn't check the app's own calls (they went through lib/scope.ts)", async () => {
    await expect(
      server.checkWorkspaceTwoFactorGate(
        {
          http: false,
          path: "/organization/update",
          body: { organizationId: TEAM, data: { metadata: {} } },
          query: {},
        },
        as(BOB, TEAM),
      ),
    ).resolves.toBeUndefined();
  });

  it("finds the workspaces a request acts on", async () => {
    const lookups = {
      organizationIdForSlug: async (slug: string) =>
        slug === "team" ? TEAM : null,
      organizationIdForInvitation: async () => null,
    };
    expect(
      await server.targetWorkspaces({ body: {}, query: {} }, TEAM, lookups),
    ).toEqual([TEAM]);
    expect(
      await server.targetWorkspaces(
        { body: { organizationId: OTHER }, query: {} },
        TEAM,
        lookups,
      ),
    ).toEqual([OTHER]);
    expect(
      await server.targetWorkspaces(
        { body: {}, query: { organizationSlug: "team" } },
        null,
        lookups,
      ),
    ).toEqual([TEAM]);
    // A name that finds nothing never falls back to the session's.
    expect(
      await server.targetWorkspaces(
        { body: {}, query: { organizationSlug: "nope" } },
        TEAM,
        lookups,
      ),
    ).toEqual([]);
  });
});

// ─── The Team page's setting ─────────────────────────────────────────────────

describe("Settings → Team → Require two-step verification", () => {
  beforeEach(() => {
    fakeDb.reset();
    seed({ required: false });
  });

  it("asks an owner with two-step verification to confirm it's them, then saves it", async () => {
    signIn(ADA, { slug: "team" });
    expect(await setTwoFactorRequirement({ required: true })).toEqual({
      ok: false,
      error: "CONFIRMATION_REQUIRED",
    });
    expect(state.calls).toEqual([]);

    await confirm(ADA);
    expect(await setTwoFactorRequirement({ required: true })).toEqual({
      ok: true,
      data: { required: true },
    });
    // The SSO join role (and anything else in the metadata) stays.
    expect(teamMetadata()).toEqual({
      ssoJoinRole: "viewer",
      requireTwoFactor: true,
    });

    // From now on, Cy (an admin without it) can't open the workspace.
    signIn(CY, { slug: "team" });
    await expect(scopeLib.getActiveScope()).rejects.toMatchObject({
      code: "TWO_FACTOR_REQUIRED",
    });
  });

  it("turning it off asks too, and keeps the rest of the metadata", async () => {
    fakeDb.reset();
    seed({ required: true });
    signIn(ADA, { slug: "team" });
    expect(await setTwoFactorRequirement({ required: false })).toEqual({
      ok: false,
      error: "CONFIRMATION_REQUIRED",
    });
    await confirm(ADA);
    expect(await setTwoFactorRequirement({ required: false })).toMatchObject({
      ok: true,
    });
    expect(teamMetadata()).toEqual({ ssoJoinRole: "viewer" });
  });

  it("refuses someone without two-step verification on themselves, before asking", async () => {
    const cy = fakeDb.rows("user").find((u) => u.id === CY);
    signIn(CY, { slug: "team" });
    expect(await setTwoFactorRequirement({ required: true })).toEqual({
      ok: false,
      error: OWN_TWO_FACTOR_FIRST,
    });
    // With it on, the same admin may.
    if (cy) cy.twoFactorEnabled = true;
    await confirm(CY);
    expect(await setTwoFactorRequirement({ required: true })).toMatchObject({
      ok: true,
    });
  });

  it("refuses members, viewers and billing members", async () => {
    const bob = fakeDb.rows("user").find((u) => u.id === BOB);
    if (bob) bob.twoFactorEnabled = true;
    for (const role of ["member", "viewer", "billing"]) {
      const row = fakeDb.rows("member").find((m) => m.id === "m2");
      if (row) row.role = role;
      signIn(BOB, { slug: "team" });
      await confirm(BOB);
      const result = await setTwoFactorRequirement({ required: true });
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error).toMatch(/^.*Only owners/);
    }
    expect(state.calls).toEqual([]);
  });

  it("is Business only to turn on; off works on any plan", async () => {
    state.plan = "pro";
    signIn(ADA, { slug: "team" });
    await confirm(ADA);
    expect(await setTwoFactorRequirement({ required: true })).toEqual({
      ok: false,
      error: "Requiring two-step verification comes with Business.",
      upgrade: true,
    });
    expect(state.calls).toEqual([]);
    expect(await setTwoFactorRequirement({ required: false })).toMatchObject({
      ok: true,
    });
  });

  it("refuses someone the workspace shuts out, whatever they ask", async () => {
    fakeDb.reset();
    seed({ required: true });
    signIn(CY, { slug: "team" });
    await confirm(CY);
    expect(await setTwoFactorRequirement({ required: false })).toEqual({
      ok: false,
      error: rules.TWO_FACTOR_REQUIRED_MESSAGE,
    });
    expect(state.calls).toEqual([]);
  });

  it("refuses anything but a yes or no", async () => {
    signIn(ADA, { slug: "team" });
    for (const input of [null, {}, { required: "yes" }]) {
      expect(await setTwoFactorRequirement(input)).toEqual({
        ok: false,
        error: "Invalid request.",
      });
    }
  });
});

// ─── Moving a code ───────────────────────────────────────────────────────────

describe("moving a code into a workspace that shuts you out", () => {
  it("isn't offered, and is refused", async () => {
    // Bob, in his other team, looks for where a code could go.
    const scope = {
      userId: BOB,
      organizationId: OTHER,
      role: "owner" as const,
    };
    const targets = await move.listMoveTargets(scope);
    expect(targets.map((t) => t.id)).toEqual([ownWorkspaceId(BOB)]);
    await expect(
      move.moveCodeToWorkspace(scope, "code_1", TEAM),
    ).rejects.toMatchObject({ code: "TWO_FACTOR_REQUIRED" });
  });
});

// ─── The way back from Settings ──────────────────────────────────────────────

describe("Turn on two-step verification, and back", () => {
  it("goes to Profile & security with the workspace page to come back to", () => {
    expect(appRules.twoFactorSetupHref("/dashboard/team/codes")).toBe(
      "/settings/account?next=%2Fdashboard%2Fteam%2Fcodes#two-factor",
    );
  });

  it("only ever comes back to a page inside a workspace on this site", () => {
    expect(appRules.workspaceReturnPath("/dashboard/team")).toBe(
      "/dashboard/team",
    );
    for (const value of [
      undefined,
      "",
      "https://evil.example/dashboard/team",
      "//evil.example/dashboard/team",
      "/\\evil.example",
      "/settings/account",
      "/dashboard",
      "/dashboard?to=settings",
      ["/dashboard/team"],
    ]) {
      expect(appRules.workspaceReturnPath(value)).toBeNull();
    }
    expect(appRules.twoFactorSetupHref("https://evil.example")).toBe(
      "/settings/account#two-factor",
    );
  });
});
