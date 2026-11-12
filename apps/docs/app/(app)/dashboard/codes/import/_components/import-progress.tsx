"use client";

import { Spinner as Loader2 } from "@repo/design-system/components/icons";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/ui/alert";
import { Button } from "@repo/design-system/components/ui/button";
import { Progress } from "@repo/design-system/components/ui/progress";
import {
  InfoCircle as CircleAlert,
  Clock,
  TableDocument as FileSpreadsheet,
  Pause,
  Play,
  RefreshCircle as Retry,
} from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { plural } from "@/app/(app)/dashboard/codes/_components/use-organize-action";
import { formatCount } from "@/lib/bulk-limits";
import { type ImportJob, jobProgress } from "../_lib/job";

/** "3:42 PM", or with the day when it isn't today. */
function formatTime(epoch: number): string {
  const at = new Date(epoch);
  const sameDay = at.toDateString() === new Date().toDateString();
  return at.toLocaleString(undefined, {
    ...(sameDay ? {} : { weekday: "short" }),
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Where an import is: sending, paused (by you, a reload, failed chunks or an hourly limit), stopped by the plan. */
export function ImportProgress({
  job,
  interrupted,
  waiting,
  onPause,
  onResume,
  onRetryFailed,
  onFinish,
  onUpgrade,
}: {
  job: ImportJob;
  interrupted: boolean;
  waiting: { seconds: number; reason: "rate-limit" | "retry" } | null;
  onPause: () => void;
  onResume: () => void;
  onRetryFailed: () => void;
  onFinish: () => void;
  onUpgrade: () => void;
}) {
  const t = useTranslations("app.dashboard.codes.import.importProgress");
  const progress = jobProgress(job);
  const running = job.status === "running";
  const percent = (progress.sent / Math.max(1, progress.total)) * 100;
  const organize = [
    job.folder && `into ${job.folder.name}`,
    job.tags.length > 0 &&
      `tagged ${job.tags.map((tag) => tag.name).join(", ")}`,
  ].filter(Boolean);

  return (
    <section aria-live="polite" className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg border p-3">
        <FileSpreadsheet className="text-muted-foreground size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{job.fileName}</p>
          <p className="text-muted-foreground text-xs">
            {plural(progress.total, "code")}
            {organize.length > 0 && `, ${organize.join(", ")}`}
          </p>
        </div>
      </div>

      {interrupted && !running && (
        <Alert>
          <CircleAlert />
          <AlertTitle>{t("thisImportStoppedWhenThe")}</AlertTitle>
          <AlertDescription>{t("resumeToSendTheRest")}</AlertDescription>
        </Alert>
      )}

      {job.stopped && job.resumeAfter && !running && (
        <Alert>
          <Clock />
          <AlertTitle>
            {t("pausedUntilResumeafter", {
              resumeAfter: formatTime(job.resumeAfter),
            })}
          </AlertTitle>
          <AlertDescription>
            <p>{job.stopped}</p>
            <p>
              {t("theImportGoesOnBy", {
                resumeAfter: formatTime(job.resumeAfter),
              })}
            </p>
          </AlertDescription>
        </Alert>
      )}

      {job.stopped && !job.resumeAfter && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>{t("theImportStopped")}</AlertTitle>
          <AlertDescription>
            <p>{job.stopped}</p>
            <Button className="mt-2" onClick={onUpgrade} size="sm">
              {t("seePlans")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Progress aria-label={t("importProgress")} value={percent} />
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
          <p className="tabular-nums">
            {formatCount(progress.sent)} {t("of")} {formatCount(progress.total)}{" "}
            {t("rowsSent")}
            <span className="text-muted-foreground">
              {" "}
              · {formatCount(progress.created)} {t("created")}
              {progress.rowErrors > 0 &&
                t("rowerrorsWithProblems", {
                  rowErrors: formatCount(progress.rowErrors),
                })}
            </span>
          </p>
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            {running && <Loader2 className="size-3.5 animate-spin" />}
            {running
              ? waiting
                ? waiting.reason === "retry"
                  ? t("tryingAgainInSecondsS", { seconds: waiting.seconds })
                  : t("waitingSecondsSForThe", { seconds: waiting.seconds })
                : t("importing")
              : t("paused")}
          </p>
        </div>
      </div>

      {progress.failedChunks > 0 && !running && (
        <Alert>
          <CircleAlert />
          <AlertTitle>
            {t("valueCouldntBeSent", {
              value: plural(progress.failedRows, "row"),
            })}
          </AlertTitle>
          <AlertDescription>
            {job.chunkErrors.find(Boolean) ?? t("theRequestDidntGoThrough")}{" "}
            {t("retryThemNothingIsMade")}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {running ? (
          <Button onClick={onPause} variant="outline">
            <Pause />
            {t("pause")}
          </Button>
        ) : (
          <>
            {progress.failedChunks > 0 ? (
              <Button onClick={onRetryFailed}>
                <Retry />
                {progress.pendingChunks > 0
                  ? t("retryAndContinue")
                  : t("retryValue", {
                      value: plural(progress.failedRows, "row"),
                    })}
              </Button>
            ) : (
              progress.pendingChunks > 0 && (
                <Button onClick={onResume}>
                  <Play />
                  {t("resume")}
                </Button>
              )
            )}
            <Button onClick={onFinish} variant="ghost">
              {progress.created > 0 ? t("finishWithWhatsMade") : t("stop")}
            </Button>
          </>
        )}
        {running && (
          <span className="text-muted-foreground text-xs">
            {t("leavingThisPagePausesThe")}
          </span>
        )}
      </div>
    </section>
  );
}
