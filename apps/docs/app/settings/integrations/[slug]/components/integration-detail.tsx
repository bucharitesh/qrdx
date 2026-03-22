/** biome-ignore-all lint/suspicious/noArrayIndexKey: <explanation> */
"use client";

import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Separator } from "@repo/design-system/components/ui/separator";
import type { IntegrationCategory } from "@repo/integrations";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  ExternalLink,
  Globe,
  Loader2,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  connectIntegrationAction,
  disconnectIntegrationAction,
} from "../../actions";

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
  logo: string;
  features: string[];
  developedBy?: string;
  website?: string;
  category: IntegrationCategory[];
  isConfigured: boolean;
  isConnected: boolean;
  status?: "active" | "disconnected" | "error";
  connectedAt?: Date;
}

export function IntegrationDetail({
  slug,
  name,
  description,
  logo,
  features,
  developedBy,
  website,
  category,
  isConfigured,
  isConnected,
  status,
  connectedAt,
}: IntegrationDetailProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);

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
      };
      toast.error(errorMessages[error] || `Failed to connect ${name}`);
      router.replace(`/settings/integrations/${slug}`);
    }
  }, [searchParams, slug, name, router]);

  const handleConnect = async () => {
    if (!isConfigured) {
      toast.error(
        `${name} is not configured. Please add the required environment variables.`,
      );
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
      await disconnectIntegrationAction(slug);
      toast.success(`${name} disconnected`);
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
          <Badge variant="default" className="gap-1.5">
            <CheckCircle className="size-3" />
            Connected
          </Badge>
        );
      case "error":
        return (
          <Badge variant="destructive" className="gap-1.5">
            <XCircle className="size-3" />
            Error
          </Badge>
        );
      case "disconnected":
        return (
          <Badge variant="secondary" className="gap-1.5">
            <AlertCircle className="size-3" />
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
        <ArrowLeft className="size-3.5" />
        Integrations
      </Link>

      {/* Header card */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="bg-white border border-border flex size-14 items-center justify-center rounded-full p-2.5 shrink-0">
              {logo ? (
                <img
                  src={logo}
                  alt={`${name} logo`}
                  className="size-full object-contain"
                />
              ) : (
                <ExternalLink className="size-6 text-muted-foreground" />
              )}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-semibold">{name}</h1>
                {statusBadge()}
                {!isConfigured && (
                  <Badge
                    variant="outline"
                    className="text-yellow-600 border-yellow-300 bg-yellow-50 dark:bg-yellow-950 dark:border-yellow-800 dark:text-yellow-400"
                  >
                    Coming Soon
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </div>

          {/* Action button */}
          <div className="shrink-0 flex items-center gap-2">
            {isConnected ? (
              <>
                {status === "error" && (
                  <Button
                    onClick={handleConnect}
                    disabled={isLoading}
                    variant="outline"
                    size="sm"
                  >
                    {isLoading && (
                      <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                    )}
                    Reconnect
                  </Button>
                )}
                <Button
                  onClick={handleDisconnect}
                  disabled={isLoading}
                  variant={status === "error" ? "destructive" : "outline"}
                  size="sm"
                >
                  {isLoading && (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  )}
                  Disconnect
                </Button>
              </>
            ) : (
              <Button
                onClick={handleConnect}
                disabled={isLoading || !isConfigured}
                size="sm"
              >
                {isLoading && (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                )}
                {isConfigured ? "Enable" : "Not Configured"}
              </Button>
            )}
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
                <Globe className="size-3.5" />
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

      {/* Features */}
      {features.length > 0 && (
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <h2 className="text-base font-semibold">Features</h2>
          <p className="text-sm text-muted-foreground">
            The following capabilities are supported.
          </p>
          <ul className="space-y-2">
            {features.map((feature, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm">
                <CheckCircle className="size-4 text-emerald-500 mt-0.5 shrink-0" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* How to install */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="text-base font-semibold">How to install</h2>
        <ol className="space-y-3">
          {[
            `Click on "Enable" to start the authorization flow`,
            `Grant ${name} permission to access your account`,
            `You're all set — the integration will be active immediately`,
          ].map((step, idx) => (
            <li key={idx} className="flex items-start gap-3 text-sm">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                {idx + 1}
              </span>
              <span className="text-muted-foreground">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Not configured warning */}
      {!isConfigured && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-950">
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
            Configuration required
          </p>
          <p className="mt-1 text-xs text-yellow-700 dark:text-yellow-400">
            This integration requires environment variables to be set before it
            can be enabled.
          </p>
        </div>
      )}
    </div>
  );
}
