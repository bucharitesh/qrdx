/** Rebrandly API v1 shapes QRdx reads (https://developers.rebrandly.com). */

export interface RebrandlyAccount {
  id: string;
  username?: string;
  email?: string;
  fullName?: string;
}

export interface RebrandlyDomain {
  id: string;
  fullName: string;
  active?: boolean;
  /** "service" for rebrand.ly and other shared domains */
  type?: "user" | "service" | string;
}

export interface RebrandlyLink {
  id: string;
  title?: string;
  slashtag: string;
  destination: string;
  /** Without scheme, e.g. "rebrand.ly/abc" */
  shortUrl: string;
  createdAt?: string;
  clicks?: number;
  tags?: Array<string | { name?: string }>;
  domain?: { id?: string; fullName?: string };
  domainName?: string;
}

/** Saved in the integration row's metadata. */
export interface RebrandlyMetadata {
  accountId?: string;
  name?: string;
  email?: string;
  defaultDomain?: { id: string; hostname: string };
}
