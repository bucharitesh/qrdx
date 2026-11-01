import { hasAdminRole } from "@repo/auth/admin";
import { Badge } from "@repo/design-system/components/ui/badge";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SettingsHeader } from "@/app/settings/components/settings-header";
import { Facts, Panel } from "../../_components/panel";
import { UserActions } from "../../_components/user-actions";
import { formatAgo, formatDate, formatDateTime } from "../../_lib/format";
import { requireAdmin } from "../../_lib/guard";
import { loadProfile } from "../../_lib/user-360";
import {
  AbuseSection,
  AiUsageSection,
  AuditSection,
  BillingSection,
  CodesSection,
  ImportsSection,
  IntegrationsSection,
  LibrarySection,
  OAuthSection,
  PagesSection,
  ScansSection,
  SessionsSection,
  SignInSection,
  TeamsSection,
  WebhooksSection,
} from "./sections";

export const metadata: Metadata = { title: "Admin · User" };

const SECTIONS = [
  ["billing", "Billing"],
  ["teams", "Teams"],
  ["codes", "Codes"],
  ["pages", "Pages"],
  ["webhooks", "Webhooks"],
  ["integrations", "Integrations"],
  ["oauth", "OAuth"],
  ["imports", "Imports"],
  ["sessions", "Sessions"],
  ["abuse", "Abuse"],
  ["audit", "Audit"],
] as const;

/**
 * User 360: everything support needs about one account on one page. Every
 * panel streams and fails on its own; actions confirm, need a reason and
 * land in the audit log.
 */
export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const admin = await requireAdmin();
  const { userId } = await params;
  const profile = await loadProfile(userId);
  if (!profile) notFound();

  const { user } = profile;
  const email = user.email;

  return (
    <div className="space-y-4">
      <Link
        className="text-muted-foreground text-sm hover:underline"
        href="/admin/users"
      >
        ← All users
      </Link>
      <SettingsHeader description={email} title={user.name || email} />

      <div className="flex flex-wrap gap-2">
        <Badge className="font-mono" variant="outline">
          {user.id}
        </Badge>
        {hasAdminRole(user.role) && <Badge variant="secondary">admin</Badge>}
        <Badge variant="outline">
          {user.emailVerified ? "email verified" : "email not verified"}
        </Badge>
        {user.banned && <Badge variant="destructive">banned</Badge>}
        {user.id === admin.id && <Badge variant="secondary">you</Badge>}
      </div>

      {user.banned && (
        <p className="text-sm">
          <span className="font-medium">Banned:</span> {user.banReason ?? "—"} ·{" "}
          {user.banExpires
            ? `lifts ${formatDateTime(user.banExpires)}`
            : "no end date"}
        </p>
      )}

      <div className="bg-card space-y-4 rounded-xl border p-4">
        <Facts
          items={[
            { label: "Joined", value: formatDate(user.createdAt) },
            { label: "Last active", value: formatAgo(profile.lastActiveAt) },
            { label: "Live sessions", value: String(profile.liveSessions) },
          ]}
        />
        <UserActions
          banned={Boolean(user.banned)}
          email={email}
          emailVerified={user.emailVerified}
          isSelf={user.id === admin.id}
          role={user.role}
          userId={user.id}
        />
      </div>

      <nav
        aria-label="Sections"
        className="flex gap-1 overflow-x-auto pb-1 text-sm"
      >
        {SECTIONS.map(([id, label]) => (
          <a
            className="hover:bg-muted text-muted-foreground hover:text-foreground shrink-0 rounded-md px-2.5 py-1"
            href={`#${id}`}
            key={id}
          >
            {label}
          </a>
        ))}
      </nav>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          description="How they sign in"
          id="sign-in"
          title="Sign-in methods"
        >
          <SignInSection profile={profile} />
        </Panel>
        <Panel id="billing" title="Plan and billing">
          <BillingSection userId={userId} />
        </Panel>
        <Panel id="teams" title="Teams">
          <TeamsSection email={email} userId={userId} />
        </Panel>
        <Panel id="scans" title="Scans" description="Across all their codes">
          <ScansSection userId={userId} />
        </Panel>
        <Panel className="lg:col-span-2" id="codes" title="Dynamic codes">
          <CodesSection userId={userId} />
        </Panel>
        <Panel id="pages" title="Hosted pages and forms">
          <PagesSection userId={userId} />
        </Panel>
        <Panel id="library" title="Themes, folders and files">
          <LibrarySection userId={userId} />
        </Panel>
        <Panel className="lg:col-span-2" id="webhooks" title="Webhooks">
          <WebhooksSection userId={userId} />
        </Panel>
        <Panel
          description="Tokens are never shown"
          id="integrations"
          title="Integrations"
        >
          <IntegrationsSection userId={userId} />
        </Panel>
        <Panel id="oauth" title="OAuth apps">
          <OAuthSection userId={userId} />
        </Panel>
        <Panel id="imports" title="Imports">
          <ImportsSection userId={userId} />
        </Panel>
        <Panel id="sessions" title="Active sessions">
          <SessionsSection userId={userId} />
        </Panel>
        <Panel id="ai" title="AI usage">
          <AiUsageSection userId={userId} />
        </Panel>
        <Panel id="abuse" title="Abuse reports">
          <AbuseSection email={email} userId={userId} />
        </Panel>
        <Panel
          className="lg:col-span-2"
          description="Admin actions on this account and what they own"
          id="audit"
          title="Audit trail"
        >
          <AuditSection userId={userId} />
        </Panel>
      </div>
    </div>
  );
}
