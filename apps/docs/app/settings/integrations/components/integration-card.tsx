"use client";

import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
  connectedAt,
  features,
  category,
}: IntegrationCardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);

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
        `${name} is not configured. Please add the required environment variables.`
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 flex size-10 items-center justify-center rounded-lg p-2">
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
            <div>
              <CardTitle className="text-lg">{name}</CardTitle>
              {getStatusBadge()}
            </div>
          </div>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Features list */}
        {features && features.length > 0 && (
          <div>
            <p className="text-muted-foreground mb-2 text-xs font-medium">
              Features
            </p>
            <ul className="space-y-1">
              {features.slice(0, 3).map((feature, idx) => (
                <li key={idx} className="text-xs text-muted-foreground flex items-start">
                  <span className="mr-2">•</span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Connected metadata */}
        {isConnected && metadata && (
          <div className="space-y-2 pt-2 border-t">
            {metadata.workspace && (
              <div className="border-muted bg-muted/50 rounded-md border p-2">
                <p className="text-muted-foreground text-xs font-medium">
                  Connected Workspace
                </p>
                <p className="text-sm font-semibold">{metadata.workspace.name}</p>
                {metadata.workspace.slug && (
                  <p className="text-muted-foreground text-xs">
                    {metadata.workspace.slug}
                  </p>
                )}
              </div>
            )}
            {metadata.user && (
              <div className="border-muted bg-muted/50 rounded-md border p-2">
                <p className="text-muted-foreground text-xs font-medium">
                  Connected Account
                </p>
                <p className="text-sm font-semibold">{metadata.user.displayName}</p>
              </div>
            )}
            {connectedAt && (
              <p className="text-muted-foreground text-xs">
                Connected on {new Date(connectedAt).toLocaleDateString()}
              </p>
            )}
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

      <CardFooter className="gap-2">
        {isConnected ? (
          <>
            {status === "error" && (
              <Button
                onClick={handleConnect}
                disabled={isLoading}
                variant="outline"
                className="flex-1"
              >
                {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
                Reconnect
              </Button>
            )}
            <Button
              onClick={handleDisconnect}
              disabled={isLoading}
              variant={status === "error" ? "destructive" : "outline"}
              className={status !== "error" ? "flex-1" : ""}
            >
              {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
              Disconnect
            </Button>
          </>
        ) : (
          <Button
            onClick={handleConnect}
            disabled={isLoading || !isConfigured}
            className="w-full"
            variant={isConfigured ? "default" : "secondary"}
          >
            {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
            {isConfigured ? `Connect ${name}` : "Not Configured"}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

