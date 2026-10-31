import { IntegrationApiError, providerRequest } from "../../core/http-client";

const PROVIDER = { slug: "slack", name: "Slack" };
export const SLACK_REVOKE_URL = "https://slack.com/api/auth.revoke";
const WEBHOOK = /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]{10,200}$/;

/** The part of oauth.v2.access QRdx keeps (the webhook, not a bot token). */
export interface SlackInstall {
  webhookUrl: string;
  channel: string;
  channelId: string | null;
  teamId: string | null;
  teamName: string | null;
  configurationUrl: string | null;
}

/**
 * Slack answers token requests with HTTP 200 and `ok: false` on errors, and
 * the webhook arrives in the token response. Validates both.
 */
export function readSlackInstall(tokenResponse: unknown): SlackInstall {
  const data = (tokenResponse ?? {}) as {
    ok?: boolean;
    error?: string;
    team?: { id?: string; name?: string };
    incoming_webhook?: {
      url?: string;
      channel?: string;
      channel_id?: string;
      configuration_url?: string;
    };
  };
  if (data.ok === false) {
    throw new IntegrationApiError({
      provider: PROVIDER.slug,
      status: 400,
      code: "bad_request",
      // Slack error codes ("invalid_code", "access_denied") are safe to show.
      message: `Slack: ${String(data.error ?? "unknown_error").slice(0, 60)}`,
    });
  }
  const hook = data.incoming_webhook;
  if (!(hook?.url && WEBHOOK.test(hook.url))) {
    throw new IntegrationApiError({
      provider: PROVIDER.slug,
      status: 400,
      code: "bad_request",
      message: "Slack did not return a channel webhook. Pick a channel and try again.",
    });
  }
  const configurationUrl = hook.configuration_url?.startsWith("https://")
    ? hook.configuration_url
    : null;
  return {
    webhookUrl: hook.url,
    channel: (hook.channel ?? "").slice(0, 100) || "Slack channel",
    channelId: hook.channel_id ?? null,
    teamId: data.team?.id ?? null,
    teamName: data.team?.name?.slice(0, 100) ?? null,
    configurationUrl,
  };
}

/** Revokes the token; the webhook stops working once the app is removed. */
export async function revokeSlackToken(token: string): Promise<void> {
  const result = await providerRequest<{ ok: boolean; error?: string }>(
    PROVIDER,
    SLACK_REVOKE_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "",
    }
  );
  if (!result.ok && result.error !== "invalid_auth" && result.error !== "token_revoked") {
    throw new IntegrationApiError({
      provider: PROVIDER.slug,
      status: 400,
      code: "bad_request",
      message: `Slack: ${String(result.error ?? "revoke_failed").slice(0, 60)}`,
    });
  }
}
