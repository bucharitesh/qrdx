import { Badge } from "@repo/design-system/components/ui/badge";
import Link from "next/link";
import { abuseReasonLabel } from "@/lib/safety/abuse-reasons";
import { AdminAction } from "../../_components/admin-action";
import {
  Empty,
  Facts,
  LoadFailed,
  Row,
  Rows,
  SubHeading,
} from "../../_components/panel";
import {
  formatAgo,
  formatBytes,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
} from "../../_lib/format";
import { signInMethodLabel } from "../../_lib/rules";
import { safeLoad } from "../../_lib/safe";
import {
  loadAbuseReports,
  loadAiUsage,
  loadAuditTrail,
  loadBilling,
  loadCodes,
  loadImports,
  loadIntegrations,
  loadLibrary,
  loadOAuthApps,
  loadPages,
  loadScans,
  loadSessions,
  loadTeams,
  loadWebhooks,
  type UserProfile,
} from "../../_lib/user-360";

// The sections of /admin/users/<id>. Each loads its own data (safeLoad turns
// a failed query into a notice) and sits in a <Panel> with its own Suspense
// and error boundary. Destinations and URLs are plain text on purpose: they
// may be malicious.

const userLink = (id: string) => `/admin/users/${encodeURIComponent(id)}`;

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-xs">{children}</span>;
}

// ─── Sign-in ─────────────────────────────────────────────────────────────────

export function SignInSection({ profile }: { profile: UserProfile }) {
  const { user, accounts } = profile;
  return (
    <Rows>
      <Row
        meta={
          user.emailVerified
            ? "Codes go to this address; it is verified."
            : "Not verified yet: team invitations can't be accepted until it is."
        }
        title={
          <>
            Email code
            <Badge variant="outline">always on</Badge>
          </>
        }
        actions={
          !user.emailVerified && (
            <AdminAction
              action="markEmailVerified"
              confirmLabel="Mark verified"
              description={`Only when ${user.email} is confirmed to belong to this person (e.g. they replied from it).`}
              input={{ userId: user.id }}
              label="Mark verified"
              success="Email marked verified"
              title="Mark email verified"
            />
          )
        }
      />
      {accounts.map((entry) => (
        <Row
          actions={
            <AdminAction
              action="unlinkSignIn"
              confirmLabel="Unlink"
              description={`They can no longer sign in with ${signInMethodLabel(entry.providerId)}; email codes keep working. Their last linked method can't be removed.`}
              destructive
              disabled={accounts.length <= 1}
              disabledHint="Their only linked sign-in method"
              input={{ userId: user.id, accountId: entry.id }}
              label="Unlink"
              success={`${signInMethodLabel(entry.providerId)} unlinked`}
              title={`Unlink ${signInMethodLabel(entry.providerId)}`}
              variant="ghost"
            />
          }
          key={entry.id}
          meta={`Linked ${formatDate(entry.createdAt)}`}
          title={signInMethodLabel(entry.providerId)}
        />
      ))}
    </Rows>
  );
}

// ─── Plan and billing ────────────────────────────────────────────────────────

export async function BillingSection({ userId }: { userId: string }) {
  const loaded = await safeLoad("billing", () => loadBilling(userId));
  if (!loaded.ok) return <LoadFailed />;
  const { plan, subscriptions, customerId, polarUrl } = loaded.data;
  const current = subscriptions[0];

  return (
    <div className="space-y-3">
      <Facts
        items={[
          { label: "Plan", value: <span className="capitalize">{plan}</span> },
          { label: "Status", value: current?.status ?? "No subscription" },
          {
            label: "Price",
            value: current
              ? `${formatMoney(current.amount, current.currency)} / ${current.recurringInterval}`
              : "—",
          },
          {
            label: "Current period",
            value: current
              ? `${formatDate(current.currentPeriodStart)} → ${formatDate(current.currentPeriodEnd)}`
              : "—",
          },
          {
            label: "Renews",
            value: current
              ? current.cancelAtPeriodEnd
                ? "Cancels at period end"
                : current.endedAt
                  ? `Ended ${formatDate(current.endedAt)}`
                  : "Yes"
              : "—",
          },
          {
            label: "Polar customer",
            value: customerId ? <Mono>{customerId}</Mono> : "—",
          },
        ]}
      />
      {polarUrl && (
        <a
          className="text-sm underline-offset-4 hover:underline"
          href={polarUrl}
          rel="noreferrer"
          target="_blank"
        >
          Open in Polar ↗
        </a>
      )}
      {subscriptions.length > 1 && (
        <>
          <SubHeading>History</SubHeading>
          <Rows>
            {subscriptions.slice(1).map((row) => (
              <Row
                key={row.id}
                meta={`${formatMoney(row.amount, row.currency)} / ${row.recurringInterval} · started ${formatDate(row.createdAt)}${row.canceledAt ? ` · canceled ${formatDate(row.canceledAt)}` : ""}`}
                title={row.status}
              />
            ))}
          </Rows>
        </>
      )}
      <p className="text-muted-foreground text-xs">
        Plans, prices and refunds are changed in Polar, not here.
      </p>
    </div>
  );
}

// ─── Teams ───────────────────────────────────────────────────────────────────

export async function TeamsSection({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  const loaded = await safeLoad("teams", () => loadTeams(userId, email));
  if (!loaded.ok) return <LoadFailed />;
  const { teams, invitations } = loaded.data;
  const now = Date.now();

  return (
    <div>
      {teams.length === 0 ? (
        <Empty>Not in any team.</Empty>
      ) : (
        <Rows>
          {teams.map((team) => (
            <Row
              key={team.memberId}
              meta={`${team.role} · ${formatNumber(team.members)} member${team.members === 1 ? "" : "s"} · joined ${formatDate(team.joinedAt)}`}
              title={
                <>
                  {team.name}
                  <Mono>{team.slug}</Mono>
                </>
              }
            />
          ))}
        </Rows>
      )}
      {invitations.length > 0 && (
        <>
          <SubHeading>Pending invitations</SubHeading>
          <Rows>
            {invitations.map((row) => {
              const expired = row.expiresAt.getTime() < now;
              return (
                <Row
                  actions={
                    <AdminAction
                      action="resendInvitation"
                      confirmLabel="Resend"
                      description={`Emails ${row.email} the invitation to ${row.teamName} again${expired ? " with a fresh 48 hours" : ""}. Outside production no email is sent.`}
                      input={{ invitationId: row.id }}
                      label="Resend"
                      success="Invitation resent"
                      title="Resend invitation"
                    />
                  }
                  key={row.id}
                  meta={`${row.direction === "received" ? "To them" : `Sent to ${row.email}`} · ${row.role ?? "member"} · ${expired ? "expired" : "expires"} ${formatDateTime(row.expiresAt)}`}
                  title={row.teamName}
                />
              );
            })}
          </Rows>
        </>
      )}
    </div>
  );
}

// ─── Codes ───────────────────────────────────────────────────────────────────

type CodeRow = Awaited<ReturnType<typeof loadCodes>>["recent"][number];

function CodeStatus({ code }: { code: CodeRow }) {
  if (code.deletedAt) return <Badge variant="outline">In trash</Badge>;
  if (!code.isActive) return <Badge variant="destructive">Disabled</Badge>;
  if (code.pausedAt) return <Badge variant="outline">Paused</Badge>;
  if (code.archivedAt) return <Badge variant="outline">Archived</Badge>;
  if (code.expiresAt && code.expiresAt.getTime() < Date.now()) {
    return <Badge variant="outline">Expired</Badge>;
  }
  return <Badge variant="secondary">Live</Badge>;
}

export function CodeActions({
  code,
}: {
  code: { id: string; slug: string; isActive: boolean; pausedAt: Date | null };
}) {
  return (
    <>
      <AdminAction
        action="setCodePaused"
        confirmLabel={code.pausedAt ? "Resume" : "Pause"}
        description={
          code.pausedAt
            ? `/q/${code.slug} starts redirecting again.`
            : `/q/${code.slug} sends visitors to its fallback (or a "paused" page). The owner can resume it.`
        }
        input={{ codeId: code.id, paused: !code.pausedAt }}
        label={code.pausedAt ? "Resume" : "Pause"}
        success={code.pausedAt ? "Code resumed" : "Code paused"}
        title={code.pausedAt ? "Resume code" : "Pause code"}
        variant="ghost"
      />
      <AdminAction
        action="setCodeActive"
        confirmLabel={code.isActive ? "Disable" : "Enable"}
        description={
          code.isActive
            ? `For abuse or phishing: /q/${code.slug} shows "no longer active" and the owner can't turn it back on.`
            : `/q/${code.slug} works again and the owner regains control.`
        }
        destructive={code.isActive}
        input={{ codeId: code.id, active: !code.isActive }}
        label={code.isActive ? "Disable" : "Enable"}
        success={code.isActive ? "Code disabled" : "Code enabled"}
        title={code.isActive ? "Disable code" : "Enable code"}
        variant="ghost"
      />
    </>
  );
}

export async function CodesSection({ userId }: { userId: string }) {
  const loaded = await safeLoad("codes", () => loadCodes(userId));
  if (!loaded.ok) return <LoadFailed />;
  const { counts, recent } = loaded.data;

  return (
    <div className="space-y-3">
      <Facts
        items={[
          { label: "Codes", value: formatNumber(counts?.total ?? 0) },
          { label: "Live", value: formatNumber(counts?.live ?? 0) },
          {
            label: "Scans (all time)",
            value: formatNumber(counts?.scans ?? 0),
          },
          { label: "Paused", value: formatNumber(counts?.paused ?? 0) },
          { label: "Disabled", value: formatNumber(counts?.disabled ?? 0) },
          {
            label: "Archived / trash",
            value: `${formatNumber(counts?.archived ?? 0)} / ${formatNumber(counts?.trashed ?? 0)}`,
          },
        ]}
      />
      {recent.length === 0 ? (
        <Empty>No dynamic codes.</Empty>
      ) : (
        <>
          <SubHeading>Latest</SubHeading>
          <Rows>
            {recent.map((code) => (
              <Row
                actions={!code.deletedAt && <CodeActions code={code} />}
                key={code.id}
                meta={
                  <>
                    <span
                      className="block max-w-full truncate"
                      title={code.destinationUrl}
                    >
                      {code.kind === "page"
                        ? "Hosted page"
                        : code.destinationUrl}
                    </span>
                    {formatNumber(code.scanCount)} scans · last{" "}
                    {formatAgo(code.lastScannedAt)} · created{" "}
                    {formatDate(code.createdAt)}
                    {code.organizationId && " · team code"}
                  </>
                }
                title={
                  <>
                    <Mono>/q/{code.slug}</Mono>
                    {code.title && (
                      <span className="text-muted-foreground max-w-[200px] truncate font-normal">
                        {code.title}
                      </span>
                    )}
                    <CodeStatus code={code} />
                  </>
                }
              />
            ))}
          </Rows>
          {(counts?.total ?? 0) > recent.length && (
            <Link
              className="text-sm underline-offset-4 hover:underline"
              href={`/admin/codes?q=${encodeURIComponent(userId)}`}
            >
              All {formatNumber(counts?.total ?? 0)} codes →
            </Link>
          )}
        </>
      )}
    </div>
  );
}

// ─── Pages and forms ─────────────────────────────────────────────────────────

export async function PagesSection({ userId }: { userId: string }) {
  const loaded = await safeLoad("pages", () => loadPages(userId));
  if (!loaded.ok) return <LoadFailed />;
  const { total, responses, pages } = loaded.data;

  return (
    <div className="space-y-3">
      <Facts
        items={[
          { label: "Hosted pages", value: formatNumber(total) },
          { label: "Form responses", value: formatNumber(responses.total) },
          { label: "Responses (30d)", value: formatNumber(responses.last30d) },
        ]}
      />
      {pages.length === 0 ? (
        <Empty>No hosted pages.</Empty>
      ) : (
        <Rows>
          {pages.map((page) => (
            <Row
              actions={
                page.code && (
                  <AdminAction
                    action="setCodeActive"
                    confirmLabel={
                      page.code.isActive ? "Disable page" : "Enable page"
                    }
                    description={
                      page.code.isActive
                        ? `For abuse: /p/${page.code.slug} shows "no longer active" and the owner can't turn it back on.`
                        : `/p/${page.code.slug} is shown again.`
                    }
                    destructive={page.code.isActive}
                    input={{
                      codeId: page.code.id,
                      active: !page.code.isActive,
                    }}
                    label={page.code.isActive ? "Disable" : "Enable"}
                    success={
                      page.code.isActive ? "Page disabled" : "Page enabled"
                    }
                    title={page.code.isActive ? "Disable page" : "Enable page"}
                    variant="ghost"
                  />
                )
              }
              key={page.id}
              meta={`${page.type} · v${page.version} · updated ${formatAgo(page.updatedAt)} · ${formatNumber(page.responses)} responses${page.lastResponseAt ? ` (last ${formatAgo(page.lastResponseAt)})` : ""}`}
              title={
                <>
                  {page.title || "Untitled page"}
                  {page.code ? (
                    <Mono>/p/{page.code.slug}</Mono>
                  ) : (
                    <Badge variant="outline">no code</Badge>
                  )}
                  {page.code && !page.code.isActive && (
                    <Badge variant="destructive">Disabled</Badge>
                  )}
                </>
              }
            />
          ))}
        </Rows>
      )}
    </div>
  );
}

// ─── Library ─────────────────────────────────────────────────────────────────

export async function LibrarySection({ userId }: { userId: string }) {
  const loaded = await safeLoad("library", () => loadLibrary(userId));
  if (!loaded.ok) return <LoadFailed />;
  const data = loaded.data;

  return (
    <div className="space-y-3">
      <Facts
        items={[
          {
            label: "Themes",
            value: `${formatNumber(data.themeCount)} (${formatNumber(data.publishedThemes)} public)`,
          },
          { label: "Folders", value: formatNumber(data.folderCount) },
          { label: "Tags", value: formatNumber(data.tagCount) },
          {
            label: "Files",
            value: `${formatNumber(data.files.total)} · ${formatBytes(data.files.bytes)}`,
          },
          { label: "Blocked files", value: formatNumber(data.files.blocked) },
        ]}
      />
      {data.themes.length > 0 && (
        <>
          <SubHeading>Latest themes</SubHeading>
          <Rows>
            {data.themes.map((theme) => (
              <Row
                key={theme.id}
                meta={`${formatDate(theme.createdAt)}${theme.organizationId ? " · team" : ""}${theme.communityThemeId ? ` · public, ${formatNumber(theme.likeCount ?? 0)} likes` : ""}`}
                title={<span className="truncate">{theme.name}</span>}
              />
            ))}
          </Rows>
        </>
      )}
      {data.folders.length > 0 && (
        <>
          <SubHeading>Latest folders</SubHeading>
          <Rows>
            {data.folders.map((entry) => (
              <Row
                key={entry.id}
                meta={`${formatDate(entry.createdAt)}${entry.parentId ? " · subfolder" : ""}${entry.organizationId ? " · team" : ""}`}
                title={<span className="truncate">{entry.name}</span>}
              />
            ))}
          </Rows>
        </>
      )}
    </div>
  );
}

// ─── Webhooks ────────────────────────────────────────────────────────────────

export async function WebhooksSection({ userId }: { userId: string }) {
  const loaded = await safeLoad("webhooks", () => loadWebhooks(userId));
  if (!loaded.ok) return <LoadFailed />;
  const { endpoints, deliveries, stats } = loaded.data;
  if (endpoints.length === 0) return <Empty>No webhook endpoints.</Empty>;
  const statsByEndpoint = new Map(stats.map((row) => [row.endpointId, row]));
  const urlById = new Map(endpoints.map((row) => [row.id, row.url]));

  return (
    <div>
      <Rows>
        {endpoints.map((endpoint) => {
          const row = statsByEndpoint.get(endpoint.id);
          return (
            <Row
              key={endpoint.id}
              meta={`${endpoint.events.length} event${endpoint.events.length === 1 ? "" : "s"} · ${formatNumber(row?.succeeded ?? 0)} ok · ${formatNumber(row?.failed ?? 0)} failed · ${formatNumber(row?.pending ?? 0)} pending · last ${formatAgo(row?.lastAt)}`}
              title={
                <>
                  <span className="max-w-full truncate font-mono text-xs">
                    {endpoint.url}
                  </span>
                  {!endpoint.active && <Badge variant="outline">Off</Badge>}
                  {endpoint.organizationId && (
                    <Badge variant="outline">team</Badge>
                  )}
                </>
              }
            />
          );
        })}
      </Rows>
      {deliveries.length > 0 && (
        <>
          <SubHeading>Recent deliveries (failures first)</SubHeading>
          <Rows>
            {deliveries.map((delivery) => (
              <Row
                actions={
                  delivery.status !== "succeeded" && (
                    <AdminAction
                      action="retryDelivery"
                      confirmLabel="Retry now"
                      description={`Sends ${delivery.event} to ${urlById.get(delivery.endpointId) ?? "the endpoint"} once more. Outside production nothing is sent.`}
                      input={{ deliveryId: delivery.id }}
                      label="Retry"
                      success="Retried"
                      title="Retry delivery"
                      variant="ghost"
                    />
                  )
                }
                key={delivery.id}
                meta={
                  <>
                    {formatDateTime(delivery.createdAt)} · {delivery.attempts}{" "}
                    attempt
                    {delivery.attempts === 1 ? "" : "s"}
                    {delivery.status === "pending" &&
                      delivery.nextAttemptAt &&
                      ` · next ${formatDateTime(delivery.nextAttemptAt)}`}
                    {delivery.lastError && (
                      <span className="block break-words">
                        {delivery.lastError}
                      </span>
                    )}
                  </>
                }
                title={
                  <>
                    <Mono>{delivery.event}</Mono>
                    <Badge
                      variant={
                        delivery.status === "failed"
                          ? "destructive"
                          : delivery.status === "pending"
                            ? "outline"
                            : "secondary"
                      }
                    >
                      {delivery.status}
                    </Badge>
                  </>
                }
              />
            ))}
          </Rows>
        </>
      )}
    </div>
  );
}

// ─── Integrations ────────────────────────────────────────────────────────────

export async function IntegrationsSection({ userId }: { userId: string }) {
  const loaded = await safeLoad("integrations", () => loadIntegrations(userId));
  if (!loaded.ok) return <LoadFailed />;
  if (loaded.data.length === 0)
    return <Empty>No connected integrations.</Empty>;

  return (
    <Rows>
      {loaded.data.map((row) => (
        <Row
          actions={
            <AdminAction
              action="disconnectIntegration"
              confirmLabel="Disconnect"
              description={`Same as the user's own Disconnect: the ${row.provider} token is revoked where possible and the connection is deleted. They can connect again.`}
              destructive
              input={{ integrationId: row.id }}
              label="Disconnect"
              success={`${row.provider} disconnected`}
              title={`Disconnect ${row.provider}`}
              variant="ghost"
            />
          }
          key={row.id}
          meta={
            <>
              Connected {formatDate(row.createdAt)} · last used{" "}
              {formatAgo(row.lastSyncAt)}
              {row.expiresAt &&
                ` · token ${row.expiresAt.getTime() < Date.now() ? "expired" : "expires"} ${formatDateTime(row.expiresAt)}`}
              {row.sync && (
                <span className="block">
                  Sync {row.sync.enabled ? row.sync.status : "off"} ·{" "}
                  {formatNumber(row.sync.delivered)} sent · last success{" "}
                  {formatAgo(row.sync.lastSuccessAt)}
                  {row.sync.lastError && ` · ${row.sync.lastError}`}
                </span>
              )}
            </>
          }
          title={
            <>
              {row.provider}
              <Badge
                variant={row.status === "error" ? "destructive" : "outline"}
              >
                {row.status}
              </Badge>
            </>
          }
        />
      ))}
    </Rows>
  );
}

// ─── OAuth apps ──────────────────────────────────────────────────────────────

export async function OAuthSection({ userId }: { userId: string }) {
  const loaded = await safeLoad("oauth", () => loadOAuthApps(userId));
  if (!loaded.ok) return <LoadFailed />;
  const { owned, authorized } = loaded.data;

  return (
    <div>
      <SubHeading>Apps they built</SubHeading>
      {owned.length === 0 ? (
        <Empty>None.</Empty>
      ) : (
        <Rows>
          {owned.map((app) => (
            <Row
              actions={
                <>
                  <AdminAction
                    action="setAppVerified"
                    confirmLabel={app.verified ? "Remove badge" : "Verify"}
                    description={
                      app.verified
                        ? "The consent screen shows the unverified note again."
                        : "Only after reviewing the app: the consent screen stops warning that it is unverified."
                    }
                    input={{ appId: app.id, verified: !app.verified }}
                    label={app.verified ? "Unverify" : "Verify"}
                    success={app.verified ? "App unverified" : "App verified"}
                    title={app.verified ? "Unverify app" : "Verify app"}
                    variant="ghost"
                  />
                  <AdminAction
                    action="setAppSuspended"
                    confirmLabel={app.suspended ? "Lift suspension" : "Suspend"}
                    description={
                      app.suspended
                        ? "The app works again; its users keep their access."
                        : "No new authorizations, its tokens stop working, and the developer can't turn it back on."
                    }
                    destructive={!app.suspended}
                    input={{ appId: app.id, suspended: !app.suspended }}
                    label={app.suspended ? "Unsuspend" : "Suspend"}
                    success={
                      app.suspended ? "Suspension lifted" : "App suspended"
                    }
                    title={app.suspended ? "Lift suspension" : "Suspend app"}
                    variant="ghost"
                  />
                </>
              }
              key={app.id}
              meta={
                <>
                  <Mono>{app.clientId}</Mono> · {formatNumber(app.users)} user
                  {app.users === 1 ? "" : "s"} · created{" "}
                  {formatDate(app.createdAt)}
                  {app.organizationId && " · team app"}
                </>
              }
              title={
                <>
                  {app.name}
                  {app.verified && <Badge variant="secondary">Verified</Badge>}
                  {app.suspended ? (
                    <Badge variant="destructive">Suspended</Badge>
                  ) : (
                    !app.isActive && <Badge variant="outline">Paused</Badge>
                  )}
                </>
              }
            />
          ))}
        </Rows>
      )}
      <SubHeading>Apps with access to their account</SubHeading>
      {authorized.length === 0 ? (
        <Empty>None.</Empty>
      ) : (
        <Rows>
          {authorized.map((app) => (
            <Row
              key={app.id}
              meta={`by ${app.builtBy} · ${app.scopes.join(", ")} · authorized ${formatDate(app.authorizedAt)} · active ${formatAgo(app.lastActiveAt)}`}
              title={
                <>
                  {app.name}
                  {app.firstParty && <Badge variant="outline">QRdx</Badge>}
                  {app.paused && <Badge variant="outline">Paused</Badge>}
                </>
              }
            />
          ))}
        </Rows>
      )}
    </div>
  );
}

// ─── Imports ─────────────────────────────────────────────────────────────────

export async function ImportsSection({ userId }: { userId: string }) {
  const loaded = await safeLoad("imports", () => loadImports(userId));
  if (!loaded.ok) return <LoadFailed />;
  if (loaded.data.length === 0) return <Empty>No imports.</Empty>;

  return (
    <Rows>
      {loaded.data.map((job) => (
        <Row
          actions={
            <>
              {(job.failed > 0 || job.stuck) && (
                <AdminAction
                  action="requeueImport"
                  confirmLabel="Re-run"
                  description="Failed links go back in the queue. The import runs from their browser (it needs their provider connection): it resumes the next time they open the import dialog."
                  input={{ userId, jobId: job.id }}
                  label="Re-run"
                  success="Import queued again"
                  title="Re-run import"
                  variant="ghost"
                />
              )}
              {job.status === "running" && (
                <AdminAction
                  action="cancelImport"
                  confirmLabel="Cancel import"
                  description="Links still waiting are marked failed; codes already created stay."
                  destructive
                  input={{ userId, jobId: job.id }}
                  label="Cancel"
                  success="Import canceled"
                  title="Cancel import"
                  variant="ghost"
                />
              )}
            </>
          }
          key={job.id}
          meta={
            <>
              {formatNumber(job.processed)} / {formatNumber(job.total)} done ·{" "}
              {formatNumber(job.created)} created · {formatNumber(job.skipped)}{" "}
              skipped · {formatNumber(job.failed)} failed · updated{" "}
              {formatAgo(job.updatedAt)}
              {job.errors.map((error) => (
                <span className="block truncate" key={error.link}>
                  {error.link}: {error.reason}
                </span>
              ))}
            </>
          }
          title={
            <>
              {job.provider}
              <Badge
                variant={
                  job.stuck
                    ? "destructive"
                    : job.status === "running"
                      ? "outline"
                      : "secondary"
                }
              >
                {job.stuck ? "stuck" : job.status}
              </Badge>
              <span className="text-muted-foreground font-normal">
                {formatDate(job.createdAt)}
              </span>
            </>
          }
        />
      ))}
    </Rows>
  );
}

// ─── Scans ───────────────────────────────────────────────────────────────────

export async function ScansSection({ userId }: { userId: string }) {
  const loaded = await safeLoad("scans", () => loadScans(userId));
  if (!loaded.ok) return <LoadFailed />;
  const { totals, countries, devices } = loaded.data;

  return (
    <div className="space-y-3">
      <Facts
        items={[
          { label: "Last 24 h", value: formatNumber(totals.last24h) },
          { label: "Last 7 days", value: formatNumber(totals.last7d) },
          { label: "Last 30 days", value: formatNumber(totals.last30d) },
          { label: "Visitors (30d)", value: formatNumber(totals.visitors) },
          { label: "Last scan", value: formatAgo(totals.lastAt) },
        ]}
      />
      {(countries.length > 0 || devices.length > 0) && (
        <p className="text-muted-foreground text-xs">
          {countries.length > 0 &&
            `Top countries: ${countries.map((row) => `${row.value} ${formatNumber(row.total)}`).join(", ")}. `}
          {devices.length > 0 &&
            `Devices: ${devices.map((row) => `${row.value} ${formatNumber(row.total)}`).join(", ")}.`}
        </p>
      )}
    </div>
  );
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export async function SessionsSection({ userId }: { userId: string }) {
  const loaded = await safeLoad("sessions", () => loadSessions(userId));
  if (!loaded.ok) return <LoadFailed />;
  if (loaded.data.length === 0) return <Empty>Signed out everywhere.</Empty>;

  return (
    <Rows>
      {loaded.data.map((row) => (
        <Row
          key={row.id}
          meta={`Active ${formatAgo(row.updatedAt)} · signed in ${formatDate(row.createdAt)} · expires ${formatDate(row.expiresAt)}${row.impersonatedBy ? " · impersonation" : ""}`}
          title={row.device}
        />
      ))}
    </Rows>
  );
}

// ─── AI usage ────────────────────────────────────────────────────────────────

export async function AiUsageSection({ userId }: { userId: string }) {
  const loaded = await safeLoad("ai", () => loadAiUsage(userId));
  if (!loaded.ok) return <LoadFailed />;
  const { totals, byModel, recent } = loaded.data;

  return (
    <div className="space-y-3">
      <Facts
        items={[
          { label: "All time", value: formatNumber(totals.total) },
          { label: "Last 30 days", value: formatNumber(totals.last30d) },
          { label: "Last used", value: formatAgo(recent[0]?.createdAt) },
        ]}
      />
      {byModel.length > 0 && (
        <p className="text-muted-foreground text-xs">
          30 days by model:{" "}
          {byModel
            .map((row) => `${row.modelId} ${formatNumber(row.total)}`)
            .join(", ")}
        </p>
      )}
    </div>
  );
}

// ─── Abuse reports ───────────────────────────────────────────────────────────

export async function AbuseSection({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  const loaded = await safeLoad("abuse", () => loadAbuseReports(userId, email));
  if (!loaded.ok) return <LoadFailed />;
  if (loaded.data.length === 0) return <Empty>No reports involve them.</Empty>;

  return (
    <Rows>
      {loaded.data.map((report) => (
        <Row
          key={report.id}
          meta={
            <>
              {formatDateTime(report.createdAt)} ·{" "}
              {report.codeOwnerId === userId
                ? "about their code"
                : report.reporterEmail === email
                  ? "filed by them"
                  : "about their page"}
              {report.url && (
                <span className="block truncate">{report.url}</span>
              )}
            </>
          }
          title={
            <>
              {abuseReasonLabel(report.reason)}
              {report.codeSlug && <Mono>/q/{report.codeSlug}</Mono>}
              <Badge
                variant={report.status === "open" ? "destructive" : "outline"}
              >
                {report.status}
              </Badge>
            </>
          }
        />
      ))}
    </Rows>
  );
}

// ─── Audit trail ─────────────────────────────────────────────────────────────

export async function AuditSection({ userId }: { userId: string }) {
  const loaded = await safeLoad("audit", () => loadAuditTrail(userId));
  if (!loaded.ok) return <LoadFailed />;
  if (loaded.data.length === 0) return <Empty>No admin actions yet.</Empty>;

  return (
    <Rows>
      {loaded.data.map((entry) => {
        const metadata = entry.metadata ?? {};
        const reason =
          typeof metadata.reason === "string" ? metadata.reason : null;
        return (
          <Row
            key={entry.id}
            meta={
              <>
                {formatDateTime(entry.createdAt)} · by{" "}
                <Link
                  className="hover:underline"
                  href={userLink(entry.actorUserId)}
                >
                  {String(metadata.actorEmail ?? entry.actorUserId)}
                </Link>
                {entry.targetType !== "user" &&
                  ` · ${entry.targetType} ${entry.targetId ?? ""}`}
                {reason && <span className="block">“{reason}”</span>}
              </>
            }
            title={<Mono>{entry.action}</Mono>}
          />
        );
      })}
    </Rows>
  );
}
