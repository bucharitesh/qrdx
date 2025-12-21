"use client";

import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import {
  AlertCircle,
  CheckCircle,
  ExternalLink,
  Loader2,
  XCircle,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  connectIntegrationAction,
  disconnectIntegrationAction,
} from "../actions";

interface IntegrationCardProps {
  name: string;
  slug: string;
  description: string;
  logo: string;
  isConnected: boolean;
  isConfigured?: boolean;
  status?: "active" | "disconnected" | "error";
  metadata?: any;
  connectedAt?: Date;
  features?: string[];
  category?: string[];
}

export function IntegrationCard({
  name,
  slug,
  description,
  logo,
  isConnected,
  isConfigured = true,
  status,
  metadata,
  features,
}: IntegrationCardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Handle OAuth callback success/error
  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");

    if (success === `${slug}_connected`) {
      toast.success(`${name} connected successfully!`);
      // Clean up URL
      router.replace("/settings/integrations");
    } else if (error) {
      const errorMessages: Record<string, string> = {
        unauthorized: "You must be logged in to connect integrations",
        no_code: "Authorization code not received",
        missing_verifier: "Security verification failed",
        token_exchange_failed: "Failed to exchange authorization code",
        unexpected_error: "An unexpected error occurred",
      };
      toast.error(errorMessages[error] || `Failed to connect ${name}`);
      // Clean up URL
      router.replace("/settings/integrations");
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
    } catch (error) {
      toast.error("Failed to connect integration");
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm(`Are you sure you want to disconnect ${name}?`)) {
      return;
    }

    setIsLoading(true);
    try {
      await disconnectIntegrationAction(slug);
      toast.success(`${name} disconnected`);
      router.refresh();
    } catch (error) {
      toast.error("Failed to disconnect integration");
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = () => {
    if (!isConnected) return null;

    switch (status) {
      case "active":
        return (
          <Badge variant="default" className="gap-1">
            <CheckCircle className="size-3" />
            Connected
          </Badge>
        );
      case "error":
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="size-3" />
            Error
          </Badge>
        );
      case "disconnected":
        return (
          <Badge variant="secondary" className="gap-1">
            <AlertCircle className="size-3" />
            Disconnected
          </Badge>
        );
      default:
        return null;
    }
  };

  const hasExpandableContent =
    (features && features.length > 0) ||
    (isConnected && metadata) ||
    !isConfigured;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="bg-white border border-border flex size-10 items-center justify-center rounded-lg p-2 shrink-0">
              {logo ? (
                <img
                  src={logo}
                  alt={`${name} logo`}
                  className="size-full object-contain"
                />
              ) : (
                <ExternalLink className="text-primary size-5" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-lg">{name}</CardTitle>
                {getStatusBadge()}
              </div>
              <CardDescription className="mt-1">{description}</CardDescription>
            </div>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            {isConnected ? (
              <>
                {status === "error" && (
                  <Button
                    onClick={handleConnect}
                    disabled={isLoading}
                    variant="outline"
                    size="sm"
                  >
                    {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
                    Reconnect
                  </Button>
                )}
                <Button
                  onClick={handleDisconnect}
                  disabled={isLoading}
                  variant={status === "error" ? "destructive" : "outline"}
                  size="sm"
                >
                  {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Disconnect
                </Button>
              </>
            ) : (
              <Button
                onClick={handleConnect}
                disabled={isLoading || !isConfigured}
                size="sm"
                variant={isConfigured ? "default" : "secondary"}
              >
                {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
                {isConfigured ? "Connect" : "Not Configured"}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      {!isExpanded && hasExpandableContent && (
        <div className="px-6 pb-2 space-y-1">
          {features && features.length > 0 && (
            <div className="flex flex-col items-start gap-0">
              <ul className="space-y-1">
                {features.slice(0, 2).map((feature, idx) => (
                  <li
                    key={idx}
                    className="text-xs text-muted-foreground flex items-start"
                  >
                    <span className="mr-2">•</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!isConfigured && (
            <p className="text-xs text-yellow-600">
              ⚠️ Configuration required to enable this integration
            </p>
          )}
        </div>
      )}

      {isExpanded && hasExpandableContent && (
        <CardContent className="space-y-3 pt-0">
          {/* Features list */}
          {features && features.length > 0 && (
            <div>
              <ul className="space-y-1">
                {features.map((feature, idx) => (
                  <li
                    key={idx}
                    className="text-xs text-muted-foreground flex items-start"
                  >
                    <span className="mr-2">•</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}


          {/* Not configured warning */}
          {!isConfigured && (
            <div className="rounded-md bg-yellow-50 border border-yellow-200 p-2">
              <p className="text-xs text-yellow-800">
                Not configured. Add environment variables to enable.
              </p>
            </div>
          )}
        </CardContent>
      )}

      {hasExpandableContent && (
        <div className="px-6 pb-3">
          <Button
            variant="link"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-fit text-xs text-muted-foreground hover:text-foreground p-0 h-auto"
          >
            {isExpanded ? (
              <>
                Show less
              </>
            ) : (
              <>
                Read more...
              </>
            )}
          </Button>
        </div>
      )}
    </Card>
  );
}
