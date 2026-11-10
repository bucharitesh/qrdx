// The Discord app's endpoint with the bot set up: Discord's Ed25519
// signature over timestamp + raw body is checked before anything else (a key
// pair generated here stands in for the app's), PING gets PONG, and /qr and
// "Make QR code" reply in Discord's shape. Nothing touches the network or a
// database; the rate limiter is a fake that records its keys.
import type { KeyObject } from "node:crypto";
import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
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
  return { privateKey, allow: true, keys: [] as string[] };
});

vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async (key: string) => {
      state.keys.push(key);
      return { success: state.allow, reset: Date.now() + 60_000 };
    },
  }),
}));

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

  it("rate limits each Discord user, in servers and DMs", async () => {
    state.keys.length = 0;
    await send(qr("https://qrdx.dev"));
    await send(makeFromMessage("https://qrdx.dev"));
    expect(state.keys).toEqual([
      "discord-bot:user:u_guild",
      "discord-bot:user:u_dm",
    ]);
  });

  it("tells the user privately when they're over the limit", async () => {
    state.allow = false;
    try {
      const { status, body } = await send(qr("https://qrdx.dev"));
      expect(status).toBe(200);
      expect(body.data).toMatchObject({
        content: NOTICES.rateLimited,
        flags: EPHEMERAL,
      });
      expect(body.data.embeds).toBeUndefined();
    } finally {
      state.allow = true;
    }
  });

  it("doesn't rate limit PINGs", async () => {
    state.keys.length = 0;
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
