import { keys as authKeys } from "@repo/auth/keys";
import { auth } from "@repo/auth/server";
import { database as db, session as sessionTable } from "@repo/database";
import { and, desc, eq, gt } from "drizzle-orm";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  describeDeletionPlan,
  isRecentSignIn,
  planAccountDeletion,
} from "@/lib/account/deletion";
import { loadDeletionFacts } from "@/lib/account/deletion-server";
import { signInCodesAvailable } from "@/lib/account/reauth";
import { toSessionViews } from "@/lib/account/sessions";
import {
  isSocialProvider,
  type LinkedAccount,
  linkableProviders,
  type SocialProvider,
  toSignInMethods,
} from "@/lib/account/sign-in-methods";
import { scanGeo } from "@/lib/scans";
import { isStorageConfigured } from "@/lib/storage/r2";
import { SettingsHeader } from "../components/settings-header";
import {
  DangerZoneSection,
  type ReauthMode,
} from "./_components/danger-zone-section";
import { DataExportSection } from "./_components/data-export-section";
import { ProfileSection } from "./_components/profile-section";
import { SessionsSection } from "./_components/sessions-section";
import {
  type LinkOutcome,
  SignInMethodsSection,
} from "./_components/sign-in-methods-section";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};

const DATE_FORMAT = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeZone: "UTC",
});
const formatDate = (date: Date) => DATE_FORMAT.format(date);

// Sessions listed at most (newest first); older ones still end on expiry.
const SESSION_LIMIT = 50;

/** Social providers with both a client id and secret on this server. */
function configuredProviders(): SocialProvider[] {
  const env = authKeys();
  return [
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? ["google"] : []),
    ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET ? ["github"] : []),
  ] as SocialProvider[];
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Back from Better Auth's link flow: ?linked=<provider> or ?error=<code>. */
function linkOutcome(params: Record<string, string | string[] | undefined>) {
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
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) redirect("/playground");

  const userId: string = session.user.id;
  const now = new Date();
  // Better Auth's listSessions needs a session younger than a day, which
  // would hide this list from most people; the rows are read directly.
  const [accounts, sessionRows, facts, params] = await Promise.all([
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
        and(eq(sessionTable.userId, userId), gt(sessionTable.expiresAt, now)),
      )
      .orderBy(desc(sessionTable.updatedAt))
      .limit(SESSION_LIMIT),
    loadDeletionFacts(userId),
    searchParams,
  ]);

  const sessions = toSessionViews(sessionRows, {
    currentSessionId: session.session.id,
    now,
    currentLocation: scanGeo(requestHeaders as unknown as Headers),
  });
  const reauth: ReauthMode = signInCodesAvailable()
    ? { kind: "code" }
    : {
        kind: "recent-sign-in",
        recent: isRecentSignIn(new Date(session.session.createdAt), now),
      };

  return (
    <div className="space-y-6">
      <SettingsHeader
        description="Your profile, how you sign in, where you're signed in, and your data."
        title="Account"
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
        linkable={linkableProviders(accounts, configuredProviders())}
        methods={toSignInMethods(accounts, formatDate)}
        outcome={linkOutcome(params)}
      />

      <SessionsSection sessions={sessions} />

      <DataExportSection />

      <DangerZoneSection
        email={session.user.email}
        reauth={reauth}
        summary={describeDeletionPlan(planAccountDeletion(facts))}
      />
    </div>
  );
}
