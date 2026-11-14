// plugins/slack/manifest.json, the Slack app the owner (or a self-hoster)
// creates from it, against the code: every URL in it is a route that
// exists, its scopes are the ones the two install flows and Sign in with
// Slack (when linking an account) ask for, and its shortcut and events are
// the ones the bot handles.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getIntegrationRegistry,
  initializeIntegrations,
} from "@repo/integrations";
import { describe, expect, it } from "vitest";
import { MAKE_QR_CALLBACK_ID } from "@/lib/slack-bot/events";
import { SLACK_BOT_SCOPES } from "@/lib/slack-bot/slack-api";

const ROOT = join(import.meta.dirname, "../../../..");
const manifest = JSON.parse(
  readFileSync(join(ROOT, "plugins/slack/manifest.json"), "utf8"),
);
const APP = join(ROOT, "apps/app/app");

/** The app route file a qrdx.dev URL is served by. */
function routeFile(url: string): string {
  const { origin, pathname } = new URL(url);
  expect(origin).toBe("https://qrdx.dev");
  const path = join(APP, pathname, "route.ts");
  if (existsSync(path)) return path;
  // /api/integrations/slack/callback is the generic [provider] callback.
  return join(APP, pathname.replace("/slack/", "/[provider]/"), "route.ts");
}

describe("the Slack app manifest", () => {
  it("points every URL at a route that exists", () => {
    const urls = [
      ...manifest.features.slash_commands.map((c: { url: string }) => c.url),
      manifest.settings.event_subscriptions.request_url,
      manifest.settings.interactivity.request_url,
      ...manifest.oauth_config.redirect_urls,
    ];
    expect(urls).toHaveLength(6);
    for (const url of urls) expect(existsSync(routeFile(url)), url).toBe(true);
    expect(manifest.oauth_config.redirect_urls).toEqual([
      "https://qrdx.dev/api/integrations/slack/callback",
      "https://qrdx.dev/api/integrations/slack/bot/callback",
      "https://qrdx.dev/api/integrations/slack/link/callback",
    ]);
  });

  it("asks for exactly the alerts' scope and the bot's, and openid for Sign in with Slack", () => {
    initializeIntegrations();
    const alerts = getIntegrationRegistry().get("slack")?.oauth?.scopes ?? [];
    expect([...manifest.oauth_config.scopes.bot].sort()).toEqual(
      [...alerts, ...SLACK_BOT_SCOPES].sort(),
    );
    // Only who the person is, when they link their QRdx account.
    expect(manifest.oauth_config.scopes.user).toEqual(["openid"]);
  });

  it("has the /qr command, the shortcut, the events and DMs the bot handles", () => {
    expect(manifest.features.slash_commands).toEqual([
      expect.objectContaining({ command: "/qr", should_escape: true }),
    ]);
    expect(manifest.features.shortcuts).toEqual([
      expect.objectContaining({
        type: "message",
        callback_id: MAKE_QR_CALLBACK_ID,
        name: "Make a QR code",
      }),
    ]);
    expect(
      [...manifest.settings.event_subscriptions.bot_events].sort(),
    ).toEqual([
      "app_mention",
      "app_uninstalled",
      "message.im",
      "tokens_revoked",
    ]);
    expect(manifest.features.bot_user.display_name).toBe("QRdx");
    expect(manifest.features.app_home.messages_tab_enabled).toBe(true);
    expect(manifest.settings.org_deploy_enabled).toBe(false);
    expect(manifest.settings.interactivity.is_enabled).toBe(true);
  });

  it("stays within Slack's length limits", () => {
    const info = manifest.display_information;
    expect(info.description.length).toBeLessThanOrEqual(140);
    expect(info.long_description.length).toBeGreaterThanOrEqual(174);
    expect(info.long_description.length).toBeLessThanOrEqual(4000);
    for (const shortcut of manifest.features.shortcuts) {
      expect(shortcut.description.length).toBeLessThanOrEqual(80);
    }
    for (const command of manifest.features.slash_commands) {
      expect(command.description.length).toBeLessThanOrEqual(2000);
      expect(command.usage_hint.length).toBeLessThanOrEqual(1000);
    }
  });
});
