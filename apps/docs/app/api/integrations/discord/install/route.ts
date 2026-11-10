import { NextResponse } from "next/server";
import {
  discordBotSettings,
  discordInstallUrl,
} from "@/lib/chat-bots/discord/settings";

/**
 * GET /api/integrations/discord/install — "Add to Discord": sends the person
 * to Discord's page for adding the app to a server or to their own account.
 * The link is built from DISCORD_APPLICATION_ID; 404 where the bot isn't set
 * up.
 */
export function GET() {
  const settings = discordBotSettings();
  if (!settings) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.redirect(discordInstallUrl(settings.applicationId), 302);
}
