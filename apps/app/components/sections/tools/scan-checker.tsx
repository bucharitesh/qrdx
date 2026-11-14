"use client";

import { toast } from "@repo/design-system";
import { Spinner as LoaderCircle } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import {
  TickCircle as CircleCheck,
  CloseCircle as CircleX,
  ClipboardImport as ClipboardPaste,
  Copy,
  ExportSquare as ExternalLink,
  GalleryExport as ImageUp,
  ShieldTick as ShieldCheck,
} from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { getImageScanScore, type ImageScanScoreResult } from "qrdx";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useDropzone } from "react-dropzone";
import {
  GRADE_COLORS,
  ScanCheckList,
  useGradeLabels,
} from "@/components/editor/scan-score";
import { InfoHint } from "@/components/help/info-hint";
import { compareDecoded, type DecodedMatch } from "@/lib/scan-match";
import { soundEvent } from "@/lib/sound/emit";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

type Status =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "done"; result: ImageScanScoreResult }
  | { phase: "error"; message: "notImage" | "tooBig" | "unreadable" };

function safeLink(data: string): string | null {
  try {
    const url = new URL(data);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export interface ScanCheckerProps {
  /**
   * A tighter layout for a dialog: no page-width container, a slimmer drop
   * area and a one-row result. The dialog says the image stays on the device.
   */
  compact?: boolean;
  /**
   * The text the code should hold (the editor's value). When set, the result
   * says whether the decoded text matches it (lib/scan-match.ts).
   */
  expected?: string;
  /** Extra action for a decoded http(s) link, after "Open link". */
  renderLinkAction?: (link: string) => ReactNode;
}

/**
 * Reads a photo or screenshot of a QR code and scores how well it scans,
 * entirely in the browser (qrdx's getImageScanScore on a local object URL):
 * the image is never uploaded. Used by /tools/scan-checker and the editor's
 * photo check (components/editor/photo-scan-dialog.tsx).
 */
export function ScanChecker({
  compact = false,
  expected,
  renderLinkAction,
}: ScanCheckerProps) {
  const gradeLabels = useGradeLabels();
  const t = useTranslations("scanChecker");
  const [status, setStatus] = useState<Status>({ phase: "idle" });
  const [preview, setPreview] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);
  const runRef = useRef(0);
  const target = expected?.trim() ? expected : null;
  // For the result's sound cue, read when a check finishes.
  const targetRef = useRef(target);
  useEffect(() => {
    targetRef.current = target;
  });

  const check = useCallback(async (file: Blob) => {
    if (!file.type.startsWith("image/")) {
      setStatus({
        phase: "error",
        message: "notImage",
      });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setStatus({
        phase: "error",
        message: "tooBig",
      });
      return;
    }
    const run = ++runRef.current;
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
    }
    previewRef.current = URL.createObjectURL(file);
    setPreview(previewRef.current);
    setStatus({ phase: "checking" });
    try {
      const result = await getImageScanScore(file);
      if (run === runRef.current) {
        setStatus({ phase: "done", result });
        const mismatch =
          targetRef.current !== null &&
          result.data !== null &&
          !compareDecoded(result.data, targetRef.current).matches;
        soundEvent(result.score >= 75 && !mismatch ? "good" : "low");
      }
    } catch (error) {
      console.error("Scan check failed:", error);
      if (run === runRef.current) {
        setStatus({
          phase: "error",
          message: "unreadable",
        });
      }
    }
  }, []);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((item) =>
        item.type.startsWith("image/"),
      );
      if (file) {
        event.preventDefault();
        check(file);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [check]);

  useEffect(
    () => () => {
      if (previewRef.current) {
        URL.revokeObjectURL(previewRef.current);
      }
    },
    [],
  );

  const pasteFromClipboard = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((entry) => entry.startsWith("image/"));
        if (type) {
          await check(await item.getType(type));
          return;
        }
      }
      toast.error(t("noClipboardImage"));
    } catch {
      toast.error(t("clipboardBlocked"));
    }
  };

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: { "image/*": [] },
    multiple: false,
    noClick: true,
    onDrop: (files) => {
      const [file] = files;
      if (file) {
        check(file);
      }
    },
  });

  const result = status.phase === "done" ? status.result : null;
  const link = result?.data ? safeLink(result.data) : null;
  const match = useMemo(
    () =>
      result?.data != null && target !== null
        ? compareDecoded(result.data, target)
        : null,
    [result, target],
  );

  const actions = result?.data != null && (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(result.data ?? "");
              toast.success(t("copied"));
              soundEvent("copy");
            } catch {
              toast.error(t("copyFailed"));
            }
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          <Copy className="size-3.5" />
          {t("copy")}
        </Button>
        {link && (
          <Button asChild size="sm" variant="outline">
            <a href={link} rel="noopener noreferrer nofollow" target="_blank">
              <ExternalLink className="size-3.5" />
              {t("openLink")}
            </a>
          </Button>
        )}
        {link && renderLinkAction?.(link)}
      </div>
      {link && !match?.matches && (
        <p className="text-muted-foreground text-xs">{t("checkAddress")}</p>
      )}
    </div>
  );

  const score = result && (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          "font-semibold tabular-nums tracking-tight",
          compact ? "text-3xl" : "text-4xl",
        )}
      >
        {result.score}
      </span>
      <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium">
        <span
          className={cn("size-2 rounded-full", GRADE_COLORS[result.grade])}
        />
        {gradeLabels[result.grade]}
      </span>
    </div>
  );

  const checking = status.phase === "checking" && (
    <p className="text-muted-foreground flex items-center gap-2 text-sm">
      <LoaderCircle className="size-4 animate-spin" />
      {t("checking")}
    </p>
  );

  // In a dialog, the drop area shrinks to its buttons once there's a
  // result, so the result stays in view on a phone.
  const slim = compact && preview !== null;

  return (
    <div
      className={cn(
        "flex w-full flex-col",
        compact ? "gap-4" : "mx-auto max-w-4xl gap-6",
      )}
    >
      <div
        {...getRootProps()}
        className={cn(
          "flex flex-col items-center justify-center text-center transition-colors",
          !compact && "gap-4 rounded-xl border-2 border-dashed px-6 py-10",
          compact && "gap-3 rounded-lg border border-dashed px-4",
          compact && (slim ? "py-2.5" : "py-5"),
          isDragActive ? "border-foreground/30 bg-muted/50" : "border-border",
        )}
      >
        <input {...getInputProps()} aria-label={t("imageLabel")} />
        {!slim && (
          <ImageUp
            aria-hidden
            className={cn(
              "text-muted-foreground",
              compact ? "size-6" : "size-8",
            )}
          />
        )}
        {compact ? (
          <p className={cn("text-sm font-medium", slim && "sr-only")}>
            {t("dropCompact")}
          </p>
        ) : (
          <div className="space-y-1">
            <p className="font-medium">
              {t("drop")} <InfoHint id="scan-checker" />
            </p>
            <p className="text-muted-foreground text-sm">{t("dropHelp")}</p>
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            onClick={open}
            size={compact ? "sm" : "default"}
            type="button"
          >
            <ImageUp className="size-4" />
            {t("choose")}
          </Button>
          <Button
            onClick={pasteFromClipboard}
            size={compact ? "sm" : "default"}
            type="button"
            variant="outline"
          >
            <ClipboardPaste className="size-4" />
            {t("paste")}
          </Button>
        </div>
        {!compact && (
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <ShieldCheck aria-hidden className="size-3.5" />
            {t("private")}
          </p>
        )}
      </div>

      {status.phase === "error" && (
        <div
          className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200"
          role="alert"
        >
          {t(`errors.${status.message}`)}
        </div>
      )}

      {preview && status.phase !== "error" && compact && (
        <div
          aria-live="polite"
          className="flex flex-col gap-4 rounded-lg border p-3"
        >
          <div className="flex items-center gap-3">
            <div className="bg-muted/40 grid size-20 shrink-0 place-items-center overflow-hidden rounded-md p-1">
              <img
                alt={t("previewAltCompact")}
                className="max-h-full max-w-full object-contain"
                src={preview}
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              {checking}
              {score}
              {result?.data != null && (
                <DecodedSummary data={result.data} link={link} />
              )}
            </div>
          </div>
          {result && (
            <>
              {match && target && <MatchRow expected={target} match={match} />}
              <ScanCheckList checks={result.checks} />
              {actions}
            </>
          )}
        </div>
      )}

      {preview && status.phase !== "error" && !compact && (
        <div className="grid gap-6 rounded-xl border p-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:p-6">
          <div className="bg-muted/40 flex items-center justify-center rounded-lg p-3">
            <img
              alt={t("previewAlt")}
              className="max-h-80 w-auto object-contain"
              src={preview}
            />
          </div>

          <div aria-live="polite" className="flex min-w-0 flex-col gap-4">
            {checking}

            {result && (
              <>
                {score}

                {match && target && (
                  <MatchRow expected={target} match={match} />
                )}

                {result.data !== null ? (
                  <div className="space-y-2">
                    <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                      {result.version
                        ? t("decodedVersion", { version: result.version })
                        : t("decoded")}
                    </p>
                    <p className="bg-muted/50 max-h-40 overflow-auto rounded-md p-3 font-mono text-sm break-all whitespace-pre-wrap">
                      {result.data}
                    </p>
                    {actions}
                  </div>
                ) : null}

                <ScanCheckList checks={result.checks} />

                <p className="text-muted-foreground border-t pt-3 text-xs leading-relaxed">
                  {t("footnote")}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** "Opens https://…" for a link, else the start of the decoded text. */
function DecodedSummary({ data, link }: { data: string; link: string | null }) {
  const t = useTranslations("scanChecker");
  if (link) {
    return (
      <p className="line-clamp-2 text-sm [overflow-wrap:anywhere]" title={link}>
        {t.rich("opens", {
          link,
          muted: (chunks) => (
            <span className="text-muted-foreground">{chunks}</span>
          ),
          strong: (chunks) => <span className="font-medium">{chunks}</span>,
        })}
      </p>
    );
  }
  return (
    <p
      className="text-muted-foreground truncate font-mono text-xs"
      title={data}
    >
      {data}
    </p>
  );
}

/** Whether the photo holds what the design encodes, as a check row. */
function MatchRow({
  match,
  expected,
}: {
  match: DecodedMatch;
  expected: string;
}) {
  const t = useTranslations("scanChecker");
  if (match.matches) {
    return (
      <p className="flex gap-2 text-sm font-medium">
        <CircleCheck
          className="mt-0.5 size-4 shrink-0 text-emerald-500"
          variant="Bold"
        />
        {t("matches")}
      </p>
    );
  }
  return (
    <div className="flex gap-2 text-sm" role="status">
      <CircleX className="mt-0.5 size-4 shrink-0 text-red-500" variant="Bold" />
      <div className="min-w-0">
        <p className="font-medium leading-snug">
          {t(match.decodedIsLink ? "differentLink" : "differentContent")}
        </p>
        {match.expectedIsLink && (
          <p
            className="text-muted-foreground mt-0.5 line-clamp-2 text-xs leading-snug [overflow-wrap:anywhere]"
            title={expected.trim()}
          >
            {t("designOpens", { link: expected.trim() })}
          </p>
        )}
      </div>
    </div>
  );
}
