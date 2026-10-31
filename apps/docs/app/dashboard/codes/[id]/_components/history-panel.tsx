import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { displayUrl } from "@/app/dashboard/codes/_components/format";
import { requireDashboardScope } from "@/app/dashboard/codes/_lib/qr-codes";
import type {
  VersionChange,
  VersionField,
} from "@/app/dashboard/codes/_lib/version-diff";
import { listCodeVersions } from "@/lib/code-versions";
import { HistoryRestoreButton } from "./history-restore-button";

const SHOWN = 30;

// Fixed locale and UTC so server and client agree.
const timeFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});
const when = (value: Date | string) =>
  `${timeFormat.format(new Date(value))} UTC`;

const EMPTY: Partial<Record<VersionField, string>> = {
  title: "no title",
  domainId: "default short link",
  scanLimit: "no limit",
};

function value(change: VersionChange, raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return EMPTY[change.field] ?? "none";
  if (change.kind === "date") return when(raw);
  if (change.kind === "url") return displayUrl(raw);
  return raw;
}

function ChangeLine({ change }: { change: VersionChange }) {
  if (change.kind === "opaque") {
    return <li>{change.label} changed</li>;
  }
  if (change.field === "hasPassword") {
    return <li>Password turned {change.to === "On" ? "on" : "off"}</li>;
  }
  return (
    <li className="min-w-0">
      {change.label}:{" "}
      <span className="text-muted-foreground break-all line-through decoration-1">
        {value(change, change.from)}
      </span>{" "}
      → <span className="break-all">{value(change, change.to)}</span>
    </li>
  );
}

/** Settings history with diff summaries; restoring creates a new version. */
export async function HistoryPanel({ codeId }: { codeId: string }) {
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
        <CardTitle>Version history</CardTitle>
        <CardDescription>
          Each edit to the destination, title, design, domain, schedule, routing
          or pixels saves the previous settings here. Restoring a version saves
          the current settings first, so it can be undone.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        {entries.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
            No changes yet. When you edit this code, its earlier settings show
            up here.
          </p>
        ) : (
          <ol className="divide-y rounded-lg border">
            {entries.map((entry) => {
              const actor = !entry.actor
                ? "A former member"
                : entry.actor.id === scope.userId
                  ? "You"
                  : entry.actor.name;
              const changeWhen = when(entry.createdAt);
              return (
                <li
                  className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between"
                  key={entry.id}
                >
                  <div className="min-w-0 space-y-1 text-sm">
                    <p>
                      <span className="font-medium">{actor}</span>{" "}
                      <span className="text-muted-foreground">
                        changed on {changeWhen}
                      </span>
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
            Showing the latest {SHOWN} of {total} versions. Up to 100 are kept
            per code.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
