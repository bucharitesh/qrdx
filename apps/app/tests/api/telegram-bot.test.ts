// The QRdx Telegram bot (lib/chat-bots/telegram): the webhook checks
// Telegram's secret before it reads anything, answers 200 at once and replies
// through the Bot API after the response. fetch is a fake that records each
// Bot API call: nothing reaches Telegram. The rate limiters run in memory
// with their real windows, on a clock that stands still in the middle of a
// minute (a test that ran across a minute's end would see part of its count
// weighted away); a test can mark a key as used up (state.exhausted) to skip
// filling a big window.
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
    /** Keys whose window is full, without counting up to it */
    exhausted: new Set<string>(),
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
  /** 30 seconds into a minute. */
  const MID_MINUTE = Math.floor(Date.now() / 60_000) * 60_000 + 30_000;
  const clock = () => MID_MINUTE;
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
      let memory = createMemoryLimiter(limiter, clock);
      return {
        limit: async (key: string) => {
          if (generation !== state.generation) {
            generation = state.generation;
            memory = createMemoryLimiter(limiter, clock);
          }
          state.keys.push(key);
          if (state.exhausted.has(key)) {
            return { success: false, reset: Date.now() + 60_000 };
          }
          return memory.limit(key);
        },
      };
    },
  };
});

import { GET as open } from "@/app/api/integrations/telegram/open/route";
import { POST } from "@/app/api/integrations/telegram/webhook/route";
import {
  CHAT_QR_PNG_SIZE,
  chatQrLinks as plainLinks,
  withBotRef,
} from "@/lib/chat-bots/qr-reply";
import { TELEGRAM_GLOBAL_PER_MINUTE } from "@/lib/chat-bots/telegram/bot";
import { verifyPhotoLink } from "@/lib/chat-bots/telegram/photo-link";
import {
  BUSY_TEXT,
  CANT_RESTYLE_TEXT,
  NOT_YOURS_TEXT,
  RATE_LIMITED_TEXT,
  RESTYLE_FAILED_TEXT,
  readCommand,
  readStyleCallback,
  TOO_LONG_TEXT,
} from "@/lib/chat-bots/telegram/replies";
import { decodeStyleParam } from "@/lib/playground-style";

/** The bot's links: the editor's is tagged ref=telegram-bot. */
const chatQrLinks = (data: string) =>
  withBotRef(plainLinks(data), "telegram-bot");

interface ApiCall {
  url: string;
  method: string;
  payload: Record<string, any>;
}

/** The real fetch, for the renderer's own files. */
const realFetch = globalThis.fetch;

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
  state.exhausted.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      // The renderer loads its own files (the scan check renders codes).
      if (!url.startsWith("https://")) return realFetch(input, init);
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
        [
          { text: "Open in editor", url: links.editor },
          // The style buttons, for the person who asked (their Telegram id).
          { text: "Style", callback_data: "m:1001" },
        ],
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
    // Honest about where the content goes.
    const help = calls[0]!.payload.text as string;
    expect(help).toContain("QRdx doesn't save the codes you make.");
    expect(help).toContain("logs and caches");
    expect(help).not.toMatch(/keep what you send|nothing kept/i);
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
    // The same links; a text message has no photo to restyle.
    const links = chatQrLinks("https://qrdx.dev");
    expect(fallback.reply_markup).toEqual({
      inline_keyboard: [
        [
          { text: "Download PNG", url: links.png },
          { text: "Download SVG", url: links.svg },
        ],
        [{ text: "Open in editor", url: links.editor }],
      ],
    });
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

  it("only answers a button press that isn't one of the bot's, so it stops spinning", async () => {
    await post({
      update_id: updateId++,
      callback_query: { id: "c", from: PERSON, data: "x" },
    });
    expect(only("answerCallbackQuery")).toEqual({ callback_query_id: "c" });
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

    // Both links are signed with the webhook secret, expire together within
    // two hours, and only verify with that secret.
    expect(verifyPhotoLink(photo.searchParams, SECRET)).toMatchObject({
      data: link,
      size: CHAT_QR_PNG_SIZE,
    });
    expect(verifyPhotoLink(thumb.searchParams, SECRET)).toMatchObject({
      data: link,
      size: 256,
    });
    expect(verifyPhotoLink(photo.searchParams, `${SECRET}x`)).toBeNull();
    expect(thumb.searchParams.get("exp")).toBe(photo.searchParams.get("exp"));
    expect(thumb.searchParams.get("sig")).not.toBe(
      photo.searchParams.get("sig"),
    );
    const secondsLeft =
      Number(photo.searchParams.get("exp")) - Date.now() / 1000;
    expect(secondsLeft).toBeGreaterThan(3500);
    expect(secondsLeft).toBeLessThanOrEqual(7200);

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

describe("the bot-wide cap", () => {
  it(`answers ${TELEGRAM_GLOBAL_PER_MINUTE} messages and inline queries a minute from everyone together, then says it's busy`, async () => {
    // 20 people, each within their own limits: 10 messages and 5 inline
    // queries apiece.
    for (let person = 0; person < 20; person++) {
      const from = { ...PERSON, id: 5000 + person };
      for (let i = 0; i < 10; i++) {
        await post(groupMessage(`/qr code ${person}-${i}`, from));
      }
      for (let i = 0; i < 5; i++) {
        await post(inlineQuery(`q ${person}-${i}`, from));
      }
    }
    expect(calls).toHaveLength(TELEGRAM_GLOBAL_PER_MINUTE);
    expect(calls.filter((call) => call.method === "sendPhoto")).toHaveLength(
      200,
    );
    expect(
      calls.filter((call) => call.payload.results?.length === 1),
    ).toHaveLength(100);

    // Someone new, well within their own limits, now gets "busy".
    const newcomer = { ...PERSON, id: 9001 };
    await post(groupMessage("/qr one more", newcomer));
    expect(calls.at(-1)!.method).toBe("sendMessage");
    expect(calls.at(-1)!.payload.text).toBe(BUSY_TEXT);
    await post(inlineQuery("one more", newcomer));
    const inline = calls.at(-1)!.payload;
    expect(inline.results).toEqual([]);
    expect(inline.button.text).toBe(BUSY_TEXT);
    expect(inline.cache_time).toBeLessThanOrEqual(10);
    expect(inline.is_personal).toBe(false);
  });

  it("says busy once a minute per person in chats, and checks each person's own limit first", async () => {
    state.exhausted.add("telegram-bot:global");
    await post(privateMessage("https://qrdx.dev"));
    await post(privateMessage("https://qrdx.dev/again"));
    await post(groupMessage("/qr https://qrdx.dev", { ...PERSON, id: 2002 }));
    expect(calls.map((call) => [call.method, call.payload.text])).toEqual([
      ["sendMessage", BUSY_TEXT],
      ["sendMessage", BUSY_TEXT],
    ]);
    expect(calls.map((call) => call.payload.chat_id)).toEqual([777, -100_123]);

    // Over their own limit: told that, and the bot-wide count isn't touched.
    state.exhausted.add("telegram-bot:message:3003");
    state.keys = [];
    await post(groupMessage("/qr x", { ...PERSON, id: 3003 }));
    expect(state.keys).toEqual([
      "telegram-bot:message:3003",
      "telegram-bot:notice:3003",
    ]);
    expect(calls.at(-1)!.payload.text).toBe(RATE_LIMITED_TEXT);

    state.exhausted.add("telegram-bot:inline:3003");
    state.keys = [];
    await post(inlineQuery("x", { ...PERSON, id: 3003 }));
    expect(state.keys).toEqual(["telegram-bot:inline:3003"]);
    expect(calls.at(-1)!.payload.button.text).toBe(
      "Too many codes. Try again in a minute",
    );
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

describe("styles", () => {
  /** The style value of an image link, decoded. */
  const styleOf = (link: string) =>
    decodeStyleParam(new URL(link).searchParams.get("style"));
  const pngOf = (keyboard: { inline_keyboard: Json[][] }) =>
    keyboard.inline_keyboard
      .flat()
      .find((button) => button.text === "Download PNG")?.url as string;

  type Json = Record<string, any>;

  /** The bot's photo reply to `text` from PERSON, as the chat now shows it. */
  async function photoFor(text: string) {
    await post(privateMessage(text));
    const payload = only("sendPhoto");
    calls = [];
    return {
      message_id: 50,
      chat: { id: 777, type: "private" },
      reply_markup: payload.reply_markup as { inline_keyboard: Json[][] },
    };
  }

  /** A press of the button with `data` under `message`. */
  const press = (
    message: Awaited<ReturnType<typeof photoFor>>,
    data: string,
    from = PERSON,
  ) => ({
    update_id: updateId++,
    callback_query: { id: "cb-1", from, data, chat_instance: "x", message },
  });

  const methods = () => calls.map((call) => call.method);

  it("styles a code with options typed after the content, scan-checked", async () => {
    await post(privateMessage("qrdx.dev --look royal --logo wifi"));
    const payload = only("sendPhoto");
    const photo = new URL(payload.photo);
    expect(photo.searchParams.get("data")).toBe("https://qrdx.dev");
    expect(photo.searchParams.get("logoIcon")).toBe("wifi");
    expect(styleOf(payload.photo)?.preset).toBe("royal");
    expect(payload.caption).toBe("https://qrdx.dev");
    // Open in editor opens the same design.
    const editor = payload.reply_markup.inline_keyboard[1][0];
    expect(new URL(editor.url).searchParams.get("style")).toBe(
      photo.searchParams.get("style"),
    );
  });

  it("says what's wrong with an option, and where to see them all", async () => {
    await post(privateMessage("/qr qrdx.dev --frame cloud"));
    const payload = only("sendMessage");
    expect(payload.text).toMatch(/no frame "cloud".*banner-bottom/);
    expect(payload.text).toMatch(/\/help/);
  });

  it("Style opens Look, Color, Frame and Logo, and each opens its options", async () => {
    const message = await photoFor("https://qrdx.dev");
    await post(press(message, "m:1001"));
    expect(methods()).toEqual([
      "editMessageReplyMarkup",
      "answerCallbackQuery",
    ]);
    const menu = calls[0]!.payload;
    expect(menu).toMatchObject({ chat_id: 777, message_id: 50 });
    expect(menu.reply_markup.inline_keyboard).toEqual([
      [
        { text: "Look", callback_data: "k:l:1001" },
        { text: "Color", callback_data: "k:c:1001" },
        { text: "Frame", callback_data: "k:f:1001" },
        { text: "Logo", callback_data: "k:i:1001" },
      ],
      [
        { text: "Download PNG", url: pngOf(message.reply_markup) },
        { text: "Done", callback_data: "d:1001" },
      ],
    ]);
    expect(calls[1]!.payload).toEqual({ callback_query_id: "cb-1" });

    calls = [];
    await post(
      press({ ...message, reply_markup: menu.reply_markup }, "k:l:1001"),
    );
    const looks = calls[0]!.payload.reply_markup.inline_keyboard as Json[][];
    // Three to a row, the current one ticked, then Download PNG and Back.
    expect(looks[0]!.map((button) => button.text)).toEqual([
      "✓ Plain",
      "Classic",
      "Modern",
    ]);
    expect(looks[0]![1]!.callback_data).toBe("l:classic:1001");
    expect(looks.at(-1)!.map((button) => button.text)).toEqual([
      "Download PNG",
      "Back",
    ]);
  });

  it("an option redraws the photo for the person who asked, and keeps its options open", async () => {
    const message = await photoFor("Table 4");
    await post(press(message, "l:royal:1001"));
    expect(methods()).toEqual(["editMessageMedia", "answerCallbackQuery"]);
    const edit = calls[0]!.payload;
    expect(edit).toMatchObject({ chat_id: 777, message_id: 50 });
    expect(edit.media.type).toBe("photo");
    expect(new URL(edit.media.media).searchParams.get("data")).toBe("Table 4");
    expect(styleOf(edit.media.media)?.preset).toBe("royal");
    expect(edit.media.caption).toBe("Table 4");
    const rows = edit.reply_markup.inline_keyboard as Json[][];
    expect(rows.flat().find((b) => b.text.startsWith("✓"))?.text).toBe(
      "✓ Royal",
    );
    expect(pngOf(edit.reply_markup)).toBe(edit.media.media);
    // A restyle counts like a message, for the person and for everyone.
    expect(state.keys).toEqual(
      expect.arrayContaining([
        "telegram-bot:message:1001",
        "telegram-bot:global",
      ]),
    );

    // The next option builds on it.
    calls = [];
    await post(
      press(
        { ...message, reply_markup: edit.reply_markup },
        "f:banner-top:1001",
      ),
    );
    const again = calls[0]!.payload;
    expect(styleOf(again.media.media)).toMatchObject({
      preset: "royal",
      styles: { frame: { style: "banner-top" } },
    });
  });

  it("in a group, someone else's press only gets a note", async () => {
    const message = await photoFor("https://qrdx.dev");
    await post(press(message, "l:royal:1001", { ...PERSON, id: 2002 }));
    expect(only("answerCallbackQuery")).toEqual({
      callback_query_id: "cb-1",
      text: NOT_YOURS_TEXT,
    });
  });

  it("restyles count toward the same limits as messages", async () => {
    const message = await photoFor("https://qrdx.dev");
    state.exhausted.add("telegram-bot:message:1001");
    await post(press(message, "l:retro:1001"));
    expect(only("answerCallbackQuery").text).toBe(RATE_LIMITED_TEXT);

    calls = [];
    state.exhausted.clear();
    state.exhausted.add("telegram-bot:global");
    await post(press(message, "l:retro:1001"));
    expect(only("answerCallbackQuery").text).toBe(BUSY_TEXT);
  });

  it("says so when Telegram can't load the new image, or the code can't be read back", async () => {
    const message = await photoFor("https://qrdx.dev");
    failures.editMessageMedia = {
      status: 400,
      description: "Bad Request: wrong file identifier/HTTP URL specified",
    };
    await post(press(message, "c:blue:1001"));
    expect(calls.at(-1)!.payload.text).toBe(RESTYLE_FAILED_TEXT);

    calls = [];
    const foreign = {
      ...message,
      reply_markup: {
        inline_keyboard: [
          [{ text: "Download PNG", url: "https://evil.example/qr?data=x" }],
        ],
      },
    };
    await post(press(foreign, "c:blue:1001"));
    expect(only("answerCallbackQuery").text).toBe(CANT_RESTYLE_TEXT);
  });

  it("keeps every button's data within Telegram's 64 bytes", () => {
    const big = 9_007_199_254_740_991;
    for (const data of [
      `m:${big}`,
      `k:f:${big}`,
      `f:banner-bottom:${big}`,
      `i:instagram:${big}`,
      `l:bordeaux:${big}`,
    ]) {
      expect(new TextEncoder().encode(data).length).toBeLessThanOrEqual(64);
      expect(readStyleCallback(data)).not.toBeNull();
    }
    for (const data of ["l:neon:1", "z:x:1", "m:abc", "m:-1", "l:royal", ""]) {
      expect(readStyleCallback(data), data).toBeNull();
    }
  });

  it("styles inline results with typed options, through signed photo links", async () => {
    const plain = { ...inlineQuery("https://qrdx.dev") };
    await post(plain);
    await post(
      inlineQuery("https://qrdx.dev --frame banner-bottom --logo link"),
    );
    const [first, styled] = calls.map((call) => call.payload.results[0]);
    expect(styled.id).not.toBe(first.id);
    const photo = new URL(styled.photo_url);
    expect(photo.searchParams.get("logoIcon")).toBe("link");
    expect(
      decodeStyleParam(photo.searchParams.get("style"))?.styles.frame,
    ).toMatchObject({
      style: "banner-bottom",
    });
    // The design is signed with the content.
    expect(verifyPhotoLink(photo.searchParams, SECRET)).toMatchObject({
      data: "https://qrdx.dev",
      logoIcon: "link",
      style: photo.searchParams.get("style"),
    });
    // A frame changes the picture's size, so it isn't given.
    expect(styled).not.toHaveProperty("photo_width");
    // No message to edit before it's sent: no Style button.
    expect(JSON.stringify(styled.reply_markup)).not.toContain("callback_data");

    calls = [];
    await post(inlineQuery("https://qrdx.dev --look"));
    const none = only("answerInlineQuery");
    expect(none.results).toEqual([]);
    expect(none.button.text).toBe(
      "Check the options after the link. Tap for help",
    );
  });

  it("the help lists the options", async () => {
    await post(privateMessage("/help"));
    const text = only("sendMessage").text as string;
    for (const flag of ["--look", "--fg", "--frame-text", "--logo", "Style"]) {
      expect(text).toContain(flag);
    }
  });
});

describe("Open in Telegram", () => {
  it("redirects to the bot's t.me page, without the @", () => {
    const response = open();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`https://t.me/${USERNAME}`);
  });
});
