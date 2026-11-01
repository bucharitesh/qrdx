import { Badge } from "@repo/design-system/components/ui/badge";
import type { Metadata } from "next";
import { SettingsHeader } from "@/app/settings/components/settings-header";
import {
  Empty,
  Facts,
  LoadFailed,
  Panel,
  Row,
  Rows,
} from "../_components/panel";
import { formatAgo, formatDateTime, formatNumber } from "../_lib/format";
import { requireAdmin } from "../_lib/guard";
import {
  getBuildInfo,
  getConfiguration,
  getCronHealth,
  getIntegrationHealth,
  getServiceProbes,
  getWebhookBacklog,
  type ProbeStatus,
} from "../_lib/health";
import { safeLoad } from "../_lib/safe";

export const metadata: Metadata = { title: "Admin · Health" };

const STATUS_LABEL: Record<ProbeStatus, string> = {
  ok: "OK",
  warn: "Check",
  error: "Down",
  off: "Off",
};

function StatusBadge({ status }: { status: ProbeStatus }) {
  return (
    <Badge
      variant={
        status === "error"
          ? "destructive"
          : status === "ok"
            ? "secondary"
            : "outline"
      }
    >
      {STATUS_LABEL[status]}
    </Badge>
  );
}

async function Services() {
  const probes = await getServiceProbes();
  return (
    <Rows>
      {probes.map((probe) => (
        <Row
          key={probe.id}
          meta={`${probe.detail}${probe.latencyMs !== null ? ` · ${probe.latencyMs} ms` : ""}`}
          title={
            <>
              {probe.name}
              <StatusBadge status={probe.status} />
            </>
          }
        />
      ))}
    </Rows>
  );
}

async function Backlog() {
  const loaded = await safeLoad("health.webhooks", getWebhookBacklog);
  if (!loaded.ok) return <LoadFailed />;
  const backlog = loaded.data;
  return (
    <Facts
      items={[
        { label: "Pending", value: formatNumber(backlog.pending) },
        { label: "Due now", value: formatNumber(backlog.due) },
        {
          label: "Oldest due",
          value: backlog.due > 0 ? formatAgo(backlog.oldestDue) : "—",
        },
        { label: "Failed (24 h)", value: formatNumber(backlog.failed24h) },
      ]}
    />
  );
}

const CRON_LABELS = {
  webhooks: "Webhook retries + data syncs (every 5 min)",
  integrations: "Data syncs (optional schedule)",
  digest: "Weekly digest (Mondays)",
};

async function Cron() {
  const loaded = await safeLoad("health.cron", getCronHealth);
  if (!loaded.ok) return <LoadFailed />;
  return (
    <Rows>
      {Object.entries(loaded.data).map(([job, run]) => (
        <Row
          key={job}
          meta={
            run
              ? `${formatDateTime(run.at)} · ${formatNumber(run.durationMs)} ms`
              : "No run recorded (runs are recorded in Redis from this release on)"
          }
          title={
            <>
              {CRON_LABELS[job as keyof typeof CRON_LABELS] ?? job}
              {run && (
                <span className="text-muted-foreground font-normal">
                  {formatAgo(run.at)}
                </span>
              )}
            </>
          }
        />
      ))}
    </Rows>
  );
}

function Integrations() {
  const rows = getIntegrationHealth();
  const available = rows.filter((row) => row.available);
  const missing = rows.filter((row) => !row.available);
  return (
    <div className="space-y-3 text-sm">
      <p>
        {formatNumber(available.length)} of {formatNumber(rows.length)}{" "}
        available{available.length > 0 && ": "}
        <span className="text-muted-foreground">
          {available.map((row) => row.name).join(", ")}
        </span>
      </p>
      {missing.length === 0 ? (
        <Empty>Everything is configured.</Empty>
      ) : (
        <Rows>
          {missing.map((row) => (
            <Row
              key={row.slug}
              meta={`Needs ${row.missing.join(", ")}`}
              title={row.name}
            />
          ))}
        </Rows>
      )}
    </div>
  );
}

export default async function AdminHealthPage() {
  await requireAdmin();
  const build = getBuildInfo();
  const configuration = getConfiguration();

  return (
    <div className="space-y-4">
      <SettingsHeader
        description="One read-only check per service, cached for 60 seconds. Secret values are never shown."
        title="System health"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel id="services" title="Services">
          <Services />
        </Panel>
        <div className="grid min-w-0 gap-4">
          <Panel id="build" title="This deployment">
            <Facts
              items={[
                { label: "Environment", value: build.environment },
                {
                  label: "Commit",
                  value: build.commit ? (
                    build.commitUrl ? (
                      <a
                        className="font-mono hover:underline"
                        href={build.commitUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {build.commit}
                      </a>
                    ) : (
                      <span className="font-mono">{build.commit}</span>
                    )
                  ) : (
                    "local"
                  ),
                },
                { label: "Branch", value: build.branch ?? "—" },
                { label: "Region", value: build.region ?? "—" },
                { label: "Node", value: build.node },
              ]}
            />
            {build.message && (
              <p className="text-muted-foreground mt-3 truncate text-xs">
                {build.message}
              </p>
            )}
          </Panel>
          <Panel
            description="Outgoing webhook deliveries"
            id="webhooks"
            title="Webhook backlog"
          >
            <Backlog />
          </Panel>
        </div>
        <Panel id="cron" title="Cron jobs">
          <Cron />
        </Panel>
        <Panel id="config" title="Optional features">
          <Rows>
            {configuration.map((item) => (
              <Row
                key={item.name}
                meta={item.vars}
                title={
                  <>
                    {item.name}
                    <Badge variant={item.on ? "secondary" : "outline"}>
                      {item.on ? "On" : "Off"}
                    </Badge>
                  </>
                }
              />
            ))}
          </Rows>
        </Panel>
        <Panel
          className="lg:col-span-2"
          description="From this deployment's environment (variable names only)"
          id="integrations"
          title="Integrations"
        >
          <Integrations />
        </Panel>
      </div>
    </div>
  );
}
