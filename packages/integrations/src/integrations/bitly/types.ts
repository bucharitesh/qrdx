/** Bitly API v4 shapes QRdx reads (https://dev.bitly.com/api-reference). */

export interface BitlyUser {
  login: string;
  name?: string;
  emails?: Array<{
    email: string;
    is_primary?: boolean;
    is_verified?: boolean;
  }>;
  default_group_guid?: string;
}

export interface BitlyGroup {
  guid: string;
  name: string;
  organization_guid?: string;
  is_active?: boolean;
  bsds?: string[];
}

export interface BitlyBitlink {
  /** `domain/hash`, e.g. `bit.ly/3xYz` */
  id: string;
  link: string;
  long_url: string;
  title?: string | null;
  tags?: string[];
  archived?: boolean;
  created_at?: string;
}

export interface BitlyBitlinkList {
  links: BitlyBitlink[];
  pagination?: { search_after?: string; next?: string; size?: number };
}

/** Saved in the integration row's metadata. */
export interface BitlyMetadata {
  login?: string;
  name?: string;
  groupGuid?: string;
  defaultDomain?: { id: string; hostname: string };
}
