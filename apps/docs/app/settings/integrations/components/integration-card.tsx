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
  status?: "active" | "disconnected" | "error";
  metadata?: any;
  connectedAt?: Date;
}

export function IntegrationCard({
  name,
  slug,
  description,
  logo,
  isConnected,
  status,
  metadata,
  connectedAt,
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

      {isConnected && metadata && (
        <CardContent className="space-y-2">
          {metadata.workspace && (
            <div className="border-muted bg-muted/50 rounded-md border p-3">
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
          {connectedAt && (
            <p className="text-muted-foreground text-xs">
              Connected on {new Date(connectedAt).toLocaleDateString()}
            </p>
          )}
        </CardContent>
      )}

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
            disabled={isLoading}
            className="w-full"
          >
            {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
            Connect {name}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

