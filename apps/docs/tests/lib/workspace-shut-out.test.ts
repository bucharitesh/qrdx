// A workspace that requires two-step verification shuts out members without
// it (lib/workspaces.ts). Besides its pages, actions and Better Auth's
// endpoints, nothing else may act on it, or send its data anywhere, on
// membership alone:
//
// - notification targets: email alerts, Slack and Discord webhooks, adding
//   events to one (lib/events/notification-settings.ts);
// - "Add to Slack" (app/api/integrations/slack/install) and its callback
//   (lib/data-connections/server.ts prepareDataConnect);
// - delivering alerts and the digest to them (lib/events/subscribers.ts);
// - data-out syncs they set up (lib/data-connections/data.ts);
// - unpublishing the workspace's community items (lib/community/publish-access.ts).
//
// In-memory tables (tests/support/fake-db.ts); the workspace requirement and
// its plan are the real ones (packages/auth/workspace-two-factor.ts).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => {
  // packages/auth/plan.ts reads the Business products when it loads.
  process.env.NEXT_PUBLIC_QRDX_BUSINESS_MONTHLY_PRODUCT_ID =
    "prod_business_monthly";
  return {
    cookie: null as string | null,
    remembered: [] as (string | null)[],
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
  headers: async () => new Headers({ host: "localhost:3000" }),
  cookies: async () => ({
    get: () => (state.cookie ? { value: state.cookie } : undefined),
    set: () => {},
    delete: () => {},
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
  slidingWindow: () => ({}),
}));
vi.mock("@repo/auth/server", () => ({
  auth: { api: { getSession: async () => null } },
}));
vi.mock("@/lib/shared", () => ({ logError: () => {} }));
// The team is on Business (its owner's plan); the requirement's own plan
// check reads the subscription below.
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getOwnerPlanForOrganization: async () => "business",
  getPlan: async () => "business",
  getPlanForScope: async () => "business",
}));
// "Add to Slack": the signed-in person is Cy; Slack itself isn't called.
vi.mock("@/lib/data-connections/http", () => ({
  requireUser: async () => ({ userId: "user_cy" }),
}));
vi.mock("@/lib/integration-oauth", () => ({
  isOAuthConfigured: () => true,
  createIntegrationAuthUrl: async () => "https://slack.com/oauth/v2/authorize",
}));
vi.mock("@/lib/data-connections/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data-connections/server")>()),
  rememberSlackWorkspace: async (organizationId: string | null) => {
    state.remembered.push(organizationId);
  },
}));

const settings = await import("@/lib/events/notification-settings");
const { loadSubscribers } = await import("@/lib/events/subscribers");
const { syncPauseReason } = await import("@/lib/data-connections/data");
const { workspaceCanUnpublish } = await import(
  "@/lib/community/publish-access"
);
const slackInstall = await import("@/app/api/integrations/slack/install/route");
const { prepareDataConnect } = await import("@/lib/data-connections/server");

const ADA = "user_ada"; // owner, two-step on, pays for Business
const CY = "user_cy"; // admin, two-step off
const TEAM = "org_team"; // requires two-step verification
const OTHER = "org_other"; // Cy's other team, no requirement
const SLACK = "https://hooks.slack.com/services/T000/B000/XXXXXXXXXX";
const SLACK_2 = "https://hooks.slack.com/services/T000/B000/YYYYYYYYYY";

function seed() {
  const now = new Date();
  fakeDb.reset();
  fakeDb.seed("user", [
    { id: ADA, name: "Ada", email: "ada@qrdx.test", twoFactorEnabled: true },
    { id: CY, name: "Cy", email: "cy@qrdx.test", twoFactorEnabled: false },
  ]);
  fakeDb.seed("organization", [
    {
      id: TEAM,
      name: "Team",
      slug: "team",
      createdAt: now,
      metadata: JSON.stringify({ requireTwoFactor: true }),
    },
    { id: OTHER, name: "Other", slug: "other", createdAt: now },
  ]);
  fakeDb.seed("member", [
    { id: "m1", organizationId: TEAM, userId: ADA, role: "owner" },
    { id: "m2", organizationId: TEAM, userId: CY, role: "admin" },
    { id: "m3", organizationId: OTHER, userId: CY, role: "owner" },
  ]);
  fakeDb.seed("subscription", [
    {
      id: "sub_ada",
      userId: ADA,
      productId: "prod_business_monthly",
      status: "active",
    },
  ]);
  // Targets set up before the workspace required two-step verification.
  fakeDb.seed("notificationSetting", [
    {
      id: "n_ada",
      userId: ADA,
      organizationId: TEAM,
      channel: "email",
      target: "ada@qrdx.test",
      events: ["form.submitted"],
      createdAt: now,
    },
    {
      id: "n_cy_email",
      userId: CY,
      organizationId: TEAM,
      channel: "email",
      target: "cy@qrdx.test",
      events: ["form.submitted"],
      createdAt: now,
    },
    {
      id: "n_cy_slack",
      userId: CY,
      organizationId: TEAM,
      channel: "slack",
      target: SLACK,
      events: ["scan.milestone"],
      createdAt: now,
    },
  ]);
}

const turnOnTwoFactor = (userId: string) => {
  const row = fakeDb.find("user", { id: userId });
  if (row) row.twoFactorEnabled = true;
};

const dropRequirement = () => {
  const row = fakeDb.find("organization", { id: TEAM });
  if (row) row.metadata = JSON.stringify({});
};

const refused = { code: "TWO_FACTOR_REQUIRED", status: 403 };

beforeEach(() => {
  seed();
  state.cookie = null;
  state.remembered = [];
});

describe("notification targets", () => {
  it("a shut-out member can't turn on email alerts, add a webhook or add events to one", async () => {
    await expect(
      settings.setEmailEvents(CY, TEAM, ["form.submitted"]),
    ).rejects.toMatchObject(refused);
    await expect(
      settings.addChatTarget(CY, TEAM, {
        channel: "slack",
        url: SLACK_2,
        events: ["form.submitted"],
      }),
    ).rejects.toMatchObject(refused);
    await expect(
      settings.updateChatTarget(CY, "n_cy_slack", [
        "scan.milestone",
        "form.submitted",
      ]),
    ).rejects.toMatchObject(refused);
    expect(fakeDb.find("notificationSetting", { target: SLACK_2 })).toBe(
      undefined,
    );
    expect(
      fakeDb.find("notificationSetting", { id: "n_cy_slack" })?.events,
    ).toEqual(["scan.milestone"]);
  });

  it("can always turn email off and remove a webhook", async () => {
    await settings.setEmailEvents(CY, TEAM, []);
    await settings.removeChatTarget(CY, "n_cy_slack");
    expect(
      fakeDb.rows("notificationSetting").filter((row) => row.userId === CY),
    ).toEqual([]);
  });

  it("works with two-step verification on, in a team without the requirement, and once it's off", async () => {
    await settings.addChatTarget(CY, OTHER, {
      channel: "slack",
      url: SLACK_2,
      events: ["form.submitted"],
    });
    turnOnTwoFactor(CY);
    await settings.setEmailEvents(CY, TEAM, ["form.submitted"]);
    await settings.updateChatTarget(CY, "n_cy_slack", ["form.submitted"]);
    seed();
    dropRequirement();
    await settings.addChatTarget(CY, TEAM, {
      channel: "discord",
      url: "https://discord.com/api/webhooks/123456789/abcdefghij",
      events: ["form.submitted"],
    });
  });
});

describe("delivering alerts", () => {
  const targetIds = async () =>
    (await loadSubscribers({ userId: ADA, organizationId: TEAM }))?.targets
      .map((target) => target.id)
      .sort();

  it("skips a shut-out member's email and chat targets until they turn it on", async () => {
    expect(await targetIds()).toEqual(["n_ada"]);
    turnOnTwoFactor(CY);
    expect(await targetIds()).toEqual(["n_ada", "n_cy_email", "n_cy_slack"]);
  });

  it("skips nobody once the workspace doesn't require it", async () => {
    dropRequirement();
    expect(await targetIds()).toEqual(["n_ada", "n_cy_email", "n_cy_slack"]);
  });

  it("skips nobody when the workspace isn't on Business", async () => {
    const sub = fakeDb.find("subscription", { id: "sub_ada" });
    if (sub) sub.productId = "prod_pro_monthly";
    expect(await targetIds()).toEqual(["n_ada", "n_cy_email", "n_cy_slack"]);
  });
});

describe("Add to Slack", () => {
  const install = (workspace: string) =>
    slackInstall.GET(
      new Request(
        `http://localhost:3000/api/integrations/slack/install?workspace=${workspace}`,
      ),
    );

  it("sends a shut-out member back with the reason, before Slack", async () => {
    const reply = await install(TEAM);
    expect(reply.headers.get("location")).toContain(
      "error=two_factor_required",
    );
    expect(state.remembered).toEqual([]);
  });

  it("goes to Slack with two-step verification on, or for a team without the requirement", async () => {
    expect((await install(OTHER)).headers.get("location")).toContain(
      "slack.com",
    );
    turnOnTwoFactor(CY);
    expect((await install(TEAM)).headers.get("location")).toContain(
      "slack.com",
    );
    expect(state.remembered).toEqual([OTHER, TEAM]);
  });

  it("refuses the channel at the callback too, with the same reason", async () => {
    state.cookie = TEAM;
    const outcome = await prepareDataConnect(
      "slack",
      {
        ok: true,
        team: { id: "T000", name: "Acme" },
        incoming_webhook: { url: SLACK_2, channel: "#alerts" },
      },
      CY,
    );
    expect(outcome).toMatchObject({
      handled: true,
      error: "two_factor_required",
    });
    expect(fakeDb.find("notificationSetting", { target: SLACK_2 })).toBe(
      undefined,
    );
  });
});

describe("data-out syncs", () => {
  it("pause for a shut-out member, and for someone who left", async () => {
    expect(await syncPauseReason({ userId: CY, organizationId: TEAM })).toMatch(
      /requires two-step verification/,
    );
    expect(
      await syncPauseReason({ userId: "user_gone", organizationId: TEAM }),
    ).toMatch(/no longer a member/);
  });

  it("run otherwise", async () => {
    expect(
      await syncPauseReason({ userId: ADA, organizationId: TEAM }),
    ).toBeNull();
    expect(
      await syncPauseReason({ userId: CY, organizationId: OTHER }),
    ).toBeNull();
    expect(
      await syncPauseReason({ userId: CY, organizationId: null }),
    ).toBeNull();
    turnOnTwoFactor(CY);
    expect(
      await syncPauseReason({ userId: CY, organizationId: TEAM }),
    ).toBeNull();
  });
});

describe("unpublishing the workspace's community items", () => {
  beforeEach(() => {
    fakeDb.seed("landingPage", [
      { id: "page_1", userId: ADA, organizationId: TEAM },
    ]);
    fakeDb.seed("communityItem", [
      {
        id: "item_1",
        userId: ADA,
        sourceKind: "landing_page",
        sourceId: "page_1",
      },
    ]);
  });

  it("is refused to a shut-out admin, until they turn it on", async () => {
    expect(await workspaceCanUnpublish(CY, "item_1")).toBe(false);
    turnOnTwoFactor(CY);
    expect(await workspaceCanUnpublish(CY, "item_1")).toBe(true);
  });
});
