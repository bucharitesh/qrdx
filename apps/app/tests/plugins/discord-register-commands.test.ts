// plugins/discord/scripts/register-commands.mjs uploads the app's commands
// to Discord. Run here with a fake fetch: it must send exactly the
// definitions the endpoint answers, to the bulk-overwrite route, with the
// bot token only in the Authorization header.
import { describe, expect, it, vi } from "vitest";
import { DISCORD_COMMANDS } from "@/lib/chat-bots/discord/commands";
import {
  describeCommand,
  readCommands,
  registerCommands,
  registerRequest,
} from "../../../../plugins/discord/scripts/register-commands.mjs";

const TOKEN = "fake-bot-token-for-tests";
const env = {
  DISCORD_APPLICATION_ID: "112233445566778899",
  DISCORD_BOT_TOKEN: TOKEN,
};

describe("register-commands.mjs", () => {
  it("reads the same commands.json the app answers from", async () => {
    expect(await readCommands()).toEqual(DISCORD_COMMANDS);
  });

  it("PUTs every command to the app's global commands", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json(
        DISCORD_COMMANDS.map((command, index) => ({
          ...command,
          id: `${index}`,
        })),
      ),
    );
    const saved = await registerCommands({ env, fetchImpl });
    expect(saved).toHaveLength(DISCORD_COMMANDS.length);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      "https://discord.com/api/v10/applications/112233445566778899/commands",
    );
    expect(init.method).toBe("PUT");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bot ${TOKEN}`);
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["User-Agent"]).toMatch(
      /^DiscordBot \(https:\/\/github\.com\/qrdxinc\/qrdx, \d+\)$/,
    );
    expect(JSON.parse(init.body as string)).toEqual(DISCORD_COMMANDS);
  });

  it("prints each saved command with /qr's options and their choices", () => {
    const [qr, message] = DISCORD_COMMANDS;
    expect(describeCommand({ ...qr, id: "1" })).toBe(
      "/qr (1): content, look (9 choices), color (6 choices), frame (5 choices), private",
    );
    expect(describeCommand({ ...message, id: "2" })).toBe("Make QR code (2)");
  });

  it("names the missing variable before calling Discord", () => {
    expect(() =>
      registerRequest({
        applicationId: undefined,
        botToken: TOKEN,
        commands: [],
      }),
    ).toThrow(/DISCORD_APPLICATION_ID/);
    expect(() =>
      registerRequest({
        applicationId: "not-an-id",
        botToken: TOKEN,
        commands: [],
      }),
    ).toThrow(/DISCORD_APPLICATION_ID/);
    expect(() =>
      registerRequest({ applicationId: "1", botToken: " ", commands: [] }),
    ).toThrow(/DISCORD_BOT_TOKEN/);
  });

  it("reports Discord's error without the token", async () => {
    const fetchImpl = async () =>
      new Response('{"message": "401: Unauthorized", "code": 0}', {
        status: 401,
        statusText: "Unauthorized",
      });
    const error = await registerCommands({ env, fetchImpl }).catch(
      (caught: Error) => caught,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("401");
    expect((error as Error).message).not.toContain(TOKEN);
  });
});
