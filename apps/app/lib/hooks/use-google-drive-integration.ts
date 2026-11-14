import type { DriveFile } from "@repo/integrations";
import * as React from "react";

interface UseGoogleDriveIntegrationReturn {
  files: DriveFile[];
  isLoading: boolean;
  isConnected: boolean;
  error: string | null;
  nextPageToken?: string;
  search: (query: string) => Promise<void>;
  loadMore: () => Promise<void>;
  refetch: () => Promise<void>;
}

function getFilesUrl(search: string, pageToken?: string): string {
  const params = new URLSearchParams({
    sourceType: "all",
    pageSize: "30",
  });

  if (search.trim()) {
    params.set("search", search.trim());
  }

  if (pageToken) {
    params.set("pageToken", pageToken);
  }

  return `/api/integrations/google-drive/files?${params.toString()}`;
}

export function useGoogleDriveIntegration(): UseGoogleDriveIntegrationReturn {
  const [files, setFiles] = React.useState<DriveFile[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isConnected, setIsConnected] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [nextPageToken, setNextPageToken] = React.useState<
    string | undefined
  >();
  const [activeSearch, setActiveSearch] = React.useState("");

  const fetchFiles = React.useCallback(
    async (search: string, pageToken?: string) => {
      try {
        setIsLoading(true);
        setError(null);

        // Plain fetch: a 401 here means "not connected", not "sign the user out"
        const response = await fetch(getFilesUrl(search, pageToken));

        if (response.status === 404 || response.status === 401) {
          setIsConnected(false);
          setFiles([]);
          setNextPageToken(undefined);
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to fetch Google Drive files");
        }

        const data = await response.json();
        setFiles((currentFiles) =>
          pageToken
            ? [...currentFiles, ...(data.files || [])]
            : data.files || [],
        );
        setNextPageToken(data.nextPageToken);
        setIsConnected(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setIsConnected(false);
        setFiles([]);
        setNextPageToken(undefined);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    fetchFiles("");
  }, [fetchFiles]);

  const search = React.useCallback(
    async (query: string) => {
      setActiveSearch(query);
      await fetchFiles(query);
    },
    [fetchFiles],
  );

  const loadMore = React.useCallback(async () => {
    if (!nextPageToken) {
      return;
    }

    await fetchFiles(activeSearch, nextPageToken);
  }, [activeSearch, fetchFiles, nextPageToken]);

  const refetch = React.useCallback(async () => {
    await fetchFiles(activeSearch);
  }, [activeSearch, fetchFiles]);

  return {
    files,
    isLoading,
    isConnected,
    error,
    nextPageToken,
    search,
    loadMore,
    refetch,
  };
}
