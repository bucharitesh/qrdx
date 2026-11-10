// The Discord app's endpoint with the bot set up: Discord's Ed25519
// signature over timestamp + raw body is checked before anything else (a key
// pair generated here stands in for the app's), PING gets PONG, and /qr and
// "Make QR code" reply in Discord's shape. Nothing touches the network or a
// database. The rate limiters run in memory with their real windows (fresh
// for each test) and record their keys; `state.allow = false` refuses all.
// Their clock stands still in the middle of a minute: the windows are
// minutes of the real clock, and a test that ran across one's end would see
// part of its count weighted away.
import type { KeyObject } from "node:crypto";
import { generateKeyPairSync, sign } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QR_DATA_MAX_LENGTH } from "@/lib/qr-render";

const state = vi.hoisted(() => {
  const crypto = process.getBuiltinModule("node:crypto");
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const jwk = publicKey.export({ format: "jwk" });
  process.env.DISCORD_APPLICATION_ID = "112233445566778899";
  process.env.DISCORD_PUBLIC_KEY = Buffer.from(
    jwk.x as string,
    "base64url",
  ).toString("hex");
  return { privateKey, allow: true, keys: [] as string[], generation: 0 };
});

vi.mock("@repo/rate-limit", async () => {
  const { createMemoryLimiter, parseDuration } = await import(
    "@repo/rate-limit/fallback"
  );
  /** 30 seconds into a minute. */
  const MID_MINUTE = Math.floor(Date.now() / 60_000) * 60_000 + 30_000;
  const window = (tokens: number, duration: string) => ({
    tokens,
    windowMs: parseDuration(duration),
  });
  return {
    slidingWindow: window,
    fixedWindow: window,
    createRateLimiter: ({
      limiter = window(10, "10 s"),
    }: {
      limiter?: { tokens: number; windowMs: number };
    }) => {
      const clock = () => MID_MINUTE;
      let generation = -1;
      let memory = createMemoryLimiter(limiter, clock);
      return {
        limit: async (key: string) => {
          if (generation !== state.generation) {
            generation = state.generation;
            memory = createMemoryLimiter(limiter, clock);
          }
          state.keys.push(key);
          if (!state.allow) {
            return { success: false, reset: Date.now() + 60_000 };
          }
          return memory.limit(key);
        },
      };
    },
  };
});

beforeEach(() => {
  state.generation += 1;
  state.keys.length = 0;
  state.allow = true;
});

const { POST } = await import(
  "@/app/api/integrations/discord/interactions/route"
);
const { GET: install } = await import(
  "@/app/api/integrations/discord/install/route"
);
const { EMBED_URL_MAX, EPHEMERAL, LINK_BUTTON_URL_MAX, NOTICES } = await import(
  "@/lib/chat-bots/discord/interactions"
);

const ENDPOINT = "http://localhost/api/integrations/discord/interactions";
const nowSeconds = () => String(Math.floor(Date.now() / 1000));

function request(
  body: string,
  options: {
    key?: KeyObject;
    timestamp?: string;
    signedBody?: string;
    headers?: Record<string, string | undefined>;
  } = {},
) {
  const timestamp = options.timestamp ?? nowSeconds();
  const signature = sign(
    null,
    Buffer.from(timestamp + (options.signedBody ?? body)),
    options.key ?? state.privateKey,
  ).toString("hex");
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-signature-ed25519": signature,
    "x-signature-timestamp": timestamp,
  };
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    if (value === undefined) delete headers[name];
    else headers[name] = value;
  }
  return new Request(ENDPOINT, { method: "POST", headers, body });
}

async function send(payload: unknown) {
  const response = await POST(request(JSON.stringify(payload)));
  return { status: response.status, body: await response.json() };
}

const guildUser = { member: { user: { id: "u_guild" } } };

const qr = (content: string, extra: Record<string, unknown> = {}) => ({
  type: 2,
  ...guildUser,
  data: {
    type: 1,
    name: "qr",
    options: [
      { name: "content", type: 3, value: content },
      ...Object.entries(extra).map(([name, value]) => ({
        name,
        type: 5,
        value,
      })),
    ],
  },
});

const makeFromMessage = (content: string | undefined) => ({
  type: 2,
  user: { id: "u_dm" },
  data: {
    type: 3,
    name: "Make QR code",
    target_id: "m1",
    resolved: { messages: { m1: content === undefined ? {} : { content } } },
  },
});

type Button = { type: number; style: number; label: string; url: string };

const buttonsOf = (body: {
  data: { components?: { components: Button[] }[] };
}) => body.data.components?.flatMap((row) => row.components) ?? [];

describe("the request signature", () => {
  const ping = JSON.stringify({ type: 1 });

  it("answers a signed PING with PONG", async () => {
    const response = await POST(request(ping));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ type: 1 });
  });

  it("refuses a body changed after signing", async () => {
    const response = await POST(
      request(JSON.stringify({ type: 1, x: 2 }), { signedBody: ping }),
    );
    expect(response.status).toBe(401);
  });

  it("refuses a signature from another key", async () => {
    const other = generateKeyPairSync("ed25519").privateKey;
    expect((await POST(request(ping, { key: other }))).status).toBe(401);
  });

  it("refuses requests without the signature headers", async () => {
    for (const missing of ["x-signature-ed25519", "x-signature-timestamp"]) {
      const response = await POST(
        request(ping, { headers: { [missing]: undefined } }),
      );
      expect(response.status, missing).toBe(401);
    }
    const bare = new Request(ENDPOINT, { method: "POST", body: ping });
    expect((await POST(bare)).status).toBe(401);
  });

  it("refuses a malformed signature or timestamp", async () => {
    expect(
      (await POST(request(ping, { headers: { "x-signature-ed25519": "zz" } })))
        .status,
    ).toBe(401);
    expect((await POST(request(ping, { timestamp: "yesterday" }))).status).toBe(
      401,
    );
  });

  it("refuses a stale timestamp, even correctly signed", async () => {
    const old = String(Math.floor(Date.now() / 1000) - 10 * 60);
    expect((await POST(request(ping, { timestamp: old }))).status).toBe(401);
  });

  it("checks the signature before reading the body", async () => {
    const response = await POST(
      request("not json", {
        headers: { "x-signature-ed25519": "0".repeat(128) },
      }),
    );
    expect(response.status).toBe(401);
  });

  it("answers 400 to a signed body that isn't an interaction", async () => {
    expect((await POST(request("not json"))).status).toBe(400);
    expect((await POST(request(JSON.stringify({ hello: 1 })))).status).toBe(
      400,
    );
    expect((await POST(request(JSON.stringify({ type: 3 })))).status).toBe(400);
  });

  it("refuses oversized bodies", async () => {
    const response = await POST(request(" ".repeat(300 * 1024)));
    expect(response.status).toBe(413);
  });
});

describe("the body size cap", () => {
  const CHUNK = 64 * 1024;

  /** A body that never ends, counting the chunks the route reads. */
  function endlessBody() {
    const counter = { chunks: 0 };
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        counter.chunks += 1;
        controller.enqueue(new Uint8Array(CHUNK).fill(0x20));
      },
    });
    return { stream, counter };
  }

  function streamed(
    body: ReadableStream<Uint8Array>,
    headers: Record<string, string> = {},
  ) {
    const timestamp = nowSeconds();
    return new Request(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-signature-ed25519": "0".repeat(128),
        "x-signature-timestamp": timestamp,
        ...headers,
      },
      body,
      duplex: "half",
    } as RequestInit);
  }

  it("refuses a content-length over the cap without reading the body", async () => {
    const { stream, counter } = endlessBody();
    const response = await POST(
      streamed(stream, { "content-length": String(300 * 1024) }),
    );
    expect(response.status).toBe(413);
    // At most the one chunk a stream pulls when it's created.
    expect(counter.chunks).toBeLessThanOrEqual(1);
  });

  it("stops reading as soon as a body without a content-length passes the cap", async () => {
    const { stream, counter } = endlessBody();
    const request = streamed(stream);
    expect(request.headers.get("content-length")).toBeNull();
    const response = await POST(request);
    expect(response.status).toBe(413);
    // 256 KB is four 64 KB chunks: the fifth passes the cap. The stream may
    // have pulled one more ahead.
    expect(counter.chunks).toBeGreaterThanOrEqual(5);
    expect(counter.chunks).toBeLessThanOrEqual(6);
  });

  it("stops at the cap when the content-length understates the body", async () => {
    const { stream, counter } = endlessBody();
    const response = await POST(streamed(stream, { "content-length": "20" }));
    expect(response.status).toBe(413);
    expect(counter.chunks).toBeLessThanOrEqual(6);
  });

  it("reads a streamed body within the cap, then checks its signature", async () => {
    const ping = JSON.stringify({ type: 1 });
    const timestamp = nowSeconds();
    const signature = sign(
      null,
      Buffer.from(timestamp + ping),
      state.privateKey,
    ).toString("hex");
    const bytes = new TextEncoder().encode(ping);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.subarray(0, 4));
        controller.enqueue(bytes.subarray(4));
        controller.close();
      },
    });
    const response = await POST(
      streamed(body, {
        "x-signature-ed25519": signature,
        "x-signature-timestamp": timestamp,
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ type: 1 });
  });
});

describe("/qr", () => {
  it("replies with the code as an embed image and three link buttons", async () => {
    const { status, body } = await send(qr("https://qrdx.dev/pricing"));
    expect(status).toBe(200);
    expect(body.type).toBe(4);
    expect(body.data.flags).toBeUndefined();
    expect(body.data.allowed_mentions).toEqual({ parse: [] });
    expect(body.data.content).toBeUndefined();

    const [embed] = body.data.embeds;
    expect(embed.title).toBe("https://qrdx.dev/pricing");
    const image = new URL(embed.image.url);
    expect(image.origin).toBe("https://api.qrdx.dev");
    expect(image.pathname).toBe("/v1/qr");
    expect(image.searchParams.get("data")).toBe("https://qrdx.dev/pricing");
    expect(image.searchParams.get("format")).toBe("png");
    expect(image.searchParams.get("size")).toBe("1024");

    const buttons = buttonsOf(body);
    expect(buttons.map((button) => button.label)).toEqual([
      "Download PNG",
      "Download SVG",
      "Open in editor",
    ]);
    for (const button of buttons) {
      expect(button).toMatchObject({ type: 2, style: 5 });
    }
    expect(buttons[0].url).toBe(embed.image.url);
    expect(new URL(buttons[1].url).searchParams.get("format")).toBeNull();
    const editor = new URL(buttons[2].url);
    expect(editor.pathname).toBe("/playground");
    expect(editor.hash).toContain("url=");
  });

  it("is ephemeral with private set to True", async () => {
    const { body } = await send(qr("door code 4471", { private: true }));
    expect(body.data.flags).toBe(EPHEMERAL);
    expect(body.data.embeds).toHaveLength(1);
    const { body: shared } = await send(
      qr("door code 4471", { private: false }),
    );
    expect(shared.data.flags).toBeUndefined();
  });

  it("never carries text content into the editor link", async () => {
    const { body } = await send(qr("door code 4471"));
    const editor = buttonsOf(body).find((b) => b.label === "Open in editor");
    expect(editor?.url).not.toContain("4471");
  });

  it("unwraps a link Discord wrapped in <…> to hide its preview", async () => {
    const { body } = await send(qr("<https://example.com/menu>"));
    const image = new URL(body.data.embeds[0].image.url);
    expect(image.searchParams.get("data")).toBe("https://example.com/menu");
  });

  it("can't ping anyone, whatever the content says", async () => {
    const { body } = await send(qr("@everyone <@&123> look"));
    expect(body.data.allowed_mentions).toEqual({ parse: [] });
    expect(body.data.content).toBeUndefined();
    expect(body.data.embeds[0].title).toBe("@everyone <@&123> look");
  });

  it("explains privately when the content can't be a QR code", async () => {
    for (const content of [
      "a".repeat(QR_DATA_MAX_LENGTH + 1),
      // Within the length limit, but too many bytes for the largest code.
      "é".repeat(1500),
    ]) {
      const { status, body } = await send(qr(content));
      expect(status).toBe(200);
      expect(body.data).toMatchObject({
        content: NOTICES.tooLong,
        flags: EPHEMERAL,
        allowed_mentions: { parse: [] },
      });
      expect(body.data.embeds).toBeUndefined();
    }
    const { body } = await send(qr("   "));
    expect(body.data).toMatchObject({
      content: NOTICES.empty,
      flags: EPHEMERAL,
    });
  });

  it("points at the editor when the image link would be too long for Discord", async () => {
    // Fits a QR code, but every % triples in the image link.
    const { body } = await send(qr("%".repeat(1500)));
    expect(body.data).toMatchObject({
      content: NOTICES.tooLongToShow,
      flags: EPHEMERAL,
    });
    expect(body.data.embeds).toBeUndefined();
    expect(buttonsOf(body).map((b) => b.label)).toEqual(["Open in editor"]);
  });

  it("leaves out buttons whose links Discord would refuse", async () => {
    const long = `https://example.com/${"a".repeat(600)}`;
    const { body } = await send(qr(long));
    expect(body.data.embeds[0].image.url.length).toBeLessThanOrEqual(
      EMBED_URL_MAX,
    );
    expect(body.data.embeds[0].image.url.length).toBeGreaterThan(
      LINK_BUTTON_URL_MAX,
    );
    expect(body.data.components).toBeUndefined();
  });

  it("shortens long content in the title", async () => {
    const { body } = await send(qr(`line one\n${"x".repeat(300)}`));
    const title: string = body.data.embeds[0].title;
    expect(title.length).toBeLessThanOrEqual(120);
    expect(title.startsWith("line one x")).toBe(true);
    expect(title.endsWith("…")).toBe(true);
  });
});

describe("Make QR code (message command)", () => {
  it("makes a code of the first web address in the message", async () => {
    const { body } = await send(
      makeFromMessage(
        "Menu is here: <https://example.com/menu>, and https://other.example too.",
      ),
    );
    const image = new URL(body.data.embeds[0].image.url);
    expect(image.searchParams.get("data")).toBe("https://example.com/menu");
    expect(body.data.flags).toBeUndefined();
    expect(body.data.allowed_mentions).toEqual({ parse: [] });
  });

  it("uses the message's text when it has no web address", async () => {
    const { body } = await send(makeFromMessage("  Wi-Fi: Lobby / pass 1234 "));
    const image = new URL(body.data.embeds[0].image.url);
    expect(image.searchParams.get("data")).toBe("Wi-Fi: Lobby / pass 1234");
  });

  it("explains privately when the message has no text", async () => {
    for (const content of [undefined, ""]) {
      const { body } = await send(makeFromMessage(content));
      expect(body.data).toMatchObject({
        content: NOTICES.emptyMessage,
        flags: EPHEMERAL,
      });
    }
  });

  it("explains privately when the message is too long for a code", async () => {
    const { body } = await send(makeFromMessage("word ".repeat(800)));
    expect(body.data).toMatchObject({
      content: NOTICES.tooLong,
      flags: EPHEMERAL,
    });
  });
});

describe("other commands and limits", () => {
  it("answers an unknown command with help, privately", async () => {
    const { body } = await send({
      type: 2,
      ...guildUser,
      data: { type: 1, name: "qrcode" },
    });
    expect(body).toMatchObject({
      type: 4,
      data: { content: NOTICES.help, flags: EPHEMERAL },
    });
  });

  it("rate limits each Discord user, in servers and DMs, then the bot as a whole", async () => {
    await send(qr("https://qrdx.dev"));
    await send(makeFromMessage("https://qrdx.dev"));
    expect(state.keys).toEqual([
      "discord-bot:user:u_guild",
      "discord-bot:global",
      "discord-bot:user:u_dm",
      "discord-bot:global",
    ]);
  });

  it("tells the user privately when they're over their limit, without counting them bot-wide", async () => {
    for (let i = 0; i < 20; i++) {
      expect((await send(qr(`code ${i}`))).body.data.embeds).toHaveLength(1);
    }
    state.keys.length = 0;
    const { status, body } = await send(qr("https://qrdx.dev"));
    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      content: NOTICES.rateLimited,
      flags: EPHEMERAL,
    });
    expect(body.data.embeds).toBeUndefined();
    expect(state.keys).toEqual(["discord-bot:user:u_guild"]);
  });

  it("makes 300 codes a minute from everyone together, then says privately that it's busy", async () => {
    // 15 people at their own limit of 20.
    for (let person = 0; person < 15; person++) {
      for (let i = 0; i < 20; i++) {
        const { body } = await send({
          ...qr(`code ${person}-${i}`),
          member: { user: { id: `u_${person}` } },
        });
        expect(body.data.embeds).toHaveLength(1);
      }
    }
    // Someone new, well within their own limit.
    const { status, body } = await send(makeFromMessage("https://qrdx.dev"));
    expect(status).toBe(200);
    expect(body).toEqual({
      type: 4,
      data: {
        content: "QRdx is busy right now. Try again in a minute.",
        flags: EPHEMERAL,
        allowed_mentions: { parse: [] },
      },
    });
    expect(NOTICES.busy).toBe(body.data.content);
  });

  it("doesn't rate limit PINGs", async () => {
    await send({ type: 1 });
    expect(state.keys).toEqual([]);
  });
});

describe("Add to Discord", () => {
  it("redirects to Discord's install page for this app", async () => {
    const response = install();
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(
      "https://discord.com/oauth2/authorize",
    );
    expect(location.searchParams.get("client_id")).toBe("112233445566778899");
  });
});
