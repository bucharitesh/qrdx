"use client";

import { Spinner as Loader2 } from "@repo/design-system/components/icons";
import {
  Alert,
  AlertDescription,
} from "@repo/design-system/components/ui/alert";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Skeleton } from "@repo/design-system/components/ui/skeleton";
import type { DriveFile } from "@repo/integrations";
import {
  DocumentText as FileText,
  Folder2 as Folder,
  SearchNormal1 as Search,
} from "iconsax-reactjs";
import * as React from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-fetch";
import { useGoogleDriveIntegration } from "@/lib/hooks/use-google-drive-integration";
import type { GoogleDriveFormData } from "@/lib/validations/qr-content";
import { googleDriveSchema } from "@/lib/validations/qr-content";
import { useQREditorStore } from "@/store/editor-store";
import type { GoogleDriveContent } from "@/types/qr-content";
import { encodeGoogleDrive } from "@/utils/qr-content-encoder";

function isFolder(file: DriveFile): boolean {
  return file.mimeType === "application/vnd.google-apps.folder";
}

function getDriveUrl(file: DriveFile): string {
  return file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`;
}

export function GoogleDriveForm() {
  const { setValue, getContentConfig, setContentConfig } = useQREditorStore();
  const {
    files,
    isLoading,
    isConnected,
    error,
    nextPageToken,
    search,
    loadMore,
  } = useGoogleDriveIntegration();

  const storedConfig = getContentConfig("google-drive") as
    | GoogleDriveContent
    | undefined;
  const [driveData, setDriveData] = React.useState<GoogleDriveFormData>({
    url: storedConfig?.url || "",
    name: storedConfig?.name,
    fileId: storedConfig?.fileId,
    mimeType: storedConfig?.mimeType,
    source: storedConfig?.source || "manual",
  });
  const [searchTerm, setSearchTerm] = React.useState("");
  const [isConnecting, setIsConnecting] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    const result = googleDriveSchema.safeParse(driveData);

    if (result.success) {
      const config: GoogleDriveContent = {
        type: "google-drive",
        ...result.data,
      };
      setValue(encodeGoogleDrive(config));
      setContentConfig("google-drive", config);
      setErrors({});
      return;
    }

    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0] as string;
      fieldErrors[field] = issue.message;
    }
    setErrors(fieldErrors);
  }, [driveData, setContentConfig, setValue]);

  const handleConnect = async () => {
    setIsConnecting(true);

    try {
      const response = await apiFetch(
        "/api/integrations/google-drive?action=connect",
      );

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.error ?? "Failed to start Google Drive connection",
        );
      }

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }

      throw new Error("Google Drive did not return an authorization URL");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to connect Google Drive",
      );
      setIsConnecting(false);
    }
  };

  const handleFileSelect = (file: DriveFile) => {
    setDriveData({
      url: getDriveUrl(file),
      name: file.name,
      fileId: file.id,
      mimeType: file.mimeType,
      source: "drive-selected",
    });
  };

  return (
    <div className="space-y-4">
      {!isConnected && (
        <Alert>
          <AlertDescription className="space-y-3">
            <p>
              Connect Google Drive to browse files and folders, or paste a Drive
              URL manually below.
            </p>
            <Button
              disabled={isConnecting}
              onClick={handleConnect}
              size="sm"
              type="button"
            >
              {isConnecting && (
                <Loader2 className="mr-2 size-3.5 animate-spin" />
              )}
              Connect Google Drive
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="google-drive-url">
          Google Drive URL *
        </Label>
        <Input
          className={errors.url ? "border-destructive" : ""}
          id="google-drive-url"
          onChange={(event) =>
            setDriveData({
              url: event.target.value,
              source: "manual",
            })
          }
          placeholder="https://drive.google.com/file/d/..."
          type="url"
          value={driveData.url}
        />
        {errors.url ? (
          <p className="text-destructive text-[11px]">{errors.url}</p>
        ) : (
          <p className="text-muted-foreground text-[11px]">
            Scanning will open the selected Google Drive file or folder.
          </p>
        )}
      </div>

      {isConnected && (
        <div className="space-y-3 rounded-xl border bg-card p-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                onChange={(event) => setSearchTerm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    search(searchTerm);
                  }
                }}
                placeholder="Search Drive files and folders"
                value={searchTerm}
              />
            </div>
            <Button
              disabled={isLoading}
              onClick={() => search(searchTerm)}
              type="button"
              variant="outline"
            >
              Search
            </Button>
          </div>

          {error && <p className="text-destructive text-xs">{error}</p>}

          <div className="max-h-64 space-y-1 overflow-y-auto">
            {isLoading && files.length === 0 ? (
              <>
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </>
            ) : (
              files.map((file) => {
                const Icon = isFolder(file) ? Folder : FileText;
                const isSelected = driveData.fileId === file.id;

                return (
                  <button
                    className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors hover:bg-accent ${
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "bg-background"
                    }`}
                    key={file.id}
                    onClick={() => handleFileSelect(file)}
                    type="button"
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  </button>
                );
              })
            )}
          </div>

          {nextPageToken && (
            <Button
              disabled={isLoading}
              onClick={loadMore}
              size="sm"
              type="button"
              variant="outline"
            >
              Load more
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
