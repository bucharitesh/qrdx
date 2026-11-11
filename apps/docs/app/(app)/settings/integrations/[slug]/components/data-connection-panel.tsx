"use client";

import { Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Label } from "@repo/design-system/components/ui/label";
import { Switch } from "@repo/design-system/components/ui/switch";
import type { IntegrationApiKeyConfig } from "@repo/integrations";
import { ExportSquare } from "iconsax-reactjs";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { ensureConfirmed } from "@/components/confirm-identity/actions";
import { useConfirmation } from "@/components/confirm-identity/provider";
import { SheetsExportButton } from "@/components/data-connections/sheets-export-button";
import { SyncStatus } from "@/components/data-connections/sync-status";
import {
  loadSinkView,
  retrySinkNow,
  type SinkViewData,
  saveSink,
} from "@/lib/data-connections/client";
import { ResponseSinkPanel } from "./response-sink-panel";
import { SourceKeyForm } from "./source-key-form";
import { SourcePreview } from "./source-preview";

const KEY_PROVIDERS = new Set(["stripe", "calcom", "shopify"]);
const NO_ACCOUNT = new Set(["youtube", "spotify"]);
const PREVIEW_PROVIDERS = new Set(["stripe", "calcom", "shopify", "calendly"]);

/** Stripe, Cal.com, Shopify: our own key form instead of the generic one. */
export const usesDataKeyForm = (slug: string) => KEY_PROVIDERS.has(slug);
/** YouTube, Spotify: smart links that never connect. */
export const isNoAccountIntegration = (slug: string) => NO_ACCOUNT.has(slug);

const linkClass =
  "inline-flex items-center gap-1 font-medium text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground";

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4 rounded-xl border bg-card p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function SheetsPanel() {
  const t = useTranslations("app.settings.integrations.dataConnectionPanel");
  const id = useId();
  const [view, setView] = useState<SinkViewData | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadSinkView("google-sheets")
      .then(setView)
      .catch(() => setView(null));
  }, []);

  const settings = (view?.settings ?? {}) as {
    lastExport?: {
      spreadsheetUrl: string;
      label: string;
      rowsWritten: number;
      createdAt: string;
    };
    syncTarget?: { spreadsheetUrl: string };
    syncLabel?: string;
  };
  const syncOn = Boolean(view?.sync?.enabled);

  const toggle = async (enabled: boolean) => {
    setBusy(true);
    try {
      setView(await saveSink("google-sheets", { enabled }));
      toast.success(enabled ? t("newScansWillBeAdded") : t("syncOff"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("couldntSave"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={t("exportScans")}>
      <p className="text-muted-foreground text-sm text-pretty">
        {t("aNewSpreadsheetWithEvery")}
      </p>
      <SheetsExportButton codeId={null} size="default" />
      {settings.lastExport && (
        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-sm">
            {t("lastExport")} {settings.lastExport.label},{" "}
            {settings.lastExport.rowsWritten.toLocaleString()} {t("rows")}{" "}
            <a
              className={linkClass}
              href={settings.lastExport.spreadsheetUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              {t("openSheet")}
              <ExportSquare aria-hidden className="size-3.5" />
            </a>
          </p>
          <div className="flex items-center gap-2">
            <Switch
              checked={syncOn}
              disabled={busy}
              id={`${id}-sync`}
              onCheckedChange={toggle}
            />
            <Label htmlFor={`${id}-sync`}>{t("keepThisSheetInSync")}</Label>
            {busy && <Spinner className="size-3.5" />}
          </div>
          <p className="text-muted-foreground text-xs text-pretty">
            {t("newScansAreAppendedIn")}
          </p>
        </div>
      )}
      <SyncStatus
        noun={t("scans")}
        onRetry={async () =>
          setView(await retrySinkNow("google-sheets").catch(() => view))
        }
        state={view?.sync ?? null}
      />
    </Card>
  );
}

/**
 * "Add another channel", to the workspace the person is in (like Enable):
 * asks "Confirm it's you" in the page (the channel will get form answers),
 * then goes to the install route, which checks it again before sending the
 * person to Slack.
 */
function AddSlackChannelButton() {
  const t = useTranslations("app.settings.integrations.dataConnectionPanel");
  const { withConfirmation } = useConfirmation();
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setBusy(true);
    try {
      const result = await withConfirmation(
        () => ensureConfirmed(),
        "add-slack-channel",
      );
      if (result?.ok) {
        window.location.assign("/api/integrations/slack/install");
        return;
      }
      if (result) toast.error(result.error);
    } catch {
      toast.error(t("somethingWentWrongCheckYour"));
    }
    setBusy(false);
  };

  return (
    <Button disabled={busy} onClick={add}>
      {busy && <Spinner className="size-3.5" />}
      {t("addAnotherChannel")}
    </Button>
  );
}

function SlackPanel({ metadata }: { metadata?: Record<string, unknown> }) {
  const t = useTranslations("app.settings.integrations.dataConnectionPanel");
  const channels = Array.isArray(metadata?.channels)
    ? (metadata.channels as Array<{
        targetId: string;
        channel: string;
        teamName: string | null;
        addedAt: string;
      }>)
    : [];
  return (
    <Card title={t("channels")}>
      {channels.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {channels.map((channel) => (
            <li
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
              key={channel.targetId}
            >
              <span>
                {channel.channel}
                {channel.teamName && (
                  <span className="text-muted-foreground">
                    {" "}
                    · {channel.teamName}
                  </span>
                )}
              </span>
              <span className="text-muted-foreground text-xs">
                {t("addedValue", {
                  value: new Date(channel.addedAt).toLocaleDateString(),
                })}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t("noChannelsYet")}</p>
      )}
      <p className="text-muted-foreground text-sm text-pretty">
        {t("eachChannelGetsScanMilestones")}
      </p>
      <div className="flex flex-wrap gap-2">
        <AddSlackChannelButton />
        <Button asChild variant="outline">
          <Link href="/settings/notifications">{t("chooseAlerts")}</Link>
        </Button>
      </div>
    </Card>
  );
}

interface DataConnectionPanelProps {
  slug: string;
  name: string;
  isConfigured: boolean;
  isConnected: boolean;
  status?: "active" | "disconnected" | "error";
  metadata?: Record<string, unknown>;
  apiKey?: IntegrationApiKeyConfig;
}

/** Content sources and data out on the integration's settings page. */
export function DataConnectionPanel({
  slug,
  name,
  isConfigured,
  isConnected,
  status,
  metadata,
  apiKey,
}: DataConnectionPanelProps) {
  const t = useTranslations("app.settings.integrations.dataConnectionPanel");
  const active = isConnected && status === "active";

  if (NO_ACCOUNT.has(slug)) {
    return (
      <Card title={t("noAccountNeeded")}>
        <p className="text-muted-foreground text-sm text-pretty">
          {t("pasteAnyNameLinkIn", { name, name2: name })}
        </p>
        <Button asChild variant="outline">
          <Link href={`/qr-code-generator/${slug}`}>
            {t("makeANameQrCode", { name })}
          </Link>
        </Button>
      </Card>
    );
  }

  if (!isConfigured) return null;

  if (KEY_PROVIDERS.has(slug)) {
    return (
      <>
        {active && <SourcePreview name={name} slug={slug} />}
        {(!isConnected || status === "error") && (
          <SourceKeyForm
            apiKey={apiKey}
            name={name}
            reconnect={isConnected}
            slug={slug as "stripe" | "calcom" | "shopify"}
          />
        )}
      </>
    );
  }

  if (!active) return null;
  if (PREVIEW_PROVIDERS.has(slug))
    return <SourcePreview name={name} slug={slug} />;
  if (slug === "google-sheets") return <SheetsPanel />;
  if (slug === "slack") return <SlackPanel metadata={metadata} />;
  if (slug === "hubspot" || slug === "mailchimp") {
    return <ResponseSinkPanel name={name} provider={slug} />;
  }
  return null;
}
