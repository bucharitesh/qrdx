// The QRdx Telegram bot (lib/chat-bots/telegram): the webhook checks
// Telegram's secret before it reads anything, answers 200 at once and replies
// through the Bot API after the response. fetch is a fake that records each
// Bot API call: nothing reaches Telegram. The rate limiters run in memory
// with their real windows.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "123456:fake-token-for-tests";
const SECRET = "fake_webhook_secret-1";
const USERNAME = "QRdxTestBot";

const state = vi.hoisted(() => {
  process.env.TELEGRAM_BOT_TOKEN = "123456:fake-token-for-tests";
  process.env.TELEGRAM_WEBHOOK_SECRET = "fake_webhook_secret-1";
  process.env.TELEGRAM_BOT_USERNAME = "@QRdxTestBot";
  return {
    pending: [] as Promise<unknown>[],
    /** Bumped per test: every limiter starts empty again */
    generation: 0,
    keys: [] as string[],
  };
});

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => Promise<unknown>) => {
    state.pending.push(Promise.resolve().then(task));
  },
}));
vi.mock("@repo/rate-limit", async () => {
  const { createMemoryLimiter, parseDuration } = await import(
    "@repo/rate-limit/fallback"
  );
  return {
    slidingWindow: (tokens: number, window: string) => ({
      tokens,
      windowMs: parseDuration(window),
    }),
    createRateLimiter: ({
      limiter,
    }: {
      limiter: { tokens: number; windowMs: number };
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
          return memory.limit(key);
        },
      };
    },
  };
});

import { GET as open } from "@/app/api/integrations/telegram/open/route";
import { POST } from "@/app/api/integrations/telegram/webhook/route";
import { CHAT_QR_PNG_SIZE, chatQrLinks } from "@/lib/chat-bots/qr-reply";
import {
  RATE_LIMITED_TEXT,
  readCommand,
  TOO_LONG_TEXT,
} from "@/lib/chat-bots/telegram/replies";

interface ApiCall {
  url: string;
  method: string;
  payload: Record<string, any>;
}

let calls: ApiCall[] = [];
/** What the fake Bot API answers, by method; ok with `true` otherwise. */
let failures: Record<string, { status: number; description: string }> = {};
let consoleLines: string[] = [];

beforeEach(() => {
  calls = [];
  failures = {};
  consoleLines = [];
  state.generation += 1;
  state.keys = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const method = url.split("/").at(-1) ?? "";
      calls.push({ url, method, payload: JSON.parse(String(init?.body)) });
      const failure = failures[method];
      return failure
        ? Response.json(
            {
              ok: false,
              error_code: failure.status,
              description: failure.description,
            },
            { status: failure.status },
          )
        : Response.json({ ok: true, result: true });
    }),
  );
  for (const level of ["log", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      consoleLines.push(JSON.stringify(args));
    });
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

let updateId = 1;

async function post(
  body: unknown,
  headers: Record<string, string> = {
    "x-telegram-bot-api-secret-token": SECRET,
  },
) {
  const response = await POST(
    new Request("http://localhost:3000/api/integrations/telegram/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
  await Promise.all(state.pending.splice(0));
  return response;
}

const PERSON = { id: 1001, is_bot: false, first_name: "Ada" };

function privateMessage(text?: string, extra: Record<string, unknown> = {}) {
  return {
    update_id: updateId++,
    message: {
      message_id: 42,
      date: 1_700_000_000,
      chat: { id: 777, type: "private", first_name: "Ada" },
      from: PERSON,
      ...(text === undefined ? {} : { text }),
      ...extra,
    },
  };
}

function groupMessage(text: string, from = { ...PERSON, id: 1002 }) {
  return {
    update_id: updateId++,
    message: {
      message_id: 9,
      date: 1_700_000_000,
      chat: { id: -100_123, type: "supergroup", title: "Team" },
      from,
      text,
    },
  };
}

function inlineQuery(query: string, from = { ...PERSON, id: 1003 }) {
  return {
    update_id: updateId++,
    inline_query: { id: "inline-1", from, query, offset: "" },
  };
}

const only = (method: string) => {
  expect(calls.map((call) => call.method)).toEqual([method]);
  return calls[0]!.payload;
};

describe("webhook secret", () => {
  it("answers 401 without the secret, or with the wrong one, and reads nothing", async () => {
    const wrong: Record<string, string>[] = [
      {},
      { "x-telegram-bot-api-secret-token": "" },
      { "x-telegram-bot-api-secret-token": "fake_webhook_secret-2" },
      { "x-telegram-bot-api-secret-token": `${SECRET}x` },
    ];
    for (const headers of wrong) {
      const response = await post(privateMessage("https://qrdx.dev"), headers);
      expect(response.status).toBe(401);
    }
    // Checked before the body: not even unreadable JSON gets further.
    expect((await post("{not json", {})).status).toBe(401);
    expect(calls).toEqual([]);
    expect(state.keys).toEqual([]);
  });

  it("answers 200 at once with the right secret, then replies", async () => {
    const response = await post(privateMessage("https://qrdx.dev"));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      `https://api.telegram.org/bot${TOKEN}/sendPhoto`,
    );
  });
});

describe("private chat", () => {
  it("replies to a link with the code as a photo, its caption and buttons", async () => {
    const link = "https://qrdx.dev/pricing?plan=pro&period=year";
    await post(privateMessage(`  ${link}\n`));
    const payload = only("sendPhoto");
    const links = chatQrLinks(link);

    expect(payload.chat_id).toBe(777);
    expect(payload.reply_parameters).toEqual({
      message_id: 42,
      allow_sending_without_reply: true,
    });
    expect(payload.photo).toBe(links.png);
    const png = new URL(payload.photo);
    expect(png.origin).toBe("https://api.qrdx.dev");
    expect(png.searchParams.get("data")).toBe(link);
    expect(png.searchParams.get("format")).toBe("png");
    expect(png.searchParams.get("size")).toBe(String(CHAT_QR_PNG_SIZE));
    expect(payload.caption).toBe(link);
    expect(payload).not.toHaveProperty("parse_mode");
    expect(payload.reply_markup).toEqual({
      inline_keyboard: [
        [
          { text: "Download PNG", url: links.png },
          { text: "Download SVG", url: links.svg },
        ],
        [{ text: "Open in editor", url: links.editor }],
      ],
    });
  });

  it("encodes text exactly, line breaks included, and never puts it in the editor link", async () => {
    await post(privateMessage("Wi-Fi: Lobby\nPassword: tulip-4471"));
    const payload = only("sendPhoto");
    expect(new URL(payload.photo).searchParams.get("data")).toBe(
      "Wi-Fi: Lobby\nPassword: tulip-4471",
    );
    expect(payload.caption).toBe("Wi-Fi: Lobby Password: tulip-4471");
    const editor = payload.reply_markup.inline_keyboard[1][0].url as string;
    expect(editor).not.toContain("tulip");
  });

  it("takes /qr with the rest of the message, on the same line or the next", async () => {
    await post(privateMessage("/qr https://example.com/a"));
    await post(privateMessage("/qr\nhello there"));
    expect(calls.map((call) => call.method)).toEqual([
      "sendPhoto",
      "sendPhoto",
    ]);
    expect(calls.map((call) => call.payload.caption)).toEqual([
      "https://example.com/a",
      "hello there",
    ]);
  });

  it("sends help for /start, /help, an empty /qr, other commands and non-text messages", async () => {
    for (const update of [
      privateMessage("/start"),
      privateMessage("/start help"),
      privateMessage("/help"),
      privateMessage("/qr"),
      privateMessage("/qr   "),
      privateMessage("/settings"),
      privateMessage(undefined, { sticker: { file_id: "x" } }),
    ]) {
      await post(update);
    }
    expect(calls).toHaveLength(7);
    for (const call of calls) {
      expect(call.method).toBe("sendMessage");
      expect(call.payload.text).toContain(`type @${USERNAME} and a link`);
      expect(call.payload.text).toContain(`/qr@${USERNAME}`);
      expect(call.payload.reply_parameters.message_id).toBe(42);
      expect(call.payload).not.toHaveProperty("parse_mode");
    }
  });

  it("explains when the content is too long for a QR code", async () => {
    await post(privateMessage("é".repeat(1500)));
    await post(privateMessage(`/qr ${"a".repeat(3000)}`));
    expect(calls.map((call) => call.payload.text)).toEqual([
      TOO_LONG_TEXT,
      TOO_LONG_TEXT,
    ]);
  });

  it("sends the links instead when Telegram can't use the image", async () => {
    failures.sendPhoto = {
      status: 400,
      description: "Bad Request: wrong file identifier/HTTP URL specified",
    };
    await post(privateMessage("https://qrdx.dev"));
    expect(calls.map((call) => call.method)).toEqual([
      "sendPhoto",
      "sendMessage",
    ]);
    const fallback = calls[1]!.payload;
    expect(fallback.text).toContain("https://qrdx.dev");
    expect(fallback.reply_markup).toEqual(calls[0]!.payload.reply_markup);
  });

  it("stays quiet when the person blocked the bot, and never logs the token or the text", async () => {
    failures.sendPhoto = {
      status: 403,
      description: "Forbidden: bot was blocked by the user",
    };
    await post(privateMessage("https://secret.example/private-path"));
    expect(consoleLines).toEqual([]);

    failures.sendPhoto = { status: 500, description: "Internal Server Error" };
    await post(privateMessage("https://secret.example/private-path"));
    expect(consoleLines.length).toBeGreaterThan(0);
    const logged = consoleLines.join("\n");
    expect(logged).toContain("sendPhoto");
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain("private-path");
  });
});

describe("groups", () => {
  it("answers /qr@<this bot> (any case) and plain /qr", async () => {
    await post(groupMessage(`/qr@${USERNAME} https://example.com/menu`));
    await post(groupMessage("/qr@qrdxtestbot Table 4"));
    await post(groupMessage("/qr https://example.com/b"));
    expect(calls.map((call) => call.method)).toEqual([
      "sendPhoto",
      "sendPhoto",
      "sendPhoto",
    ]);
    expect(calls.map((call) => call.payload.caption)).toEqual([
      "https://example.com/menu",
      "Table 4",
      "https://example.com/b",
    ]);
    expect(calls[0]!.payload.chat_id).toBe(-100_123);
    expect(calls[0]!.payload.reply_parameters.message_id).toBe(9);
  });

  it("answers /start@<this bot> and /help with help", async () => {
    await post(groupMessage(`/start@${USERNAME} help`));
    await post(groupMessage("/help"));
    expect(calls.map((call) => call.method)).toEqual([
      "sendMessage",
      "sendMessage",
    ]);
  });

  it("ignores other bots' commands, unknown commands and plain messages", async () => {
    for (const text of [
      "/qr@SomeOtherBot https://example.com",
      "/poll lunch?",
      "https://example.com",
      `thanks @${USERNAME}`,
    ]) {
      expect((await post(groupMessage(text))).status).toBe(200);
    }
    expect(calls).toEqual([]);
  });
});

describe("updates the bot ignores", () => {
  it("acknowledges them without calling Telegram", async () => {
    const ignored = [
      { update_id: updateId++, edited_message: privateMessage("x").message },
      { update_id: updateId++, channel_post: groupMessage("/qr x").message },
      {
        update_id: updateId++,
        callback_query: { id: "c", from: PERSON, data: "x" },
      },
      {
        update_id: updateId++,
        chosen_inline_result: { result_id: "r", from: PERSON, query: "x" },
      },
      privateMessage("https://qrdx.dev", {
        from: { id: 5, is_bot: true, first_name: "Other" },
      }),
      privateMessage(undefined, {
        via_bot: { id: 6, is_bot: true, first_name: "QRdx" },
        photo: [],
      }),
      {
        update_id: updateId++,
        message: {
          ...groupMessage("/qr x").message,
          chat: { id: -5, type: "channel" },
        },
      },
      { not: "an update" },
    ];
    for (const update of ignored) {
      expect((await post(update)).status).toBe(200);
    }
    expect((await post("{not json")).status).toBe(200);
    expect((await post(`"${"x".repeat(70_000)}"`)).status).toBe(200);
    expect(calls).toEqual([]);
  });
});

describe("inline mode", () => {
  it("answers with the code as one JPEG photo result", async () => {
    const link = "https://qrdx.dev/pricing";
    await post(inlineQuery(link));
    const payload = only("answerInlineQuery");
    expect(payload).toMatchObject({
      inline_query_id: "inline-1",
      cache_time: 60,
      is_personal: false,
    });
    expect(payload.results).toHaveLength(1);
    const [result] = payload.results;
    expect(result).toMatchObject({
      type: "photo",
      photo_width: CHAT_QR_PNG_SIZE,
      photo_height: CHAT_QR_PNG_SIZE,
      title: "QR code",
      description: link,
      caption: link,
    });
    expect(result.id).toMatch(/^[0-9a-f]{32}$/);
    expect(result).not.toHaveProperty("parse_mode");

    // The Bot API takes only JPEG here: the bot's own photo route, which
    // local dev and previews point at qrdx.dev (like the image API links).
    const photo = new URL(result.photo_url);
    expect(photo.origin + photo.pathname).toBe(
      "https://qrdx.dev/api/integrations/telegram/photo",
    );
    expect(photo.searchParams.get("data")).toBe(link);
    expect(photo.searchParams.get("size")).toBe(String(CHAT_QR_PNG_SIZE));
    const thumb = new URL(result.thumbnail_url);
    expect(thumb.pathname).toBe(photo.pathname);
    expect(thumb.searchParams.get("data")).toBe(link);
    expect(thumb.searchParams.get("size")).toBe("256");

    const links = chatQrLinks(link);
    expect(result.reply_markup.inline_keyboard.flat()).toEqual([
      { text: "Download PNG", url: links.png },
      { text: "Download SVG", url: links.svg },
      { text: "Open in editor", url: links.editor },
    ]);
  });

  it("gives the same text the same result id", async () => {
    await post(inlineQuery("hello"));
    await post(inlineQuery("  hello "));
    await post(inlineQuery("hello!"));
    const ids = calls.map((call) => call.payload.results[0].id);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[0]);
  });

  it("answers an empty or too-long query with no results and a help button", async () => {
    await post(inlineQuery("   "));
    await post(inlineQuery("é".repeat(1500)));
    expect(calls.map((call) => call.method)).toEqual([
      "answerInlineQuery",
      "answerInlineQuery",
    ]);
    const [empty, tooLong] = calls.map((call) => call.payload);
    expect(empty!.results).toEqual([]);
    expect(empty!.button).toEqual({
      text: "Type a link or text to make a QR code",
      start_parameter: "help",
    });
    expect(tooLong!.results).toEqual([]);
    expect(tooLong!.button.text).toBe("Too long for one QR code");
  });
});

describe("rate limits", () => {
  it("allows 20 messages a minute per person, then says so once and goes quiet", async () => {
    for (let i = 0; i < 20; i++) await post(privateMessage(`code ${i}`));
    expect(calls.every((call) => call.method === "sendPhoto")).toBe(true);
    expect(calls).toHaveLength(20);

    await post(privateMessage("one more"));
    await post(privateMessage("and another"));
    expect(calls.slice(20).map((call) => call.payload.text)).toEqual([
      RATE_LIMITED_TEXT,
    ]);
    expect(state.keys).toContain("telegram-bot:message:1001");

    // Someone else in the same chat isn't held back.
    await post(groupMessage("/qr fine", { ...PERSON, id: 2002 }));
    expect(calls.at(-1)!.method).toBe("sendPhoto");
  });

  it("allows 60 inline queries a minute per person, then answers with a personal notice", async () => {
    for (let i = 0; i < 60; i++) await post(inlineQuery(`q${i}`));
    expect(calls.every((call) => call.payload.results.length === 1)).toBe(true);

    await post(inlineQuery("q60"));
    const last = calls.at(-1)!.payload;
    expect(last.results).toEqual([]);
    expect(last.is_personal).toBe(true);
    expect(last.button.text).toBe("Too many codes. Try again in a minute");
    expect(state.keys).toContain("telegram-bot:inline:1003");
  });
});

describe("reading commands", () => {
  it("separates commands from text that only starts with a slash", () => {
    expect(readCommand("/qr hi", USERNAME)).toEqual({
      name: "qr",
      args: " hi",
    });
    expect(readCommand("/QR@qrdxtestbot\nhi", USERNAME)).toEqual({
      name: "qr",
      args: "\nhi",
    });
    expect(readCommand("/qr@OtherBot hi", USERNAME)).toBe("other-bot");
    expect(readCommand("/Users/ada/notes.txt", USERNAME)).toBeNull();
    expect(readCommand("/qrhi", USERNAME)).toEqual({ name: "qrhi", args: "" });
    expect(readCommand("see /qr", USERNAME)).toBeNull();
  });
});

describe("Open in Telegram", () => {
  it("redirects to the bot's t.me page, without the @", () => {
    const response = open();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`https://t.me/${USERNAME}`);
  });
});
