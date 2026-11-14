"use client";

import { track } from "@repo/analytics";
import { Info, Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Progress } from "@repo/design-system/components/ui/progress";
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  DocumentDownload,
  Global,
  Link21,
  Warning2,
} from "iconsax-reactjs";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceHref } from "@/components/workspace-provider";
import type { Translator } from "@/lib/i18n/translator";
import {
  MigrateApiError,
  type MigrateClient,
  withRetry,
} from "@/lib/migrate/client";
import { mappingCsv, mappingText } from "@/lib/migrate/mapping";
import {
  API_PROVIDERS,
  FILE_PROVIDERS,
  isApiProviderId,
  isRetiredProvider,
  providerName,
} from "@/lib/migrate/providers";
import type { JobItem, JobSummary } from "@/lib/migrate/types";
import { soundEvent } from "@/lib/sound";
import { Note, Stat, StepLayout, saveText } from "./import-shared";
import { useMigrateReasonText } from "./migrate-reason-text";

function reasonsOf(
  items: JobItem[],
  status: JobItem["status"],
  t: Translator<"app.dashboard.codes.importRunStep">,
  reasonText: ReturnType<typeof useMigrateReasonText>,
) {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.status !== status) continue;
    const reason = reasonText(item) ?? t("other");
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]);
}

export function RunStep({
  client,
  jobId,
  onRedirects,
  onClose,
  onBack,
}: {
  client: MigrateClient;
  jobId: string;
  onRedirects: () => void;
  onClose: () => void;
  onBack: () => void;
}) {
  const t = useTranslations("app.dashboard.codes.importRunStep");
  const reasonText = useMigrateReasonText();
  const inWorkspace = useWorkspaceHref();
  const [job, setJob] = useState<JobSummary | null>(null);
  const [items, setItems] = useState<JobItem[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<number | null>(null);
  const [attach, setAttach] = useState<
    | { state: "idle" | "busy" }
    | { state: "done"; count: number }
    | { state: "error"; message: string }
  >({ state: "idle" });
  const finishedOnce = useRef(false);

  const refresh = useCallback(async () => {
    const result = await client.job(jobId);
    setJob(result.job);
    setItems(result.items);
    return result.job;
  }, [client, jobId]);

  // One loop at a time: a new run (or a pause) retires the previous loop, and
  // waits for its request so two chunks never run at once from this tab.
  const loop = useRef(0);
  const pending = useRef<Promise<unknown> | null>(null);
  const run = useCallback(async () => {
    const id = ++loop.current;
    setRunning(true);
    setError(null);
    try {
      if (pending.current) await pending.current.catch(() => null);
      for (;;) {
        if (loop.current !== id) return;
        const request = withRetry(() => client.run(jobId), {
          onWait: setWaiting,
        });
        pending.current = request;
        const result = await request.finally(() => {
          pending.current = null;
        });
        if (loop.current !== id) return;
        setWaiting(null);
        setJob(result.job);
        if (result.done) break;
      }
      await refresh();
    } catch (failure) {
      if (loop.current !== id) return;
      setError(
        failure instanceof MigrateApiError
          ? failure.message
          : "The import stopped. Nothing was lost: continue where it left off.",
      );
      soundEvent("error");
    } finally {
      if (loop.current === id) {
        setWaiting(null);
        setRunning(false);
      }
    }
  }, [client, jobId, refresh]);

  const pause = () => {
    loop.current += 1;
    setRunning(false);
    setWaiting(null);
  };

  useEffect(() => {
    let cancelled = false;
    refresh()
      .then((loaded) => {
        if (loaded.status === "done") finishedOnce.current = true;
        if (!cancelled && loaded.status === "running") void run();
      })
      .catch(() => setError("Couldn't load this import."));
    return () => {
      cancelled = true;
      loop.current += 1;
    };
  }, [refresh, run]);

  const done = job?.status === "done" && !running;
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, when the run finishes.
  useEffect(() => {
    if (done && !finishedOnce.current) {
      finishedOnce.current = true;
      soundEvent("success");
      if (job)
        track("import_completed", {
          provider: job.provider,
          count: job.created,
          failed: job.failed,
        });
    }
  }, [done]);

  const provider = job?.provider;
  const withLinks = useMemo(
    () => items.filter((item) => item.newLink),
    [items],
  );

  if (!(job && provider)) {
    return (
      <StepLayout>
        <div className="text-muted-foreground flex items-center justify-center gap-2 py-16 text-sm">
          {error ?? (
            <>
              <Spinner className="size-4 animate-spin" />{" "}
              {t("loadingTheImport")}
            </>
          )}
        </div>
      </StepLayout>
    );
  }

  const percent = job.total
    ? Math.round((job.processed / job.total) * 100)
    : 100;
  const name = providerName(provider);
  const api = isApiProviderId(provider) ? API_PROVIDERS[provider] : null;
  const file = isApiProviderId(provider) ? null : FILE_PROVIDERS[provider];
  // Dub imports have ended: its old jobs only offer undo of earlier changes.
  const retired = isRetiredProvider(provider);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(mappingText(items));
      soundEvent("copy");
    } catch {
      setError("Couldn't copy. Download the mapping CSV instead.");
    }
  };
  const download = () => {
    saveText(mappingCsv(items), `qrdx-${provider}-mapping.csv`);
    soundEvent("download");
  };
  const attachDomain = async () => {
    setAttach({ state: "busy" });
    try {
      const result = await client.attachDomain(jobId);
      setJob(result.job);
      setAttach({ state: "done", count: result.attached });
      await refresh();
    } catch (failure) {
      setAttach({
        state: "error",
        message:
          failure instanceof MigrateApiError
            ? failure.message
            : "Couldn't attach the codes.",
      });
    }
  };

  if (!done) {
    return (
      <StepLayout
        footer={
          <>
            <span className="text-muted-foreground text-xs">
              {t("closingIsSafeOpenImport")}
            </span>
            {running ? (
              <Button onClick={pause} variant="outline">
                {t("pause")}
              </Button>
            ) : (
              <Button onClick={run}>{t("continueImport")}</Button>
            )}
          </>
        }
      >
        <div className="mx-auto max-w-md space-y-4 py-10">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">
              {running ? t("importingFromName", { name }) : t("importPaused")}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {job.processed} / {job.total}
            </span>
          </div>
          <Progress aria-label={t("importProgress")} value={percent} />
          <p className="text-muted-foreground text-xs">
            {waiting !== null
              ? t("waitingWaitingSForThe", { waiting })
              : t("valueCreatedSoFarIn", { count: job.created })}
          </p>
          {error && (
            <Note icon={<Warning2 />} tone="warning">
              <p>{error}</p>
            </Note>
          )}
        </div>
      </StepLayout>
    );
  }

  const skipped = reasonsOf(items, "skipped", t, reasonText);
  const failed = reasonsOf(items, "failed", t, reasonText);
  const searchHref = inWorkspace(
    `/codes?q=${encodeURIComponent(`Imported from ${name}`)}`,
  );

  return (
    <StepLayout
      footer={
        <>
          <Button onClick={onBack} size="sm" variant="ghost">
            <ArrowLeft />
            {t("allProviders")}
          </Button>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link href={searchHref} onClick={onClose}>
                {t("viewImportedCodes")}
              </Link>
            </Button>
            <Button onClick={onClose}>{t("done")}</Button>
          </div>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-2">
          <Stat label={t("created")} value={job.created} />
          <Stat label={t("skipped")} muted value={job.skipped} />
          <Stat label={t("failed")} muted value={job.failed} />
        </div>

        {(skipped.length > 0 || failed.length > 0) && (
          <ul className="space-y-1 text-sm">
            {failed.map(([reason, count]) => (
              <li className="flex gap-2" key={`f-${reason}`}>
                <span className="text-destructive tabular-nums">{count}</span>
                <span>{t("failedReason", { reason })}</span>
              </li>
            ))}
            {skipped.map(([reason, count]) => (
              <li
                className="text-muted-foreground flex gap-2"
                key={`s-${reason}`}
              >
                <span className="tabular-nums">{count}</span>
                <span>{t("skippedReason", { reason })}</span>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <Note icon={<Warning2 />} tone="warning">
            <p>{error}</p>
          </Note>
        )}

        {withLinks.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={copyAll} size="sm" variant="outline">
              <Copy />
              {t("copyAllNewLinks")}
            </Button>
            <Button onClick={download} size="sm" variant="outline">
              <DocumentDownload />
              {t("downloadMappingCsv")}
            </Button>
          </div>
        )}

        {retired && job.redirected > 0 && (
          <div className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/40">
              <Link21 aria-hidden className="size-4 text-foreground/80" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold">
                {t("oldLinksPointToQrdx", { count: job.redirected, name })}
              </h3>
              <p className="text-muted-foreground text-xs">
                {t("importsFromNameHaveEnded", { name, name2: name })}
              </p>
            </div>
            <Button onClick={onRedirects} size="sm" variant="outline">
              {t("reviewUndo")}
              <ArrowRight />
            </Button>
          </div>
        )}

        {!retired &&
          api?.capabilities.updateDestination &&
          withLinks.length > 0 && (
            <div className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/40">
                <Link21 aria-hidden className="size-4 text-foreground/80" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold">
                  {t("keepMyPrintedCodesWorking")}
                </h3>
                <p className="text-muted-foreground text-xs">
                  {t("optionalPointEachOldName", { name })}
                </p>
              </div>
              <Button onClick={onRedirects} size="sm" variant="outline">
                {job.redirected > 0 ? t("manage") : t("reviewChanges")}
                <ArrowRight />
              </Button>
            </div>
          )}

        {file && withLinks.length > 0 && (
          <div className="space-y-2 rounded-xl border p-4">
            <h3 className="text-sm font-semibold">
              {t("pointYourOldCodesAt")}
            </h3>
            <p className="text-muted-foreground text-xs">
              {name === "CSV"
                ? t("oldProviderCodesLiveOnItsDomain")
                : t("providerCodesLiveOnItsDomain", { name })}
            </p>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {file.repointSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="text-muted-foreground text-xs">
              {file.keepWorkingNote}
            </p>
          </div>
        )}

        {job.backHalfDomain && (
          <div className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/40">
              <Global aria-hidden className="size-4 text-foreground/80" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold">
                {t("backHalvesOnBackhalfdomain", {
                  backHalfDomain: job.backHalfDomain,
                })}
              </h3>
              <p className="text-muted-foreground text-xs">
                {job.domainAttachedAt || attach.state === "done"
                  ? t("theCodesAreOnBackhalfdomain", {
                      backHalfDomain: job.backHalfDomain,
                    })
                  : t("afterBackhalfdomainPointsToQrdx", {
                      backHalfDomain: job.backHalfDomain,
                      backHalfDomain2: job.backHalfDomain,
                    })}
              </p>
              {attach.state === "error" && (
                <p className="text-destructive mt-1 text-xs">
                  {attach.message}
                </p>
              )}
            </div>
            {!(job.domainAttachedAt || attach.state === "done") && (
              <Button
                disabled={attach.state === "busy"}
                onClick={attachDomain}
                size="sm"
                variant="outline"
              >
                {attach.state === "busy" && (
                  <Spinner className="animate-spin" />
                )}
                {t("attachCodes")}
              </Button>
            )}
          </div>
        )}

        <Note icon={<Info />}>
          <p>{t("notesOnEachCodeSay")}</p>
        </Note>
      </div>
    </StepLayout>
  );
}
