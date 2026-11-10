import "server-only";

import { env } from "@/lib/env";
import { isFeatureAvailable } from "@/lib/feature-availability";

export interface DiscordBotSettings {
  /** The app's id, which is also its OAuth client id. */
  applicationId: string;
  /** The app's Ed25519 public key, as hex. */
  publicKey: string;
}

/**
 * The Discord app this deployment answers for, or null when the bot isn't
 * set up here (lib/feature-availability-rules.ts `discordBot`): its routes
 * then answer 404 and the catalog and docs leave it out.
 */
export function discordBotSettings(): DiscordBotSettings | null {
  const applicationId = env.DISCORD_APPLICATION_ID?.trim();
  const publicKey = env.DISCORD_PUBLIC_KEY?.trim();
  if (!(isFeatureAvailable("discordBot") && applicationId && publicKey)) {
    return null;
  }
  return { applicationId, publicKey };
}

/**
 * Discord's page for adding the app to a server or to your own account. With
 * no scope in the link, Discord uses the install settings saved in the
 * developer portal (guild and user install, `applications.commands`).
 */
export function discordInstallUrl(applicationId: string): string {
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", applicationId);
  return url.toString();
}
