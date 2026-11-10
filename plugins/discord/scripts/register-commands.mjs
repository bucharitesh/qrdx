#!/usr/bin/env node
// Registers the QRdx Discord app's commands (/qr with its content, look,
// color, frame and private options, and "Make QR code") as its global
// commands. The definitions are read from
// apps/docs/lib/chat-bots/discord/commands.json, the same file the app
// answers from, and replace every global command the app has.
//
//   DISCORD_APPLICATION_ID=… DISCORD_BOT_TOKEN=… node plugins/discord/scripts/register-commands.mjs
//
// Node 22, no dependencies. Run it again after changing commands.json. The
// bot token is only needed here; the web app never reads it. It's sent to
// discord.com and nowhere else, and never printed.

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const COMMANDS_FILE = new URL(
  "../../../apps/docs/lib/chat-bots/discord/commands.json",
  import.meta.url
);

const API = "https://discord.com/api/v10";
const USER_AGENT = "DiscordBot (https://github.com/bucharitesh/qrdx, 1)";

/**
 * The command definitions, as the app answers them.
 *
 * @param {URL} [file]
 * @returns {Promise<unknown[]>}
 */
export async function readCommands(file = COMMANDS_FILE) {
  const commands = JSON.parse(await readFile(file, "utf8"));
  if (!Array.isArray(commands) || commands.length === 0) {
    throw new Error(`${file.pathname} has no commands`);
  }
  return commands;
}

/**
 * The bulk-overwrite request (PUT /applications/{id}/commands) for these
 * commands. Throws, naming the variable, when one is missing.
 *
 * @param {{ applicationId?: string; botToken?: string; commands: unknown[] }} options
 * @returns {{ url: string; init: RequestInit & { headers: Record<string, string>; body: string } }}
 */
export function registerRequest({ applicationId, botToken, commands }) {
  if (!/^\d+$/.test(applicationId?.trim() ?? "")) {
    throw new Error(
      "Set DISCORD_APPLICATION_ID to the app's Application ID (General Information in the developer portal)."
    );
  }
  if (!botToken?.trim()) {
    throw new Error(
      "Set DISCORD_BOT_TOKEN to the app's bot token (Bot → Reset Token in the developer portal)."
    );
  }
  return {
    url: `${API}/applications/${applicationId.trim()}/commands`,
    init: {
      method: "PUT",
      headers: {
        Authorization: `Bot ${botToken.trim()}`,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify(commands),
    },
  };
}

/**
 * Registers the commands and returns what Discord saved.
 *
 * @param {{
 *   env?: Record<string, string | undefined>;
 *   fetchImpl?: (url: string, init: RequestInit) => Promise<Response>;
 *   file?: URL;
 * }} [options]
 */
export async function registerCommands({
  env = process.env,
  fetchImpl = fetch,
  file = COMMANDS_FILE,
} = {}) {
  const commands = await readCommands(file);
  const { url, init } = registerRequest({
    applicationId: env.DISCORD_APPLICATION_ID,
    botToken: env.DISCORD_BOT_TOKEN,
    commands,
  });
  const response = await fetchImpl(url, init);
  const text = await response.text();
  if (!response.ok) {
    // Discord's error body names the field it rejected; it never holds the token.
    throw new Error(
      `Discord answered ${response.status} ${response.statusText}: ${text.slice(0, 2000)}`
    );
  }
  return JSON.parse(text);
}

/**
 * One saved command as a line for the terminal: its name and, for /qr, its
 * options with how many choices each offers.
 *
 * @param {{ type: number; name: string; id?: string; options?: { name: string; choices?: unknown[] }[] }} command
 */
export function describeCommand(command) {
  const label = command.type === 1 ? `/${command.name}` : command.name;
  const options = (command.options ?? []).map((option) =>
    option.choices?.length
      ? `${option.name} (${option.choices.length} choices)`
      : option.name
  );
  return `${label}${command.id ? ` (${command.id})` : ""}${
    options.length > 0 ? `: ${options.join(", ")}` : ""
  }`;
}

const runDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (runDirectly) {
  try {
    const saved = await registerCommands();
    for (const command of saved) {
      console.log(`Registered ${describeCommand(command)}`);
    }
    console.log(
      "Done. If a command doesn't show up in Discord yet, reload Discord (Ctrl+R or Cmd+R)."
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
