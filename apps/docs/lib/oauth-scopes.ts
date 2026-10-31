// OAuth scopes QRdx grants to apps. Client-safe: the consent screen and the
// developer settings import this; lib/oauth.ts re-exports it for the server.

export const OAUTH_SCOPES = [
  "themes:read",
  "profile:read",
  "codes:read",
  "codes:write",
] as const;
export type OAuthScope = (typeof OAUTH_SCOPES)[number];

export const OAUTH_SCOPE_INFO: Record<
  OAuthScope,
  { label: string; consent: string }
> = {
  "profile:read": {
    label: "Profile",
    consent: "Read your profile (name, email and avatar)",
  },
  "themes:read": {
    label: "Themes",
    consent: "Read your saved QR themes",
  },
  "codes:read": {
    label: "Read codes",
    consent: "Read your dynamic QR codes and their scan analytics",
  },
  "codes:write": {
    label: "Manage codes",
    consent:
      "Create, edit and delete your dynamic QR codes, report conversions and manage webhook subscriptions",
  },
};

export function isOAuthScope(value: string): value is OAuthScope {
  return (OAUTH_SCOPES as readonly string[]).includes(value);
}
