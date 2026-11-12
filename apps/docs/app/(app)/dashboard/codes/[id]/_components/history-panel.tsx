import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { use } from "react";
import { displayUrl } from "@/app/(app)/dashboard/codes/_components/format";
import { requireDashboardScope } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import type {
  VersionChange,
  VersionField,
} from "@/app/(app)/dashboard/codes/_lib/version-diff";
import { listCodeVersions } from "@/lib/code-versions";
import { getAppTranslations } from "@/lib/i18n/app-locale";
import type { Translator } from "@/lib/i18n/translator";
import { HistoryRestoreButton } from "./history-restore-button";

const SHOWN = 30;

// Fixed locale and UTC so server and client agree.
const timeFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});
const when = (
  value: Date | string,
  t: Translator<"app.dashboard.codes.historyPanel">,
) => t("valueUtc", { value: timeFormat.format(new Date(value)) });

const EMPTY: Partial<Record<VersionField, string>> = {
  title: "no title",
  domainId: "default short link",
  scanLimit: "no limit",
};

function value(
  change: VersionChange,
  raw: string | null | undefined,
  t: Translator<"app.dashboard.codes.historyPanel">,
): string {
  if (raw === null || raw === undefined) return EMPTY[change.field] ?? "none";
  if (change.kind === "date") return when(raw, t);
  if (change.kind === "url") return displayUrl(raw);
  return raw;
}

function ChangeLine({ change }: { change: VersionChange }) {
  const t = use(getAppTranslations("app.dashboard.codes.historyPanel"));
  if (change.kind === "opaque") {
    return <li>{t("labelChanged", { label: change.label })}</li>;
  }
  if (change.field === "hasPassword") {
    return (
      <li>
        {change.to === "On" ? t("passwordTurnedOn") : t("passwordTurnedOff")}
      </li>
    );
  }
  return (
    <li className="min-w-0">
      {change.label}:{" "}
      <span className="text-muted-foreground break-all line-through decoration-1">
        {value(change, change.from, t)}
      </span>{" "}
      → <span className="break-all">{value(change, change.to, t)}</span>
    </li>
  );
}

/** Settings history with diff summaries; restoring creates a new version. */
export async function HistoryPanel({ codeId }: { codeId: string }) {
  const t = await getAppTranslations("app.dashboard.codes.historyPanel");
  const scope = await requireDashboardScope();
  let history: Awaited<ReturnType<typeof listCodeVersions>>;
  try {
    history = await listCodeVersions(scope, codeId, { limit: SHOWN });
  } catch {
    return null;
  }
  const { entries, total } = history;

  return (
    <Card className="gap-4 py-4" id="history">
      <CardHeader className="px-4">
        <CardTitle>{t("versionHistory")}</CardTitle>
        <CardDescription>{t("eachEditToTheType")}</CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        {entries.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
            {t("noChangesYetWhenYou")}
          </p>
        ) : (
          <ol className="divide-y rounded-lg border">
            {entries.map((entry) => {
              const actor = !entry.actor
                ? "A former member"
                : entry.actor.id === scope.userId
                  ? "You"
                  : entry.actor.name;
              const changeWhen = when(entry.createdAt, t);
              return (
                <li
                  className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between"
                  key={entry.id}
                >
                  <div className="min-w-0 space-y-1 text-sm">
                    <p>
                      {t.rich("actorChangedOn", {
                        actor,
                        changeWhen,
                        strong: (chunks) => (
                          <span className="font-medium">{chunks}</span>
                        ),
                        muted: (chunks) => (
                          <span className="text-muted-foreground">
                            {chunks}
                          </span>
                        ),
                      })}
                    </p>
                    <ul className="space-y-0.5">
                      {entry.changes.map((change) => (
                        <ChangeLine change={change} key={change.field} />
                      ))}
                    </ul>
                  </div>
                  {entry.restores.length > 0 && (
                    <div className="shrink-0">
                      <HistoryRestoreButton
                        codeId={codeId}
                        undoes={entry.restores}
                        versionId={entry.id}
                        when={`before ${changeWhen}`}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {total > SHOWN && (
          <p className="text-muted-foreground mt-2 text-xs">
            {t("showingTheLatestShownOf", { SHOWN, total })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
