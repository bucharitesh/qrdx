// The QRdx bot for Slack, through its real routes and server actions: signed
// requests in, Block Kit messages out, and linking an account with Sign in
// with Slack. The database is the in-memory fake (tests/support/fake-db.ts),
// Slack's API is a stubbed fetch that records what the bot sends and answers
// the OpenID sign-in as the test says, and every secret, id and token is a
// fake.
import { encryptApiKey } from "@repo/integrations";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => {
  // The bot is on: the Slack app's keys and its signing secret (fakes).
  process.env.SLACK_CLIENT_ID = "test-slack-client-id";
  process.env.SLACK_CLIENT_SECRET = "test-slack-client-secret";
  process.env.SLACK_SIGNING_SECRET = "test-slack-signing-secret";
  // packages/auth/plan.ts reads the Business products when it loads (the
  // two-step requirement applies on Business).
  process.env.NEXT_PUBLIC_QRDX_BUSINESS_MONTHLY_PRODUCT_ID =
    "prod_business_monthly";
  return {
    plan: "business" as "free" | "pro" | "business",
    headers: new Headers(),
    /** Rate limiters (by prefix) that are over their limit */
    limitedPrefixes: [] as string[],
    /** What Slack's OpenID endpoints answer */
    idToken: {} as Record<string, unknown>,
    tokenResponse: null as Record<string, unknown> | null,
    userInfo: {} as Record<string, unknown>,
    tasks: [] as Promise<unknown>[],
    session: null as null | { user: { id: string; email: string } },
    sessionId: "s_1",
    cookies: new Map<string, string>(),
    limited: false,
    fetches: [] as { url: string; body: any; auth: string | null }[],
    oauth: {} as Record<string, unknown>,
    postResult: { ok: true } as Record<string, unknown>,
    confirmed: true,
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
vi.mock("@repo/auth/server", () => ({
  auth: { api: { getSession: async () => state.session } },
}));
vi.mock("next/headers", () => ({
  headers: async () => state.headers,
  cookies: async () => ({
    get: (name: string) =>
      state.cookies.has(name) ? { value: state.cookies.get(name) } : undefined,
    set: (name: string, value: string) => state.cookies.set(name, value),
    delete: (name: string) => state.cookies.delete(name),
  }),
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    state.tasks.push(Promise.resolve().then(task));
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: (config?: { prefix?: string }) => ({
    limit: async () => {
      const over =
        state.limited || state.limitedPrefixes.includes(config?.prefix ?? "");
      return {
        success: !over,
        limit: 30,
        remaining: over ? 0 : 29,
        reset: Date.now() + 60_000,
        pending: Promise.resolve(),
      };
    },
  }),
}));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => state.plan,
  getOwnerPlanForOrganization: async () => state.plan,
}));
vi.mock("@/app/dashboard/domains/_lib/domains", () => ({
  getDomainRefs: async () => new Map(),
  assertBindableDomains: async () => {},
}));
vi.mock("@/app/dashboard/themes/_lib/queries", () => ({
  getDefaultThemeStyle: async () => null,
}));
vi.mock("@/lib/code-versions", () => ({ snapshotCodeVersion: async () => {} }));
vi.mock("@/lib/safety/destinations", () => ({
  screenNewCodes: async (_scope: unknown, rows: unknown[]) => rows,
  screenUrlChange: async () => false,
}));
vi.mock("@/lib/events/emit", () => ({
  emitCodesCreated: () => {},
  emitCodeUpdated: () => {},
}));
vi.mock("@/lib/limit-notices", () => ({ noteLimitUsage: () => {} }));
vi.mock("@/lib/account/confirmation-server", () => ({
  currentSession: async () =>
    state.session
      ? {
          userId: state.session.user.id,
          email: state.session.user.email,
          sessionId: state.sessionId,
          sessionCreatedAt: new Date(),
          requestHeaders: new Headers(),
        }
      : null,
  requireRecentConfirmation: async () =>
    state.confirmed ? null : { ok: false, error: "CONFIRMATION_REQUIRED" },
}));

const { signSlackRequest } = await import("@/lib/slack-bot/signature");
const { decodeStyleParam } = await import("@/lib/playground-style");
const { BUSY_TEXT } = await import("@/lib/slack-bot/config");
const { signLinkToken, verifyLinkToken } = await import(
  "@/lib/slack-bot/link-token"
);
const { openSignInFlow, sealLinkProof } = await import(
  "@/lib/slack-bot/link-proof"
);
const { database } = await import("@repo/database");
const { saveInstallation } = await import("@/lib/slack-bot/store");
const admin = await import("@/lib/slack-bot/admin");
const { revokeSlackLinkAction } = await import(
  "@/app/settings/developers/_lib/slack-link-actions"
);
const linkStart = await import("@/app/api/integrations/slack/link/start/route");
const linkCallback = await import(
  "@/app/api/integrations/slack/link/callback/route"
);
const commands = await import("@/app/api/integrations/slack/commands/route");
const events = await import("@/app/api/integrations/slack/events/route");
const interactions = await import(
  "@/app/api/integrations/slack/interactions/route"
);
const install = await import("@/app/api/integrations/slack/bot/install/route");
const callback = await import(
  "@/app/api/integrations/slack/bot/callback/route"
);
const { linkSlackAccount } = await import(
  "@/app/integrations/slack/link/actions"
);

/** The real fetch, for the renderer's own files. */
const realFetch = globalThis.fetch;

const SIGNING_SECRET = "test-slack-signing-secret";
const AUTH_SECRET = "test-secret-at-least-32-characters-long";
const TEAM = "T0ACME";
const BOT = "U0BOT";
const ANA = "U0ANA";
const ORG = "org_acme";
const RESPONSE_URL = "https://hooks.slack.com/commands/T0ACME/1/fake";
const BOT_TOKEN = "xoxb-fake-bot-token";
const CLIENT_ID = "test-slack-client-id";
const ACCESS_TOKEN = "xoxp-fake-openid-access-token";
const EVE = "U0EVE";
const SESSION = {
  user: { id: "u_ana", email: "ana@acme.test" },
  sessionId: "s_1",
};

/** An unsigned JWT with these claims (the signature isn't read). */
const jwt = (claims: Record<string, unknown>) =>
  [
    Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(JSON.stringify(claims)).toString("base64url"),
    "fake-signature",
  ].join(".");

async function flush() {
  while (state.tasks.length > 0) await Promise.all(state.tasks.splice(0));
}

function signed(
  path: string,
  body: string,
  {
    contentType = "application/x-www-form-urlencoded",
    headers = {},
    timestamp = String(Math.floor(Date.now() / 1000)),
    signature,
  }: {
    contentType?: string;
    headers?: Record<string, string>;
    timestamp?: string;
    signature?: string;
  } = {},
) {
  return new Request(`http://localhost:3000/api/integrations/slack/${path}`, {
    method: "POST",
    headers: {
      "content-type": contentType,
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature":
        signature ?? signSlackRequest(SIGNING_SECRET, body, timestamp),
      ...headers,
    },
    body,
  });
}

const slash = (text: string, extra: Record<string, string> = {}) =>
  signed(
    "commands",
    new URLSearchParams({
      command: "/qr",
      text,
      team_id: TEAM,
      team_domain: "acme",
      user_id: ANA,
      user_name: "ana",
      channel_id: "C0GENERAL",
      response_url: RESPONSE_URL,
      ...extra,
    }).toString(),
  );

const eventRequest = (payload: unknown, headers: Record<string, string> = {}) =>
  signed("events", JSON.stringify(payload), {
    contentType: "application/json",
    headers,
  });

const callbackEvent = (event: Record<string, unknown>) => ({
  type: "event_callback",
  team_id: TEAM,
  authorizations: [{ team_id: TEAM, enterprise_id: null }],
  event,
});

const interaction = (payload: unknown) =>
  signed(
    "interactions",
    new URLSearchParams({ payload: JSON.stringify(payload) }).toString(),
  );

type Json = Record<string, any>;
const sentTo = (method: string) =>
  state.fetches.filter((call) => call.url.endsWith(`/${method}`));
const responses = () =>
  state.fetches.filter((call) =>
    call.url.startsWith("https://hooks.slack.com/"),
  );
const allText = (message: Json) => JSON.stringify(message);

function seedInstall(teamId = TEAM) {
  fakeDb.seed("slackBotInstallation", [
    {
      id: `inst_${teamId}`,
      teamId,
      enterpriseId: null,
      teamName: "Acme",
      botUserId: BOT,
      botToken: encryptApiKey(BOT_TOKEN),
      scopes: "commands,app_mentions:read,chat:write,im:history",
      installedByUserId: "u_ana",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
}

function seedLink(organizationId = ORG, teamId = TEAM, slackUserId = ANA) {
  fakeDb.seed("slackUserLink", [
    {
      id: `link_${teamId}_${slackUserId}`,
      teamId,
      slackUserId,
      userId: "u_ana",
      organizationId,
      createdAt: new Date(),
    },
  ]);
}

beforeEach(() => {
  fakeDb.resetAll();
  state.plan = "business";
  state.tasks = [];
  state.session = { user: SESSION.user };
  state.sessionId = SESSION.sessionId;
  state.headers = new Headers();
  state.limitedPrefixes = [];
  state.idToken = {};
  state.tokenResponse = null;
  state.userInfo = {};
  state.cookies = new Map();
  state.limited = false;
  state.fetches = [];
  state.postResult = { ok: true };
  state.confirmed = true;
  vi.stubGlobal(
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      // The renderer loads its own files (the scan check renders codes).
      if (!/^https?:/.test(url)) return realFetch(input, init);
      const raw = typeof init?.body === "string" ? init.body : "";
      let body: unknown = raw;
      try {
        body = JSON.parse(raw);
      } catch {
        body = Object.fromEntries(new URLSearchParams(raw));
      }
      const headers = new Headers(init?.headers);
      state.fetches.push({ url, body, auth: headers.get("authorization") });
      if (url.endsWith("/oauth.v2.access")) return Response.json(state.oauth);
      if (url.endsWith("/openid.connect.token")) {
        return Response.json(
          state.tokenResponse ?? {
            ok: true,
            access_token: ACCESS_TOKEN,
            token_type: "Bearer",
            id_token: jwt(state.idToken),
          },
        );
      }
      if (url.endsWith("/openid.connect.userInfo")) {
        return Response.json(state.userInfo);
      }
      if (url.endsWith("/chat.postMessage"))
        return Response.json(state.postResult);
      if (url.startsWith("https://slack.com/api/")) {
        return Response.json({ ok: true });
      }
      return new Response("ok");
    },
  );
  fakeDb.seed("organization", [
    {
      id: ORG,
      name: "Acme",
      slug: "acme",
      logo: null,
      metadata: null,
      createdAt: new Date(0),
    },
    {
      id: "org_other",
      name: "Other",
      slug: "other",
      logo: null,
      metadata: null,
      createdAt: new Date(0),
    },
    {
      id: "org_eve",
      name: "Eve's",
      slug: "eve",
      logo: null,
      metadata: null,
      createdAt: new Date(0),
    },
  ]);
  fakeDb.seed("user", [
    {
      id: "u_ana",
      name: "Ana",
      email: "ana@acme.test",
      banned: false,
      banExpires: null,
    },
    {
      id: "u_eve",
      name: "Eve",
      email: "eve@evil.test",
      banned: false,
      banExpires: null,
    },
  ]);
  fakeDb.seed("member", [
    {
      id: "m_ana",
      organizationId: ORG,
      userId: "u_ana",
      role: "owner",
      createdAt: new Date(0),
    },
    {
      id: "m_eve",
      organizationId: "org_eve",
      userId: "u_eve",
      role: "owner",
      createdAt: new Date(0),
    },
  ]);
  fakeDb.defaults("qrCode", () => ({
    slugScope: "",
    contentType: "url",
    style: null,
    title: null,
    domainId: null,
    isActive: true,
    archivedAt: null,
    scanCount: 0,
    lastScannedAt: null,
    kind: "redirect",
    pageId: null,
    folderId: null,
    notes: null,
    isFavorite: false,
    pausedAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  fakeDb.unique("qrCode", "slugScope", "slug");
  fakeDb.unique("slackUserLink", "teamId", "slackUserId");
});

afterEach(async () => {
  await flush();
  vi.unstubAllGlobals();
});

describe("signatures", () => {
  it("refuse unsigned, wrongly signed and stale requests before reading them", async () => {
    const body = new URLSearchParams({ text: "hi" }).toString();
    const noSig = new Request(
      "http://localhost:3000/api/integrations/slack/commands",
      {
        method: "POST",
        body,
      },
    );
    expect((await commands.POST(noSig)).status).toBe(401);
    expect(
      (
        await commands.POST(
          signed("commands", body, { signature: `v0=${"0".repeat(64)}` }),
        )
      ).status,
    ).toBe(401);
    const old = String(Math.floor(Date.now() / 1000) - 600);
    expect(
      (await commands.POST(signed("commands", body, { timestamp: old })))
        .status,
    ).toBe(401);
    expect(
      (await events.POST(eventRequest({ type: "url_verification" }, {})))
        .status,
    ).not.toBe(401);
    // A body changed after signing.
    const request = slash("https://qrdx.dev");
    const tampered = new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: `${await request.text()}&x=1`,
    });
    expect((await commands.POST(tampered)).status).toBe(401);
    expect(state.fetches).toEqual([]);
  });
});

describe("/qr", () => {
  it("answers with help, only for the person, when empty or asked", async () => {
    for (const text of ["", "help", "HELP"]) {
      const reply = (await (await commands.POST(slash(text))).json()) as Json;
      expect(reply.response_type).toBe("ephemeral");
      expect(allText(reply)).toContain("/qr track");
    }
  });

  it("posts a QR code image in the channel for a link or text", async () => {
    const reply = (await (
      await commands.POST(slash("<https://qrdx.dev/pricing|qrdx.dev/pricing>"))
    ).json()) as Json;
    expect(reply.response_type).toBe("in_channel");
    const image = new URL(reply.blocks[0].image_url);
    expect(image.searchParams.get("data")).toBe("https://qrdx.dev/pricing");
    expect(reply.blocks[0].alt_text).toBe(
      "QR code for https://qrdx.dev/pricing",
    );

    const text = (await (
      await commands.POST(slash("Fish &amp; chips"))
    ).json()) as Json;
    expect(new URL(text.blocks[0].image_url).searchParams.get("data")).toBe(
      "Fish & chips",
    );
    // Images need no install and no database.
    expect(fakeDb.rows("slackBotInstallation")).toEqual([]);
  });

  it("explains content that is too long, privately", async () => {
    const reply = (await (
      await commands.POST(slash("x".repeat(3000)))
    ).json()) as Json;
    expect(reply.response_type).toBe("ephemeral");
    expect(reply.text).toMatch(/too long/);
  });

  it("slows down a person over the limit", async () => {
    state.limited = true;
    const reply = (await (
      await commands.POST(slash("https://qrdx.dev"))
    ).json()) as Json;
    expect(reply.response_type).toBe("ephemeral");
    expect(reply.text).toMatch(/a little fast/);
  });

  it("link: a 10-minute button bound to this Slack person, once the bot is installed", async () => {
    const before = (await (await commands.POST(slash("link"))).json()) as Json;
    expect(before.response_type).toBe("ephemeral");
    expect(before.text).toMatch(/hasn't been added/);

    seedInstall();
    const reply = (await (await commands.POST(slash("link"))).json()) as Json;
    expect(reply.response_type).toBe("ephemeral");
    const button = reply.blocks[1].elements[0];
    const url = new URL(button.url);
    expect(url.pathname).toBe("/integrations/slack/link");
    expect(
      verifyLinkToken(url.searchParams.get("t"), AUTH_SECRET),
    ).toMatchObject({
      teamId: TEAM,
      slackUserId: ANA,
      teamName: "Acme",
      userName: "ana",
    });
  });

  it("unlink removes only the caller's link", async () => {
    seedInstall();
    seedLink();
    seedLink(ORG, TEAM, "U0BEN");
    const reply = (await (await commands.POST(slash("unlink"))).json()) as Json;
    expect(reply.text).toMatch(/^Unlinked/);
    expect(fakeDb.rows("slackUserLink").map((row) => row.slackUserId)).toEqual([
      "U0BEN",
    ]);
    const again = (await (await commands.POST(slash("unlink"))).json()) as Json;
    expect(again.text).toMatch(/no QRdx account linked/);
  });

  describe("track", () => {
    it("asks to link first, privately, and makes nothing", async () => {
      seedInstall();
      const reply = (await (
        await commands.POST(slash("track <https://shop.example/menu>"))
      ).json()) as Json;
      expect(reply.response_type).toBe("ephemeral");
      expect(reply.text).toMatch(/Link your QRdx account first/);
      expect(reply.blocks[1].elements[0].text.text).toBe("Link QRdx account");
      await flush();
      expect(fakeDb.rows("qrCode")).toEqual([]);
    });

    it("needs one http(s) address", async () => {
      seedInstall();
      seedLink();
      for (const text of ["track", "track ftp://x.example", "track a b"]) {
        const reply = (await (await commands.POST(slash(text))).json()) as Json;
        expect(reply.response_type, text).toBe("ephemeral");
        expect(reply.text, text).toMatch(/one web address/);
      }
    });

    it("makes a dynamic code as the linked QRdx user, posts it with the workspace, and the dashboard link only to them", async () => {
      seedInstall();
      seedLink();
      const ack = (await (
        await commands.POST(
          slash("track <https://shop.example/menu|shop.example/menu>"),
        )
      ).json()) as Json;
      expect(ack.response_type).toBe("ephemeral");
      expect(ack.text).toMatch(/Making your tracked code/);
      await flush();

      const [code] = fakeDb.rows("qrCode");
      expect(code).toMatchObject({
        userId: "u_ana",
        organizationId: ORG,
        destinationUrl: "https://shop.example/menu",
        title: "shop.example from Slack",
      });
      const [posted, followUp] = responses();
      expect(posted?.url).toBe(RESPONSE_URL);
      expect(posted?.body.response_type).toBe("in_channel");
      const data = new URL(posted?.body.blocks[0].image_url).searchParams.get(
        "data",
      );
      expect(data).toMatch(new RegExp(`/q/${code?.slug}$`));
      expect(posted?.body.blocks[1].elements[0].text).toContain(
        "in the QRdx workspace Acme",
      );
      // The channel never sees the workspace's address or the code's id.
      expect(allText(posted?.body)).not.toContain("/dashboard/");
      expect(
        posted?.body.blocks[2].elements.map((b: Json) => b.text.text),
      ).toEqual(["Download PNG", "Download SVG", "Open in editor"]);

      expect(followUp?.url).toBe(RESPONSE_URL);
      expect(followUp?.body.response_type).toBe("ephemeral");
      const open = followUp?.body.blocks[1].elements[0];
      expect(open.text.text).toBe("Open in QRdx");
      expect(open.url).toMatch(
        new RegExp(`/dashboard/acme/codes/${code?.id}$`),
      );
      expect(responses()).toHaveLength(2);
    });

    it("re-checks membership: a stale link makes nothing", async () => {
      seedInstall();
      seedLink("org_other");
      await commands.POST(slash("track https://shop.example/menu"));
      await flush();
      expect(fakeDb.rows("qrCode")).toEqual([]);
      const [posted] = responses();
      expect(posted?.body.response_type).toBe("ephemeral");
      expect(posted?.body.text).toMatch(/no longer a member/);
    });

    it("re-checks the role: a viewer can't make codes", async () => {
      seedInstall();
      seedLink();
      fakeDb.rows("member")[0]!.role = "viewer";
      await commands.POST(slash("track https://shop.example/menu"));
      await flush();
      expect(fakeDb.rows("qrCode")).toEqual([]);
      expect(responses()[0]?.body.text).toMatch(/can't create codes/);
    });

    it("turns a plan limit into a private note with the plans", async () => {
      seedInstall();
      seedLink();
      state.plan = "free";
      const { getPlanLimits } = await import("@/lib/plans");
      const limit = getPlanLimits("free").dynamicCodes;
      fakeDb.seed(
        "qrCode",
        Array.from({ length: limit }, (_, index) => ({
          id: `c_${index}`,
          userId: "u_ana",
          organizationId: ORG,
          slug: `slug${index}`,
          destinationUrl: "https://shop.example",
        })),
      );
      await commands.POST(slash("track https://shop.example/menu"));
      await flush();
      expect(fakeDb.rows("qrCode")).toHaveLength(limit);
      const [posted] = responses();
      expect(posted?.body.response_type).toBe("ephemeral");
      expect(posted?.body.text).toMatch(/active dynamic QR codes/);
      const button = posted?.body.blocks[1].elements[0];
      expect(button.text.text).toBe("See plans");
      expect(new URL(button.url).pathname).toBe("/pricing");
    });
  });
});

describe("events", () => {
  it("answers Slack's URL check", async () => {
    const response = await events.POST(
      eventRequest({ type: "url_verification", challenge: "abc123" }),
    );
    expect(await response.json()).toEqual({ challenge: "abc123" });
  });

  it("acknowledges and drops retries", async () => {
    seedInstall();
    const response = await events.POST(
      eventRequest(
        callbackEvent({
          type: "app_mention",
          user: ANA,
          text: `<@${BOT}> https://qrdx.dev`,
          channel: "C0GENERAL",
          ts: "1700000000.000100",
        }),
        { "x-slack-retry-num": "1", "x-slack-retry-reason": "http_timeout" },
      ),
    );
    expect(response.status).toBe(200);
    await flush();
    expect(state.fetches).toEqual([]);
  });

  it("replies to a mention in its thread, with the bot's token", async () => {
    seedInstall();
    const response = await events.POST(
      eventRequest(
        callbackEvent({
          type: "app_mention",
          user: ANA,
          text: `<@${BOT}> <https://qrdx.dev/pricing>`,
          channel: "C0GENERAL",
          ts: "1700000000.000100",
        }),
      ),
    );
    expect(response.status).toBe(200);
    await flush();
    const [post] = sentTo("chat.postMessage");
    expect(post?.auth).toBe(`Bearer ${BOT_TOKEN}`);
    expect(post?.body).toMatchObject({
      channel: "C0GENERAL",
      thread_ts: "1700000000.000100",
    });
    expect(
      new URL(post?.body.blocks[0].image_url).searchParams.get("data"),
    ).toBe("https://qrdx.dev/pricing");
  });

  it("sends a mention's link button only to the person who asked", async () => {
    seedInstall();
    await events.POST(
      eventRequest(
        callbackEvent({
          type: "app_mention",
          user: ANA,
          text: `<@${BOT}> link`,
          channel: "C0GENERAL",
          ts: "1700000000.000100",
        }),
      ),
    );
    await flush();
    expect(sentTo("chat.postMessage")).toEqual([]);
    const [ephemeral] = sentTo("chat.postEphemeral");
    expect(ephemeral?.body).toMatchObject({ channel: "C0GENERAL", user: ANA });
    expect(allText(ephemeral?.body)).toContain("/integrations/slack/link?t=");
  });

  it("replies to a direct message in the DM", async () => {
    seedInstall();
    await events.POST(
      eventRequest(
        callbackEvent({
          type: "message",
          channel_type: "im",
          user: ANA,
          text: "Table 4",
          channel: "D0ANA",
          ts: "1700000000.000200",
        }),
      ),
    );
    await flush();
    const [post] = sentTo("chat.postMessage");
    expect(post?.body.channel).toBe("D0ANA");
    expect(post?.body.thread_ts).toBeUndefined();
    expect(
      new URL(post?.body.blocks[0].image_url).searchParams.get("data"),
    ).toBe("Table 4");
  });

  it("ignores bot messages, its own, edits and other subtypes", async () => {
    seedInstall();
    const base = {
      type: "message",
      channel_type: "im",
      user: ANA,
      text: "hi",
      channel: "D0ANA",
      ts: "1",
    };
    for (const event of [
      { ...base, bot_id: "B0OTHER" },
      { ...base, user: BOT },
      { ...base, subtype: "message_changed" },
      { ...base, subtype: "bot_message" },
      { ...base, edited: { user: ANA, ts: "2" } },
      { ...base, channel_type: "channel" },
    ]) {
      await events.POST(eventRequest(callbackEvent(event)));
    }
    await flush();
    expect(state.fetches).toEqual([]);
  });

  it("forgets a workspace's install and links when the app is removed", async () => {
    seedInstall();
    seedInstall("T0OTHER");
    seedLink();
    seedLink(ORG, "T0OTHER", ANA);
    await events.POST(eventRequest(callbackEvent({ type: "app_uninstalled" })));
    await flush();
    expect(
      fakeDb.rows("slackBotInstallation").map((row) => row.teamId),
    ).toEqual(["T0OTHER"]);
    expect(fakeDb.rows("slackUserLink").map((row) => row.teamId)).toEqual([
      "T0OTHER",
    ]);

    await events.POST(
      eventRequest({
        ...callbackEvent({ type: "tokens_revoked", tokens: { bot: [BOT] } }),
        team_id: "T0OTHER",
        authorizations: [{ team_id: "T0OTHER" }],
      }),
    );
    await flush();
    expect(fakeDb.rows("slackBotInstallation")).toEqual([]);
    expect(fakeDb.rows("slackUserLink")).toEqual([]);
  });
});

describe("the message shortcut", () => {
  const shortcut = (text: string) => ({
    type: "message_action",
    callback_id: "qrdx_make_qr",
    team: { id: TEAM },
    user: { id: ANA },
    channel: { id: "C0GENERAL" },
    message: { text, ts: "1700000000.000300" },
    response_url: "https://hooks.slack.com/actions/T0ACME/2/fake",
  });

  it("replies in the thread with a code of the first web address", async () => {
    seedInstall();
    const response = await interactions.POST(
      interaction(shortcut("Menu is at <https://shop.example/menu> and more")),
    );
    expect(response.status).toBe(200);
    await flush();
    const [post] = sentTo("chat.postMessage");
    expect(post?.body.thread_ts).toBe("1700000000.000300");
    expect(
      new URL(post?.body.blocks[0].image_url).searchParams.get("data"),
    ).toBe("https://shop.example/menu");
  });

  it("shows the code only to the person when the bot isn't in the channel", async () => {
    seedInstall();
    state.postResult = { ok: false, error: "not_in_channel" };
    await interactions.POST(interaction(shortcut("Wi-Fi in the lobby")));
    await flush();
    const [reply] = responses();
    expect(reply?.body.response_type).toBe("ephemeral");
    expect(
      new URL(reply?.body.blocks[0].image_url).searchParams.get("data"),
    ).toBe("Wi-Fi in the lobby");
  });

  it("acknowledges button clicks without doing anything", async () => {
    const response = await interactions.POST(
      interaction({
        type: "block_actions",
        actions: [{ action_id: "qrdx_png" }],
      }),
    );
    expect(response.status).toBe(200);
    await flush();
    expect(state.fetches).toEqual([]);
  });
});

describe("adding the bot", () => {
  it("sends a signed-in person to Slack with the bot scopes only", async () => {
    const response = await install.GET(
      new Request("http://localhost:3000/api/integrations/slack/bot/install"),
    );
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(
      "https://slack.com/oauth/v2/authorize",
    );
    expect(location.searchParams.get("scope")).toBe(
      "commands,app_mentions:read,chat:write,im:history",
    );
    expect(location.searchParams.get("redirect_uri")).toMatch(
      /\/api\/integrations\/slack\/bot\/callback$/,
    );
    expect(location.searchParams.get("state")).toBe(
      state.cookies.get("slack_bot_oauth_state"),
    );
  });

  it("stores the bot token encrypted on the way back, and updates it on a reinstall", async () => {
    state.cookies.set("slack_bot_oauth_state", "state-1");
    state.oauth = {
      ok: true,
      token_type: "bot",
      access_token: BOT_TOKEN,
      bot_user_id: BOT,
      scope: "commands,app_mentions:read,chat:write,im:history",
      team: { id: TEAM, name: "Acme" },
      enterprise: null,
    };
    const back = (query: string) =>
      callback.GET(
        new Request(
          `http://localhost:3000/api/integrations/slack/bot/callback?${query}`,
        ),
      );
    const response = await back("code=c1&state=state-1");
    expect(response.headers.get("location")).toMatch(
      /\/settings\/integrations\/slack\?success=slack_bot_installed$/,
    );
    const [row] = fakeDb.rows("slackBotInstallation");
    expect(row).toMatchObject({
      teamId: TEAM,
      teamName: "Acme",
      botUserId: BOT,
      installedByUserId: "u_ana",
    });
    expect(row?.botToken).not.toContain(BOT_TOKEN);

    state.cookies.set("slack_bot_oauth_state", "state-2");
    state.oauth = { ...state.oauth, team: { id: TEAM, name: "Acme Inc" } };
    await back("code=c2&state=state-2");
    expect(fakeDb.rows("slackBotInstallation")).toHaveLength(1);
    expect(fakeDb.rows("slackBotInstallation")[0]?.teamName).toBe("Acme Inc");
  });

  it("refuses a callback without this browser's state", async () => {
    state.cookies.set("slack_bot_oauth_state", "state-1");
    const response = await callback.GET(
      new Request(
        "http://localhost:3000/api/integrations/slack/bot/callback?code=c1&state=forged",
      ),
    );
    expect(response.headers.get("location")).toMatch(/error=missing_verifier/);
    expect(state.fetches).toEqual([]);
    expect(fakeDb.rows("slackBotInstallation")).toEqual([]);
  });
});

describe("Sign in with Slack on the confirm page", () => {
  const AUTH_TOKEN_FOR = (teamId: string, slackUserId: string) =>
    signLinkToken(
      { teamId, slackUserId, teamName: "Acme", userName: "ana" },
      AUTH_SECRET,
    );
  const start = (token: string) =>
    linkStart.GET(
      new Request(
        `http://localhost:3000/api/integrations/slack/link/start?t=${encodeURIComponent(token)}`,
      ),
    );
  const callbackWith = (query: string) =>
    linkCallback.GET(
      new Request(
        `http://localhost:3000/api/integrations/slack/link/callback?${query}`,
      ),
    );
  const flow = () =>
    openSignInFlow(state.cookies.get("slack_link_sign_in"), AUTH_SECRET);
  /** What Slack's id_token says for a person in a workspace, for this flow. */
  const idTokenFor = (
    teamId: string,
    slackUserId: string,
    extra: Record<string, unknown> = {},
  ) => ({
    iss: "https://slack.com",
    aud: CLIENT_ID,
    sub: slackUserId,
    exp: Math.floor(Date.now() / 1000) + 600,
    iat: Math.floor(Date.now() / 1000),
    nonce: flow()?.nonce,
    "https://slack.com/team_id": teamId,
    "https://slack.com/user_id": slackUserId,
    ...extra,
  });
  /**
   * The whole round trip: "Sign in with Slack" for `token`, then Slack
   * signing the person in as `as` and sending the browser back.
   */
  async function signInWithSlack(
    token: string,
    as: { teamId: string; slackUserId: string },
    idTokenExtra: Record<string, unknown> = {},
  ) {
    const started = await start(token);
    expect(started.status).toBe(307);
    state.idToken = idTokenFor(as.teamId, as.slackUserId, idTokenExtra);
    state.userInfo = {
      ok: true,
      sub: as.slackUserId,
      "https://slack.com/team_id": as.teamId,
      "https://slack.com/user_id": as.slackUserId,
    };
    const sent = new URL(started.headers.get("location") ?? "");
    return callbackWith(
      `code=fake-code&state=${sent.searchParams.get("state")}`,
    );
  }
  const backTo = (response: Response) =>
    new URL(response.headers.get("location") ?? "");
  const proofCookie = () => state.cookies.get("slack_link_proof");

  it("sends a signed-in person to Slack's OpenID sign-in, with a state and a nonce bound to this session and token", async () => {
    const token = AUTH_TOKEN_FOR(TEAM, ANA);
    const response = await start(token);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(
      "https://slack.com/openid/connect/authorize",
    );
    expect(location.searchParams.get("scope")).toBe("openid");
    expect(location.searchParams.get("response_type")).toBe("code");
    expect(location.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(location.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/integrations/slack/link/callback",
    );
    expect(location.searchParams.get("team")).toBe(TEAM);
    // The token itself never goes to Slack.
    expect(location.toString()).not.toContain(token);
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");

    const first = flow();
    expect(first).toMatchObject({
      state: location.searchParams.get("state"),
      nonce: location.searchParams.get("nonce"),
      userId: "u_ana",
      sessionId: "s_1",
      token,
    });
    expect(first?.state).toHaveLength(43);
    expect(first?.nonce).toHaveLength(43);
    expect(first?.nonce).not.toBe(first?.state);

    // A new state and nonce every time.
    await start(token);
    expect(flow()?.state).not.toBe(first?.state);
    expect(flow()?.nonce).not.toBe(first?.nonce);

    // The cookie is signed: a changed one doesn't open.
    const sealed = state.cookies.get("slack_link_sign_in") ?? "";
    expect(openSignInFlow(`${sealed.slice(0, -2)}xx`, AUTH_SECRET)).toBeNull();
  });

  it("asks a signed-out person to sign in to QRdx first, and an expired token goes back to the page", async () => {
    const token = AUTH_TOKEN_FOR(TEAM, ANA);
    state.session = null;
    const signedOut = await start(token);
    expect(backTo(signedOut).pathname).toBe("/sign-in");
    expect(state.cookies.has("slack_link_sign_in")).toBe(false);

    state.session = { user: SESSION.user };
    const expired = signLinkToken(
      { teamId: TEAM, slackUserId: ANA, teamName: "Acme", userName: "ana" },
      AUTH_SECRET,
      Date.now() - 11 * 60_000,
    );
    const response = await start(expired);
    expect(backTo(response).pathname).toBe("/integrations/slack/link");
    expect(state.cookies.has("slack_link_sign_in")).toBe(false);
  });

  it("proves the identity when Slack names the token's user in the token's workspace", async () => {
    seedInstall();
    const token = AUTH_TOKEN_FOR(TEAM, ANA);
    const response = await signInWithSlack(token, {
      teamId: TEAM,
      slackUserId: ANA,
    });
    const back = backTo(response);
    expect(back.pathname).toBe("/integrations/slack/link");
    expect(back.searchParams.get("t")).toBe(token);
    expect(back.searchParams.get("slack")).toBeNull();
    // The flow is used up; the proof is there.
    expect(state.cookies.has("slack_link_sign_in")).toBe(false);
    expect(proofCookie()).toBeTruthy();

    // The code was exchanged with the app's credentials and the same
    // redirect URI, and userInfo read with the access token.
    const [exchange] = sentTo("openid.connect.token");
    expect(exchange?.body).toMatchObject({
      code: "fake-code",
      client_id: CLIENT_ID,
      client_secret: "test-slack-client-secret",
      redirect_uri:
        "http://localhost:3000/api/integrations/slack/link/callback",
    });
    expect(sentTo("openid.connect.userInfo")[0]?.auth).toBe(
      `Bearer ${ACCESS_TOKEN}`,
    );
    // Slack's access token is kept nowhere.
    for (const value of state.cookies.values()) {
      expect(value).not.toContain(ACCESS_TOKEN);
    }

    expect(await linkSlackAccount({ token, organizationId: ORG })).toEqual({
      ok: true,
      workspaceName: "Acme",
    });
    expect(fakeDb.rows("slackUserLink")).toEqual([
      expect.objectContaining({
        teamId: TEAM,
        slackUserId: ANA,
        userId: "u_ana",
        organizationId: ORG,
      }),
    ]);
  });

  it("a leaked link: someone else, signed in to QRdx and to Slack as themselves, is refused and nothing is linked", async () => {
    seedInstall();
    // Ana's /qr link URL, opened by Eve.
    const victimToken = AUTH_TOKEN_FOR(TEAM, ANA);
    state.session = { user: { id: "u_eve", email: "eve@evil.test" } };
    state.sessionId = "s_eve";
    const response = await signInWithSlack(victimToken, {
      teamId: TEAM,
      slackUserId: EVE,
    });
    expect(backTo(response).searchParams.get("slack")).toBe("mismatch");
    expect(proofCookie()).toBeUndefined();

    expect(
      await linkSlackAccount({
        token: victimToken,
        organizationId: "org_eve",
      }),
    ).toMatchObject({ ok: false, signIn: true });
    expect(fakeDb.rows("slackUserLink")).toEqual([]);
  });

  it("reverse phishing: a link someone made for their own Slack account is refused when the victim signs in to Slack as themselves", async () => {
    seedInstall("T0EVIL");
    // Eve's own Slack workspace and user, in a link sent to Ana.
    const attackerToken = AUTH_TOKEN_FOR("T0EVIL", EVE);
    const response = await signInWithSlack(attackerToken, {
      teamId: TEAM,
      slackUserId: ANA,
    });
    expect(backTo(response).searchParams.get("slack")).toBe("mismatch");
    expect(proofCookie()).toBeUndefined();

    expect(
      await linkSlackAccount({ token: attackerToken, organizationId: ORG }),
    ).toMatchObject({ ok: false, signIn: true });
    expect(fakeDb.rows("slackUserLink")).toEqual([]);
  });

  it("refuses the right user in another Slack workspace, and userInfo that disagrees with the id_token", async () => {
    const token = AUTH_TOKEN_FOR(TEAM, ANA);
    const otherTeam = await signInWithSlack(token, {
      teamId: "T0OTHER",
      slackUserId: ANA,
    });
    expect(backTo(otherTeam).searchParams.get("slack")).toBe("mismatch");

    await start(token);
    state.idToken = idTokenFor(TEAM, ANA);
    state.userInfo = {
      ok: true,
      "https://slack.com/team_id": TEAM,
      "https://slack.com/user_id": EVE,
    };
    const sent = flow();
    const disagree = await callbackWith(`code=fake-code&state=${sent?.state}`);
    expect(backTo(disagree).searchParams.get("slack")).toBe("mismatch");
    expect(proofCookie()).toBeUndefined();
  });

  it("refuses a bad or missing state, a flow from another session and a wrong nonce", async () => {
    const token = AUTH_TOKEN_FOR(TEAM, ANA);

    await start(token);
    state.idToken = idTokenFor(TEAM, ANA);
    const forged = await callbackWith("code=fake-code&state=forged");
    expect(backTo(forged).searchParams.get("slack")).toBe("state");
    expect(backTo(forged).searchParams.get("t")).toBe(token);
    // Nothing went to Slack.
    expect(sentTo("openid.connect.token")).toEqual([]);

    await start(token);
    const missing = await callbackWith("code=fake-code");
    expect(backTo(missing).searchParams.get("slack")).toBe("state");

    // No flow at all (another browser): no token to go back to.
    const noFlow = await callbackWith("code=fake-code&state=anything");
    expect(backTo(noFlow).searchParams.get("slack")).toBe("state");
    expect(backTo(noFlow).searchParams.get("t")).toBeNull();

    // Started in one QRdx session, finished in another.
    await start(token);
    const started = flow();
    state.sessionId = "s_2";
    const otherSession = await callbackWith(
      `code=fake-code&state=${started?.state}`,
    );
    expect(backTo(otherSession).searchParams.get("slack")).toBe("state");
    state.sessionId = "s_1";
    expect(sentTo("openid.connect.token")).toEqual([]);

    // An id_token from another sign-in (its nonce isn't this flow's).
    const wrongNonce = await signInWithSlack(
      token,
      { teamId: TEAM, slackUserId: ANA },
      { nonce: "another-sign-ins-nonce" },
    );
    expect(backTo(wrongNonce).searchParams.get("slack")).toBe("state");
    expect(proofCookie()).toBeUndefined();
  });

  it("refuses an id_token from another issuer or app, an expired one and one without the Slack claims", async () => {
    const token = AUTH_TOKEN_FOR(TEAM, ANA);
    const me = { teamId: TEAM, slackUserId: ANA };
    for (const extra of [
      { iss: "https://evil.test" },
      { aud: "another-app" },
      { aud: [CLIENT_ID, "another-app"] },
      { exp: Math.floor(Date.now() / 1000) - 1 },
      { exp: undefined },
      { nonce: undefined },
      { "https://slack.com/team_id": undefined },
      { "https://slack.com/user_id": undefined },
    ]) {
      const response = await signInWithSlack(token, me, extra);
      const reason = backTo(response).searchParams.get("slack");
      expect(reason, JSON.stringify(extra)).toMatch(/^(failed|state)$/);
      expect(proofCookie(), JSON.stringify(extra)).toBeUndefined();
    }
  });

  it("explains a cancelled sign-in and Slack's errors, and logs only codes", async () => {
    const token = AUTH_TOKEN_FOR(TEAM, ANA);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await start(token);
      const cancelled = await callbackWith(
        `error=access_denied&state=${flow()?.state}`,
      );
      expect(backTo(cancelled).searchParams.get("slack")).toBe("cancelled");

      await start(token);
      state.tokenResponse = { ok: false, error: "invalid_code" };
      const failed = await callbackWith(
        `code=fake-code&state=${flow()?.state}`,
      );
      expect(backTo(failed).searchParams.get("slack")).toBe("failed");
      expect(proofCookie()).toBeUndefined();

      const lines = logged.mock.calls.map((call) => String(call[0]));
      expect(lines).toContainEqual(
        JSON.stringify({
          event: "slack-bot.link_sign_in_refused",
          reason: "failed",
          detail: "invalid_code",
        }),
      );
      for (const line of lines) {
        expect(line).not.toContain(token);
        expect(line).not.toContain("fake-code");
        expect(line).not.toContain(ACCESS_TOKEN);
      }
    } finally {
      logged.mockRestore();
    }
  });
});

describe("linking an account", () => {
  const token = (teamId = TEAM, slackUserId = ANA) =>
    signLinkToken(
      { teamId, slackUserId, teamName: "Acme", userName: "ana" },
      AUTH_SECRET,
    );
  /** This session signed in with Slack as the token's person (the callback's proof). */
  const prove = (
    linkToken: string,
    claims = { teamId: TEAM, slackUserId: ANA },
    now = Date.now(),
  ) =>
    state.cookies.set(
      "slack_link_proof",
      sealLinkProof(
        {
          userId: state.session?.user.id ?? "",
          sessionId: state.sessionId,
          token: linkToken,
          claims,
        },
        AUTH_SECRET,
        now,
      ),
    );

  it("needs a Slack sign-in for this token, in this session, from the last 10 minutes", async () => {
    seedInstall();
    const t = token();
    expect(await linkSlackAccount({ token: t, organizationId: ORG })).toEqual({
      ok: false,
      error: expect.stringMatching(/^Sign in with Slack first/),
      signIn: true,
    });

    // A sign-in for another link token (an older /qr link).
    const older = signLinkToken(
      { teamId: TEAM, slackUserId: ANA, teamName: "Acme", userName: "ana" },
      AUTH_SECRET,
      Date.now() - 60_000,
    );
    prove(older);
    expect(
      await linkSlackAccount({ token: t, organizationId: ORG }),
    ).toMatchObject({ ok: false, signIn: true });

    // A sign-in as another Slack person, with this token.
    prove(t, { teamId: TEAM, slackUserId: EVE });
    expect(
      await linkSlackAccount({ token: t, organizationId: ORG }),
    ).toMatchObject({ ok: false, signIn: true });

    // An expired sign-in.
    prove(t, undefined, Date.now() - 11 * 60_000);
    expect(
      await linkSlackAccount({ token: t, organizationId: ORG }),
    ).toMatchObject({ ok: false, signIn: true });

    // Another QRdx session's sign-in.
    prove(t);
    state.sessionId = "s_other";
    expect(
      await linkSlackAccount({ token: t, organizationId: ORG }),
    ).toMatchObject({ ok: false, signIn: true });
    state.sessionId = "s_1";
    expect(fakeDb.rows("slackUserLink")).toEqual([]);

    expect(await linkSlackAccount({ token: t, organizationId: ORG })).toEqual({
      ok: true,
      workspaceName: "Acme",
    });
    // Used up.
    expect(state.cookies.has("slack_link_proof")).toBe(false);
  });

  it("is refused when the bot isn't in that Slack workspace", async () => {
    const t = token();
    prove(t);
    expect(await linkSlackAccount({ token: t, organizationId: ORG })).toEqual({
      ok: false,
      error: expect.stringMatching(/isn't in that Slack workspace/),
    });
    expect(fakeDb.rows("slackUserLink")).toEqual([]);
  });

  it("needs membership, a role that creates codes and a recent confirmation", async () => {
    seedInstall();
    const t = token();
    prove(t);
    expect(
      await linkSlackAccount({ token: t, organizationId: "org_other" }),
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/not a member/),
    });

    fakeDb.rows("member")[0]!.role = "viewer";
    expect(
      await linkSlackAccount({ token: t, organizationId: ORG }),
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/can't create codes/),
    });
    fakeDb.rows("member")[0]!.role = "member";

    state.confirmed = false;
    expect(await linkSlackAccount({ token: t, organizationId: ORG })).toEqual({
      ok: false,
      error: "CONFIRMATION_REQUIRED",
    });
    expect(fakeDb.rows("slackUserLink")).toEqual([]);
  });

  it("never replaces a link silently: replacing it needs Replace the link", async () => {
    seedInstall();
    fakeDb.seed("member", [
      {
        id: "m_ana2",
        organizationId: "org_other",
        userId: "u_ana",
        role: "admin",
        createdAt: new Date(0),
      },
    ]);
    const first = token();
    prove(first);
    expect(
      await linkSlackAccount({ token: first, organizationId: ORG }),
    ).toEqual({ ok: true, workspaceName: "Acme" });

    // The same link again changes nothing and needs no confirmation.
    const again = token();
    prove(again);
    expect(
      await linkSlackAccount({ token: again, organizationId: ORG }),
    ).toEqual({ ok: true, workspaceName: "Acme" });

    const second = token();
    prove(second);
    expect(
      await linkSlackAccount({ token: second, organizationId: "org_other" }),
    ).toEqual({
      ok: false,
      error: expect.stringMatching(/already linked/),
    });
    expect(fakeDb.rows("slackUserLink")[0]?.organizationId).toBe(ORG);

    expect(
      await linkSlackAccount({
        token: second,
        organizationId: "org_other",
        replace: true,
      }),
    ).toEqual({ ok: true, workspaceName: "Other" });
    expect(fakeDb.rows("slackUserLink")).toEqual([
      expect.objectContaining({
        teamId: TEAM,
        slackUserId: ANA,
        userId: "u_ana",
        organizationId: "org_other",
      }),
    ]);
  });

  it("never takes over another QRdx account's link without Replace the link", async () => {
    seedInstall();
    fakeDb.seed("slackUserLink", [
      {
        id: "link_eve",
        teamId: TEAM,
        slackUserId: ANA,
        userId: "u_eve",
        organizationId: "org_eve",
        createdAt: new Date(0),
      },
    ]);
    const t = token();
    prove(t);
    expect(
      await linkSlackAccount({ token: t, organizationId: ORG }),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/already/) });
    expect(fakeDb.rows("slackUserLink")[0]?.userId).toBe("u_eve");
  });

  it("tells the Slack person in a direct message which QRdx account and workspace they're linked to", async () => {
    seedInstall();
    const t = token();
    prove(t);
    await linkSlackAccount({ token: t, organizationId: ORG });
    await flush();
    const [dm] = sentTo("chat.postMessage");
    expect(dm?.auth).toBe(`Bearer ${BOT_TOKEN}`);
    expect(dm?.body.channel).toBe(ANA);
    expect(dm?.body.text).toBe(
      "Linked to ana@acme.test in Acme. Not you? /qr unlink",
    );
  });

  it("links even when the direct message fails, and logs only Slack's error code", async () => {
    seedInstall();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      state.postResult = { ok: false, error: "messages_tab_disabled" };
      const t = token();
      prove(t);
      expect(await linkSlackAccount({ token: t, organizationId: ORG })).toEqual(
        { ok: true, workspaceName: "Acme" },
      );
      await flush();
      expect(fakeDb.rows("slackUserLink")).toHaveLength(1);
      expect(logged.mock.calls.map((call) => String(call[0]))).toEqual([
        JSON.stringify({
          event: "slack-bot.link_notice_failed",
          error: "messages_tab_disabled",
        }),
      ]);
    } finally {
      logged.mockRestore();
    }
  });

  it("links even when Slack can't be reached, and logs only the error's name", async () => {
    seedInstall();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      vi.stubGlobal("fetch", async () => {
        throw new TypeError("fetch failed: ana@acme.test xoxb-secret");
      });
      const t = token();
      prove(t);
      expect(await linkSlackAccount({ token: t, organizationId: ORG })).toEqual(
        { ok: true, workspaceName: "Acme" },
      );
      await flush();
      expect(fakeDb.rows("slackUserLink")).toHaveLength(1);
      expect(logged.mock.calls.map((call) => String(call[0]))).toEqual([
        JSON.stringify({
          event: "slack-bot.link_notice_failed",
          error: "TypeError",
        }),
      ]);
    } finally {
      logged.mockRestore();
    }
  });

  it("refuses an expired or changed token", async () => {
    seedInstall();
    const t = token();
    prove(t);
    const [payload, signature] = t.split(".");
    const other = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(payload ?? "", "base64url").toString()),
        teamId: "T0OTHER",
      }),
    ).toString("base64url");
    expect(
      await linkSlackAccount({
        token: `${other}.${signature}`,
        organizationId: ORG,
      }),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/expired/) });
  });
});

describe("tracked codes and the workspace", () => {
  it("from a mention: the code in the thread, the dashboard link only to the person", async () => {
    seedInstall();
    seedLink();
    await events.POST(
      eventRequest(
        callbackEvent({
          type: "app_mention",
          user: ANA,
          text: `<@${BOT}> track <https://shop.example/menu>`,
          channel: "C0GENERAL",
          ts: "1700000000.000100",
        }),
      ),
    );
    await flush();
    const [code] = fakeDb.rows("qrCode");
    const [post] = sentTo("chat.postMessage");
    expect(post?.body.thread_ts).toBe("1700000000.000100");
    expect(allText(post?.body)).toContain("in the QRdx workspace Acme");
    expect(allText(post?.body)).not.toContain("/dashboard/");
    const [ephemeral] = sentTo("chat.postEphemeral");
    expect(ephemeral?.body).toMatchObject({ channel: "C0GENERAL", user: ANA });
    expect(ephemeral?.body.blocks[1].elements[0].url).toMatch(
      new RegExp(`/dashboard/acme/codes/${code?.id}$`),
    );
  });

  it("are recorded in the audit log as made via Slack, for the linked person", async () => {
    seedInstall();
    seedLink();
    await commands.POST(slash("track https://shop.example/menu"));
    await flush();
    const [code] = fakeDb.rows("qrCode");
    expect(fakeDb.rows("workspaceAuditLog")).toEqual([
      expect.objectContaining({
        organizationId: ORG,
        action: "code.created",
        targetId: code?.id,
        actorType: "slack",
        actorUserId: "u_ana",
        actorLabel: `${ANA} in ${TEAM}`,
        apiKeyId: null,
        oauthAppId: null,
        metadata: expect.objectContaining({ actingFor: "Ana <ana@acme.test>" }),
      }),
    ]);
  });

  it("are refused when the workspace requires two-step verification and the linked person hasn't turned it on", async () => {
    seedInstall();
    seedLink();
    fakeDb.rows("organization")[0]!.metadata = JSON.stringify({
      requireTwoFactor: true,
    });
    fakeDb.seed("subscription", [
      {
        id: "sub_ana",
        userId: "u_ana",
        productId: "prod_business_monthly",
        status: "active",
      },
    ]);
    fakeDb.rows("user")[0]!.twoFactorEnabled = false;
    await commands.POST(slash("track https://shop.example/menu"));
    await flush();
    expect(fakeDb.rows("qrCode")).toEqual([]);
    const [posted] = responses();
    expect(posted?.body.response_type).toBe("ephemeral");
    expect(posted?.body.text).toMatch(
      /Acme requires two-step verification\. Turn it on in QRdx/,
    );

    // With two-step verification on, the same link works.
    fakeDb.rows("user")[0]!.twoFactorEnabled = true;
    state.fetches = [];
    await commands.POST(slash("track https://shop.example/menu"));
    await flush();
    expect(fakeDb.rows("qrCode")).toHaveLength(1);
  });
});

describe("the bot's limit across every Slack workspace", () => {
  it("answers that QRdx is busy, and keeps each person's and workspace's limits", async () => {
    state.limitedPrefixes = ["qrdx:slack-bot:all"];
    const busy = (await (
      await commands.POST(slash("https://qrdx.dev"))
    ).json()) as Json;
    expect(busy.response_type).toBe("ephemeral");
    expect(busy.text).toBe("QRdx is busy right now. Try again in a minute.");

    state.limitedPrefixes = ["qrdx:slack-bot:user"];
    const person = (await (
      await commands.POST(slash("https://qrdx.dev"))
    ).json()) as Json;
    expect(person.text).toMatch(/a little fast/);

    state.limitedPrefixes = ["qrdx:slack-bot:team"];
    const team = (await (
      await commands.POST(slash("https://qrdx.dev"))
    ).json()) as Json;
    expect(team.text).toMatch(/a little fast/);
  });

  it("is lower for tracked codes, which then aren't made", async () => {
    seedInstall();
    seedLink();
    state.limitedPrefixes = ["qrdx:slack-bot:all-track"];
    const reply = (await (
      await commands.POST(slash("track https://shop.example/menu"))
    ).json()) as Json;
    expect(reply.text).toBe("QRdx is busy right now. Try again in a minute.");
    await flush();
    expect(fakeDb.rows("qrCode")).toEqual([]);

    // Plain codes still work.
    const plain = (await (
      await commands.POST(slash("https://qrdx.dev"))
    ).json()) as Json;
    expect(plain.response_type).toBe("in_channel");
  });

  it("applies to mentions too, privately", async () => {
    seedInstall();
    state.limitedPrefixes = ["qrdx:slack-bot:all"];
    await events.POST(
      eventRequest(
        callbackEvent({
          type: "app_mention",
          user: ANA,
          text: `<@${BOT}> https://qrdx.dev`,
          channel: "C0GENERAL",
          ts: "1700000000.000100",
        }),
      ),
    );
    await flush();
    expect(sentTo("chat.postMessage")).toEqual([]);
    expect(sentTo("chat.postEphemeral")[0]?.body.text).toBe(
      "QRdx is busy right now. Try again in a minute.",
    );
  });
});

describe("adding the bot: the stored install", () => {
  const install = {
    ok: true,
    token_type: "bot",
    access_token: BOT_TOKEN,
    bot_user_id: BOT,
    scope: "commands,app_mentions:read,chat:write,im:history",
    team: { id: TEAM, name: "Acme" },
    enterprise: null,
  };
  const finish = (n: number) => {
    state.cookies.set("slack_bot_oauth_state", `state-${n}`);
    return callback.GET(
      new Request(
        `http://localhost:3000/api/integrations/slack/bot/callback?code=c${n}&state=state-${n}`,
      ),
    );
  };

  it("is one upsert on the workspace: installs at once leave one row", async () => {
    const execute = vi.spyOn(
      database as { execute: (q: unknown) => unknown },
      "execute",
    );
    const save = (teamName: string, enterpriseId: string | null = null) =>
      saveInstallation({
        teamId: TEAM,
        enterpriseId,
        teamName,
        botUserId: BOT,
        botToken: BOT_TOKEN,
        scopes: "commands",
        installedByUserId: "u_ana",
      });
    try {
      await Promise.all([save("Acme"), save("Acme Inc")]);
      // One statement each: no lookup first that a second install could race.
      expect(execute).toHaveBeenCalledTimes(2);
      expect(fakeDb.rows("slackBotInstallation")).toEqual([
        expect.objectContaining({ teamId: TEAM, teamName: "Acme Inc" }),
      ]);

      // The same workspace id in an Enterprise Grid org is another install.
      await save("Acme Grid", "E0GRID");
      expect(
        fakeDb
          .rows("slackBotInstallation")
          .map((row) => [row.teamId, row.enterpriseId, row.teamName]),
      ).toEqual([
        [TEAM, null, "Acme Inc"],
        [TEAM, "E0GRID", "Acme Grid"],
      ]);
    } finally {
      execute.mockRestore();
    }
  });

  it("logs only the error's name and code when saving fails", async () => {
    state.oauth = install;
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const execute = vi
      .spyOn(database as { execute: (q: unknown) => unknown }, "execute")
      .mockRejectedValue(
        Object.assign(
          new Error(
            'duplicate key value: params ("T0ACME","Acme","v1:secret-ciphertext")',
          ),
          { name: "NeonDbError", code: "23505" },
        ),
      );
    try {
      const response = await finish(4);
      expect(response.headers.get("location")).toMatch(
        /error=slack_bot_failed$/,
      );
      expect(logged.mock.calls.map((call) => String(call[0]))).toEqual([
        JSON.stringify({
          event: "slack-bot.install_failed",
          error: "NeonDbError",
          code: "23505",
        }),
      ]);
    } finally {
      execute.mockRestore();
      logged.mockRestore();
    }
  });
});

describe("workspace admins", () => {
  const owner = {
    userId: "u_ana",
    organizationId: ORG,
    role: "owner" as const,
  };

  function seedLinks() {
    seedInstall();
    seedLink();
    fakeDb.seed("member", [
      {
        id: "m_eve_acme",
        organizationId: ORG,
        userId: "u_eve",
        role: "member",
        createdAt: new Date(0),
      },
    ]);
    fakeDb.seed("slackUserLink", [
      {
        id: "link_eve",
        teamId: TEAM,
        slackUserId: EVE,
        userId: "u_eve",
        organizationId: ORG,
        createdAt: new Date(1),
      },
      {
        id: "link_elsewhere",
        teamId: TEAM,
        slackUserId: "U0BEN",
        userId: "u_eve",
        organizationId: "org_eve",
        createdAt: new Date(2),
      },
    ]);
  }

  it("owners and admins see the Slack accounts linked to their workspace", async () => {
    seedLinks();
    const links = await admin.loadWorkspaceSlackLinks(owner);
    // Oldest first: Eve's was linked before Ana's.
    expect(links).toEqual({
      available: true,
      links: [
        expect.objectContaining({
          id: "link_eve",
          slackUserId: EVE,
          memberEmail: "eve@evil.test",
        }),
        expect.objectContaining({
          id: `link_${TEAM}_${ANA}`,
          teamId: TEAM,
          teamName: "Acme",
          slackUserId: ANA,
          userId: "u_ana",
          memberName: "Ana",
          memberEmail: "ana@acme.test",
        }),
      ],
    });
    expect(
      await admin.loadWorkspaceSlackLinks({ ...owner, role: "admin" }),
    ).toMatchObject({ available: true });
  });

  it("members, viewers and billing members don't, and no query is made", async () => {
    seedLinks();
    fakeDb.missing("slackUserLink");
    for (const role of ["member", "viewer", "billing"] as const) {
      expect(
        await admin.loadWorkspaceSlackLinks({ ...owner, role }),
        role,
      ).toBeNull();
    }
  });

  it("an admin revokes one, and the audit log records it", async () => {
    seedLinks();
    state.headers = new Headers({ "x-qrdx-workspace": "acme" });
    expect(await revokeSlackLinkAction({ id: "link_eve" })).toEqual({
      ok: true,
    });
    await flush();
    expect(fakeDb.rows("slackUserLink").map((row) => row.id)).toEqual([
      `link_${TEAM}_${ANA}`,
      "link_elsewhere",
    ]);
    expect(fakeDb.rows("workspaceAuditLog")).toEqual([
      expect.objectContaining({
        organizationId: ORG,
        action: "slack_link.revoked",
        actorType: "user",
        actorUserId: "u_ana",
        targetType: "slack_link",
        targetId: "link_eve",
        targetLabel: `${EVE} in Acme`,
        metadata: { member: "eve@evil.test" },
      }),
    ]);

    // Eve's /qr track stops making codes there.
    await commands.POST(
      signed(
        "commands",
        new URLSearchParams({
          command: "/qr",
          text: "track https://shop.example",
          team_id: TEAM,
          team_domain: "acme",
          user_id: EVE,
          user_name: "eve",
          channel_id: "C0GENERAL",
          response_url: RESPONSE_URL,
        }).toString(),
      ),
    );
    await flush();
    expect(fakeDb.rows("qrCode")).toEqual([]);
  });

  it("refuses members, and links of another workspace", async () => {
    seedLinks();
    // Eve is a member of Acme: she can't revoke Ana's link.
    state.session = { user: { id: "u_eve", email: "eve@evil.test" } };
    state.headers = new Headers({ "x-qrdx-workspace": "acme" });
    expect(await revokeSlackLinkAction({ id: `link_${TEAM}_${ANA}` })).toEqual({
      ok: false,
      error: "Only owners and admins can revoke Slack links.",
    });

    // Ana owns Acme, but this link is to Eve's workspace.
    state.session = { user: SESSION.user };
    expect(await revokeSlackLinkAction({ id: "link_elsewhere" })).toEqual({
      ok: false,
      error: "Slack link not found.",
    });
    expect(fakeDb.rows("slackUserLink")).toHaveLength(3);
    await flush();
    expect(fakeDb.rows("workspaceAuditLog")).toEqual([]);
  });
});

describe("styles", () => {
  const STYLED =
    'qrdx.dev --look modern --frame banner-bottom --frame-text "Scan me"';

  /** The image link of a message, parsed. */
  const imageOf = (message: Json) => new URL(message.blocks[0].image_url);
  const styleOf = (message: Json) =>
    decodeStyleParam(imageOf(message).searchParams.get("style"));
  const menusOf = (message: Json) =>
    (message.blocks as Json[]).find((block) =>
      String(block.block_id).startsWith("qrdx_style:"),
    );

  /** A pick in a code's style menus, as Slack sends it. */
  const pick = (message: Json, picker: string, value: string, user = ANA) => ({
    type: "block_actions",
    team: { id: TEAM },
    user: { id: user },
    channel: { id: "C0GENERAL" },
    message: { ts: "1700000000.000900", blocks: message.blocks },
    response_url: "https://hooks.slack.com/actions/T0ACME/3/fake",
    actions: [
      {
        type: "static_select",
        action_id: `qrdx_${picker}`,
        block_id: menusOf(message)?.block_id,
        selected_option: { text: { type: "plain_text", text: value }, value },
      },
    ],
  });

  /** A plain code from /qr, as the channel shows it. */
  async function plainCode(text = "https://qrdx.dev") {
    return (await (await commands.POST(slash(text))).json()) as Json;
  }

  it("puts Look, Color, Frame and Logo menus under a code, for the person who made it", async () => {
    const reply = await plainCode();
    expect(imageOf(reply).searchParams.has("style")).toBe(false);
    const menus = menusOf(reply);
    expect(menus?.block_id).toBe(`qrdx_style:${ANA}`);
    expect(
      menus?.elements.map((menu: Json) => [
        menu.type,
        menu.action_id,
        menu.placeholder.text,
      ]),
    ).toEqual([
      ["static_select", "qrdx_look", "Look"],
      ["static_select", "qrdx_color", "Color"],
      ["static_select", "qrdx_frame", "Frame"],
      ["static_select", "qrdx_logo", "Logo"],
    ]);
    // The buttons stay first, under the caption.
    expect(reply.blocks[2].elements[0].text.text).toBe("Download PNG");
  });

  it("/qr with options answers at once, then posts the scan-checked code in the channel", async () => {
    const response = await commands.POST(slash(STYLED));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    await flush();
    const [post] = responses();
    expect(post?.url).toBe(RESPONSE_URL);
    expect(post?.body.response_type).toBe("in_channel");
    expect(imageOf(post?.body).searchParams.get("data")).toBe(
      "https://qrdx.dev",
    );
    expect(styleOf(post?.body)).toMatchObject({
      preset: "modern",
      styles: { frame: { style: "banner-bottom", text: "Scan me" } },
    });
    // Open in editor carries the whole design.
    const editor = new URL(post?.body.blocks[2].elements[2].url);
    expect(editor.searchParams.get("style")).toBe(
      imageOf(post?.body).searchParams.get("style"),
    );
    expect(menusOf(post?.body)?.block_id).toBe(`qrdx_style:${ANA}`);
  });

  it("explains an option it doesn't know, privately, with the valid ones", async () => {
    const reply = (await (
      await commands.POST(slash("qrdx.dev --look neon"))
    ).json()) as Json;
    expect(reply.response_type).toBe("ephemeral");
    expect(reply.text).toMatch(/--look takes one of: plain, classic, modern/);
    await flush();
    expect(state.fetches).toEqual([]);
  });

  it("styles a code in a direct message too", async () => {
    seedInstall();
    await events.POST(
      eventRequest(
        callbackEvent({
          type: "message",
          channel_type: "im",
          user: ANA,
          text: "Table 4 --frame polaroid --logo wifi",
          channel: "D0ANA",
          ts: "1700000000.000200",
        }),
      ),
    );
    await flush();
    const [post] = sentTo("chat.postMessage");
    const image = new URL(post?.body.blocks[0].image_url);
    expect(image.searchParams.get("data")).toBe("Table 4");
    expect(image.searchParams.get("logoIcon")).toBe("wifi");
    expect(
      decodeStyleParam(image.searchParams.get("style"))?.styles.frame,
    ).toMatchObject({ style: "polaroid" });
  });

  it("a pick restyles the code in place, for the person who made it", async () => {
    const reply = await plainCode("Fish &amp; chips");
    const response = await interactions.POST(
      interaction(pick(reply, "look", "royal")),
    );
    expect(response.status).toBe(200);
    await flush();
    const [post] = responses();
    expect(post?.url).toBe("https://hooks.slack.com/actions/T0ACME/3/fake");
    expect(post?.body.replace_original).toBe(true);
    expect(imageOf(post?.body).searchParams.get("data")).toBe("Fish & chips");
    expect(styleOf(post?.body)?.preset).toBe("royal");
    // The menus stay, still theirs; text never goes in the editor link.
    expect(menusOf(post?.body)?.block_id).toBe(`qrdx_style:${ANA}`);
    const editor = post?.body.blocks[2].elements[2];
    expect(editor.action_id).toBe("qrdx_editor");
    expect(new URL(editor.url).searchParams.has("style")).toBe(true);
    expect(editor.url).not.toContain("chips");

    // A second pick builds on the first: royal with a frame.
    state.fetches = [];
    await interactions.POST(
      interaction(pick(post?.body, "frame", "banner-top")),
    );
    await flush();
    const [again] = responses();
    expect(styleOf(again?.body)).toMatchObject({
      preset: "royal",
      styles: { frame: { style: "banner-top" } },
    });
  });

  it("someone else's pick gets a note only they see, and changes nothing", async () => {
    const reply = await plainCode();
    await interactions.POST(interaction(pick(reply, "color", "red", EVE)));
    await flush();
    const [post] = responses();
    expect(post?.body).toMatchObject({
      response_type: "ephemeral",
      replace_original: false,
      text: "Only the person who made this code can restyle it. Make your own with /qr.",
    });
    expect(allText(post?.body)).not.toContain("image_url");
  });

  it("picks count toward the same limits as /qr", async () => {
    const reply = await plainCode();
    state.limitedPrefixes = ["qrdx:slack-bot:user"];
    await interactions.POST(interaction(pick(reply, "look", "retro")));
    await flush();
    const [slow] = responses();
    expect(slow?.body.response_type).toBe("ephemeral");
    expect(slow?.body.text).toMatch(/a little fast/);
    expect(slow?.body.replace_original).toBe(false);

    state.fetches = [];
    state.limitedPrefixes = ["qrdx:slack-bot:all"];
    await interactions.POST(interaction(pick(reply, "look", "retro")));
    await flush();
    expect(responses()[0]?.body.text).toBe(BUSY_TEXT);
  });

  it("can't restyle a code whose links it didn't make, or an option it doesn't offer", async () => {
    const reply = await plainCode();
    const tampered = JSON.parse(
      JSON.stringify(reply).replaceAll("api.qrdx.dev", "evil.example"),
    );
    await interactions.POST(interaction(pick(tampered, "look", "retro")));
    await interactions.POST(interaction(pick(reply, "look", "neon")));
    await flush();
    for (const post of responses()) {
      expect(post.body.response_type).toBe("ephemeral");
      expect(post.body.text).toMatch(/can't be restyled/);
    }
    expect(responses()).toHaveLength(2);
  });

  it("the shortcut's private code has no menus, which couldn't read it back", async () => {
    seedInstall();
    state.postResult = { ok: false, error: "not_in_channel" };
    await interactions.POST(
      interaction({
        type: "message_action",
        callback_id: "qrdx_make_qr",
        team: { id: TEAM },
        user: { id: ANA },
        channel: { id: "C0GENERAL" },
        message: { text: "Table 4 --look royal", ts: "1.2" },
        response_url: "https://hooks.slack.com/actions/T0ACME/2/fake",
      }),
    );
    await flush();
    const [post] = sentTo("chat.postMessage");
    // Someone else's message is content as it is: no options read from it.
    expect(
      new URL(post?.body.blocks[0].image_url).searchParams.get("data"),
    ).toBe("Table 4 --look royal");
    expect(menusOf(post?.body)?.block_id).toBe(`qrdx_style:${ANA}`);
    const [fallback] = responses();
    expect(fallback?.body.response_type).toBe("ephemeral");
    expect(menusOf(fallback?.body)).toBeUndefined();
  });

  it("the help lists the options", async () => {
    const reply = (await (await commands.POST(slash("help"))).json()) as Json;
    for (const flag of ["--look", "--fg", "--frame-text", "--logo"]) {
      expect(allText(reply)).toContain(flag);
    }
  });
});

describe("with the bot off", () => {
  afterAll(() => {
    process.env.SLACK_SIGNING_SECRET = "test-slack-signing-secret";
  });

  it("every bot route answers 404", async () => {
    delete process.env.SLACK_SIGNING_SECRET;
    vi.resetModules();
    const off = {
      commands: await import("@/app/api/integrations/slack/commands/route"),
      events: await import("@/app/api/integrations/slack/events/route"),
      interactions: await import(
        "@/app/api/integrations/slack/interactions/route"
      ),
      install: await import("@/app/api/integrations/slack/bot/install/route"),
      callback: await import("@/app/api/integrations/slack/bot/callback/route"),
      linkStart: await import("@/app/api/integrations/slack/link/start/route"),
      linkCallback: await import(
        "@/app/api/integrations/slack/link/callback/route"
      ),
      admin: await import("@/lib/slack-bot/admin"),
    };
    expect((await off.commands.POST(slash("https://qrdx.dev"))).status).toBe(
      404,
    );
    expect(
      (
        await off.events.POST(
          eventRequest({ type: "url_verification", challenge: "x" }),
        )
      ).status,
    ).toBe(404);
    expect(
      (await off.interactions.POST(interaction({ type: "block_actions" })))
        .status,
    ).toBe(404);
    expect(
      (
        await off.install.GET(
          new Request(
            "http://localhost:3000/api/integrations/slack/bot/install",
          ),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await off.callback.GET(
          new Request(
            "http://localhost:3000/api/integrations/slack/bot/callback?code=x&state=y",
          ),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await off.linkStart.GET(
          new Request(
            "http://localhost:3000/api/integrations/slack/link/start?t=x",
          ),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await off.linkCallback.GET(
          new Request(
            "http://localhost:3000/api/integrations/slack/link/callback?code=x&state=y",
          ),
        )
      ).status,
    ).toBe(404);
    // Nothing for the admins' settings while the bot is off.
    expect(
      await off.admin.loadWorkspaceSlackLinks({
        userId: "u_ana",
        organizationId: ORG,
        role: "owner",
      }),
    ).toBeNull();
  });
});
