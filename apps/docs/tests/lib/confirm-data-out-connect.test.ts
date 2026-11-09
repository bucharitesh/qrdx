// Connecting a tool that QRdx sends the account's data to asks "Confirm it's
// you" (lib/data-connections/connect-confirmation.ts), as pasting a Slack or
// Discord webhook does: Slack (each channel gets form answers and scan
// milestones) and the data-out syncs, Google Sheets, HubSpot and Mailchimp.
// Every way their sign-in starts checks it: "Add to Slack"
// (app/api/integrations/slack/install), Enable and Reconnect
// (connectIntegrationAction) and GET /api/integrations/<provider>?action=connect.
// Other integrations don't ask. The confirmation is the real one
// (lib/account/confirmation-server.tsx) on in-memory tables
// (tests/support/fake-db.ts); starting a provider's sign-in is recorded
// instead of made.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  /** Providers whose sign-in was started (an authorization URL made) */
  started: [] as string[],
  /** Workspaces "Add to Slack" remembered for the callback */
  remembered: [] as (string | null)[],
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
    get: () => undefined,
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
  auth: {
    api: {
      getSession: async () => ({
        user: { id: "user_1", email: "ada@qrdx.test" },
        session: { id: "session_1", createdAt: new Date() },
      }),
    },
  },
}));
// Codes can be emailed here, so a sign-in just now doesn't count on its own.
vi.mock("@/lib/account/reauth", () => ({ signInCodesAvailable: () => true }));
vi.mock("@/lib/request-guards", () => ({ enforceRateLimits: async () => {} }));
vi.mock("@/lib/shared", () => ({ logError: () => {} }));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => "business",
}));
vi.mock("@/lib/data-connections/http", () => ({
  requireUser: async () => ({ userId: "user_1" }),
}));
vi.mock("@/lib/connected-accounts/server", () => ({
  connectLimiter: {},
  revokeStoredToken: async () => false,
}));
vi.mock("@/lib/data-connections/server", () => ({
  rememberSlackWorkspace: async (organizationId: string | null) => {
    state.remembered.push(organizationId);
  },
  cleanupDataConnection: async () => false,
}));
vi.mock("@/lib/integration-oauth", () => ({
  isOAuthConfigured: () => true,
  createIntegrationAuthUrl: async (provider: string) => {
    state.started.push(provider);
    return `https://${provider}.example/oauth/authorize`;
  },
}));

const { recordConfirmation } = await import(
  "@/lib/account/confirmation-server"
);
const { connectSendsDataOut } = await import(
  "@/lib/data-connections/connect-confirmation"
);
const slackInstall = await import("@/app/api/integrations/slack/install/route");
const providerRoute = await import("@/app/api/integrations/[provider]/route");
const { connectIntegrationAction } = await import(
  "@/app/settings/integrations/actions"
);

const REQUIRED = { ok: false, error: "CONFIRMATION_REQUIRED" };
const DATA_OUT = ["slack", "google-sheets", "hubspot", "mailchimp"];

const confirm = () =>
  recordConfirmation({ userId: "user_1", sessionId: "session_1" });

/** The confirmation ran out (it lasts 10 minutes). */
const expireConfirmations = () => {
  for (const row of fakeDb.rows("verification")) {
    row.expiresAt = new Date(Date.now() - 1000);
  }
};

beforeEach(() => {
  fakeDb.reset();
  fakeDb.seed("user", [
    { id: "user_1", email: "ada@qrdx.test", twoFactorEnabled: false },
  ]);
  state.started = [];
  state.remembered = [];
});

it("covers Slack and the data-out syncs, and nothing else", () => {
  for (const provider of DATA_OUT) {
    expect(connectSendsDataOut(provider), provider).toBe(true);
  }
  for (const provider of ["dub", "bitly", "google-drive", "calendly"]) {
    expect(connectSendsDataOut(provider), provider).toBe(false);
  }
});

describe('"Add to Slack"', () => {
  const install = () =>
    slackInstall.GET(
      new Request("http://localhost:3000/api/integrations/slack/install"),
    );

  it("without a recent confirmation, goes back to the page with the reason, before Slack", async () => {
    const reply = await install();
    expect(reply.headers.get("location")).toBe(
      "http://localhost:3000/settings/integrations/slack?error=confirmation_required",
    );
    expect(state.started).toEqual([]);
    expect(state.remembered).toEqual([]);
  });

  it("goes to Slack after one", async () => {
    await confirm();
    const reply = await install();
    expect(reply.headers.get("location")).toBe(
      "https://slack.example/oauth/authorize",
    );
    expect(state.started).toEqual(["slack"]);
    expect(state.remembered).toEqual([null]);
  });

  it("asks again once it has run out", async () => {
    await confirm();
    expireConfirmations();
    expect((await install()).headers.get("location")).toContain(
      "error=confirmation_required",
    );
    expect(state.started).toEqual([]);
  });
});

describe("Enable and Reconnect", () => {
  it.each(DATA_OUT)("%s asks first, then starts", async (provider) => {
    expect(await connectIntegrationAction(provider)).toEqual(REQUIRED);
    expect(state.started).toEqual([]);
    await confirm();
    expect(await connectIntegrationAction(provider)).toEqual({
      url: `https://${provider}.example/oauth/authorize`,
    });
    expect(state.started).toEqual([provider]);
  });

  it("asks again once it has run out", async () => {
    await confirm();
    expireConfirmations();
    expect(await connectIntegrationAction("hubspot")).toEqual(REQUIRED);
    expect(state.started).toEqual([]);
  });

  it("doesn't ask for an integration that sends nothing out", async () => {
    expect(await connectIntegrationAction("dub")).toEqual({
      url: "https://dub.example/oauth/authorize",
    });
    expect(state.started).toEqual(["dub"]);
  });
});

describe("GET /api/integrations/<provider>?action=connect", () => {
  const connect = (provider: string) =>
    providerRoute.GET(
      new Request(
        `http://localhost:3000/api/integrations/${provider}?action=connect`,
      ),
      { params: Promise.resolve({ provider }) },
    );

  it.each(DATA_OUT)(
    "%s is refused without one, then starts",
    async (provider) => {
      const refused = await connect(provider);
      expect(refused.status).toBe(403);
      expect(await refused.json()).toEqual({
        error: "Confirm it's you first, then try again.",
        code: "CONFIRMATION_REQUIRED",
      });
      expect(state.started).toEqual([]);
      await confirm();
      const started = await connect(provider);
      expect(started.status).toBe(200);
      expect(await started.json()).toEqual({
        url: `https://${provider}.example/oauth/authorize`,
      });
      expect(state.started).toEqual([provider]);
    },
  );

  it("doesn't ask for an integration that sends nothing out", async () => {
    const reply = await connect("dub");
    expect(reply.status).toBe(200);
    expect(state.started).toEqual(["dub"]);
  });
});
