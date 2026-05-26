/**
 * Hook for Dub integration - fetch links and check connection status
 */

import * as React from "react";
import { apiFetch } from "@/lib/api-fetch";

interface DubLink {
  id: string;
  domain: string;
  key: string;
  url: string;
  title?: string;
  description?: string;
  qrCode?: string;
  archived: boolean;
  clicks?: number;
  createdAt: string;
}

interface CreateDubLinkInput {
  url: string;
  domain?: string;
  key?: string;
  title?: string;
  description?: string;
}

interface UseDubIntegrationReturn {
  links: DubLink[];
  isLoading: boolean;
  isMutating: boolean;
  isConnected: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createLink: (input: CreateDubLinkInput) => Promise<DubLink>;
}

export function useDubIntegration(): UseDubIntegrationReturn {
  const [links, setLinks] = React.useState<DubLink[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isMutating, setIsMutating] = React.useState(false);
  const [isConnected, setIsConnected] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchLinks = React.useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await apiFetch("/api/integrations/dub/links");

      if (response.status === 404) {
        // Dub integration not connected
        setIsConnected(false);
        setLinks([]);
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to fetch Dub links");
      }

      const data = await response.json();
      setLinks(data.links || []);
      setIsConnected(true);
    } catch (err) {
      console.error("Error fetching Dub links:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsConnected(false);
      setLinks([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  const createLink = React.useCallback(async (input: CreateDubLinkInput) => {
    setIsMutating(true);
    setError(null);

    try {
      const response = await apiFetch("/api/integrations/dub/links", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Failed to create Dub link");
      }

      const data = await response.json();
      const link = data.link as DubLink;
      setLinks((currentLinks) => [link, ...currentLinks]);
      setIsConnected(true);
      return link;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create Dub link";
      setError(message);
      throw new Error(message);
    } finally {
      setIsMutating(false);
    }
  }, []);

  return {
    links,
    isLoading,
    isMutating,
    isConnected,
    error,
    refetch: fetchLinks,
    createLink,
  };
}
