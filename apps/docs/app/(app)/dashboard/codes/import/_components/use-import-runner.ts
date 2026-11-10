"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { importQrCodesChunk } from "@/actions/bulk-codes";
import type { OrganizeResult } from "@/app/dashboard/codes/_lib/organize";
import { track } from "@/lib/analytics";
import { soundEvent } from "@/lib/sound/emit";
import type { ThemeStyles } from "@/types/theme";
import {
  chunkRowsOf,
  type ImportJob,
  idempotencyKeyFor,
  type JobRowResult,
  jobProgress,
  nextChunk,
  withChunkDone,
  withChunkFailed,
  withFailedRetried,
} from "../_lib/job";
import {
  clearImportJob,
  loadImportJob,
  saveImportJob,
} from "../_lib/job-store";

type ActionError = Extract<OrganizeResult<never>, { success: false }>["error"];

type Outcome =
  | { type: "done"; rows: JobRowResult[]; style: ThemeStyles | null }
  /** `offline`: the request didn't come back, so the next ones won't either */
  | { type: "failed"; message: string; offline?: boolean }
  | { type: "stop"; error: ActionError }
  /** A limit that lifts at `until` (epoch ms): pause until then */
  | { type: "wait"; error: ActionError; until: number }
  /** Paused while waiting to try again: the chunk stays in the queue */
  | { type: "paused" };

/** Errors no retry fixes: the plan, the session, the role. */
const STOPS = new Set([
  "PLAN_REQUIRED",
  "LIMIT_REACHED",
  "UNAUTHORIZED",
  "FORBIDDEN",
]);
/** Tries per chunk for errors that may pass (network, server). */
const TRIES = 3;
/** Waits for the create rate limit before a chunk is marked failed. */
const RATE_LIMIT_WAITS = 10;
/**
 * Longer waits (a new account's hourly cap) pause the import instead, saying
 * when it can go on; it resumes by itself then if the page is still open.
 */
const LONGEST_WAIT_SECONDS = 120;

/**
 * Runs a CSV import as a resumable job (../_lib/job.ts): sends chunk after
 * chunk, saves the job after each, retries what may pass, waits out the
 * rate limit, pauses between chunks, and picks a saved job up after a reload.
 */
export function useImportRunner(
  storeKey: string,
  { onStop }: { onStop?: (error: ActionError) => void } = {},
) {
  const [job, setJob] = useState<ImportJob | null>(null);
  const [loaded, setLoaded] = useState(false);
  /** The saved job was running when the page closed */
  const [interrupted, setInterrupted] = useState(false);
  /** A wait before the next try: seconds left, and why */
  const [waiting, setWaiting] = useState<{
    seconds: number;
    reason: "rate-limit" | "retry";
  } | null>(null);
  const jobRef = useRef<ImportJob | null>(null);
  const control = useRef({ running: false, pause: false });
  const onStopRef = useRef(onStop);
  useEffect(() => {
    onStopRef.current = onStop;
  }, [onStop]);

  const commit = useCallback(
    (next: ImportJob | null) => {
      jobRef.current = next;
      setJob(next);
      if (next) void saveImportJob(storeKey, next);
    },
    [storeKey],
  );

  useEffect(() => {
    let cancelled = false;
    loadImportJob(storeKey).then((saved) => {
      if (cancelled) return;
      if (saved && !jobRef.current) {
        const wasRunning = saved.status === "running";
        setInterrupted(wasRunning);
        const restored: ImportJob = wasRunning
          ? { ...saved, status: "paused" }
          : saved;
        jobRef.current = restored;
        setJob(restored);
      }
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [storeKey]);

  /** Sleeps, a second at a time, unless the run is paused. */
  const wait = useCallback(
    async (seconds: number, reason: "rate-limit" | "retry") => {
      for (let left = Math.ceil(seconds); left > 0; left--) {
        if (control.current.pause) break;
        setWaiting({ seconds: left, reason });
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      setWaiting(null);
    },
    [],
  );

  const send = useCallback(
    async (current: ImportJob, index: number): Promise<Outcome> => {
      const input = {
        rows: chunkRowsOf(current, index),
        domainId: current.domainId,
        folderId: current.folder?.id ?? null,
        tagIds: current.tags.map((tag) => tag.id),
        idempotencyKey: idempotencyKeyFor(current, index),
      };
      let tries = 0;
      let waits = 0;
      for (;;) {
        let result: Awaited<ReturnType<typeof importQrCodesChunk>>;
        try {
          result = await importQrCodesChunk(input);
        } catch {
          // The request didn't come back (offline, a dropped connection):
          // sending it again is safe under the chunk's idempotency key.
          if (++tries < TRIES && !control.current.pause) {
            await wait(2 ** tries, "retry");
            if (control.current.pause) return { type: "paused" };
            continue;
          }
          return {
            type: "failed",
            message: "The connection dropped before the rows were sent.",
            offline: true,
          };
        }
        if (result.success) {
          return {
            type: "done",
            rows: result.data.rows,
            style: result.data.style,
          };
        }
        const { error } = result;
        if (STOPS.has(error.code)) return { type: "stop", error };
        if (
          error.code === "RATE_LIMITED" &&
          (error.retryAfterSeconds ?? 0) > LONGEST_WAIT_SECONDS
        ) {
          return {
            type: "wait",
            error,
            until: Date.now() + (error.retryAfterSeconds ?? 0) * 1000,
          };
        }
        if (
          error.code === "RATE_LIMITED" &&
          ++waits <= RATE_LIMIT_WAITS &&
          !control.current.pause
        ) {
          await wait(error.retryAfterSeconds ?? 20, "rate-limit");
          if (control.current.pause) return { type: "paused" };
          continue;
        }
        if (
          error.code === "UNKNOWN_ERROR" &&
          ++tries < TRIES &&
          !control.current.pause
        ) {
          await wait(2 ** tries, "retry");
          if (control.current.pause) return { type: "paused" };
          continue;
        }
        return { type: "failed", message: error.message };
      }
    },
    [wait],
  );

  const run = useCallback(
    async (start?: ImportJob) => {
      const first = start ?? jobRef.current;
      if (!first || control.current.running) return;
      control.current = { running: true, pause: false };
      setInterrupted(false);
      let current: ImportJob = {
        ...first,
        status: "running",
        stopped: null,
        resumeAfter: null,
      };
      commit(current);
      try {
        for (;;) {
          if (control.current.pause) {
            commit({ ...current, status: "paused" });
            return;
          }
          const index = nextChunk(current);
          if (index < 0) break;
          const outcome = await send(current, index);
          if (outcome.type === "paused") {
            commit({ ...current, status: "paused" });
            return;
          }
          if (outcome.type === "wait") {
            commit({
              ...current,
              status: "paused",
              stopped: outcome.error.message,
              resumeAfter: outcome.until,
            });
            soundEvent("error");
            return;
          }
          if (outcome.type === "stop") {
            commit({
              ...current,
              status: "paused",
              stopped: outcome.error.message,
            });
            soundEvent("error");
            onStopRef.current?.(outcome.error);
            return;
          }
          current =
            outcome.type === "done"
              ? withChunkDone(current, index, outcome.rows, outcome.style)
              : withChunkFailed(current, index, outcome.message);
          if (outcome.type === "failed" && outcome.offline) {
            // Offline: wait for a retry instead of failing every chunk left.
            commit({ ...current, status: "paused" });
            soundEvent("error");
            return;
          }
          commit(current);
        }
        const progress = jobProgress(current);
        const finished = progress.failedChunks === 0;
        commit({ ...current, status: finished ? "done" : "paused" });
        soundEvent(finished && progress.created > 0 ? "success" : "error");
        if (finished) {
          track("import_completed", {
            provider: "csv",
            count: progress.created,
            failed: progress.rowErrors,
          });
        }
      } finally {
        control.current.running = false;
        setWaiting(null);
      }
    },
    [commit, send],
  );

  // A limit that lifts by itself: go on then, if the page is still open.
  const resumeAfter = job?.status === "paused" ? job.resumeAfter : null;
  useEffect(() => {
    if (!resumeAfter) return;
    const timer = setTimeout(
      () => void run(),
      Math.max(0, resumeAfter - Date.now()) + 2000,
    );
    return () => clearTimeout(timer);
  }, [resumeAfter, run]);

  /** Stops after the chunk in flight. */
  const pause = useCallback(() => {
    control.current.pause = true;
  }, []);

  const retryFailed = useCallback(() => {
    const current = jobRef.current;
    if (current) void run(withFailedRetried(current));
  }, [run]);

  /** Ends the import with what it made so far. */
  const finish = useCallback(() => {
    const current = jobRef.current;
    if (current && !control.current.running) {
      commit({ ...current, status: "done" });
    }
  }, [commit]);

  /** Forgets the job (the codes it made stay). */
  const discard = useCallback(() => {
    control.current.pause = true;
    jobRef.current = null;
    setJob(null);
    setInterrupted(false);
    void clearImportJob(storeKey);
  }, [storeKey]);

  return {
    job,
    loaded,
    interrupted,
    waiting,
    running: job?.status === "running",
    start: run,
    resume: () => void run(),
    pause,
    retryFailed,
    finish,
    discard,
  };
}
