// The Discord app's commands, exactly as they're registered with Discord.
// commands.json is the one definition: plugins/discord/scripts/
// register-commands.mjs uploads it as the app's global commands, the
// interactions route reads the names below from it, and the tests check it.
// After changing it, run the script again (plugins/discord/README.md).
import definitions from "./commands.json";

/** Discord's application command types we register. */
export const COMMAND_TYPE = { chatInput: 1, message: 3 } as const;

/** Discord's command option types we use. */
const OPTION_TYPE = { string: 3, boolean: 5 } as const;

export interface DiscordCommandOption {
  type: number;
  name: string;
  description: string;
  required?: boolean;
  min_length?: number;
  max_length?: number;
}

export interface DiscordCommand {
  type: number;
  name: string;
  description?: string;
  options?: DiscordCommandOption[];
  /** 0: added to a server, 1: added to a person's own account. */
  integration_types: number[];
  /** 0: servers, 1: DMs with the app, 2: group DMs and other people's DMs. */
  contexts: number[];
}

export const DISCORD_COMMANDS: readonly DiscordCommand[] = definitions;

function commandOfType(type: number): DiscordCommand {
  const command = DISCORD_COMMANDS.find((item) => item.type === type);
  if (!command) throw new Error(`commands.json has no command of type ${type}`);
  return command;
}

function optionOfType(command: DiscordCommand, type: number): string {
  const option = command.options?.find((item) => item.type === type);
  if (!option) {
    throw new Error(`/${command.name} has no option of type ${type}`);
  }
  return option.name;
}

const qr = commandOfType(COMMAND_TYPE.chatInput);

/** `/qr content:<link or text> private:<true|false>` */
export const QR_COMMAND = {
  name: qr.name,
  content: optionOfType(qr, OPTION_TYPE.string),
  private: optionOfType(qr, OPTION_TYPE.boolean),
} as const;

/** The message command: Apps → Make QR code. */
export const MESSAGE_COMMAND = {
  name: commandOfType(COMMAND_TYPE.message).name,
} as const;
