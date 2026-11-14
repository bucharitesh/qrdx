// Styles in the Discord app: /qr's look, color and frame options, and the
// Look, Color, Frame and Logo menus under a code. A styled code is
// scan-checked first, so the endpoint answers "thinking" (type 5, or 6 for a
// menu pick) and the code follows through the interaction's webhook, which a
// fake fetch records. Signatures are real (a key pair made here), the
// limiters run in memory with their real windows, and nothing reaches
// Discord or a database.
import { sign } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const crypto = process.getBuiltinModule("node:crypto");
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const jwk = publicKey.export({ format: "jwk" });
  process.env.DISCORD_APPLICATION_ID = "112233445566778899";
  process.env.DISCORD_PUBLIC_KEY = Buffer.from(
    jwk.x as string,
    "base64url",
  ).toString("hex");
  return {
    privateKey,
    allow: true,
    keys: [] as string[],
    generation: 0,
    tasks: [] as Promise<unknown>[],
  };
});

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    state.tasks.push(Promise.resolve().then(task));
  },
}));

vi.mock("@repo/rate-limit", async () => {
  const { createMemoryLimiter, parseDuration } = await import(
    "@repo/rate-limit/fallback"
  );
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
      let generation = -1;
      let memory = createMemoryLimiter(limiter);
      return {
        limit: async (key: string) => {
          if (generation !== state.generation) {
            generation = state.generation;
            memory = createMemoryLimiter(limiter);
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

const { POST } = await import(
  "@/app/api/integrations/discord/interactions/route"
);
const { EPHEMERAL, NOTICES } = await import(
  "@/lib/chat-bots/discord/interactions"
);
const { decodeStyleParam } = await import("@/lib/playground-style");

/** The real fetch, for the renderer's own files. */
const realFetch = globalThis.fetch;
let edits: { url: string; method: string; body: Json }[] = [];

beforeEach(() => {
  state.generation += 1;
  state.keys.length = 0;
  state.allow = true;
  state.tasks = [];
  edits = [];
  vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith("https://")) return realFetch(input, init);
    edits.push({
      url,
      method: String(init?.method),
      body: JSON.parse(String(init?.body)),
    });
    return Response.json({ id: "m1" });
  });
});

type Json = Record<string, any>;

const ENDPOINT = "http://localhost/api/integrations/discord/interactions";
const APP = "112233445566778899";
const TOKEN = "aW50ZXJhY3Rpb246MTIzNDU2Nzg5OmZha2UtdG9rZW4";
const ANA = "200000000000000001";
const EVE = "300000000000000002";

async function send(payload: unknown) {
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = sign(
    null,
    Buffer.from(timestamp + body),
    state.privateKey,
  ).toString("hex");
  const response = await POST(
    new Request(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-signature-ed25519": signature,
        "x-signature-timestamp": timestamp,
      },
      body,
    }),
  );
  while (state.tasks.length > 0) await Promise.all(state.tasks.splice(0));
  return { status: response.status, body: (await response.json()) as Json };
}

const qr = (
  content: string,
  options: Record<string, string | boolean> = {},
  user = ANA,
) => ({
  type: 2,
  token: TOKEN,
  member: { user: { id: user } },
  data: {
    type: 1,
    name: "qr",
    options: [
      { name: "content", type: 3, value: content },
      ...Object.entries(options).map(([name, value]) => ({
        name,
        type: typeof value === "boolean" ? 5 : 3,
        value,
      })),
    ],
  },
});

/** A pick in the `picker` menu of `message`, by `user`. */
const pick = (message: Json, picker: string, value: string, user = ANA) => {
  const menu = (message.components as Json[])
    .flatMap((row) => row.components)
    .find((component) => component.custom_id?.startsWith(`qrdx_${picker}:`));
  return {
    type: 3,
    token: TOKEN,
    member: { user: { id: user } },
    message: {
      id: "m1",
      embeds: message.embeds,
      components: message.components,
    },
    data: { custom_id: menu?.custom_id, component_type: 3, values: [value] },
  };
};

const imageOf = (message: Json) => new URL(message.embeds[0].image.url);
const styleOf = (message: Json) =>
  decodeStyleParam(imageOf(message).searchParams.get("style"));
const menusOf = (message: Json) =>
  (message.components as Json[])
    .flatMap((row) => row.components)
    .filter((component) => component.type === 3);

describe("/qr", () => {
  it("replies at once to a plain code, with Look, Color, Frame and Logo menus for the person who ran it", async () => {
    const { body } = await send(qr("https://qrdx.dev"));
    expect(body.type).toBe(4);
    expect(imageOf(body.data).searchParams.has("style")).toBe(false);
    const menus = menusOf(body.data);
    expect(menus.map((menu) => [menu.custom_id, menu.placeholder])).toEqual([
      [`qrdx_look:${ANA}`, "Look"],
      [`qrdx_color:${ANA}`, "Color"],
      [`qrdx_frame:${ANA}`, "Frame"],
      [`qrdx_logo:${ANA}`, "Logo"],
    ]);
    // One row of buttons and one row per menu: Discord's five.
    expect(body.data.components).toHaveLength(5);
    expect(edits).toEqual([]);
  });

  it("with look, color or frame, says it's thinking, then edits in the scan-checked code", async () => {
    const { body } = await send(
      qr("https://qrdx.dev", {
        look: "modern",
        color: "blue",
        frame: "banner-bottom",
      }),
    );
    expect(body).toEqual({ type: 5 });
    expect(edits).toHaveLength(1);
    const edit = edits[0]!;
    expect(edit.method).toBe("PATCH");
    expect(edit.url).toBe(
      `https://discord.com/api/v10/webhooks/${APP}/${TOKEN}/messages/@original`,
    );
    expect(edit.body.allowed_mentions).toEqual({ parse: [] });
    expect(styleOf(edit.body)).toMatchObject({
      preset: "modern",
      styles: {
        fgColor: "#1E40AF",
        bgColor: "#FFFFFF",
        frame: { style: "banner-bottom" },
      },
    });
    // Open in editor carries the whole design.
    const editor = (edit.body.components[0].components as Json[]).find(
      (button) => button.label === "Open in editor",
    );
    expect(new URL(editor?.url).searchParams.get("style")).toBe(
      imageOf(edit.body).searchParams.get("style"),
    );
    expect(menusOf(edit.body)).toHaveLength(4);
  });

  it("keeps a private styled code private", async () => {
    const { body } = await send(
      qr("door code 4471", { look: "royal", private: true }),
    );
    expect(body).toEqual({ type: 5, data: { flags: EPHEMERAL } });
    // Visibility comes from the deferred response; the edit can't set it.
    expect(edits[0]?.body).not.toHaveProperty("flags");
    expect(edits[0]?.body.embeds[0].title).toBe("door code 4471");
  });

  it("answers plainly when the options add up to the plain code", async () => {
    const { body } = await send(
      qr("https://qrdx.dev", { look: "plain", frame: "none" }),
    );
    expect(body.type).toBe(4);
    expect(edits).toEqual([]);
  });
});

describe("the style menus", () => {
  it("a pick redraws the code in place for the person who made it", async () => {
    const { body: made } = await send(qr("Table 4"));
    const { body } = await send(pick(made.data, "look", "royal"));
    expect(body).toEqual({ type: 6 });
    const edit = edits[0]!;
    expect(edit.url).toContain(`/webhooks/${APP}/${TOKEN}/messages/@original`);
    expect(imageOf(edit.body).searchParams.get("data")).toBe("Table 4");
    expect(styleOf(edit.body)?.preset).toBe("royal");
    expect(menusOf(edit.body)[0]?.custom_id).toBe(`qrdx_look:${ANA}`);
    // Text never goes in the editor link; the design does.
    const editor = (edit.body.components[0].components as Json[]).find(
      (button) => button.label === "Open in editor",
    );
    expect(editor?.url).not.toContain("Table");
    expect(new URL(editor?.url).searchParams.has("style")).toBe(true);

    // The next pick builds on it.
    edits = [];
    await send(pick(edit.body, "logo", "location"));
    expect(imageOf(edits[0]?.body).searchParams.get("logoIcon")).toBe(
      "location",
    );
    expect(styleOf(edits[0]?.body)?.preset).toBe("royal");
  });

  it("someone else's pick gets a note only they see, and changes nothing", async () => {
    const { body: made } = await send(qr("https://qrdx.dev"));
    const { body } = await send(pick(made.data, "color", "red", EVE));
    expect(body).toEqual({
      type: 4,
      data: {
        content: NOTICES.notYours,
        flags: EPHEMERAL,
        allowed_mentions: { parse: [] },
      },
    });
    expect(edits).toEqual([]);
  });

  it("can't restyle a code whose image it didn't make, or an option it doesn't offer", async () => {
    const { body: made } = await send(qr("https://qrdx.dev"));
    const foreign = {
      ...made.data,
      embeds: [{ image: { url: "https://evil.example/qr?data=x" } }],
    };
    for (const payload of [
      pick(foreign, "look", "retro"),
      pick(made.data, "look", "neon"),
      {
        ...pick(made.data, "look", "retro"),
        data: { custom_id: "other", values: ["retro"] },
      },
    ]) {
      const { body } = await send(payload);
      expect(body.data.content).toBe(NOTICES.cantRestyle);
    }
    expect(edits).toEqual([]);
  });

  it("picks count toward the same limits as /qr", async () => {
    const { body: made } = await send(qr("https://qrdx.dev"));
    state.keys.length = 0;
    await send(pick(made.data, "look", "retro"));
    expect(state.keys).toEqual([
      `discord-bot:user:${ANA}`,
      "discord-bot:global",
    ]);
    state.allow = false;
    const { body } = await send(pick(made.data, "look", "folio"));
    expect(body.data.content).toBe(NOTICES.rateLimited);
  });

  it("writes the error, never the content, when the edit fails", async () => {
    const lines: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      lines.push(JSON.stringify(args));
    });
    vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) =>
      String(input).startsWith("https://")
        ? new Response("no", { status: 404 })
        : realFetch(input, init),
    );
    await send(qr("secret-menu-path", { look: "retro" }));
    expect(lines.join("\n")).toContain("discord-bot.edit_failed");
    expect(lines.join("\n")).not.toContain("secret-menu-path");
    expect(lines.join("\n")).not.toContain(TOKEN);
    vi.restoreAllMocks();
  });
});
