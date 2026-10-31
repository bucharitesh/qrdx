/** Short.io API shapes QRdx reads (https://developers.short.io). */

export interface ShortIoDomain {
  id: number;
  hostname: string;
  state?: string;
}

export interface ShortIoLink {
  idString: string;
  id?: string | number;
  shortURL: string;
  secureShortURL?: string;
  originalURL: string;
  path?: string;
  title?: string | null;
  tags?: string[];
  createdAt?: string;
  DomainId?: number;
}

export interface ShortIoLinkList {
  links: ShortIoLink[];
  count?: number;
  nextPageToken?: string | null;
}

/** Saved in the integration row's metadata. */
export interface ShortIoMetadata {
  domainCount?: number;
  /** Picked in settings; links are created and listed on it. */
  defaultDomain?: { id: string; hostname: string };
}
