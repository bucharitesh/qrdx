// The QRdx bot for Slack, through its real routes and server action: signed
// requests in, Block Kit messages out. The database is the in-memory fake
// (tests/support/fake-db.ts), Slack's API is a stubbed fetch that records
// what the bot sends, and every secret, id and token is a fake.
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
  return {
    plan: "business" as "free" | "pro" | "business",
    tasks: [] as Promise<unknown>[],
    session: null as null | { user: { id: string; email: string } },
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
  headers: async () => new Headers(),
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
  createRateLimiter: () => ({
    limit: async () => ({
      success: !state.limited,
      limit: 30,
      remaining: state.limited ? 0 : 29,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    }),
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
          sessionId: "s_1",
          sessionCreatedAt: new Date(),
          requestHeaders: new Headers(),
        }
      : null,
  requireRecentConfirmation: async () =>
    state.confirmed ? null : { ok: false, error: "CONFIRMATION_REQUIRED" },
}));

const { signSlackRequest } = await import("@/lib/slack-bot/signature");
const { signLinkToken, verifyLinkToken } = await import(
  "@/lib/slack-bot/link-token"
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

const SIGNING_SECRET = "test-slack-signing-secret";
const AUTH_SECRET = "test-secret-at-least-32-characters-long";
const TEAM = "T0ACME";
const BOT = "U0BOT";
const ANA = "U0ANA";
const ORG = "org_acme";
const RESPONSE_URL = "https://hooks.slack.com/commands/T0ACME/1/fake";
const BOT_TOKEN = "xoxb-fake-bot-token";

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
  state.session = { user: { id: "u_ana", email: "ana@acme.test" } };
  state.cookies = new Map();
  state.limited = false;
  state.fetches = [];
  state.postResult = { ok: true };
  state.confirmed = true;
  vi.stubGlobal(
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
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
  ]);
  fakeDb.seed("user", [
    {
      id: "u_ana",
      name: "Ana",
      email: "ana@acme.test",
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

    it("makes a dynamic code as the linked QRdx user and posts its short link", async () => {
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
      const [posted] = responses();
      expect(posted?.url).toBe(RESPONSE_URL);
      expect(posted?.body.response_type).toBe("in_channel");
      const data = new URL(posted?.body.blocks[0].image_url).searchParams.get(
        "data",
      );
      expect(data).toMatch(new RegExp(`/q/${code?.slug}$`));
      const open = posted?.body.blocks[2].elements[0];
      expect(open.text.text).toBe("Open in QRdx");
      expect(open.url).toMatch(
        new RegExp(`/dashboard/acme/codes/${code?.id}$`),
      );
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

describe("linking an account", () => {
  const token = (teamId = TEAM) =>
    signLinkToken(
      { teamId, slackUserId: ANA, teamName: "Acme", userName: "ana" },
      AUTH_SECRET,
    );

  it("is refused when the bot isn't in that Slack workspace", async () => {
    expect(
      await linkSlackAccount({ token: token(), organizationId: ORG }),
    ).toEqual({
      ok: false,
      error: expect.stringMatching(/isn't in that Slack workspace/),
    });
    expect(fakeDb.rows("slackUserLink")).toEqual([]);
  });

  it("needs membership, a role that creates codes and a recent confirmation", async () => {
    seedInstall();
    expect(
      await linkSlackAccount({ token: token(), organizationId: "org_other" }),
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/not a member/),
    });

    fakeDb.rows("member")[0]!.role = "viewer";
    expect(
      await linkSlackAccount({ token: token(), organizationId: ORG }),
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/can't create codes/),
    });
    fakeDb.rows("member")[0]!.role = "member";

    state.confirmed = false;
    expect(
      await linkSlackAccount({ token: token(), organizationId: ORG }),
    ).toEqual({
      ok: false,
      error: "CONFIRMATION_REQUIRED",
    });
    expect(fakeDb.rows("slackUserLink")).toEqual([]);
  });

  it("links once per Slack person per workspace; linking again replaces it", async () => {
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
    expect(
      await linkSlackAccount({ token: token(), organizationId: ORG }),
    ).toEqual({
      ok: true,
      workspaceName: "Acme",
    });
    expect(
      await linkSlackAccount({ token: token(), organizationId: "org_other" }),
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

  it("refuses an expired or changed token", async () => {
    seedInstall();
    const [payload, signature] = token().split(".");
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
  });
});
