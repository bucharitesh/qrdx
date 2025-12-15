/**
 * Hook for Dub integration - fetch links and check connection status
 */

import * as React from "react";

interface DubLink {
  id: string;
  domain: string;
  key: string;
  url: string;
  archived: boolean;
  clicks?: number;
  createdAt: string;
}

interface UseDubIntegrationReturn {
  links: DubLink[];
  isLoading: boolean;
  isConnected: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useDubIntegration(): UseDubIntegrationReturn {
  const [links, setLinks] = React.useState<DubLink[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isConnected, setIsConnected] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchLinks = React.useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/integrations/dub/links");

      if (response.status === 401) {
        // Not authenticated
        setIsConnected(false);
        setLinks([]);
        return;
      }

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

  return {
    links,
    isLoading,
    isConnected,
    error,
    refetch: fetchLinks,
  };
}
