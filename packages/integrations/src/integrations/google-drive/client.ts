import type { DriveFile, DriveFileList } from "./types";
import { IMAGE_QUERY } from "./types";

/**
 * Google Drive API Client
 * Provides methods to interact with the Google Drive API
 */
export class GoogleDriveClient {
  private baseUrl = "https://www.googleapis.com/drive/v3";

  constructor(private accessToken: string) {}

  /**
   * Make an authenticated request to the Google Drive API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        error: { message: "Unknown error" },
      }));
      throw new Error(
        `Google Drive API error: ${response.status} - ${error.error?.message || "Unknown error"}`
      );
    }

    return response.json();
  }

  /**
   * List files in Drive
   */
  async listFiles(params?: {
    pageSize?: number;
    pageToken?: string;
    query?: string;
    orderBy?: string;
  }): Promise<DriveFileList> {
    const searchParams = new URLSearchParams({
      fields:
        "nextPageToken, files(id, name, mimeType, thumbnailLink, webContentLink, webViewLink, iconLink, createdTime, modifiedTime, size, owners)",
      pageSize: (params?.pageSize || 20).toString(),
    });

    if (params?.pageToken) searchParams.set("pageToken", params.pageToken);
    if (params?.query) searchParams.set("q", params.query);
    if (params?.orderBy) searchParams.set("orderBy", params.orderBy);

    return this.request<DriveFileList>(`/files?${searchParams.toString()}`);
  }

  /**
   * List only image files
   */
  async listImageFiles(params?: {
    pageSize?: number;
    pageToken?: string;
    orderBy?: string;
  }): Promise<DriveFileList> {
    return this.listFiles({
      ...params,
      query: IMAGE_QUERY,
    });
  }

  /**
   * Search for files
   */
  async searchFiles(
    searchTerm: string,
    params?: {
      pageSize?: number;
      pageToken?: string;
      imagesOnly?: boolean;
    }
  ): Promise<DriveFileList> {
    let query = `name contains '${searchTerm}'`;

    if (params?.imagesOnly) {
      query = `(${query}) and (${IMAGE_QUERY})`;
    }

    return this.listFiles({
      ...params,
      query,
      orderBy: "modifiedTime desc",
    });
  }

  /**
   * Get file metadata
   */
  async getFile(fileId: string): Promise<DriveFile> {
    const searchParams = new URLSearchParams({
      fields:
        "id, name, mimeType, thumbnailLink, webContentLink, webViewLink, iconLink, createdTime, modifiedTime, size, owners",
    });

    return this.request<DriveFile>(
      `/files/${fileId}?${searchParams.toString()}`
    );
  }

  /**
   * Download file content
   */
  async downloadFile(fileId: string): Promise<Blob> {
    const url = `${this.baseUrl}/files/${fileId}?alt=media`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }

    return response.blob();
  }

  /**
   * Get file download URL
   */
  getDownloadUrl(fileId: string): string {
    return `${this.baseUrl}/files/${fileId}?alt=media`;
  }

  /**
   * Get file as Data URL (for embedding in HTML/React)
   */
  async getFileAsDataUrl(fileId: string): Promise<string> {
    const blob = await this.downloadFile(fileId);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

/**
 * Create a Google Drive client instance
 */
export function createGoogleDriveClient(
  accessToken: string
): GoogleDriveClient {
  return new GoogleDriveClient(accessToken);
}
