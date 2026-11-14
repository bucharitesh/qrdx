"use client";

import { Info } from "@repo/design-system/components/icons";
import { ModuleOrbit } from "@repo/design-system/components/loaders";
import { Button } from "@repo/design-system/components/ui/button";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import { Progress } from "@repo/design-system/components/ui/progress";
import { ArrowLeft, ArrowRight3, RotateLeft, Warning2 } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import {
  MigrateApiError,
  type MigrateClient,
  withRetry,
} from "@/lib/migrate/client";
import { displayLink } from "@/lib/migrate/normalize";
import {
  API_PROVIDERS,
  type ApiProviderId,
  isRetiredProvider,
} from "@/lib/migrate/providers";
import type {
  JobSummary,
  RedirectMode,
  RedirectPlanItem,
  RedirectResult,
} from "@/lib/migrate/types";
import { soundEvent } from "@/lib/sound";
import { Note, StepLayout } from "./import-shared";

type Run = {
  mode: Exclude<RedirectMode, "dry-run">;
  done: number;
  total: number;
  failed: RedirectResult["items"];
  stopped: string | null;
  finished: boolean;
};

export function RedirectsStep({
  client,
  jobId,
  provider,
  onBack,
}: {
  client: MigrateClient;
  jobId: string;
  provider: ApiProviderId;
  onBack: () => void;
}) {
  const t = useTranslations("app.dashboard.codes.importRedirectsStep");
  const { name, redirectLimits } = API_PROVIDERS[provider];
  // Dub imports have ended: no new changes (the dry run is empty), undo only.
  const retired = isRetiredProvider(provider);
  const [plan, setPlan] = useState<RedirectPlanItem[] | null>(null);
  const [job, setJob] = useState<JobSummary | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPlan = useCallback(async () => {
    try {
      const result = await client.redirects(jobId, "dry-run");
      setPlan(result.items);
      setJob(result.job);
    } catch (failure) {
      setError(
        failure instanceof MigrateApiError
          ? failure.message
          : "Couldn't list the changes.",
      );
    }
  }, [client, jobId]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  const execute = async (mode: Run["mode"]) => {
    const total =
      mode === "undo" ? (job?.redirected ?? 0) : (plan?.length ?? 0);
    let state: Run = {
      mode,
      done: 0,
      total,
      failed: [],
      stopped: null,
      finished: false,
    };
    setRun(state);
    setError(null);
    try {
      for (let round = 0; round < 500; round++) {
        const result = await withRetry(() =>
          client.redirects(jobId, mode, round === 0),
        );
        setJob(result.job);
        state = {
          ...state,
          done: state.done + result.items.filter((item) => item.ok).length,
          failed: [...state.failed, ...result.items.filter((item) => !item.ok)],
          stopped: result.stopped,
        };
        setRun(state);
        if (
          result.stopped ||
          result.remaining === 0 ||
          result.items.length === 0
        ) {
          break;
        }
      }
      setRun({ ...state, finished: true });
      soundEvent(
        state.stopped || state.failed.length > 0 ? "error" : "success",
      );
      if (mode === "undo") await loadPlan();
    } catch (failure) {
      setRun({ ...state, finished: true });
      setError(
        failure instanceof MigrateApiError
          ? failure.message
          : "Stopped. Links changed so far stay changed; try again to continue.",
      );
      soundEvent("error");
    }
  };

  const busy = run !== null && !run.finished;
  const live = job?.redirected ?? 0;
  const pending = plan?.length ?? 0;

  return (
    <StepLayout
      footer={
        <>
          <Button disabled={busy} onClick={onBack} size="sm" variant="ghost">
            <ArrowLeft />
            {t("summary")}
          </Button>
          <div className="flex items-center gap-2">
            {live > 0 && (
              <Button
                disabled={busy}
                onClick={() => execute("undo")}
                variant="outline"
              >
                <RotateLeft />
                {t("undoValue", { count: live })}
              </Button>
            )}
            {pending > 0 && !retired && (
              <Button
                disabled={!agreed || busy}
                onClick={() => execute("apply")}
              >
                {busy && run?.mode === "apply" && <ModuleOrbit aria-hidden />}
                {t("updateLinksIn", { count: pending, name })}
              </Button>
            )}
          </div>
        </>
      }
    >
      <div className="space-y-4">
        {retired ? (
          <Note icon={<Info />}>
            <p className="font-medium">
              {t("importsFromNameHaveEnded", { name })}
            </p>
            <p>{t("qrdxNoLongerChangesName", { name, name2: name })}</p>
          </Note>
        ) : (
          <>
            <Note icon={<Warning2 />} tone="warning">
              <p className="font-medium">
                {t("thisChangesLinksInYour", { name })}
              </p>
              <p>{t("eachOldLinkWillOpen", { name })}</p>
            </Note>
            <Note icon={<Info />}>
              <p>{redirectLimits}</p>
            </Note>
          </>
        )}

        {run && (
          <div className="space-y-2 rounded-xl border p-4">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">
                {run.finished
                  ? run.mode === "undo"
                    ? t("valueRestored", { count: run.done })
                    : t("valueNowOpenQrdx", { count: run.done })
                  : run.mode === "undo"
                    ? t("restoringOriginalDestinations")
                    : t("updatingLinksInName", { name })}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {run.done} / {run.total}
              </span>
            </div>
            <Progress
              aria-label={t("updateProgress")}
              value={run.total ? Math.round((run.done / run.total) * 100) : 100}
            />
            {run.stopped && (
              <p className="text-sm" role="alert">
                {run.stopped}
              </p>
            )}
            {run.failed.length > 0 && (
              <ul className="text-muted-foreground max-h-32 space-y-0.5 overflow-y-auto text-xs">
                {run.failed.map((item) => (
                  <li key={item.key}>
                    {displayLink(item.shortLink ?? item.key)}: {item.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {error && (
          <Note icon={<Warning2 />} tone="warning">
            <p>{error}</p>
          </Note>
        )}

        {plan === null && !error ? (
          <div className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
            <ModuleOrbit aria-hidden className="size-4" />{" "}
            {t("listingTheChanges")}
          </div>
        ) : pending > 0 ? (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">
              {t.rich("dryRunValueWouldChange", {
                count: pending,
                span: (chunks) => (
                  <span className="text-muted-foreground font-normal">
                    {chunks}
                  </span>
                ),
              })}
            </h3>
            <ul className="max-h-64 divide-y overflow-y-auto rounded-xl border text-xs">
              {plan?.slice(0, 300).map((item) => (
                <li className="space-y-0.5 px-3 py-2" key={item.key}>
                  <div className="truncate text-sm font-medium">
                    {displayLink(item.shortLink ?? item.key)}
                  </div>
                  <div className="text-muted-foreground flex min-w-0 items-center gap-1.5">
                    <span className="truncate line-through decoration-foreground/30">
                      {displayLink(item.from)}
                    </span>
                    <ArrowRight3 aria-hidden className="size-3 shrink-0" />
                    <span className="truncate text-foreground">
                      {displayLink(item.to)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <label
              className="flex items-start gap-2.5 text-sm"
              htmlFor="migrate-agree"
            >
              <Checkbox
                checked={agreed}
                id="migrate-agree"
                className="mt-0.5"
                disabled={busy}
                onCheckedChange={(value) => setAgreed(value === true)}
              />
              {t("iUnderstandTheseNameLinks", { name })}
            </label>
          </div>
        ) : (
          plan && (
            <p className="text-muted-foreground text-sm">
              {live > 0
                ? t("oldLinksAlreadyPoint", { count: live })
                : retired
                  ? t("everyOldNameLinkHas", { name })
                  : t("noLinksToChange")}
            </p>
          )
        )}
      </div>
    </StepLayout>
  );
}
