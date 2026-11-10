#!/usr/bin/env node
// Sets up the QRdx Telegram bot through the Bot API: checks the token belongs
// to TELEGRAM_BOT_USERNAME, points the bot's webhook at your QRdx server,
// and sets its commands and descriptions. Then it lists the BotFather steps
// the API can't do. Node 22, no dependencies. Steps: ../README.md.
//
//   node --env-file=<file with the TELEGRAM_* values> plugins/telegram/scripts/setup.mjs --app-url https://qrdx.dev
//   node --env-file=<file> plugins/telegram/scripts/setup.mjs --remove
//
// Reads TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_BOT_USERNAME and
// the app URL (--app-url, else NEXT_PUBLIC_APP_URL). It never prints the
// token or the secret.

import { pathToFileURL } from "node:url";

export const WEBHOOK_PATH = "/api/integrations/telegram/webhook";

/** Only what the bot answers (app/api/integrations/telegram/webhook). */
export const ALLOWED_UPDATES = ["message", "inline_query"];

/** The command menu. Descriptions: 1-256 characters. */
export const COMMANDS = [
  { command: "qr", description: "Make a QR code from a link or text" },
  { command: "help", description: "How to use the bot" },
  { command: "start", description: "How to use the bot" },
];

/** On the bot's profile and its empty chat: 0-512 characters. */
export const DESCRIPTION = [
  "Send me a link or some text and I'll reply with its QR code, ready to download as PNG or SVG.",
  "In any chat, type my username followed by a link to send a code there. In groups, use /qr followed by a link or text.",
  "Made by QRdx. Nothing you send is kept.",
].join("\n\n");

/** Shown on the profile and when the bot is shared: 0-120 characters. */
export const SHORT_DESCRIPTION =
  "QR codes for links and text, in any Telegram chat. Made by QRdx.";

/** What BotFather's /setinline asks for: the hint in the message field. */
export const INLINE_PLACEHOLDER = "link or text";

const SECRET = /^[A-Za-z0-9_-]{1,256}$/;
const USERNAME = /^[A-Za-z0-9_]{2,29}bot$/i;

/**
 * The settings from the environment and arguments. Throws one error that
 * names everything missing or malformed (names only, never values).
 */
export function readSettings(env, argv) {
  const problems = [];
  const token = env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  const secret = env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? "";
  const username = (env.TELEGRAM_BOT_USERNAME?.trim() ?? "").replace(/^@/, "");
  const flag = argv.indexOf("--app-url");
  const rawAppUrl =
    (flag === -1 ? undefined : argv[flag + 1]) ?? env.NEXT_PUBLIC_APP_URL ?? "";

  if (!token) problems.push("TELEGRAM_BOT_TOKEN is not set.");
  if (!secret) problems.push("TELEGRAM_WEBHOOK_SECRET is not set.");
  else if (!SECRET.test(secret)) {
    problems.push(
      "TELEGRAM_WEBHOOK_SECRET may only use A-Z, a-z, 0-9, _ and - (1-256 characters)."
    );
  }
  if (!username) problems.push("TELEGRAM_BOT_USERNAME is not set.");
  else if (!USERNAME.test(username)) {
    problems.push(
      'TELEGRAM_BOT_USERNAME should be the bot\'s username: 5-32 letters, digits or _, ending in "bot".'
    );
  }

  // Removing the webhook doesn't need to know where it pointed.
  let appUrl = "";
  if (!argv.includes("--remove")) {
    try {
      const url = new URL(rawAppUrl);
      if (url.protocol !== "https:") throw new Error("not https");
      appUrl = url.origin;
    } catch {
      problems.push(
        "Pass the HTTPS address of your QRdx server with --app-url (or set NEXT_PUBLIC_APP_URL). Telegram only calls HTTPS webhooks."
      );
    }
  }

  if (problems.length > 0) throw new Error(problems.join("\n"));
  return { token, secret, username, appUrl };
}

/** The Bot API methods setup calls, in order (setupCalls follows it). */
export const SETUP_METHODS = [
  "setWebhook",
  "setMyCommands",
  "setMyDescription",
  "setMyShortDescription",
];

/** The Bot API calls that configure the bot, in order. */
export function setupCalls({ secret, appUrl }) {
  return [
    {
      method: "setWebhook",
      params: {
        url: `${appUrl}${WEBHOOK_PATH}`,
        secret_token: secret,
        allowed_updates: ALLOWED_UPDATES,
        drop_pending_updates: true,
      },
    },
    { method: "setMyCommands", params: { commands: COMMANDS } },
    { method: "setMyDescription", params: { description: DESCRIPTION } },
    {
      method: "setMyShortDescription",
      params: { short_description: SHORT_DESCRIPTION },
    },
  ];
}

async function telegram(fetchImpl, token, method, params) {
  let response;
  try {
    response = await fetchImpl(
      `https://api.telegram.org/bot${token}/${method}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      }
    );
  } catch {
    throw new Error(`${method}: couldn't reach api.telegram.org.`);
  }
  const body = await response.json().catch(() => null);
  if (!body?.ok) {
    const reason = body?.description ?? `HTTP ${response.status}`;
    const hint = response.status === 401 ? " Check TELEGRAM_BOT_TOKEN." : "";
    throw new Error(`${method} failed: ${reason}.${hint}`);
  }
  return body.result;
}

/** Runs the setup (or `--remove`), printing progress with `log`. */
export async function run({ env, argv, fetch: fetchImpl, log }) {
  const settings = readSettings(env, argv);
  const call = (method, params = {}) =>
    telegram(fetchImpl, settings.token, method, params);

  const me = await call("getMe");
  if (String(me.username).toLowerCase() !== settings.username.toLowerCase()) {
    throw new Error(
      `The token belongs to @${me.username}, but TELEGRAM_BOT_USERNAME is ${settings.username}. Set it to ${me.username}.`
    );
  }

  if (argv.includes("--remove")) {
    await call("deleteWebhook", { drop_pending_updates: true });
    log(
      `Removed @${me.username}'s webhook: Telegram stops sending it messages. Unset the TELEGRAM_* variables on the server too.`
    );
    return;
  }

  // Progress names come from SETUP_METHODS, not the call objects: those
  // carry the webhook secret, and nothing that travels with it is printed.
  const calls = setupCalls(settings);
  for (const [index, { method, params }] of calls.entries()) {
    await call(method, params);
    log(`ok  ${SETUP_METHODS[index]}`);
  }
  const info = await call("getWebhookInfo");
  log(`\nWebhook: ${info.url}`);
  if (info.last_error_message) {
    log(`Telegram's last delivery error: ${info.last_error_message}`);
  }

  log("\nFinish in @BotFather (the Bot API can't do these):");
  log(
    me.supports_inline_queries
      ? "- Inline mode is on. To change its hint, send /setinline, pick the bot and send:"
      : "- Turn on inline mode: send /setinline, pick the bot and send this placeholder:"
  );
  log(`    ${INLINE_PLACEHOLDER}`);
  log(
    "- Send /setinlinefeedback, pick the bot and choose Disabled (the bot doesn't use chosen-result updates)."
  );
  log(
    me.can_read_all_group_messages
      ? "- Privacy mode is off. Turn it back on: /setprivacy, pick the bot, Enable. In groups the bot only needs commands."
      : "- Privacy mode is on (the default). Keep it: in groups the bot only needs commands."
  );
  log(`\nTry it: https://t.me/${me.username}`);
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  run({
    env: process.env,
    argv: process.argv.slice(2),
    fetch: globalThis.fetch,
    log: (line) => console.log(line),
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
