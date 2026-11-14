/** biome-ignore-all lint/suspicious/noArrayIndexKey: false positive */
"use client";

import { TWO_FACTOR_REQUIRED_MESSAGE } from "@repo/auth/workspace-two-factor-rules";
import { Spinner, Tick } from "@repo/design-system/components/icons";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Separator } from "@repo/design-system/components/ui/separator";
import { getCapabilityLabel, hasCapability } from "@repo/integration-kit";
import type {
  IntegrationApiKeyConfig,
  IntegrationCapability,
  IntegrationCategory,
  IntegrationLogoSet,
} from "@repo/integrations";
import {
  isFilePickerProvider,
  isShortLinkProvider,
} from "@repo/integrations/src/capabilities/providers";
import { ArrowLeft, Danger, Global, InfoCircle } from "iconsax-reactjs";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useConfirmation } from "@/components/confirm-identity/provider";
import {
  NeedsSetupBadge,
  NeedsSetupNote,
  NoLongerAvailableBadge,
} from "@/components/needs-setup";
import {
  IntegrationLogo,
  logoForIntegration,
} from "@/components/sections/integrations/integration-logo";
import { CONFIRM_RETURN_PARAM } from "@/lib/account/confirmation";
import { isIntegrationsMock } from "@/lib/connected-accounts/mock";
import {
  connectIntegrationAction,
  disconnectIntegrationAction,
} from "../../actions";
import { ApiKeyConnect } from "./api-key-connect";
import { ConnectedAccountPanel } from "./connected-account-panel";
import {
  DataConnectionPanel,
  isNoAccountIntegration,
  usesDataKeyForm,
} from "./data-connection-panel";
import { DubManagement } from "./dub-management";
import { SlackBotPanel, type SlackBotSettings } from "./slack-bot-panel";

const CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  analytics: "Analytics",
  storage: "Storage",
  assets: "Assets",
  marketing: "Marketing",
  crm: "CRM",
  communication: "Communication",
};

interface IntegrationDetailProps {
  slug: string;
  name: string;
  description: string;
  logos: IntegrationLogoSet;
  capabilities: IntegrationCapability[];
  features: string[];
  developedBy?: string;
  website?: string;
  category: IntegrationCategory[];
  isConfigured: boolean;
  /** Local dev only: the env variable names it still needs. */
  needsSetup?: string[];
  isConnected: boolean;
  status?: "active" | "disconnected" | "error";
  connectedAt?: Date;
  metadata?: Record<string, unknown>;
  /** OAuth credentials are set (defaults to isConfigured). */
  oauthConfigured?: boolean;
  /** Connect by pasting a key (Bitly token, Rebrandly, Short.io). */
  apiKey?: IntegrationApiKeyConfig;
  /**
   * Hidden in production (QRdx's keys are missing), but this user connected
   * it before: show Disconnect and nothing else.
   */
  noLongerAvailable?: boolean;
  /** Slack only, where the QRdx bot is set up here: its installs and links. */
  slackBot?: SlackBotSettings;
}

export function IntegrationDetail({
  slug,
  name,
  description,
  logos,
  capabilities,
  features,
  developedBy,
  website,
  category,
  isConfigured,
  needsSetup,
  isConnected,
  status,
  connectedAt,
  metadata,
  oauthConfigured,
  apiKey,
  noLongerAvailable = false,
  slackBot,
}: IntegrationDetailProps) {
  const t = useTranslations("app.settings.integrations.integrationDetail");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { withConfirmation } = useConfirmation();
  const [isLoading, setIsLoading] = useState(false);
  const hasShortLinks = hasCapability(capabilities, "short-link-provider");
  const canOAuth = oauthConfigured ?? isConfigured;
  const accountKind = isShortLinkProvider(slug)
    ? "short-links"
    : isFilePickerProvider(slug)
      ? "files"
      : null;

  useEffect(() => {
    // Back from signing in again to confirm it's you: its `error` is the
    // sign-in's, and ConfirmIdentityProvider reports it.
    if (searchParams.get(CONFIRM_RETURN_PARAM)) return;
    const success = searchParams.get("success");
    const error = searchParams.get("error");

    if (success === `${slug}_connected`) {
      toast.success(t("nameConnectedSuccessfully", { name }));
      router.replace(`/settings/integrations/${slug}`);
    } else if (success === "slack_bot_installed") {
      toast.success(t("theQrdxBotIsIn"));
      router.replace(`/settings/integrations/${slug}`);
    } else if (error) {
      const errorMessages: Record<string, string> = {
        unauthorized: "You must be logged in to connect integrations",
        no_code: "Authorization code not received",
        missing_verifier: "Security verification failed",
        token_exchange_failed: "Failed to exchange authorization code",
        unexpected_error: "An unexpected error occurred",
        plan_required: "Slack alerts are part of the Business plan.",
        two_factor_required: TWO_FACTOR_REQUIRED_MESSAGE,
        // "Add to Slack" without a recent "Confirm it's you" (it ran out, or
        // the address was opened directly): the button asks first.
        confirmation_required: `Confirm it's you first: try again here, and QRdx will ask before sending you to ${name}.`,
        limit_reached:
          "That workspace already has 10 Slack or Discord channels.",
        not_configured: `${name} can't be connected right now.`,
        dev_disabled: "Calls to connected tools are off outside production.",
        provider_rejected: `${name} didn't finish the connection. Try again.`,
        rate_limited: "Too many attempts. Wait a minute and try again.",
        slack_bot_cancelled: "The bot wasn't added to Slack.",
        slack_bot_failed: "Slack didn't finish adding the bot. Try again.",
        slack_bot_enterprise:
          "Add the bot to one Slack workspace at a time, not to a whole Enterprise Grid organization.",
        slack_bot_unavailable: "The QRdx bot isn't available yet.",
      };
      toast.error(errorMessages[error] || t("failedToConnectName", { name }));
      router.replace(`/settings/integrations/${slug}`);
    }
  }, [searchParams, slug, name, router, t]);

  const handleConnect = async () => {
    if (!canOAuth) {
      toast.error(t("nameIsntAvailableRightNow", { name }));
      return;
    }

    setIsLoading(true);
    try {
      // Slack and the data-out tools ask "Confirm it's you" before leaving.
      const result = await withConfirmation(
        () => connectIntegrationAction(slug),
        slug === "slack" ? "add-slack-channel" : "connect-data-out",
      );
      if (!result) {
        // Cancelled, or still not confirmed (the dialog said so).
        setIsLoading(false);
      } else if ("url" in result && result.url) {
        window.location.href = result.url;
      } else {
        toast.error(t("failedToInitiateConnection"));
        setIsLoading(false);
      }
    } catch {
      toast.error(t("failedToConnectIntegration"));
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm(`Are you sure you want to disconnect ${name}?`)) return;

    setIsLoading(true);
    try {
      // Dev sample (?integrations-mock=unavailable): nothing is stored.
      const result =
        noLongerAvailable && isIntegrationsMock()
          ? { revoked: false }
          : await disconnectIntegrationAction(slug);
      toast.success(
        result.revoked
          ? t("nameDisconnectedAndQrdxsAccess", { name })
          : t("nameDisconnected", { name }),
        apiKey && !canOAuth
          ? { description: t("youCanAlsoDeleteThe", { name }) }
          : undefined,
      );
      // Once disconnected, a no-longer-available integration has no page.
      if (noLongerAvailable) router.push("/settings/integrations");
      else router.refresh();
    } catch {
      toast.error(t("failedToDisconnectIntegration"));
    } finally {
      setIsLoading(false);
    }
  };

  const statusBadge = () => {
    if (!isConnected) return null;
    switch (status) {
      case "active":
        return (
          <Badge
            variant="outline"
            className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          >
            <Tick className="size-3" />
            {t("connected")}
          </Badge>
        );
      case "error":
        return (
          <Badge variant="destructive" className="gap-1.5">
            <Danger aria-hidden className="size-3" />
            {t("error")}
          </Badge>
        );
      case "disconnected":
        return (
          <Badge variant="secondary" className="gap-1.5">
            <InfoCircle aria-hidden className="size-3" />
            {t("disconnected")}
          </Badge>
        );
      default:
        return null;
    }
  };

  const backLink = (
    <Link
      href="/settings/integrations"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      <ArrowLeft aria-hidden className="size-3.5" />
      {t("integrations")}
    </Link>
  );

  if (noLongerAvailable) {
    return (
      <div className="space-y-6">
        {backLink}
        <div className="rounded-xl border bg-card p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-4">
              <IntegrationLogo
                logo={logoForIntegration(slug, logos)}
                size="lg"
              />
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold">{name}</h1>
                  <NoLongerAvailableBadge />
                </div>
                <p className="text-sm text-muted-foreground">{description}</p>
              </div>
            </div>
            <Button
              className="shrink-0"
              disabled={isLoading}
              onClick={handleDisconnect}
              size="sm"
              variant="outline"
            >
              {isLoading && <Spinner className="size-3.5" />}
              {t("disconnect")}
            </Button>
          </div>

          <Separator className="my-5" />

          <div className="space-y-1.5 text-sm">
            <p className="font-medium">
              {t("nameIsNoLongerAvailable", { name })}
            </p>
            <p className="max-w-prose text-muted-foreground text-pretty">
              {connectedAt
                ? t("unusedConnectionSince", {
                    name,
                    date: connectedAt.toLocaleDateString(locale, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    }),
                  })
                : t("unusedConnection", { name })}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {backLink}

      {/* Header card */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <IntegrationLogo logo={logoForIntegration(slug, logos)} size="lg" />
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-semibold">{name}</h1>
                {statusBadge()}
                <NeedsSetupBadge names={needsSetup} />
              </div>
              <p className="text-sm text-muted-foreground">{description}</p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {capabilities.map((capability) => (
                  <Badge key={capability.id} variant="secondary">
                    {getCapabilityLabel(capability.kind)}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Action button */}
          <div className="shrink-0 flex items-center gap-2">
            {isConnected ? (
              <>
                {status === "error" && canOAuth && (
                  <Button
                    onClick={handleConnect}
                    disabled={isLoading}
                    variant="outline"
                    size="sm"
                  >
                    {isLoading && <Spinner className="size-3.5" />}
                    {t("reconnect")}
                  </Button>
                )}
                <Button
                  onClick={handleDisconnect}
                  disabled={isLoading}
                  variant={status === "error" ? "destructive" : "outline"}
                  size="sm"
                >
                  {isLoading && <Spinner className="size-3.5" />}
                  {t("disconnect")}
                </Button>
              </>
            ) : isNoAccountIntegration(slug) ? null : canOAuth ||
              !(apiKey && isConfigured) ? (
              <Button
                onClick={handleConnect}
                disabled={isLoading || !canOAuth}
                size="sm"
              >
                {isLoading && <Spinner className="size-3.5" />}
                {canOAuth ? t("enable") : t("needsSetup")}
              </Button>
            ) : null}
          </div>
        </div>

        <Separator className="my-5" />

        {/* Meta row */}
        <div className="flex flex-wrap gap-6 text-sm">
          {developedBy && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("builtBy")}
              </span>
              <span className="font-medium">{developedBy}</span>
            </div>
          )}
          {website && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("website")}
              </span>
              <a
                href={website}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground hover:underline inline-flex items-center gap-1"
              >
                <Global aria-hidden className="size-3.5" />
                {new URL(website).hostname}
              </a>
            </div>
          )}
          {category.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("category")}
              </span>
              <div className="flex flex-wrap gap-1">
                {category.map((cat) => (
                  <span
                    key={cat}
                    className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium"
                  >
                    {CATEGORY_LABELS[cat]}
                  </span>
                ))}
              </div>
            </div>
          )}
          {connectedAt && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("connected")}
              </span>
              <span className="font-medium">
                {connectedAt.toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          )}
        </div>
      </div>

      {slug === "dub" && hasShortLinks && isConnected && (
        <DubManagement metadata={metadata} />
      )}

      {accountKind && isConnected && status === "active" && (
        <ConnectedAccountPanel
          kind={accountKind}
          logo={logos.light}
          metadata={metadata}
          name={name}
          slug={slug}
        />
      )}

      {apiKey &&
        isConfigured &&
        !usesDataKeyForm(slug) &&
        (!isConnected || status === "error") && (
          <ApiKeyConnect
            apiKey={apiKey}
            asAlternative={canOAuth && !isConnected}
            name={name}
            reconnect={isConnected}
            slug={slug}
          />
        )}

      {slug === "slack" && slackBot && <SlackBotPanel {...slackBot} />}

      <DataConnectionPanel
        apiKey={apiKey}
        isConfigured={isConfigured}
        isConnected={isConnected}
        metadata={metadata}
        name={name}
        slug={slug}
        status={status}
      />

      {capabilities.length > 0 && (
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold">{t("qrdxCapabilities")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("whereThisIntegrationShowsUp")}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {capabilities.map((capability) => (
              <div key={capability.id} className="rounded-lg border p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{capability.label}</p>
                  <Badge variant="outline">
                    {getCapabilityLabel(capability.kind)}
                  </Badge>
                </div>
                <p className="mt-2 text-muted-foreground text-xs leading-relaxed">
                  {capability.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Features */}
      {features.length > 0 && (
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <h2 className="text-base font-semibold">{t("features")}</h2>
          <ul className="space-y-2">
            {features.map((feature, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm">
                <Tick className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* How to install */}
      {!isNoAccountIntegration(slug) && (
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <h2 className="text-base font-semibold">{t("howToConnect")}</h2>
          <ol className="space-y-3">
            {(apiKey && !canOAuth
              ? [
                  `Create ${apiKey.label === "API key" ? "an" : "a"} ${apiKey.label.toLowerCase()} in ${name} (link above).`,
                  "Paste it here. QRdx checks it with the provider and stores it encrypted.",
                  "Disconnect at any time; delete the key in the provider too if you no longer use it.",
                ]
              : [
                  `Click Enable to start a secure sign-in with ${name}.`,
                  `Approve the access QRdx asks for. Tokens are stored encrypted.`,
                  "You come back here connected, and you can disconnect at any time.",
                ]
            ).map((step, idx) => (
              <li key={idx} className="flex items-start gap-3 text-sm">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border bg-background text-xs font-medium tabular-nums">
                  {idx + 1}
                </span>
                <span className="text-muted-foreground">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Local dev only: production hides integrations that need setup */}
      {needsSetup && needsSetup.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <NeedsSetupNote names={needsSetup} />
        </div>
      )}
    </div>
  );
}
