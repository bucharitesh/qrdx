/** Microsoft Graph v1.0 drive shapes QRdx reads. */

export interface GraphDriveItem {
  id: string;
  name: string;
  size?: number;
  lastModifiedDateTime?: string;
  webUrl?: string;
  folder?: { childCount?: number };
  file?: { mimeType?: string };
  package?: { type?: string };
  parentReference?: { path?: string; driveType?: string };
}

export interface GraphDriveItemList {
  value: GraphDriveItem[];
  "@odata.nextLink"?: string;
}

export interface GraphDrive {
  id: string;
  driveType?: "personal" | "business" | "documentLibrary" | string;
  owner?: { user?: { displayName?: string; email?: string; id?: string } };
}

export interface GraphPermission {
  id?: string;
  link?: { webUrl?: string; scope?: string; type?: string };
}
