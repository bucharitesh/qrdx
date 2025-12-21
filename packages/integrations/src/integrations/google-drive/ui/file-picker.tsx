/** biome-ignore-all lint/correctness/useExhaustiveDependencies: <explanation> */
"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Input } from "@repo/design-system/components/ui/input";
import { ScrollArea } from "@repo/design-system/components/ui/scroll-area";
import {
  FileImage,
  Image as ImageIcon,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { DriveFile } from "../types";

type GoogleDriveFilePickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFileSelect: (file: DriveFile) => void;
  accessToken: string;
};

export function GoogleDriveFilePicker({
  open,
  onOpenChange,
  onFileSelect,
  accessToken,
}: GoogleDriveFilePickerProps) {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  // Load files on mount
  useEffect(() => {
    if (open && files.length === 0) {
      loadFiles();
    }
  }, [open]);

  const loadFiles = async (pageToken?: string, search?: string) => {
    setLoading(true);
    setError(null);

    try {
      const baseUrl = "https://www.googleapis.com/drive/v3/files";
      const params = new URLSearchParams({
        fields:
          "nextPageToken, files(id, name, mimeType, thumbnailLink, webContentLink, webViewLink, iconLink, createdTime, modifiedTime, size)",
        pageSize: "20",
      });

      // Add image filter query
      const imageQuery = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/svg+xml",
        "image/webp",
      ]
        .map((type) => `mimeType='${type}'`)
        .join(" or ");

      let query = `(${imageQuery}) and trashed=false`;

      // Add search if provided
      if (search?.trim()) {
        query = `name contains '${search.trim()}' and (${query})`;
      }

      params.set("q", query);
      params.set("orderBy", "modifiedTime desc");

      if (pageToken) {
        params.set("pageToken", pageToken);
      }

      const response = await fetch(`${baseUrl}?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to load files from Google Drive");
      }

      const data = await response.json();

      setFiles((prev) => (pageToken ? [...prev, ...data.files] : data.files));
      setNextPageToken(data.nextPageToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setFiles([]);
    setNextPageToken(undefined);
    loadFiles(undefined, searchTerm);
  };

  const handleLoadMore = () => {
    if (nextPageToken) {
      loadFiles(nextPageToken, searchTerm);
    }
  };

  const handleFileSelect = (file: DriveFile) => {
    onFileSelect(file);
    onOpenChange(false);
  };

  const handleClearSearch = () => {
    setSearchTerm("");
    setFiles([]);
    setNextPageToken(undefined);
    loadFiles();
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[80vh] max-w-4xl">
        <DialogHeader>
          <DialogTitle>Import from Google Drive</DialogTitle>
          <DialogDescription>
            Select an image from your Google Drive to use in your QR code
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search bar */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSearch();
                  }
                }}
                placeholder="Search for images..."
                value={searchTerm}
              />
              {searchTerm && (
                <button
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={handleClearSearch}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button disabled={loading} onClick={handleSearch}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Search
            </Button>
          </div>

          {/* Error message */}
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-destructive text-sm">
              {error}
            </div>
          )}

          {/* Files grid */}
          <ScrollArea className="h-[400px] rounded-md border">
            {loading && files.length === 0 ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : files.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <FileImage className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="font-medium text-sm">No images found</p>
                <p className="text-muted-foreground text-xs">
                  {searchTerm
                    ? "Try a different search term"
                    : "Your Google Drive doesn't contain any images"}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-4 p-4">
                {files.map((file) => (
                  <button
                    className="group relative aspect-square overflow-hidden rounded-lg border bg-muted hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                    key={file.id}
                    onClick={() => handleFileSelect(file)}
                    type="button"
                  >
                    {file.thumbnailLink ? (
                      <img
                        alt={file.name}
                        className="h-full w-full object-cover"
                        src={file.thumbnailLink}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <ImageIcon className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 text-white text-xs opacity-0 transition-opacity group-hover:opacity-100">
                      <p className="truncate font-medium">{file.name}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Load more button */}
            {nextPageToken && !loading && (
              <div className="flex justify-center p-4">
                <Button
                  disabled={loading}
                  onClick={handleLoadMore}
                  variant="outline"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Load More
                </Button>
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
