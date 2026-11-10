// A Slack channel always lands in a workspace, the one the person is in when
// they add it, whichever button they use: "Add another channel" (GET
// /api/integrations/slack/install with no ?workspace=) or Enable (no
// remembered workspace at the callback). Before, "Add another channel"
// filed it under no workspace at all: it got no alerts and Settings →
// Notifications didn't list it.
//
// The route, the callback (lib/data-connections/server.ts prepareDataConnect),
// the workspace lookup (lib/scope.ts) and the notification targets
// (lib/events/notification-settings.ts) are the real ones, on in-memory
// tables (tests/support/fake-db.ts). Slack itself isn't called.
import { ownWorkspaceId } from "@repo/auth/own-workspace-id";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  /** The browser's cookies */
  cookies: new Map<string, string>(),
  /** The session's active workspace (null: none set yet) */
  activeOrganizationId: null as string | null,
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "localhost:3000" }),
  cookies: async () => ({
    get: (name: string) =>
      state.cookies.has(name)
        ? { value: state.cookies.get(name) as string }
        : undefined,
    set: (name: string, value: string) => {
      state.cookies.set(name, value);
    },
    delete: (name: string) => {
      state.cookies.delete(name);
    },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
  slidingWindow: () => ({}),
}));
vi.mock("@repo/auth/server", () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: { id: "user_ada", name: "Ada", email: "ada@qrdx.test" },
        session: {
          id: "session_1",
          activeOrganizationId: state.activeOrganizationId,
        },
      }),
    },
  },
}));
vi.mock("@/lib/shared", () => ({ logError: () => {} }));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getOwnerPlanForOrganization: async () => "business",
  getPlan: async () => "business",
  getPlanForScope: async () => "business",
}));
vi.mock("@/lib/data-connections/http", () => ({
  requireUser: async () => ({ userId: "user_ada" }),
}));
vi.mock("@/lib/integration-oauth", () => ({
  isOAuthConfigured: () => true,
  createIntegrationAuthUrl: async () => "https://slack.com/oauth/v2/authorize",
}));
// Ada confirmed it's her just now; that check is
// tests/lib/confirm-data-out-connect.test.ts.
vi.mock("@/lib/data-connections/connect-confirmation", () => ({
  connectConfirmationNeeded: async () => null,
}));

const slackInstall = await import("@/app/api/integrations/slack/install/route");
const { prepareDataConnect } = await import("@/lib/data-connections/server");
const { listNotificationWorkspaces } = await import(
  "@/lib/events/notification-settings"
);

const ADA = "user_ada";
const OWN = ownWorkspaceId(ADA);
const TEAM = "org_team";
const STRANGERS = "org_strangers"; // Ada isn't a member
const COOKIE = "slack_install_workspace";

beforeEach(() => {
  const now = new Date();
  fakeDb.reset();
  fakeDb.seed("user", [
    { id: ADA, name: "Ada", email: "ada@qrdx.test", twoFactorEnabled: false },
  ]);
  fakeDb.seed("organization", [
    { id: OWN, name: "Ada's workspace", slug: "ada", createdAt: now },
    { id: TEAM, name: "Team", slug: "team", createdAt: now },
    { id: STRANGERS, name: "Strangers", slug: "strangers", createdAt: now },
  ]);
  fakeDb.seed("member", [
    { id: "m_own", organizationId: OWN, userId: ADA, role: "owner" },
    { id: "m_team", organizationId: TEAM, userId: ADA, role: "admin" },
  ]);
  state.cookies.clear();
  state.activeOrganizationId = null;
});

const install = (query = "") =>
  slackInstall.GET(
    new Request(`http://localhost:3000/api/integrations/slack/install${query}`),
  );

let channelCount = 0;
/** Slack's callback: the channel's webhook becomes a notification target. */
async function slackCallback() {
  channelCount += 1;
  const url = `https://hooks.slack.com/services/T000/B000/CHANNEL${channelCount}`;
  const outcome = await prepareDataConnect(
    "slack",
    {
      ok: true,
      team: { id: "T000", name: "Acme" },
      incoming_webhook: { url, channel: `#alerts-${channelCount}` },
    },
    ADA,
  );
  expect(outcome).toMatchObject({
    handled: true,
    redirect: "/settings/integrations/slack?success=slack_connected",
  });
  return fakeDb.find("notificationSetting", { target: url });
}

describe('"Add another channel" (no ?workspace=)', () => {
  it("adds the channel to the team workspace Ada is in, and Notifications lists it there", async () => {
    state.activeOrganizationId = TEAM;
    expect((await install()).headers.get("location")).toContain("slack.com");
    expect(state.cookies.get(COOKIE)).toBe(TEAM);

    const target = await slackCallback();
    expect(target?.organizationId).toBe(TEAM);
    expect(state.cookies.has(COOKIE)).toBe(false);

    const workspaces = await listNotificationWorkspaces(ADA);
    const team = workspaces.find((w) => w.organizationId === TEAM);
    expect(team?.chats.map((chat) => chat.id)).toEqual([target?.id]);
  });

  it("adds it to her own workspace when she's in that one", async () => {
    expect((await install()).headers.get("location")).toContain("slack.com");
    expect(state.cookies.get(COOKIE)).toBe(OWN);
    expect((await slackCallback())?.organizationId).toBe(OWN);
  });

  it("lands in the same workspace as Enable, which remembers none", async () => {
    state.activeOrganizationId = TEAM;
    expect((await slackCallback())?.organizationId).toBe(TEAM);
  });
});

describe("never a channel outside every workspace", () => {
  it("?workspace=personal means her own workspace", async () => {
    state.activeOrganizationId = TEAM;
    expect(
      (await install("?workspace=personal")).headers.get("location"),
    ).toContain("slack.com");
    expect(state.cookies.get(COOKIE)).toBe(OWN);
    expect((await slackCallback())?.organizationId).toBe(OWN);
  });

  it('an install started before this fix ("personal" remembered) lands in the workspace she\'s in', async () => {
    state.activeOrganizationId = TEAM;
    state.cookies.set(COOKIE, "personal");
    expect((await slackCallback())?.organizationId).toBe(TEAM);
  });

  it("no target is ever stored without a workspace", async () => {
    state.activeOrganizationId = TEAM;
    await install();
    await slackCallback();
    await install("?workspace=personal");
    await slackCallback();
    state.cookies.set(COOKIE, "personal");
    await slackCallback();
    const rows = fakeDb.rows("notificationSetting");
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => typeof row.organizationId === "string")).toBe(
      true,
    );
  });
});

it("a workspace she isn't a member of is refused before Slack", async () => {
  const reply = await install(`?workspace=${STRANGERS}`);
  expect(reply.headers.get("location")).toBe(
    "http://localhost:3000/settings/integrations/slack?error=unexpected_error",
  );
  expect(state.cookies.has(COOKIE)).toBe(false);
});
