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
import { plural } from "@/app/dashboard/codes/_components/use-organize-action";
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
          <AlertTitle>This import stopped when the page closed</AlertTitle>
          <AlertDescription>
            Resume to send the rest. Codes it already made aren't made again.
          </AlertDescription>
        </Alert>
      )}

      {job.stopped && job.resumeAfter && !running && (
        <Alert>
          <Clock />
          <AlertTitle>Paused until {formatTime(job.resumeAfter)}</AlertTitle>
          <AlertDescription>
            <p>{job.stopped}</p>
            <p>
              The import goes on by itself then if this page stays open, or
              resume it after {formatTime(job.resumeAfter)}. Codes it already
              made aren't made again.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {job.stopped && !job.resumeAfter && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>The import stopped</AlertTitle>
          <AlertDescription>
            <p>{job.stopped}</p>
            <Button className="mt-2" onClick={onUpgrade} size="sm">
              See plans
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Progress aria-label="Import progress" value={percent} />
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
          <p className="tabular-nums">
            {formatCount(progress.sent)} of {formatCount(progress.total)} rows
            sent
            <span className="text-muted-foreground">
              {" "}
              · {formatCount(progress.created)} created
              {progress.rowErrors > 0 &&
                ` · ${formatCount(progress.rowErrors)} with problems`}
            </span>
          </p>
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            {running && <Loader2 className="size-3.5 animate-spin" />}
            {running
              ? waiting
                ? waiting.reason === "retry"
                  ? `Trying again in ${waiting.seconds} s`
                  : `Waiting ${waiting.seconds} s for the create limit`
                : "Importing"
              : "Paused"}
          </p>
        </div>
      </div>

      {progress.failedChunks > 0 && !running && (
        <Alert>
          <CircleAlert />
          <AlertTitle>
            {plural(progress.failedRows, "row")} couldn't be sent
          </AlertTitle>
          <AlertDescription>
            {job.chunkErrors.find(Boolean) ?? "The request didn't go through."}{" "}
            Retry them; nothing is made twice.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {running ? (
          <Button onClick={onPause} variant="outline">
            <Pause />
            Pause
          </Button>
        ) : (
          <>
            {progress.failedChunks > 0 ? (
              <Button onClick={onRetryFailed}>
                <Retry />
                {progress.pendingChunks > 0
                  ? "Retry and continue"
                  : `Retry ${plural(progress.failedRows, "row")}`}
              </Button>
            ) : (
              progress.pendingChunks > 0 && (
                <Button onClick={onResume}>
                  <Play />
                  Resume
                </Button>
              )
            )}
            <Button onClick={onFinish} variant="ghost">
              {progress.created > 0 ? "Finish with what's made" : "Stop"}
            </Button>
          </>
        )}
        {running && (
          <span className="text-muted-foreground text-xs">
            Leaving this page pauses the import; come back to resume it.
          </span>
        )}
      </div>
    </section>
  );
}
