// commands.json is what gets registered with Discord (plugins/discord/
// scripts/register-commands.mjs) and what the endpoint answers. A change
// here means running the script again, so the whole definition is pinned,
// and each field is checked against Discord's limits.
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  DISCORD_COMMANDS,
  MESSAGE_COMMAND,
  QR_COMMAND,
} from "@/lib/chat-bots/discord/commands";
import { discordPublicKey } from "@/lib/chat-bots/discord/verify";
import { CHAT_COLORS, CHAT_FRAMES, CHAT_LOOKS } from "@/lib/chat-bots/styles";
import { QR_DATA_MAX_LENGTH } from "@/lib/qr-render";

/** Discord's rule for slash command and option names. */
const CHAT_INPUT_NAME = /^[-_\p{L}\p{N}]{1,32}$/u;

describe("the Discord commands", () => {
  it("are /qr and the Make QR code message command", () => {
    expect(DISCORD_COMMANDS).toEqual([
      {
        type: 1,
        name: "qr",
        description: "Make a QR code from a link or text",
        options: [
          {
            type: 3,
            name: "content",
            description: "The link or text the QR code opens or shows",
            required: true,
            min_length: 1,
            max_length: 2048,
          },
          {
            type: 3,
            name: "look",
            description: "A ready-made look",
            required: false,
            choices: CHAT_LOOKS.map(({ id, label }) => ({
              name: label,
              value: id,
            })),
          },
          {
            type: 3,
            name: "color",
            description: "The code's color, on white",
            required: false,
            choices: CHAT_COLORS.map(({ id, label }) => ({
              name: label,
              value: id,
            })),
          },
          {
            type: 3,
            name: "frame",
            description: "A frame that says Scan me",
            required: false,
            choices: CHAT_FRAMES.map(({ id, label }) => ({
              name: label,
              value: id,
            })),
          },
          {
            type: 5,
            name: "private",
            description: "Only you see the QR code",
            required: false,
          },
        ],
        integration_types: [0, 1],
        contexts: [0, 1, 2],
      },
      {
        type: 3,
        name: "Make QR code",
        integration_types: [0, 1],
        contexts: [0, 1, 2],
      },
    ]);
    expect(QR_COMMAND).toEqual({
      name: "qr",
      content: "content",
      look: "look",
      color: "color",
      frame: "frame",
      private: "private",
    });
    expect(MESSAGE_COMMAND).toEqual({ name: "Make QR code" });
  });

  it("work in servers and DMs, added to a server or to a person", () => {
    for (const command of DISCORD_COMMANDS) {
      // 0 guild install, 1 user install
      expect(command.integration_types, command.name).toEqual([0, 1]);
      // 0 servers, 1 DMs with the app, 2 group DMs and other DMs
      expect(command.contexts, command.name).toEqual([0, 1, 2]);
    }
  });

  it("stay within Discord's limits", () => {
    for (const command of DISCORD_COMMANDS) {
      if (command.type === 1) {
        expect(command.name).toMatch(CHAT_INPUT_NAME);
        expect(command.name).toBe(command.name.toLowerCase());
        expect(command.description?.length).toBeGreaterThan(0);
        expect(command.description?.length).toBeLessThanOrEqual(100);
      } else {
        // Message commands take a display name and no description.
        expect(command.name.length).toBeLessThanOrEqual(32);
        expect(command).not.toHaveProperty("description");
        expect(command).not.toHaveProperty("options");
      }
      for (const option of command.options ?? []) {
        expect(option.name).toMatch(CHAT_INPUT_NAME);
        expect(option.description.length).toBeLessThanOrEqual(100);
        // At most 25 choices, each name and value 1 to 100 characters.
        expect(option.choices?.length ?? 0).toBeLessThanOrEqual(25);
        for (const choice of option.choices ?? []) {
          expect(choice.name.length).toBeGreaterThan(0);
          expect(choice.name.length).toBeLessThanOrEqual(100);
          expect(choice.value.length).toBeLessThanOrEqual(100);
        }
      }
      // Required options come first.
      const required = (command.options ?? []).map((o) => o.required === true);
      expect(required).toEqual([...required].sort((a, b) => +b - +a));
    }
  });

  it("accept as much content as the image API, within Discord's 6000", () => {
    const content = DISCORD_COMMANDS[0].options?.[0];
    expect(content?.max_length).toBe(QR_DATA_MAX_LENGTH);
    expect(content?.max_length).toBeLessThanOrEqual(6000);
  });
});

describe("the app's public key", () => {
  it("is read from the portal's 64-character hex form", () => {
    const { publicKey } = generateKeyPairSync("ed25519");
    const hex = Buffer.from(
      publicKey.export({ format: "jwk" }).x as string,
      "base64url",
    ).toString("hex");
    const key = discordPublicKey(` ${hex.toUpperCase()}\n`);
    expect(key?.asymmetricKeyType).toBe("ed25519");
    expect(key?.equals(publicKey)).toBe(true);
  });

  it("is null for anything else", () => {
    for (const value of ["", "abc", "ab".repeat(31), "zz".repeat(32)]) {
      expect(discordPublicKey(value), value).toBeNull();
    }
  });
});
