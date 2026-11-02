/**
 * Settings → Account → Sign-in methods. Client-safe and pure.
 *
 * Email codes need no linked account: anyone who can read the account's
 * inbox can sign in, so that method is always on. Google and GitHub are
 * Better Auth `account` rows, and any of them can be unlinked, the last one
 * too (`allowUnlinkingAll` in packages/auth/server.ts): email codes keep
 * working, so nobody is locked out.
 */

export const SOCIAL_PROVIDERS = ["google", "github"] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export const PROVIDER_LABELS: Record<SocialProvider, string> = {
  google: "Google",
  github: "GitHub",
};

export function isSocialProvider(value: string): value is SocialProvider {
  return (SOCIAL_PROVIDERS as readonly string[]).includes(value);
}

/** An `account` row as Better Auth's listUserAccounts returns it (no tokens). */
export interface LinkedAccount {
  id: string;
  providerId: string;
  createdAt: Date | string;
}

export type UnlinkBlockReason = "not-found" | "unsupported";

/**
 * Why `accountId` can't be unlinked, or null when it can. Every linked
 * account belongs to the signed-in user (the list is theirs), so an unknown
 * id is someone else's or stale.
 */
export function unlinkBlockReason(
  accounts: readonly LinkedAccount[],
  accountId: string,
): UnlinkBlockReason | null {
  const target = accounts.find((account) => account.id === accountId);
  if (!target) return "not-found";
  if (!isSocialProvider(target.providerId)) return "unsupported";
  return null;
}

export const UNLINK_BLOCK_MESSAGES: Record<UnlinkBlockReason, string> = {
  "not-found": "That sign-in method isn't linked to your account.",
  unsupported: "This sign-in method can't be removed here.",
};

/** Said wherever unlinking is offered: email codes always remain. */
export const EMAIL_CODES_REMAIN =
  "You can still sign in with a code sent to your email.";

export interface SignInMethodView {
  /** Account row id, or "email" for email codes */
  id: string;
  kind: "email" | SocialProvider;
  label: string;
  linkedAt: string | null;
  /** Null when it can be removed, else why not */
  unlinkBlocked: string | null;
}

/** Linked providers first (Google, GitHub), then email codes. */
export function toSignInMethods(
  accounts: readonly LinkedAccount[],
  formatDate: (date: Date) => string,
): SignInMethodView[] {
  const social = accounts
    .filter((account) => isSocialProvider(account.providerId))
    .sort(
      (a, b) =>
        SOCIAL_PROVIDERS.indexOf(a.providerId as SocialProvider) -
        SOCIAL_PROVIDERS.indexOf(b.providerId as SocialProvider),
    )
    .map((account): SignInMethodView => {
      const reason = unlinkBlockReason(accounts, account.id);
      return {
        id: account.id,
        kind: account.providerId as SocialProvider,
        label: PROVIDER_LABELS[account.providerId as SocialProvider],
        linkedAt: formatDate(new Date(account.createdAt)),
        unlinkBlocked: reason ? UNLINK_BLOCK_MESSAGES[reason] : null,
      };
    });
  return [
    ...social,
    {
      id: "email",
      kind: "email",
      label: "Email code",
      linkedAt: null,
      unlinkBlocked: "Email codes always work for your address.",
    },
  ];
}

/** Providers that can still be linked: configured here and not yet linked. */
export function linkableProviders(
  accounts: readonly LinkedAccount[],
  configured: readonly SocialProvider[],
): SocialProvider[] {
  const linked = new Set(accounts.map((account) => account.providerId));
  return SOCIAL_PROVIDERS.filter(
    (provider) => configured.includes(provider) && !linked.has(provider),
  );
}

/** Better Auth's OAuth callback error codes (?error=) after linking. */
export function linkErrorMessage(code: string | null | undefined): string {
  switch (code) {
    case "email_does_not_match":
      return "That account uses a different email address. You can only link accounts with the same email as your QRdx account.";
    case "account_already_linked_to_different_user":
      return "That account already signs in to a different QRdx account.";
    case "unable_to_link_account":
    case "email_not_verified":
      return "That account's email address isn't verified with the provider, so it can't be linked.";
    case "access_denied":
      return "Linking was cancelled.";
    default:
      return "We couldn't link that account. Please try again.";
  }
}
