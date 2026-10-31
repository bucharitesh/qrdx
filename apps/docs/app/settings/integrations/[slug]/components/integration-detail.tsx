/** biome-ignore-all lint/suspicious/noArrayIndexKey: false positive */
"use client";

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
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { NeedsSetupBadge, NeedsSetupNote } from "@/components/needs-setup";
import {
  IntegrationLogo,
  logoForIntegration,
} from "@/components/sections/integrations/integration-logo";
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
}: IntegrationDetailProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const hasShortLinks = hasCapability(capabilities, "short-link-provider");
  const canOAuth = oauthConfigured ?? isConfigured;
  const accountKind = isShortLinkProvider(slug)
    ? "short-links"
    : isFilePickerProvider(slug)
      ? "files"
      : null;

  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");

    if (success === `${slug}_connected`) {
      toast.success(`${name} connected successfully!`);
      router.replace(`/settings/integrations/${slug}`);
    } else if (error) {
      const errorMessages: Record<string, string> = {
        unauthorized: "You must be logged in to connect integrations",
        no_code: "Authorization code not received",
        missing_verifier: "Security verification failed",
        token_exchange_failed: "Failed to exchange authorization code",
        unexpected_error: "An unexpected error occurred",
        plan_required: "Slack alerts are part of the Business plan.",
        limit_reached:
          "That workspace already has 10 Slack or Discord channels.",
        not_configured: `${name} can't be connected right now.`,
        dev_disabled: "Calls to connected tools are off outside production.",
        provider_rejected: `${name} didn't finish the connection. Try again.`,
        rate_limited: "Too many attempts. Wait a minute and try again.",
      };
      toast.error(errorMessages[error] || `Failed to connect ${name}`);
      router.replace(`/settings/integrations/${slug}`);
    }
  }, [searchParams, slug, name, router]);

  const handleConnect = async () => {
    if (!canOAuth) {
      toast.error(`${name} isn't available right now. Please try again later.`);
      return;
    }

    setIsLoading(true);
    try {
      const result = await connectIntegrationAction(slug);
      if (result.url) {
        window.location.href = result.url;
      } else {
        toast.error("Failed to initiate connection");
        setIsLoading(false);
      }
    } catch {
      toast.error("Failed to connect integration");
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm(`Are you sure you want to disconnect ${name}?`)) return;

    setIsLoading(true);
    try {
      const result = await disconnectIntegrationAction(slug);
      toast.success(
        result.revoked
          ? `${name} disconnected and QRdx's access revoked`
          : `${name} disconnected`,
        apiKey && !canOAuth
          ? { description: `You can also delete the key in ${name}.` }
          : undefined,
      );
      router.refresh();
    } catch {
      toast.error("Failed to disconnect integration");
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
            Connected
          </Badge>
        );
      case "error":
        return (
          <Badge variant="destructive" className="gap-1.5">
            <Danger aria-hidden className="size-3" />
            Error
          </Badge>
        );
      case "disconnected":
        return (
          <Badge variant="secondary" className="gap-1.5">
            <InfoCircle aria-hidden className="size-3" />
            Disconnected
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Link
        href="/settings/integrations"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft aria-hidden className="size-3.5" />
        Integrations
      </Link>

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
                    Reconnect
                  </Button>
                )}
                <Button
                  onClick={handleDisconnect}
                  disabled={isLoading}
                  variant={status === "error" ? "destructive" : "outline"}
                  size="sm"
                >
                  {isLoading && <Spinner className="size-3.5" />}
                  Disconnect
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
                {canOAuth ? "Enable" : "Needs setup"}
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
                Built by
              </span>
              <span className="font-medium">{developedBy}</span>
            </div>
          )}
          {website && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Website
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
                Category
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
                Connected
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
            <h2 className="text-base font-semibold">QRdx capabilities</h2>
            <p className="text-sm text-muted-foreground">
              Where this integration shows up in QRdx.
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
          <h2 className="text-base font-semibold">Features</h2>
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
          <h2 className="text-base font-semibold">How to connect</h2>
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
