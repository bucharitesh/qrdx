"use client";

import { authClient } from "@repo/auth/client";
import {
  Spinner as Loader2,
  Close as X,
} from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import { Label } from "@repo/design-system/components/ui/label";
import { Progress } from "@repo/design-system/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { Switch } from "@repo/design-system/components/ui/switch";
import { cn } from "@repo/design-system/lib/utils";
import { strToU8 } from "fflate";
import {
  Import as Download,
  Brush2 as EditStyle,
  TableDocument as FileSpreadsheet,
  Export as Upload,
} from "iconsax-reactjs";
import { useLocale, useTranslations } from "next-intl";
import Papa from "papaparse";
import { getQRCodeDataUrl, QRCode } from "qrdx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { InfoHint } from "@/components/help/info-hint";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { HairlineFigure } from "@/components/mockups/hairline";
import { defaultThemeState } from "@/config/qr";
import { track } from "@/lib/analytics";
import { useTrackEditorOpened } from "@/lib/analytics/react";
import { DEFAULT_QR_LOGO } from "@/lib/constants";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useQRThemes } from "@/lib/hooks/use-themes";
import { playgroundHref } from "@/lib/playground-links";
import { styleEngineOptions } from "@/lib/qr-design/engine-options";
import { soundEvent } from "@/lib/sound/emit";
import { createZipParts } from "@/lib/zip-stream";
import { useQREditorStore } from "@/store/editor-store";
import type { ThemeStyles } from "@/types/theme";
import { defaultPresets } from "@/utils/qr-presets";
import {
  type CsvTable,
  createFilenameAllocator,
  dataUrlToBytes,
  guessFilenameColumn,
  guessValueColumn,
  imageToDataUrl,
  MAX_BULK_ROWS,
  MAX_CSV_BYTES,
  SAMPLE_CSV_ROWS,
  sanitizeFilename,
  toTable,
} from "./bulk-utils";
import { buildQrProps, QUIET_ZONE_MODULES } from "./qr-props";

/** WebP is lossless, the same pixels as PNG in a smaller file. */
type Format = "png" | "webp" | "svg";
type LevelChoice = "style" | "L" | "M" | "Q" | "H";

interface Failure {
  row: number;
  value: string;
  error: string;
}

interface RowOutput {
  index: number;
  value: string;
  bytes?: Uint8Array;
  error?: string;
}

type Status =
  | { phase: "idle" }
  | { phase: "running"; done: number; total: number }
  | {
      phase: "done";
      url: string;
      filename: string;
      /** ZIP files saved: a large batch comes in parts */
      parts: number;
      generated: number;
      failures: Failure[];
      warning?: string;
    }
  | { phase: "error"; message: string; failures: Failure[] };

const BATCH_SIZE = 8;
const PNG_SIZES = [256, 512, 1024, 2048] as const;
const DEFAULT_STYLE_ID = "preset:classic";

function withDefaults(styles: ThemeStyles): ThemeStyles {
  return { ...defaultThemeState.styles, ...styles };
}

/** The `style` a link may ask for: editor, preset:<id> or saved:<id>. */
const STYLE_PARAM = "style";
const STYLE_VALUE =
  /^(?:editor|preset:[A-Za-z][A-Za-z0-9_-]{0,63}|saved:[A-Za-z0-9_-]{1,64})$/;

/**
 * Reads `?style=` once and removes it from the address bar, so a reload or a
 * shared link doesn't keep overriding the choice. Browser only: the page
 * stays static.
 */
function takeStyleParam(): string | null {
  const url = new URL(window.location.href);
  const raw = url.searchParams.get(STYLE_PARAM);
  if (raw === null) return null;
  url.searchParams.delete(STYLE_PARAM);
  window.history.replaceState(
    null,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
  const value = raw.trim();
  return STYLE_VALUE.test(value) ? value : null;
}

/** "Edit this style in the playground" for a style option id. */
function playgroundStyleHref(styleId: string): string {
  if (styleId.startsWith("preset:")) {
    return playgroundHref({ preset: styleId.slice(7), tab: "design" });
  }
  if (styleId.startsWith("saved:")) {
    return playgroundHref({ themeId: styleId.slice(6), tab: "design" });
  }
  return playgroundHref({ tab: "design" });
}

function saveBlob(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  soundEvent("download");
}

function downloadSampleCsv() {
  const csv = Papa.unparse(SAMPLE_CSV_ROWS);
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  saveBlob(url, "qrdx-bulk-sample.csv");
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BulkGenerator() {
  const t = useTranslations("tools.bulk.generator");
  useTrackEditorOpened("bulk_tool");
  const locale = useLocale();
  const n = (value: number) => value.toLocaleString(locale);
  /** A row's or the run's error for people (and errors.csv). */
  const readableError = (error: unknown): string => {
    const message = error instanceof Error ? error.message : String(error);
    return /too long/i.test(message)
      ? t("errorTooMuch")
      : message || t("errorFailed");
  };
  const mounted = useMounted();
  const editorStyles = useQREditorStore((state) => state.themeState.styles);
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const {
    data: savedThemes,
    isPlaceholderData: themesPlaceholder,
    isError: themesError,
  } = useQRThemes();
  // A saved theme a link asked for (style=saved:<id>), until the list says
  // whether it's there.
  const [requestedSaved, setRequestedSaved] = useState<string | null>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [rawRows, setRawRows] = useState<string[][] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [valueColumn, setValueColumn] = useState(0);
  const [filenameColumn, setFilenameColumn] = useState(-1);
  const [styleId, setStyleId] = useState(DEFAULT_STYLE_ID);
  const [format, setFormat] = useState<Format>("png");
  const [pngSize, setPngSize] = useState<number>(512);
  const [level, setLevel] = useState<LevelChoice>("style");
  const [quietZone, setQuietZone] = useState(true);
  const [status, setStatus] = useState<Status>({ phase: "idle" });
  const runRef = useRef<{ cancelled: boolean } | null>(null);

  const table: CsvTable | null = useMemo(
    () => (rawRows ? toTable(rawRows, hasHeader) : null),
    [rawRows, hasHeader],
  );

  const styleOptions = useMemo(() => {
    const options = new Map<string, { label: string; styles: ThemeStyles }>();
    for (const [id, preset] of Object.entries(defaultPresets)) {
      options.set(`preset:${id}`, {
        label: preset.label ?? id,
        styles: withDefaults(preset.styles),
      });
    }
    options.set("editor", {
      label: t("editorStyle"),
      styles: withDefaults(editorStyles),
    });
    for (const theme of savedThemes ?? []) {
      options.set(`saved:${theme.id}`, {
        label: theme.name,
        styles: withDefaults(theme.style as ThemeStyles),
      });
    }
    return options;
  }, [editorStyles, savedThemes, t]);

  // A saved theme stays selected while the list loads, and shows as soon as
  // it arrives; until then (or if it never does) the default stands in.
  const activeStyleId = styleOptions.has(styleId) ? styleId : DEFAULT_STYLE_ID;

  const selectedStyle = useMemo(() => {
    const base = styleOptions.get(activeStyleId)?.styles as ThemeStyles;
    return level === "style" ? base : { ...base, level };
  }, [styleOptions, activeStyleId, level]);

  // A link from the playground or the dashboard: ?style=editor,
  // preset:<id> or saved:<id>. Read once, in the browser.
  useEffect(() => {
    const requested = takeStyleParam();
    if (!requested) return;
    if (requested === "editor") setStyleId("editor");
    else if (requested.startsWith("preset:")) {
      if (Object.hasOwn(defaultPresets, requested.slice(7))) {
        setStyleId(requested);
      }
    } else {
      setStyleId(requested);
      setRequestedSaved(requested.slice(6));
    }
  }, []);

  const savedThemesSettled =
    !sessionPending && (!session?.user || !themesPlaceholder || themesError);
  const requestedSavedMissing =
    requestedSaved !== null &&
    styleId === `saved:${requestedSaved}` &&
    savedThemesSettled &&
    !styleOptions.has(styleId);

  // Reset column choices whenever the table shape changes.
  useEffect(() => {
    if (!table) return;
    const value = guessValueColumn(table.columns);
    setValueColumn(value);
    setFilenameColumn(guessFilenameColumn(table.columns, value));
  }, [table]);

  useEffect(
    () => () => {
      if (runRef.current) runRef.current.cancelled = true;
    },
    [],
  );

  useEffect(() => {
    if (status.phase !== "done") return;
    return () => URL.revokeObjectURL(status.url);
  }, [status]);

  const onDrop = useCallback(
    (accepted: File[]) => {
      const file = accepted[0];
      if (!file) return;
      setParseError(null);
      setStatus({ phase: "idle" });
      Papa.parse<string[]>(file, {
        skipEmptyLines: "greedy",
        // Header row + MAX rows + 1 to detect truncation.
        preview: MAX_BULK_ROWS + 2,
        complete: (results) => {
          if (results.data.length === 0) {
            setParseError(t("errorEmpty"));
            setRawRows(null);
            return;
          }
          setFileName(file.name);
          setRawRows(results.data);
        },
        error: (error) => {
          setParseError(error.message);
          setRawRows(null);
        },
      });
    },
    [t],
  );

  const { getRootProps, getInputProps, isDragActive, fileRejections } =
    useDropzone({
      onDrop,
      multiple: false,
      maxSize: MAX_CSV_BYTES,
      accept: {
        "text/csv": [".csv"],
        "text/plain": [".txt", ".csv"],
        "application/vnd.ms-excel": [".csv"],
      },
    });

  const rejection = fileRejections[0]?.errors[0];
  const rejectionMessage =
    rejection?.code === "file-too-large"
      ? t("errorTooLarge")
      : rejection?.message;

  const previewRow = table?.rows.find((row) => row[valueColumn]?.trim());
  const previewValue = previewRow?.[valueColumn]?.trim() ?? "";
  const running = status.phase === "running";

  const reset = () => {
    setFileName(null);
    setRawRows(null);
    setParseError(null);
    setStatus({ phase: "idle" });
  };

  const generate = async () => {
    if (!table || table.rows.length === 0) return;

    const run = { cancelled: false };
    runRef.current = run;
    const rows = table.rows;
    const total = rows.length;
    const lineOffset = hasHeader ? 2 : 1;
    setStatus({ phase: "running", done: 0, total });

    let style = selectedStyle;
    let logo: string | undefined;
    let warning: string | undefined;
    if (style.showLogo) {
      try {
        logo = await imageToDataUrl(style.customLogo ?? DEFAULT_QR_LOGO);
      } catch {
        style = { ...style, showLogo: false };
        warning = t("logoFailed");
      }
    }

    // Each file goes into the ZIP as soon as it's drawn, and the archive's
    // bytes leave JavaScript memory as it grows; a batch past ZIP_PART_BYTES
    // is saved in parts as it goes (lib/zip-stream.ts).
    const zipBase = `${sanitizeFilename(fileName?.replace(/\.[^.]+$/, "") ?? "") || "qr-codes"}-qr-codes`;
    const zip = createZipParts(zipBase);

    const allocate = createFilenameAllocator();
    const failures: Failure[] = [];
    const size = format === "svg" ? 1024 : pngSize;
    let generated = 0;

    for (let start = 0; start < total; start += BATCH_SIZE) {
      if (run.cancelled) break;
      const batch = rows.slice(start, start + BATCH_SIZE);
      const outputs = await Promise.all(
        batch.map(async (row, offset): Promise<RowOutput> => {
          const index = start + offset;
          const value = row[valueColumn]?.trim() ?? "";
          if (!value) return { index, value, error: t("errorEmptyValue") };
          try {
            const dataUrl = await getQRCodeDataUrl(
              buildQrProps(value, style, { quietZone, logo }),
              format,
              { width: size, height: size },
            );
            return { index, value, bytes: dataUrlToBytes(dataUrl) };
          } catch (error) {
            return { index, value, error: readableError(error) };
          }
        }),
      );

      for (const output of outputs) {
        if (!output.bytes) {
          failures.push({
            row: output.index + lineOffset,
            value: output.value,
            error: output.error ?? t("errorFailed"),
          });
          continue;
        }
        const rawName =
          filenameColumn >= 0 ? (rows[output.index][filenameColumn] ?? "") : "";
        const base =
          sanitizeFilename(rawName) ||
          `qr-${String(output.index + 1).padStart(4, "0")}`;
        await zip.add(allocate(base, format), output.bytes, format === "svg");
        generated++;
      }

      setStatus({
        phase: "running",
        done: Math.min(start + BATCH_SIZE, total),
        total,
      });
      // Let the browser paint progress between batches.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    if (run.cancelled) {
      zip.abort();
      setStatus({ phase: "idle" });
      return;
    }

    if (generated === 0) {
      zip.abort();
      setStatus({
        phase: "error",
        message: t("errorNone"),
        failures,
      });
      return;
    }

    if (failures.length > 0) {
      await zip.add("errors.csv", strToU8(Papa.unparse(failures)), true);
    }

    try {
      const { blob, filename, parts } = await zip.finish();
      const url = URL.createObjectURL(blob);
      saveBlob(url, filename);
      track("qr_generated", {
        content_type: "bulk",
        source: "bulk_tool",
        count: generated,
      });
      track("qr_downloaded", { format: `zip-${format}`, source: "bulk_tool" });
      setStatus({
        phase: "done",
        url,
        filename,
        parts,
        generated,
        failures,
        warning,
      });
    } catch (error) {
      setStatus({
        phase: "error",
        message: readableError(error),
        failures,
      });
    }
  };

  const failures =
    status.phase === "done" || status.phase === "error" ? status.failures : [];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,20rem)]">
      <div className="flex flex-col gap-6 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-medium">
              {t("stepUpload")} <InfoHint align="start" id="bulk-csv" />
            </h2>
            <Button size="sm" variant="ghost" onClick={downloadSampleCsv}>
              <FileSpreadsheet className="size-4" />
              {t("sampleCsv")}
            </Button>
          </div>
          {table ? (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted px-3 py-2 text-sm">
              <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {t("fileRows", {
                  file: fileName ?? "",
                  count: table.rows.length,
                })}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                onClick={reset}
                disabled={running}
                aria-label={t("removeFile")}
              >
                <X className="size-4" />
              </Button>
            </div>
          ) : (
            <div
              {...getRootProps()}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center transition-colors hover:bg-accent/50",
                isDragActive && "bg-accent",
              )}
            >
              <input {...getInputProps()} />
              <Upload className="size-6 text-muted-foreground" />
              <p className="text-sm font-medium">{t("drop")}</p>
              <p className="text-xs text-muted-foreground">
                {t("dropHelp", { rows: MAX_BULK_ROWS })}
              </p>
            </div>
          )}
          {(parseError || rejectionMessage) && (
            <p className="text-sm text-destructive">
              {parseError ?? rejectionMessage}
            </p>
          )}
          {table?.truncated && (
            <p className="text-sm text-muted-foreground">
              {t("truncated", { rows: MAX_BULK_ROWS })}
            </p>
          )}
          {table && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="bulk-header"
                checked={hasHeader}
                onCheckedChange={(checked) => setHasHeader(checked === true)}
                disabled={running}
              />
              <Label htmlFor="bulk-header" className="text-sm font-normal">
                {t("header")}
              </Label>
            </div>
          )}
        </div>

        {table && (
          <div className="flex flex-col gap-3">
            <h2 className="font-medium">{t("stepMap")}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs" htmlFor="bulk-value-column">
                  {t("valueColumn")}
                </Label>
                <Select
                  value={String(valueColumn)}
                  onValueChange={(value) => setValueColumn(Number(value))}
                  disabled={running}
                >
                  <SelectTrigger className="w-full" id="bulk-value-column">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {table.columns.map((column, index) => (
                      <SelectItem
                        key={column + String(index)}
                        value={String(index)}
                      >
                        {column}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs" htmlFor="bulk-filename-column">
                  {t("filenameColumn")}
                </Label>
                <Select
                  value={String(filenameColumn)}
                  onValueChange={(value) => setFilenameColumn(Number(value))}
                  disabled={running}
                >
                  <SelectTrigger className="w-full" id="bulk-filename-column">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="-1">{t("numbered")}</SelectItem>
                    {table.columns.map((column, index) => (
                      <SelectItem
                        key={column + String(index)}
                        value={String(index)}
                      >
                        {column}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <h2 className="font-medium">
            {t("stepStyle", { step: table ? 3 : 2 })}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs" htmlFor="bulk-style">
                {t("style")}
              </Label>
              <Select
                value={activeStyleId}
                onValueChange={setStyleId}
                disabled={running}
              >
                <SelectTrigger className="w-full" id="bulk-style">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {mounted && (
                    <SelectGroup>
                      <SelectLabel>{t("yours")}</SelectLabel>
                      <SelectItem value="editor">{t("editorStyle")}</SelectItem>
                      {(savedThemes ?? []).map((theme) => (
                        <SelectItem key={theme.id} value={`saved:${theme.id}`}>
                          {theme.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  <SelectGroup>
                    <SelectLabel>{t("presets")}</SelectLabel>
                    {Object.entries(defaultPresets).map(([id, preset]) => (
                      <SelectItem key={id} value={`preset:${id}`}>
                        {preset.label ?? id}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {requestedSavedMissing && (
                <p className="text-xs text-muted-foreground">
                  {t(session?.user ? "savedMissing" : "savedSignIn")}
                </p>
              )}
              <Link
                className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                href={playgroundStyleHref(activeStyleId)}
              >
                <EditStyle aria-hidden className="size-3.5 shrink-0" />
                {t("editStyle")}
              </Link>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">
                {t("ecc")} <InfoHint id="error-correction" />
              </Label>
              <Select
                value={level}
                onValueChange={(value) => setLevel(value as LevelChoice)}
                disabled={running}
              >
                <SelectTrigger aria-label={t("ecc")} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="style">{t("eccFromStyle")}</SelectItem>
                  <SelectItem value="L">L (7%)</SelectItem>
                  <SelectItem value="M">M (15%)</SelectItem>
                  <SelectItem value="Q">Q (25%)</SelectItem>
                  <SelectItem value="H">H (30%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs" htmlFor="bulk-format">
                {t("format")}
              </Label>
              <Select
                value={format}
                onValueChange={(value) => setFormat(value as Format)}
                disabled={running}
              >
                <SelectTrigger className="w-full" id="bulk-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="png">{t("formatPng")}</SelectItem>
                  <SelectItem value="webp">{t("formatWebp")}</SelectItem>
                  <SelectItem value="svg">{t("formatSvg")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {format !== "svg" && (
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs" htmlFor="bulk-png-size">
                  {t("size", { format: format === "webp" ? "WebP" : "PNG" })}
                </Label>
                <Select
                  value={String(pngSize)}
                  onValueChange={(value) => setPngSize(Number(value))}
                  disabled={running}
                >
                  <SelectTrigger className="w-full" id="bulk-png-size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PNG_SIZES.map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size} × {size} px
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
            <Label htmlFor="bulk-quiet-zone" className="text-sm font-normal">
              {t("quietZone", { modules: QUIET_ZONE_MODULES })}
            </Label>
            <Switch
              id="bulk-quiet-zone"
              checked={quietZone}
              onCheckedChange={setQuietZone}
              disabled={running}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex aspect-square w-full max-w-64 items-center justify-center [&_svg]:size-full">
          {mounted && previewValue ? (
            <QRCode
              bgColor={selectedStyle.bgColor}
              bodyPattern={selectedStyle.bodyPattern}
              cornerEyeDotPattern={selectedStyle.cornerEyeDotPattern}
              cornerEyePattern={selectedStyle.cornerEyePattern}
              dotColor={selectedStyle.dotColor}
              eyeColor={selectedStyle.eyeColor}
              fgColor={selectedStyle.fgColor}
              hideLogo={!selectedStyle.showLogo}
              level={selectedStyle.level}
              logo={selectedStyle.customLogo ?? DEFAULT_QR_LOGO}
              margin={quietZone ? QUIET_ZONE_MODULES : 0}
              size={256}
              templateId={selectedStyle.templateId}
              value={previewValue}
              {...styleEngineOptions(selectedStyle)}
            />
          ) : (
            <div className="flex flex-col items-center gap-3 px-4 text-center">
              <HairlineFigure figure="Stack" className="aspect-square w-28" />
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
            </div>
          )}
        </div>
        {previewValue && (
          <p className="w-full truncate text-center text-xs text-muted-foreground">
            {previewValue}
          </p>
        )}

        {running ? (
          <div className="flex w-full flex-col gap-2">
            <Progress value={(status.done / Math.max(status.total, 1)) * 100} />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {n(status.done)} / {n(status.total)}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (runRef.current) runRef.current.cancelled = true;
                }}
              >
                {t("cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            className="w-full"
            disabled={!table || table.rows.length === 0}
            onClick={generate}
          >
            <Download className="size-4" />
            {table
              ? t("generateCount", { count: table.rows.length })
              : t("generate")}
          </Button>
        )}

        {status.phase === "running" && status.done === 0 && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> {t("preparing")}
          </p>
        )}

        {status.phase === "done" && (
          <div className="flex w-full flex-col gap-2 text-sm">
            <p>
              {status.parts > 1
                ? t("doneParts", {
                    count: status.generated,
                    parts: status.parts,
                  })
                : t("done", {
                    count: status.generated,
                    file: status.filename,
                  })}
            </p>
            {status.warning && (
              <p className="text-xs text-muted-foreground">{status.warning}</p>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => saveBlob(status.url, status.filename)}
            >
              {status.parts > 1
                ? t("downloadPartAgain", { part: status.parts })
                : t("downloadAgain")}
            </Button>
          </div>
        )}

        {status.phase === "error" && (
          <p className="text-sm text-destructive">{status.message}</p>
        )}

        {failures.length > 0 && (
          <div className="w-full text-xs">
            <p className="font-medium">
              {t(status.phase === "done" ? "skippedListed" : "skipped", {
                count: failures.length,
              })}
            </p>
            <ul className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
              {failures.slice(0, 5).map((failure) => (
                <li key={failure.row}>
                  {t("line", { row: failure.row, error: failure.error })}
                </li>
              ))}
              {failures.length > 5 && <li>…</li>}
            </ul>
          </div>
        )}

        <p className="text-center text-[11px] text-muted-foreground">
          {t("private")}
        </p>
      </div>
    </div>
  );
}
