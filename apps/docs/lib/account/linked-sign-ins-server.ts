import "server-only";

import { keys as authKeys } from "@repo/auth/keys";
import { ssoConfirmsFor } from "@repo/auth/sso";
import { account as accountTable, database as db } from "@repo/database";
import { eq } from "drizzle-orm";
import { isFeatureAvailable } from "@/lib/feature-availability";
import type { ConfirmSignInProvider } from "./confirmation";
import { SOCIAL_PROVIDERS, type SocialProvider } from "./sign-in-methods";

/** Social providers with both a client id and secret on this server. */
export function configuredSocialProviders(): SocialProvider[] {
  const env = authKeys();
  return SOCIAL_PROVIDERS.filter((provider) =>
    provider === "google"
      ? Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
      : Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
  );
}

/**
 * The sign-ins that can confirm it's you for this person (./confirmation.ts):
 * Google and GitHub when linked and configured here, workspace SSO when
 * their address's connection is usable and they sign in through it.
 */
export async function linkedSignInsFor({
  userId,
  email,
}: {
  userId: string;
  email: string;
}): Promise<ConfirmSignInProvider[]> {
  const rows = await db
    .select({ providerId: accountTable.providerId })
    .from(accountTable)
    .where(eq(accountTable.userId, userId));
  const linked = new Set(rows.map((row) => row.providerId));
  const found: ConfirmSignInProvider[] = configuredSocialProviders().filter(
    (provider) => linked.has(provider),
  );
  if (isFeatureAvailable("sso") && (await ssoConfirmsFor(userId, email))) {
    found.push("sso");
  }
  return found;
}
