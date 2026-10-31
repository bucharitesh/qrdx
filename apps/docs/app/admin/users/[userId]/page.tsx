import { Badge } from "@repo/design-system/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SettingsHeader } from "@/app/settings/components/settings-header";
import { EmptyRow, Section, StatCard } from "../../_components/stat-card";
import { UserActions } from "../../_components/user-actions";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
} from "../../_lib/format";
import { requireAdmin } from "../../_lib/guard";
import { getUserDetail } from "../../_lib/queries";

export const metadata: Metadata = { title: "Admin · User" };

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const admin = await requireAdmin();
  const { userId } = await params;
  const detail = await getUserDetail(userId);

  if (!detail) {
    notFound();
  }

  const { user, themes, integrations, subscriptions, usage, sessions } = detail;

  return (
    <div className="space-y-4">
      <Link
        className="text-muted-foreground text-sm hover:underline"
        href="/admin/users"
      >
        ← All users
      </Link>
      <SettingsHeader
        title={user.name || user.email}
        description={user.email}
      />

      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">id: {user.id}</Badge>
        <Badge variant="outline">role: {user.role ?? "user"}</Badge>
        <Badge variant="outline">
          {user.emailVerified ? "email verified" : "email unverified"}
        </Badge>
        {detail.providers.map((provider) => (
          <Badge key={provider} variant="secondary">
            {provider}
          </Badge>
        ))}
        {user.banned && <Badge variant="destructive">banned</Badge>}
      </div>

      {user.banned && (
        <p className="text-destructive text-sm">
          Reason: {user.banReason ?? "—"} · Expires:{" "}
          {user.banExpires ? formatDateTime(user.banExpires) : "never"}
        </p>
      )}

      <Section title="Actions">
        <UserActions
          banned={Boolean(user.banned)}
          email={user.email}
          isSelf={user.id === admin.id}
          role={user.role}
          userId={user.id}
        />
      </Section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Joined" value={formatDate(user.createdAt)} />
        <StatCard
          label="AI generations"
          value={formatNumber(usage.total)}
          hint={`${formatNumber(usage.last30d)} in 30d`}
        />
        <StatCard
          label="Live sessions"
          value={formatNumber(sessions.active)}
          hint={`Last seen ${formatDateTime(sessions.lastSeenAt)}`}
        />
        <StatCard label="Saved themes" value={formatNumber(themes.length)} />
      </div>

      <Section title="Subscriptions">
        {subscriptions.length === 0 ? (
          <EmptyRow>No subscriptions</EmptyRow>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Period end</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    {row.status}
                    {row.cancelAtPeriodEnd && " (cancels at period end)"}
                  </TableCell>
                  <TableCell>
                    {formatMoney(row.amount, row.currency)} /{" "}
                    {row.recurringInterval}
                  </TableCell>
                  <TableCell>{formatDate(row.currentPeriodEnd)}</TableCell>
                  <TableCell>{formatDate(row.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section title="Themes">
        {themes.length === 0 ? (
          <EmptyRow>No saved themes</EmptyRow>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Community</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {themes.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="max-w-[240px] truncate">
                    {row.name}
                  </TableCell>
                  <TableCell>
                    {row.communityThemeId
                      ? `Published · ${formatNumber(row.likeCount ?? 0)} likes`
                      : "—"}
                  </TableCell>
                  <TableCell>{formatDate(row.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section title="Integrations">
        {integrations.length === 0 ? (
          <EmptyRow>No integrations</EmptyRow>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Last sync</TableHead>
                <TableHead>Connected</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {integrations.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.provider}</TableCell>
                  <TableCell>{row.status}</TableCell>
                  <TableCell className="max-w-[240px] truncate">
                    {row.scopes ?? "—"}
                  </TableCell>
                  <TableCell>{formatDateTime(row.lastSyncAt)}</TableCell>
                  <TableCell>{formatDate(row.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section title="Recent AI generations">
        {detail.recentUsage.length === 0 ? (
          <EmptyRow>No AI usage</EmptyRow>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.recentUsage.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.modelId}</TableCell>
                  <TableCell>{formatDateTime(row.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section title="Admin history">
        {detail.auditEntries.length === 0 ? (
          <EmptyRow>No admin actions on this user</EmptyRow>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>By</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.auditEntries.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.action}</TableCell>
                  <TableCell>
                    {String(row.metadata?.actorEmail ?? row.actorUserId)}
                  </TableCell>
                  <TableCell>{formatDateTime(row.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </div>
  );
}
