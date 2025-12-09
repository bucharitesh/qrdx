/**
 * Google Drive file resource
 */
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  webContentLink?: string;
  webViewLink?: string;
  iconLink?: string;
  createdTime: string;
  modifiedTime: string;
  size?: string;
  owners?: Array<{
    displayName: string;
    photoLink?: string;
  }>;
}

/**
 * Google Drive file list response
 */
export interface DriveFileList {
  kind: string;
  nextPageToken?: string;
  incompleteSearch: boolean;
  files: DriveFile[];
}

/**
 * Image MIME types supported
 */
export const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/svg+xml",
  "image/webp",
] as const;

/**
 * Image file filter query
 */
export const IMAGE_QUERY = IMAGE_MIME_TYPES.map(
  (type) => `mimeType='${type}'`
).join(" or ");
