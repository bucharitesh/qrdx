// More actions ask "Confirm it's you" (lib/account/confirmation.ts): linking
// and unlinking Google or GitHub (app/settings/account/_lib/actions.ts),
// deleting a workspace, changing someone's role, removing someone and
// inviting an admin (actions/organizations.ts), join links that add admins
// (actions/workspace-join.ts), and Better Auth's own endpoints for the same
// over HTTP (packages/auth/confirm-gate.ts). API keys and OAuth app secrets
// are in api-key-actions.test.ts and oauth-app-actions.test.ts.
//
// The confirmation itself is the real one (lib/account/confirmation-server
// .tsx), on in-memory tables (tests/support/fake-db.ts); Better Auth is a
// fake that records what it was asked to do. Each gated action answers
// CONFIRMATION_REQUIRED and changes nothing until this session has
// confirmed; signing out sessions never asks. Nothing connects to a
// database or a provider.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const USER = "user_1";
const EMAIL = "ada@qrdx.test";
const SESSION = "session_1";
const ORG = "org_t";

const state = vi.hoisted(() => ({
  /** The browser's session as getSession reads it (null: signed out) */
  session: {
    userId: "user_1",
    id: "session_1",
    createdAt: new Date(Date.now() - 3 * 86_400_000),
  } as { userId: string; id: string; createdAt: Date } | null,
  scope: {
    userId: "user_1",
    organizationId: "org_t",
    role: "owner",
  } as { userId: string; organizationId: string; role: string } | null,
  codesAvailable: true,
  calls: [] as string[],
  cookies: new Map<string, { value: string; options: unknown }>(),
  errors: [] as string[],
}));

const authError = (code: string) =>
  Object.assign(new Error(code), { body: { code } });

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
    get: () => undefined,
    set: (name: string, value: string, options: unknown) => {
      state.cookies.set(name, { value, options });
    },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
  slidingWindow: () => ({}),
}));
// The real helper parses Better Auth's Set-Cookie; this keeps name and value.
vi.mock("@repo/auth/passkey", () => ({
  cookiesToSet: (headers: Headers) => {
    const line = headers.get("set-cookie");
    if (!line) return [];
    const [pair = ""] = line.split(";");
    const at = pair.indexOf("=");
    return [
      {
        name: pair.slice(0, at),
        value: pair.slice(at + 1),
        options: { httpOnly: true, path: "/" },
      },
    ];
  },
}));
vi.mock("@repo/auth/passkey-rp", () => ({
  passkeyRelyingParty: () => ({ rpID: "localhost", origin: "x" }),
  isPasskeyOrigin: () => true,
}));
vi.mock("@/lib/feature-availability", () => ({
  isFeatureAvailable: () => true,
}));
vi.mock("@/lib/account/reauth", () => ({
  signInCodesAvailable: () => state.codesAvailable,
}));
vi.mock("@/lib/account/linked-sign-ins-server", () => ({
  linkedSignInsFor: async () => [],
  configuredSocialProviders: () => ["google", "github"],
}));
vi.mock("@/lib/delivery-guard", () => ({
  isOutboundDeliveryAllowed: () => false,
}));
vi.mock("@/lib/email/send", () => ({
  sendEmail: async () => ({ sent: true }),
}));
vi.mock("@/lib/storage/r2", () => ({
  isStorageConfigured: false,
  putObject: async () => {},
  deleteObject: async () => {},
  publicUrl: () => null,
}));
vi.mock("@/lib/shared", () => ({
  logError: (error: Error) => state.errors.push(error.message),
}));
vi.mock("@/lib/events/emails", () => ({
  sendTeamInviteEmail: async () => false,
}));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getOwnerPlanForOrganization: async () => "business",
  getPlan: async () => "business",
}));
vi.mock("@/lib/workspaces", () => ({
  rememberLastWorkspace: async () => {},
  workspaceSlug: async () => "team-t",
}));
vi.mock("@/lib/scope", async () => {
  const { UnauthorizedError } = await import("@/types/errors");
  const current = async () => {
    if (!state.scope) throw new UnauthorizedError();
    return state.scope;
  };
  return { getActiveScope: current };
});

/** Better Auth: records each call; only what these actions use. */
vi.mock("@repo/auth/server", async () => {
  const { fakeDb: db } = await import("../support/fake-db");
  const record =
    (name: string) =>
    async ({ body }: { body?: Record<string, unknown> } = {}) => {
      state.calls.push(`${name}${body ? ` ${JSON.stringify(body)}` : ""}`);
      return {};
    };
  return {
    auth: {
      api: {
        getSession: async () =>
          state.session
            ? {
                user: { id: state.session.userId, email: "ada@qrdx.test" },
                session: {
                  id: state.session.id,
                  createdAt: state.session.createdAt,
                },
              }
            : null,
        listUserAccounts: async () =>
          db
            .rows("account")
            .filter((row) => row.userId === state.session?.userId),
        linkSocial: async ({
          body,
        }: {
          body: { provider: string; disableRedirect?: boolean };
        }) => {
          state.calls.push(`linkSocial ${JSON.stringify(body)}`);
          if (body.provider === "google") {
            throw authError("PROVIDER_NOT_FOUND");
          }
          return {
            headers: new Headers({
              "set-cookie": "better-auth.state=state_1.sig; Path=/; HttpOnly",
            }),
            response: {
              url: "https://github.com/login/oauth/authorize?state=state_1",
              redirect: false,
            },
          };
        },
        revokeSession: record("revokeSession"),
        revokeOtherSessions: record("revokeOtherSessions"),
        updateMemberRole: record("updateMemberRole"),
        removeMember: record("removeMember"),
        deleteOrganization: record("deleteOrganization"),
        leaveOrganization: record("leaveOrganization"),
        createInvitation: async ({ body }: { body: { email: string } }) => {
          state.calls.push(`createInvitation ${JSON.stringify(body)}`);
          return {
            id: "inv_1",
            email: body.email,
            role: (body as { role?: string }).role,
            expiresAt: new Date(Date.now() + 86_400_000),
          };
        },
      },
    },
  };
});

const gate = await import("@repo/auth/confirm-gate");
const rules = await import("@repo/auth/confirm-sign-in-rules");
const confirmation = await import("@/lib/account/confirmation-server");
const account = await import("@/app/settings/account/_lib/actions");
const teams = await import("@/actions/organizations");
const join = await import("@/actions/workspace-join");

const REQUIRED = { ok: false, error: "CONFIRMATION_REQUIRED" };

function seed({ twoFactorOn = false } = {}) {
  fakeDb.seed("user", [
    {
      id: USER,
      email: EMAIL,
      name: "Ada",
      twoFactorEnabled: twoFactorOn,
      emailVerified: true,
    },
    {
      id: "user_2",
      email: "bob@qrdx.test",
      name: "Bob",
      twoFactorEnabled: false,
      emailVerified: true,
    },
  ]);
  fakeDb.seed("account", [
    { id: "acc_google", userId: USER, providerId: "google", accountId: "g-1" },
    { id: "acc_bob", userId: "user_2", providerId: "github", accountId: "h-2" },
  ]);
  fakeDb.seed("session", [
    {
      id: SESSION,
      token: "token_1",
      userId: USER,
      createdAt: new Date(Date.now() - 3 * 86_400_000),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000),
    },
    {
      id: "session_other",
      token: "token_other",
      userId: USER,
      createdAt: new Date(Date.now() - 86_400_000),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  ]);
  fakeDb.seed("organization", [
    { id: ORG, name: "Team T", slug: "team-t", createdAt: new Date() },
  ]);
  fakeDb.seed("member", [
    {
      id: "m_owner",
      organizationId: ORG,
      userId: USER,
      role: "owner",
      createdAt: new Date(),
    },
    {
      id: "m_bob",
      organizationId: ORG,
      userId: "user_2",
      role: "member",
      createdAt: new Date(),
    },
  ]);
}

/** This session confirms it's them (the dialog's last step). */
const confirm = (sessionId = SESSION) =>
  confirmation.recordConfirmation({ userId: USER, sessionId });

const mutations = () =>
  state.calls.filter((call) => !call.startsWith("linkSocial"));

beforeEach(() => {
  fakeDb.reset();
  seed();
  state.session = {
    userId: USER,
    id: SESSION,
    createdAt: new Date(Date.now() - 3 * 86_400_000),
  };
  state.scope = { userId: USER, organizationId: ORG, role: "owner" };
  state.codesAvailable = true;
  state.calls = [];
  state.cookies = new Map();
  state.errors = [];
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Better Auth over HTTP (packages/auth/confirm-gate.ts) ──────────────────

describe("the HTTP gate's rules", () => {
  it("gates linking, unlinking and the workspace changes, whatever they ask", () => {
    for (const path of [
      "/link-social",
      "/unlink-account",
      "/organization/delete",
      "/organization/update-member-role",
      "/organization/remove-member",
    ]) {
      expect(gate.needsConfirmation(path, {}), path).toBe(true);
    }
  });

  it("gates an invitation only when it gives admin or owner", () => {
    const invite = (role: unknown) =>
      gate.needsConfirmation("/organization/invite-member", { role });
    expect(invite("admin")).toBe(true);
    expect(invite("owner")).toBe(true);
    expect(invite("member,admin")).toBe(true);
    expect(invite(["viewer", " admin "])).toBe(true);
    expect(invite("member")).toBe(false);
    expect(invite(["viewer", "billing"])).toBe(false);
    expect(invite(undefined)).toBe(false);
    expect(
      gate.needsConfirmation("/organization/invite-member", undefined),
    ).toBe(false);
  });

  it("never gates signing out, and leaves everything else alone", () => {
    for (const path of [
      "/revoke-session",
      "/revoke-sessions",
      "/revoke-other-sessions",
      "/sign-out",
      "/organization/leave",
      "/organization/update",
      "/list-accounts",
      "/get-session",
    ]) {
      expect(gate.needsConfirmation(path, {}), path).toBe(false);
      expect(gate.CONFIRM_GATED_PATHS).not.toContain(path);
    }
  });

  it("is registered for exactly the gated paths", () => {
    const [hook] = gate.confirmGate().hooks.before;
    expect(hook.matcher({ path: "/link-social" } as never)).toBe(true);
    expect(hook.matcher({ path: "/organization/invite-member" } as never)).toBe(
      true,
    );
    expect(hook.matcher({ path: "/revoke-other-sessions" } as never)).toBe(
      false,
    );
  });
});

describe("the HTTP gate", () => {
  const signedIn = async () => ({
    session: { id: SESSION },
    user: { id: USER },
  });
  const request = (path: string, body: unknown = {}, http = true) => ({
    http,
    path,
    body,
  });
  const refusal = async (run: Promise<void>) => {
    try {
      await run;
      return null;
    } catch (error) {
      return (error as { body?: { code?: string } }).body?.code ?? "thrown";
    }
  };

  it("refuses an HTTP request without a recent confirmation", async () => {
    expect(
      await refusal(gate.checkConfirmGate(request("/link-social"), signedIn)),
    ).toBe("CONFIRMATION_REQUIRED");
    expect(
      await refusal(
        gate.checkConfirmGate(
          request("/organization/invite-member", { role: "admin" }),
          signedIn,
        ),
      ),
    ).toBe("CONFIRMATION_REQUIRED");
  });

  it("lets it through once the app has recorded a confirmation for this session", async () => {
    await confirm();
    expect(
      await refusal(gate.checkConfirmGate(request("/link-social"), signedIn)),
    ).toBeNull();
    expect(
      await refusal(
        gate.checkConfirmGate(request("/organization/delete"), signedIn),
      ),
    ).toBeNull();
  });

  it("doesn't count another session's confirmation, or an expired one", async () => {
    await confirm("session_other");
    expect(
      await refusal(gate.checkConfirmGate(request("/link-social"), signedIn)),
    ).toBe("CONFIRMATION_REQUIRED");

    vi.useFakeTimers({ toFake: ["Date"] });
    await confirm();
    vi.setSystemTime(Date.now() + 11 * 60_000);
    expect(
      await refusal(gate.checkConfirmGate(request("/link-social"), signedIn)),
    ).toBe("CONFIRMATION_REQUIRED");
  });

  it("doesn't count a row holding someone else's id", async () => {
    fakeDb.seed("verification", [
      {
        id: "v_other",
        identifier: rules.confirmedSessionIdentifier(SESSION),
        value: "user_2",
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    expect(await gate.sessionConfirmed(SESSION, USER)).toBe(false);
    expect(await gate.sessionConfirmed(SESSION, "user_2")).toBe(true);
  });

  it("leaves server-side calls, signed-out requests and other paths to the endpoint", async () => {
    const lookups: string[] = [];
    const counted = async () => {
      lookups.push("session");
      return null;
    };
    // auth.api calls come from the app's own actions, which asked already.
    expect(
      await refusal(
        gate.checkConfirmGate(request("/link-social", {}, false), signedIn),
      ),
    ).toBeNull();
    expect(
      await refusal(
        gate.checkConfirmGate(request("/revoke-other-sessions"), signedIn),
      ),
    ).toBeNull();
    expect(
      await refusal(
        gate.checkConfirmGate(
          request("/organization/invite-member", { role: "member" }),
          signedIn,
        ),
      ),
    ).toBeNull();
    // Signed out: the endpoint's own 401.
    expect(
      await refusal(gate.checkConfirmGate(request("/link-social"), counted)),
    ).toBeNull();
    expect(lookups).toEqual(["session"]);
  });

  it("reads the row the app's recordConfirmation writes", async () => {
    await confirm();
    const [row] = fakeDb.rows("verification");
    expect(row?.identifier).toBe(rules.confirmedSessionIdentifier(SESSION));
    expect(row?.identifier).toBe(`${rules.CONFIRMED_SESSION_PREFIX}${SESSION}`);
    expect(await gate.sessionConfirmed(SESSION, USER)).toBe(true);
  });
});

// ─── Sign-in methods ─────────────────────────────────────────────────────────

describe("unlinking Google or GitHub", () => {
  it("asks first and keeps the link until this session has confirmed", async () => {
    expect(
      await account.unlinkSignInMethod({ accountId: "acc_google" }),
    ).toEqual(REQUIRED);
    expect(fakeDb.find("account", { id: "acc_google" })).toBeTruthy();

    await confirm();
    expect(
      await account.unlinkSignInMethod({ accountId: "acc_google" }),
    ).toEqual({ ok: true });
    expect(fakeDb.find("account", { id: "acc_google" })).toBeUndefined();
  });

  it("works for a session signed in days ago once it has confirmed", async () => {
    // Better Auth's own unlink wants a sign-in within a day; the
    // confirmation replaces that, so nobody is asked twice.
    await confirm();
    expect(
      await account.unlinkSignInMethod({ accountId: "acc_google" }),
    ).toEqual({ ok: true });
  });

  it("never removes someone else's link", async () => {
    await confirm();
    expect(await account.unlinkSignInMethod({ accountId: "acc_bob" })).toEqual({
      ok: false,
      error: "That sign-in method isn't linked to your account.",
    });
    expect(fakeDb.find("account", { id: "acc_bob" })).toBeTruthy();
  });

  it("asks a signed-out browser to sign in", async () => {
    state.session = null;
    expect(
      await account.unlinkSignInMethod({ accountId: "acc_google" }),
    ).toEqual({ ok: false, error: "Sign in to manage sign-in methods." });
  });
});

describe("linking Google or GitHub", () => {
  it("asks first and doesn't start the link flow until confirmed", async () => {
    expect(await account.linkSignInMethod({ provider: "github" })).toEqual(
      REQUIRED,
    );
    expect(state.calls).toEqual([]);
    expect(state.cookies.size).toBe(0);
  });

  it("then answers the provider's address and hands over the flow's state cookie", async () => {
    await confirm();
    expect(await account.linkSignInMethod({ provider: "github" })).toEqual({
      ok: true,
      url: "https://github.com/login/oauth/authorize?state=state_1",
    });
    expect(state.calls).toEqual([
      `linkSocial ${JSON.stringify({
        provider: "github",
        callbackURL: "/settings/account?linked=github#sign-in",
        errorCallbackURL: "/settings/account",
        disableRedirect: true,
      })}`,
    ]);
    expect(state.cookies.get("better-auth.state")?.value).toBe("state_1.sig");
  });

  it("says plainly when a provider isn't set up, without logging it", async () => {
    await confirm();
    expect(await account.linkSignInMethod({ provider: "google" })).toEqual({
      ok: false,
      error: "Google can't be linked right now.",
    });
    expect(state.errors).toEqual([]);
    expect(await account.linkSignInMethod({ provider: "sso" })).toEqual({
      ok: false,
      error: "That sign-in method can't be linked.",
    });
  });

  it("follows the app's rule where codes can't be sent: a sign-in in the last 10 minutes counts", async () => {
    state.codesAvailable = false;
    expect(await account.linkSignInMethod({ provider: "github" })).toEqual(
      REQUIRED,
    );
    state.session = { userId: USER, id: SESSION, createdAt: new Date() };
    expect(
      await account.linkSignInMethod({ provider: "github" }),
    ).toMatchObject({ ok: true });
  });
});

describe("signing out sessions", () => {
  it("never asks, so an attacker can be signed out at once", async () => {
    expect(await account.revokeOtherSessions()).toEqual({ ok: true });
    expect(await account.revokeSession({ sessionId: "session_other" })).toEqual(
      { ok: true },
    );
    expect(state.calls).toEqual([
      "revokeOtherSessions",
      `revokeSession ${JSON.stringify({ token: "token_other" })}`,
    ]);
  });
});

// ─── Workspace people ───────────────────────────────────────────────────────

describe("workspace changes", () => {
  const gated: [string, () => Promise<unknown>][] = [
    [
      "deleting it",
      () => teams.deleteTeam({ organizationId: ORG, confirmSlug: "team-t" }),
    ],
    [
      "changing a role",
      () => teams.updateMemberRole({ memberId: "m_bob", role: "admin" }),
    ],
    [
      "making someone an owner",
      () => teams.updateMemberRole({ memberId: "m_bob", role: "owner" }),
    ],
    ["removing someone", () => teams.removeMember({ memberId: "m_bob" })],
    [
      "inviting an admin",
      () => teams.inviteMember({ email: "cy@qrdx.test", role: "admin" }),
    ],
  ];

  it.each(gated)("%s asks first and changes nothing", async (_name, run) => {
    expect(await run()).toEqual(REQUIRED);
    expect(mutations()).toEqual([]);
  });

  it.each(gated)(
    "%s goes ahead once this session confirmed",
    async (_name, run) => {
      await confirm();
      expect(await run()).toMatchObject({ ok: true });
      expect(mutations()).toHaveLength(1);
    },
  );

  it("inviting a member, a viewer or billing doesn't ask", async () => {
    for (const role of ["member", "viewer", "billing"] as const) {
      expect(
        await teams.inviteMember({ email: `${role}@qrdx.test`, role }),
      ).toMatchObject({ ok: true });
    }
    expect(mutations()).toHaveLength(3);
  });

  it("asks only after its own checks, so a refused change isn't asked about", async () => {
    // A wrong workspace URL, a member who can't manage people, someone who
    // isn't in the workspace: each says why, with no dialog first.
    expect(
      await teams.deleteTeam({ organizationId: ORG, confirmSlug: "nope" }),
    ).toEqual({
      ok: false,
      error: "Type the workspace URL exactly to confirm.",
    });
    expect(
      await teams.updateMemberRole({ memberId: "m_ghost", role: "viewer" }),
    ).toEqual({
      ok: false,
      error: "That person isn't a member of this workspace.",
    });
    state.scope = { userId: USER, organizationId: ORG, role: "member" };
    for (const run of [
      () => teams.removeMember({ memberId: "m_bob" }),
      () => teams.inviteMember({ email: "cy@qrdx.test", role: "admin" }),
    ]) {
      const result = (await run()) as { ok: boolean; error?: string };
      expect(result.ok).toBe(false);
      expect(result.error).not.toBe("CONFIRMATION_REQUIRED");
    }
    expect(mutations()).toEqual([]);
  });

  it("refuses a session that isn't the workspace scope's person", async () => {
    await confirm();
    state.scope = { userId: "user_2", organizationId: ORG, role: "owner" };
    expect(await teams.removeMember({ memberId: "m_bob" })).toEqual({
      ok: false,
      error: "Sign in to manage workspaces.",
    });
    expect(mutations()).toEqual([]);
  });

  it("leaving a workspace never asks", async () => {
    fakeDb.seed("organization", [
      { id: "org_u", name: "Team U", slug: "team-u", createdAt: new Date() },
    ]);
    expect(await teams.leaveTeam({ organizationId: "org_u" })).toEqual({
      ok: true,
      data: null,
    });
  });
});

describe("join links", () => {
  const link = () => fakeDb.rows("workspaceJoinLink")[0];

  it("making one that adds admins asks first", async () => {
    expect(await join.issueWorkspaceJoinLink({ role: "admin" })).toMatchObject({
      ok: false,
      error: "CONFIRMATION_REQUIRED",
    });
    expect(link()).toBeUndefined();
    await confirm();
    expect(await join.issueWorkspaceJoinLink({ role: "admin" })).toMatchObject({
      ok: true,
      data: { role: "admin" },
    });
  });

  it("giving a link the admin role asks; other roles and turning it off don't", async () => {
    expect(await join.issueWorkspaceJoinLink({ role: "member" })).toMatchObject(
      { ok: true },
    );
    expect(
      await join.setWorkspaceJoinLinkRole({ role: "viewer" }),
    ).toMatchObject({ ok: true });
    expect(
      await join.setWorkspaceJoinLinkRole({ role: "admin" }),
    ).toMatchObject({ ok: false, error: "CONFIRMATION_REQUIRED" });
    expect(link()?.role).toBe("viewer");
    // Resetting keeps the role, and a reset admin link is a new admin link.
    await confirm();
    expect(
      await join.setWorkspaceJoinLinkRole({ role: "admin" }),
    ).toMatchObject({ ok: true });
    // The 10 minutes are over.
    fakeDb.rows("verification").splice(0);
    expect(await join.issueWorkspaceJoinLink({})).toMatchObject({
      ok: false,
      error: "CONFIRMATION_REQUIRED",
    });
    expect(await join.disableWorkspaceJoinLink()).toEqual({
      ok: true,
      data: null,
    });
    expect(link()).toBeUndefined();
  });
});
