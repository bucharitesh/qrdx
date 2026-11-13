import { auth } from "@repo/auth/server";
import { SESSION_MAX_MS } from "@repo/auth/session-lifetime";
import { database as db, session as sessionTable } from "@repo/database";
import { and, desc, eq, gt } from "drizzle-orm";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ConfirmIdentityProvider } from "@/components/confirm-identity/provider";
import { CONFIRM_RETURN_PARAM } from "@/lib/account/confirmation";
import { planAccountDeletion } from "@/lib/account/deletion";
import { loadDeletionFacts } from "@/lib/account/deletion-server";
import { describeDeletionPlan } from "@/lib/account/deletion-summary";
import { configuredSocialProviders } from "@/lib/account/linked-sign-ins-server";
import { toSessionViews } from "@/lib/account/sessions";
import {
  isSocialProvider,
  type LinkedAccount,
  linkableProviders,
  toSignInMethods,
} from "@/lib/account/sign-in-methods";
import { getMyCommunityProfile } from "@/lib/community/profiles";
import { CommunityUnavailableError } from "@/lib/community/store";
import { getAppLocale, getAppTranslations } from "@/lib/i18n/app-locale";
import { signInPath } from "@/lib/safe-redirect";
import { scanGeo } from "@/lib/scans";
import { isStorageConfigured } from "@/lib/storage/r2";
import { SettingsHeader } from "../components/settings-header";
import { CommunityProfileSection } from "./_components/community-profile-section";
import { DangerZoneSection } from "./_components/danger-zone-section";
import { DataExportSection } from "./_components/data-export-section";
import { ProfileSection } from "./_components/profile-section";
import { SessionsSection } from "./_components/sessions-section";
import {
  type LinkOutcome,
  SignInMethodsSection,
} from "./_components/sign-in-methods-section";
import { TwoFactorSection } from "./_components/two-factor-section";
import { WorkspaceTwoFactorNotice } from "./_components/workspace-two-factor-notice";

export const metadata: Metadata = {
  title: "Profile & security",
  robots: { index: false, follow: false },
};

const DATE_FORMAT = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeZone: "UTC",
});
const formatDate = (date: Date) => DATE_FORMAT.format(date);

// Sessions listed at most (newest first); older ones still end on expiry.
const SESSION_LIMIT = 50;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Back from Better Auth's link flow: ?linked=<provider> or ?error=<code>.
 * An error after signing in again to confirm it's you (?confirm=…) belongs
 * to the "Confirm it's you" dialog instead.
 */
function linkOutcome(params: Record<string, string | string[] | undefined>) {
  if (first(params[CONFIRM_RETURN_PARAM])) return null;
  const linked = first(params.linked);
  const error = first(params.error);
  if (error) {
    return { kind: "error", code: error.slice(0, 64) } satisfies LinkOutcome;
  }
  if (linked && isSocialProvider(linked)) {
    return { kind: "linked", provider: linked } satisfies LinkOutcome;
  }
  return null;
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getAppTranslations("app.settings.account.page");
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) redirect(signInPath("/settings/account"));

  const userId: string = session.user.id;
  const now = new Date();
  // Better Auth's listSessions needs a session younger than a day, which
  // would hide this list from most people; the rows are read directly.
  const [accounts, sessionRows, facts, params, communityProfile] =
    await Promise.all([
      auth.api.listUserAccounts({ headers: requestHeaders }) as Promise<
        LinkedAccount[]
      >,
      db
        .select({
          id: sessionTable.id,
          createdAt: sessionTable.createdAt,
          updatedAt: sessionTable.updatedAt,
          expiresAt: sessionTable.expiresAt,
          ipAddress: sessionTable.ipAddress,
          userAgent: sessionTable.userAgent,
        })
        .from(sessionTable)
        .where(
          and(
            eq(sessionTable.userId, userId),
            gt(sessionTable.expiresAt, now),
            // Past the 30-day cap a session no longer works, whatever its
            // row says (packages/auth/session-lifetime.ts).
            gt(
              sessionTable.createdAt,
              new Date(now.getTime() - SESSION_MAX_MS),
            ),
          ),
        )
        .orderBy(desc(sessionTable.updatedAt))
        .limit(SESSION_LIMIT),
      loadDeletionFacts(userId),
      searchParams,
      getMyCommunityProfile(userId).catch((error: unknown) => {
        if (error instanceof CommunityUnavailableError) return null;
        throw error;
      }),
    ]);

  const sessions = toSessionViews(sessionRows, {
    currentSessionId: session.session.id,
    now,
    currentLocation: scanGeo(requestHeaders as unknown as Headers),
  });
  // Changes to the account's security ask "Confirm it's you" first
  // (lib/account/confirmation.ts); one dialog serves the whole page.
  return (
    <ConfirmIdentityProvider>
      <div className="space-y-6">
        <SettingsHeader
          description={t("yourProfileHowYouSign")}
          title={t("profileSecurity")}
        />

        <ProfileSection
          profile={{
            name: session.user.name ?? "",
            email: session.user.email,
            emailVerified: Boolean(session.user.emailVerified),
            image: session.user.image ?? null,
            memberSince: formatDate(new Date(session.user.createdAt)),
            canUpload: isStorageConfigured,
          }}
        />

        <SignInMethodsSection
          email={session.user.email}
          linkable={linkableProviders(accounts, configuredSocialProviders())}
          methods={toSignInMethods(accounts, formatDate)}
          outcome={linkOutcome(params)}
        />

        {/* Sent here by a workspace that requires two-step verification:
            just above the section, where its link lands. */}
        <WorkspaceTwoFactorNotice next={first(params.next)} userId={userId} />

        <TwoFactorSection email={session.user.email} userId={userId} />

        <SessionsSection sessions={sessions} />

        {/* Hidden until the community tables exist (manual-sql/0012). */}
        {communityProfile && (
          <CommunityProfileSection profile={communityProfile} />
        )}

        <DataExportSection />

        <DangerZoneSection
          summary={describeDeletionPlan(
            planAccountDeletion(facts),
            await getAppTranslations("app.settings.account.deletion"),
            await getAppLocale(),
          )}
        />
      </div>
    </ConfirmIdentityProvider>
  );
}
