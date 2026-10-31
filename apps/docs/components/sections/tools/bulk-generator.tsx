"use client";

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
import { strToU8, Zip, ZipDeflate, ZipPassThrough } from "fflate";
import { Download, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import Papa from "papaparse";
import { getQRCodeDataUrl, QRCode } from "qrdx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { defaultThemeState } from "@/config/qr";
import { DEFAULT_QR_LOGO } from "@/lib/constants";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useQRThemes } from "@/lib/hooks/use-themes";
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

type Format = "png" | "svg";
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

function saveBlob(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function downloadSampleCsv() {
  const csv = Papa.unparse(SAMPLE_CSV_ROWS);
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  saveBlob(url, "qrdx-bulk-sample.csv");
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function readableError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return /too long/i.test(message)
    ? "Too much data for one QR code"
    : message || "Could not generate";
}

export function BulkGenerator() {
  const mounted = useMounted();
  const editorStyles = useQREditorStore((state) => state.themeState.styles);
  const { data: savedThemes } = useQRThemes();

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
      label: "My editor style",
      styles: withDefaults(editorStyles),
    });
    for (const theme of savedThemes ?? []) {
      options.set(`saved:${theme.id}`, {
        label: theme.name,
        styles: withDefaults(theme.style as ThemeStyles),
      });
    }
    return options;
  }, [editorStyles, savedThemes]);

  const selectedStyle = useMemo(() => {
    const base = (
      styleOptions.get(styleId) ?? styleOptions.get(DEFAULT_STYLE_ID)
    )?.styles as ThemeStyles;
    return level === "style" ? base : { ...base, level };
  }, [styleOptions, styleId, level]);

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

  const onDrop = useCallback((accepted: File[]) => {
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
          setParseError("The file is empty.");
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
  }, []);

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
      ? "The file is larger than 10 MB."
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
        warning = "The logo couldn't be loaded, so codes were made without it.";
      }
    }

    // fflate types chunks as ArrayBufferLike-backed; they are plain ArrayBuffers.
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let resolveZip: (blob: Blob) => void = () => {};
    let rejectZip: (error: Error) => void = () => {};
    const zipped = new Promise<Blob>((resolve, reject) => {
      resolveZip = resolve;
      rejectZip = reject;
    });
    const zip = new Zip((error, chunk, final) => {
      if (error) {
        rejectZip(error);
        return;
      }
      chunks.push(chunk as Uint8Array<ArrayBuffer>);
      if (final) resolveZip(new Blob(chunks, { type: "application/zip" }));
    });

    const allocate = createFilenameAllocator();
    const failures: Failure[] = [];
    const size = format === "png" ? pngSize : 1024;
    let generated = 0;

    for (let start = 0; start < total; start += BATCH_SIZE) {
      if (run.cancelled) break;
      const batch = rows.slice(start, start + BATCH_SIZE);
      const outputs = await Promise.all(
        batch.map(async (row, offset): Promise<RowOutput> => {
          const index = start + offset;
          const value = row[valueColumn]?.trim() ?? "";
          if (!value) return { index, value, error: "Empty value" };
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
            error: output.error ?? "Could not generate",
          });
          continue;
        }
        const rawName =
          filenameColumn >= 0 ? (rows[output.index][filenameColumn] ?? "") : "";
        const base =
          sanitizeFilename(rawName) ||
          `qr-${String(output.index + 1).padStart(4, "0")}`;
        const entry =
          format === "svg"
            ? new ZipDeflate(allocate(base, format), { level: 6 })
            : new ZipPassThrough(allocate(base, format));
        zip.add(entry);
        entry.push(output.bytes, true);
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
      zip.terminate();
      setStatus({ phase: "idle" });
      return;
    }

    if (generated === 0) {
      zip.terminate();
      setStatus({
        phase: "error",
        message: "No codes could be generated from this file.",
        failures,
      });
      return;
    }

    if (failures.length > 0) {
      const entry = new ZipDeflate("errors.csv", { level: 6 });
      zip.add(entry);
      entry.push(strToU8(Papa.unparse(failures)), true);
    }
    zip.end();

    try {
      const blob = await zipped;
      const url = URL.createObjectURL(blob);
      const filename = `${sanitizeFilename(fileName?.replace(/\.[^.]+$/, "") ?? "") || "qr-codes"}-qr-codes.zip`;
      saveBlob(url, filename);
      setStatus({
        phase: "done",
        url,
        filename,
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
            <h3 className="font-medium">1. Upload a CSV</h3>
            <Button size="sm" variant="ghost" onClick={downloadSampleCsv}>
              <FileSpreadsheet className="size-4" />
              Sample CSV
            </Button>
          </div>
          {table ? (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted px-3 py-2 text-sm">
              <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {fileName} · {table.rows.length.toLocaleString()} rows
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                onClick={reset}
                disabled={running}
                aria-label="Remove file"
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
              <p className="text-sm font-medium">
                Drop a CSV file here, or click to choose one
              </p>
              <p className="text-xs text-muted-foreground">
                Up to {MAX_BULK_ROWS.toLocaleString()} rows and 10 MB. The file
                stays on your device.
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
              This file has more than {MAX_BULK_ROWS.toLocaleString()} rows.
              Only the first {MAX_BULK_ROWS.toLocaleString()} will be used.
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
                First row contains column names
              </Label>
            </div>
          )}
        </div>

        {table && (
          <div className="flex flex-col gap-3">
            <h3 className="font-medium">2. Map columns</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">QR code content</Label>
                <Select
                  value={String(valueColumn)}
                  onValueChange={(value) => setValueColumn(Number(value))}
                  disabled={running}
                >
                  <SelectTrigger className="w-full">
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
                <Label className="text-xs">File name (optional)</Label>
                <Select
                  value={String(filenameColumn)}
                  onValueChange={(value) => setFilenameColumn(Number(value))}
                  disabled={running}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="-1">Numbered (qr-0001)</SelectItem>
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
          <h3 className="font-medium">{table ? "3." : "2."} Choose a style</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Style</Label>
              <Select
                value={styleOptions.has(styleId) ? styleId : DEFAULT_STYLE_ID}
                onValueChange={setStyleId}
                disabled={running}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {mounted && (
                    <SelectGroup>
                      <SelectLabel>Yours</SelectLabel>
                      <SelectItem value="editor">My editor style</SelectItem>
                      {(savedThemes ?? []).map((theme) => (
                        <SelectItem key={theme.id} value={`saved:${theme.id}`}>
                          {theme.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  <SelectGroup>
                    <SelectLabel>Presets</SelectLabel>
                    {Object.entries(defaultPresets).map(([id, preset]) => (
                      <SelectItem key={id} value={`preset:${id}`}>
                        {preset.label ?? id}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Error correction</Label>
              <Select
                value={level}
                onValueChange={(value) => setLevel(value as LevelChoice)}
                disabled={running}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="style">From style</SelectItem>
                  <SelectItem value="L">L (7%)</SelectItem>
                  <SelectItem value="M">M (15%)</SelectItem>
                  <SelectItem value="Q">Q (25%)</SelectItem>
                  <SelectItem value="H">H (30%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Format</Label>
              <Select
                value={format}
                onValueChange={(value) => setFormat(value as Format)}
                disabled={running}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="png">PNG (image)</SelectItem>
                  <SelectItem value="svg">SVG (vector, for print)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {format === "png" && (
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">PNG size</Label>
                <Select
                  value={String(pngSize)}
                  onValueChange={(value) => setPngSize(Number(value))}
                  disabled={running}
                >
                  <SelectTrigger className="w-full">
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
              Add a {QUIET_ZONE_MODULES}-module quiet zone (recommended for
              print)
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
            />
          ) : (
            <p className="px-4 text-center text-sm text-muted-foreground">
              Upload a CSV to preview the first code.
            </p>
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
                {status.done.toLocaleString()} / {status.total.toLocaleString()}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (runRef.current) runRef.current.cancelled = true;
                }}
              >
                Cancel
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
            Generate {table ? table.rows.length.toLocaleString() : ""} codes
          </Button>
        )}

        {status.phase === "running" && status.done === 0 && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> Preparing…
          </p>
        )}

        {status.phase === "done" && (
          <div className="flex w-full flex-col gap-2 text-sm">
            <p>
              Done: {status.generated.toLocaleString()} codes in{" "}
              {status.filename}.
            </p>
            {status.warning && (
              <p className="text-xs text-muted-foreground">{status.warning}</p>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => saveBlob(status.url, status.filename)}
            >
              Download again
            </Button>
          </div>
        )}

        {status.phase === "error" && (
          <p className="text-sm text-destructive">{status.message}</p>
        )}

        {failures.length > 0 && (
          <div className="w-full text-xs">
            <p className="font-medium">
              {failures.length.toLocaleString()} rows skipped
              {status.phase === "done" ? " (listed in errors.csv)" : ""}:
            </p>
            <ul className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
              {failures.slice(0, 5).map((failure) => (
                <li key={failure.row}>
                  Line {failure.row}: {failure.error}
                </li>
              ))}
              {failures.length > 5 && <li>…</li>}
            </ul>
          </div>
        )}

        <p className="text-center text-[11px] text-muted-foreground">
          Everything runs in your browser. Your CSV and the generated codes are
          never uploaded.
        </p>
      </div>
    </div>
  );
}
