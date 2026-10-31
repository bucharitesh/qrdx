"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/ui/alert";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Label } from "@repo/design-system/components/ui/label";
import { Progress } from "@repo/design-system/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import { cn } from "@repo/design-system/lib/utils";
import {
  CircleAlert,
  CircleCheck,
  Download,
  FileSpreadsheet,
  Gem,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import Papa from "papaparse";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { importQrCodesChunk, previewQrCodeImport } from "@/actions/bulk-codes";
import {
  DomainPicker,
  useDomainOptions,
} from "@/app/dashboard/codes/_components/domain-picker";
import { plural } from "@/app/dashboard/codes/_components/use-organize-action";
import type {
  ImportPreview,
  ImportRowResult,
} from "@/app/dashboard/codes/import/_lib/import";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";
import {
  type ColumnMapping,
  checkImportRow,
  guessMapping,
  IMPORT_CHUNK_SIZE,
  IMPORT_FIELD_LABELS,
  IMPORT_FIELDS,
  type ImportField,
  type ImportRowInput,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  rowsFromTable,
  SAMPLE_IMPORT_ROWS,
} from "../_lib/csv";

const NOT_MAPPED = "none";
const PREVIEW_ROWS = 200;

interface ParsedFile {
  name: string;
  columns: string[];
  rows: string[][];
  truncated: boolean;
}

type Phase =
  | { type: "edit" }
  | { type: "importing"; done: number; total: number }
  | { type: "done"; results: ImportRowResult[]; stopped: string | null };

function saveText(text: string, filename: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ImportWizard({
  canBulk,
  basePath,
}: {
  /** Pro and Business may import more than one row */
  canBulk: boolean;
  /** Codes list to link to afterwards */
  basePath: string;
}) {
  const openGetProDialog = useGetProDialogStore(
    (state) => state.openGetProDialog,
  );
  const domainOptions = useDomainOptions(true);
  const [file, setFile] = useState<ParsedFile | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [domainId, setDomainId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [phase, setPhase] = useState<Phase>({ type: "edit" });

  const onDrop = useCallback((accepted: File[]) => {
    const picked = accepted[0];
    if (!picked) return;
    setParseError(null);
    setPreview(null);
    setPhase({ type: "edit" });
    Papa.parse<string[]>(picked, {
      skipEmptyLines: "greedy",
      preview: MAX_IMPORT_ROWS + 2,
      complete: (results) => {
        const [header, ...body] = results.data;
        if (!header || body.length === 0) {
          setParseError(
            "The file needs a header row and at least one row of codes.",
          );
          setFile(null);
          return;
        }
        const columns = header.map(
          (name, index) =>
            name.replace(/^﻿/, "").trim() || `Column ${index + 1}`,
        );
        setFile({
          name: picked.name,
          columns,
          rows: body.slice(0, MAX_IMPORT_ROWS),
          truncated: body.length > MAX_IMPORT_ROWS,
        });
        setMapping(guessMapping(columns));
      },
      error: (error) => {
        setParseError(error.message);
        setFile(null);
      },
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive, fileRejections } =
    useDropzone({
      onDrop,
      multiple: false,
      maxSize: MAX_IMPORT_FILE_BYTES,
      accept: {
        "text/csv": [".csv"],
        "text/plain": [".txt", ".csv"],
        "application/vnd.ms-excel": [".csv"],
      },
    });
  const rejection = fileRejections[0]?.errors[0];
  const rejectionMessage =
    rejection?.code === "file-too-large"
      ? "The file is larger than 1 MB."
      : rejection?.message;

  const rows = useMemo<ImportRowInput[]>(
    () => (file && mapping ? rowsFromTable(file.rows, mapping) : []),
    [file, mapping],
  );
  const destinationMapped = mapping !== null && mapping.destination >= 0;

  // Quick checks in the browser; the server preview adds slug and plan checks.
  const localErrors = useMemo(() => {
    const errors = new Map<number, string[]>();
    for (const row of rows) {
      const result = checkImportRow(row).errors;
      if (result.length > 0) errors.set(row.line, result);
    }
    return errors;
  }, [rows]);

  useEffect(() => {
    if (!destinationMapped || rows.length === 0) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setChecking(true);
    setPreviewError(null);
    const timer = setTimeout(async () => {
      const result = await previewQrCodeImport({ rows });
      if (cancelled) return;
      setChecking(false);
      if (result.success) {
        setPreview(result.data);
      } else {
        setPreview(null);
        setPreviewError(result.error.message);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [rows, destinationMapped]);

  const errorsByLine = useMemo(() => {
    if (!preview) return localErrors;
    return new Map(preview.errors.map((item) => [item.line, item.messages]));
  }, [preview, localErrors]);
  const validRows = rows.filter((row) => !errorsByLine.has(row.line));
  const busy = phase.type === "importing";

  const reset = () => {
    setFile(null);
    setMapping(null);
    setPreview(null);
    setParseError(null);
    setPhase({ type: "edit" });
  };

  const runImport = async () => {
    if (validRows.length === 0) return;
    const results: ImportRowResult[] = [];
    let stopped: string | null = null;
    setPhase({ type: "importing", done: 0, total: validRows.length });
    for (let start = 0; start < validRows.length; start += IMPORT_CHUNK_SIZE) {
      const chunk = validRows.slice(start, start + IMPORT_CHUNK_SIZE);
      const result = await importQrCodesChunk({ rows: chunk, domainId });
      if (!result.success) {
        stopped = result.error.message;
        if (
          result.error.code === "LIMIT_REACHED" ||
          result.error.code === "PLAN_REQUIRED"
        ) {
          openGetProDialog();
        }
        break;
      }
      results.push(...result.data);
      setPhase({
        type: "importing",
        done: Math.min(start + chunk.length, validRows.length),
        total: validRows.length,
      });
    }
    setPhase({ type: "done", results, stopped });
  };

  const downloadSample = () =>
    saveText(Papa.unparse(SAMPLE_IMPORT_ROWS), "qrdx-import-sample.csv");

  const downloadErrors = () =>
    saveText(
      Papa.unparse(
        rows.flatMap((row) => {
          const errors = errorsByLine.get(row.line);
          return errors
            ? [
                {
                  line: row.line,
                  destination: row.destination,
                  errors: errors.join("; "),
                },
              ]
            : [];
        }),
      ),
      "qrdx-import-errors.csv",
    );

  if (phase.type === "done") {
    const created = phase.results.filter((result) => result.ok);
    const failed = phase.results.filter((result) => !result.ok);
    const notes = created.filter((result) => result.message);
    const byLine = new Map(rows.map((row) => [row.line, row]));
    return (
      <div className="space-y-4">
        <Alert variant={created.length > 0 ? "default" : "destructive"}>
          {created.length > 0 ? <CircleCheck /> : <CircleAlert />}
          <AlertTitle>
            {created.length > 0
              ? `Created ${plural(created.length, "code")}`
              : "No codes were created"}
          </AlertTitle>
          <AlertDescription>
            {phase.stopped
              ? `The import stopped: ${phase.stopped}`
              : failed.length > 0
                ? `${plural(failed.length, "row")} couldn't be imported.`
                : "Every valid row was imported."}
          </AlertDescription>
        </Alert>
        {(failed.length > 0 || notes.length > 0) && (
          <ul className="space-y-1 rounded-lg border p-3 text-sm">
            {[...failed, ...notes].slice(0, 50).map((result) => (
              <li key={result.line}>
                <span className="text-muted-foreground">
                  Line {result.line}:
                </span>{" "}
                {result.message}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={basePath}>View codes</Link>
          </Button>
          <Button
            onClick={() =>
              saveText(
                Papa.unparse(
                  phase.results.map((result) => ({
                    line: result.line,
                    destination: byLine.get(result.line)?.destination ?? "",
                    status: result.ok ? "created" : "failed",
                    short_link: result.code?.shortLink ?? "",
                    message: result.message ?? "",
                  })),
                ),
                "qrdx-import-results.csv",
              )
            }
            variant="outline"
          >
            <Download />
            Download results CSV
          </Button>
          <Button onClick={reset} variant="ghost">
            Import another file
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!canBulk && (
        <Alert>
          <Gem />
          <AlertTitle>Bulk import is a Pro feature</AlertTitle>
          <AlertDescription>
            <p>
              On the Free plan you can import one code at a time. Pro and
              Business import up to {MAX_IMPORT_ROWS.toLocaleString("en-US")}{" "}
              codes per file.
            </p>
            <Button className="mt-2" onClick={openGetProDialog} size="sm">
              Upgrade
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">1. Choose a CSV file</h2>
          <Button onClick={downloadSample} size="sm" variant="ghost">
            <Download />
            Sample CSV
          </Button>
        </div>
        {file ? (
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <FileSpreadsheet className="text-muted-foreground size-5" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-muted-foreground text-xs">
                {plural(rows.length, "row")} ·{" "}
                {plural(file.columns.length, "column")}
              </p>
            </div>
            <Button
              aria-label="Remove file"
              disabled={busy}
              onClick={reset}
              size="icon-sm"
              variant="ghost"
            >
              <X />
            </Button>
          </div>
        ) : (
          <div
            {...getRootProps()}
            className={cn(
              "border-border hover:bg-accent/50 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center transition-colors",
              isDragActive && "bg-accent",
            )}
          >
            <input {...getInputProps()} />
            <Upload className="text-muted-foreground size-6" />
            <p className="text-sm font-medium">
              Drop a CSV file here, or click to choose one
            </p>
            <p className="text-muted-foreground max-w-md text-xs">
              First row: column names. Columns: destination (required), title,
              folder (use "Parent / Child" for subfolders), tags (separated by ;
              or |) and slug (optional, 7 letters or digits). Up to{" "}
              {MAX_IMPORT_ROWS.toLocaleString("en-US")} rows and 1 MB.
            </p>
          </div>
        )}
        {(parseError || rejectionMessage) && (
          <p className="text-destructive text-sm">
            {parseError ?? rejectionMessage}
          </p>
        )}
        {file?.truncated && (
          <p className="text-muted-foreground text-sm">
            This file has more than {MAX_IMPORT_ROWS.toLocaleString("en-US")}{" "}
            rows. Only the first {MAX_IMPORT_ROWS.toLocaleString("en-US")} are
            shown and imported.
          </p>
        )}
      </section>

      {file && mapping && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">2. Match the columns</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {IMPORT_FIELDS.map((field: ImportField) => (
              <div className="space-y-1.5" key={field}>
                <Label htmlFor={`map-${field}`}>
                  {IMPORT_FIELD_LABELS[field]}
                  {field === "destination" && (
                    <span className="text-destructive"> *</span>
                  )}
                </Label>
                <Select
                  disabled={busy}
                  onValueChange={(value) =>
                    setMapping({
                      ...mapping,
                      [field]: value === NOT_MAPPED ? -1 : Number(value),
                    })
                  }
                  value={
                    mapping[field] >= 0 ? String(mapping[field]) : NOT_MAPPED
                  }
                >
                  <SelectTrigger className="w-full" id={`map-${field}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NOT_MAPPED}>Not in this file</SelectItem>
                    {file.columns.map((column, index) => (
                      <SelectItem
                        key={`${column}-${index}`}
                        value={String(index)}
                      >
                        {column}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <div className="max-w-sm">
            <DomainPicker
              current={null}
              disabled={busy}
              onChange={setDomainId}
              options={domainOptions}
              value={domainId}
            />
          </div>
          {!destinationMapped && (
            <p className="text-destructive text-sm">
              Choose the column with the destination URLs.
            </p>
          )}
        </section>
      )}

      {file && destinationMapped && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              3. Review
              {checking && (
                <Loader2 className="text-muted-foreground size-4 animate-spin" />
              )}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">
                {plural(validRows.length, "valid row")}
              </Badge>
              {errorsByLine.size > 0 && (
                <>
                  <Badge variant="destructive">
                    {plural(errorsByLine.size, "row")} with problems
                  </Badge>
                  <Button onClick={downloadErrors} size="sm" variant="ghost">
                    <Download />
                    Problems CSV
                  </Button>
                </>
              )}
            </div>
          </div>

          {previewError && (
            <p className="text-destructive text-sm">{previewError}</p>
          )}
          {preview &&
            (preview.newFolders.length > 0 || preview.newTags.length > 0) && (
              <p className="text-muted-foreground text-sm">
                {preview.newFolders.length > 0 &&
                  `New folders: ${preview.newFolders.join(", ")}. `}
                {preview.newTags.length > 0 &&
                  `New tags: ${preview.newTags.join(", ")}.`}
              </p>
            )}

          <div className="max-h-[28rem] overflow-auto rounded-lg border">
            <Table>
              <TableHeader className="bg-background sticky top-0">
                <TableRow>
                  <TableHead className="w-14">Line</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Folder</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Check</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, PREVIEW_ROWS).map((row) => {
                  const errors = errorsByLine.get(row.line);
                  return (
                    <TableRow
                      className={cn(errors && "bg-destructive/5")}
                      key={row.line}
                    >
                      <TableCell className="text-muted-foreground tabular-nums">
                        {row.line}
                      </TableCell>
                      <TableCell className="max-w-[240px] truncate">
                        {row.destination || "—"}
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate">
                        {row.title || "—"}
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate">
                        {row.folder || "—"}
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate">
                        {row.tags || "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.slug || "auto"}
                      </TableCell>
                      <TableCell className="min-w-[180px] text-xs">
                        {errors ? (
                          <span className="text-destructive">
                            {errors.join(". ")}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">OK</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {rows.length > PREVIEW_ROWS && (
            <p className="text-muted-foreground text-xs">
              Showing the first {PREVIEW_ROWS} of {rows.length} rows. Every row
              is checked.
            </p>
          )}

          {preview?.blocked && (
            <Alert>
              <Gem />
              <AlertTitle>Upgrade to import these codes</AlertTitle>
              <AlertDescription>
                <p>{preview.blocked}</p>
                <Button className="mt-2" onClick={openGetProDialog} size="sm">
                  See plans
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {phase.type === "importing" ? (
            <div className="space-y-2">
              <Progress
                aria-label="Import progress"
                value={(phase.done / Math.max(1, phase.total)) * 100}
              />
              <p className="text-muted-foreground text-sm">
                Imported {phase.done} of {phase.total}...
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                disabled={
                  checking ||
                  !preview ||
                  Boolean(preview.blocked) ||
                  validRows.length === 0
                }
                onClick={runImport}
              >
                Import {plural(validRows.length, "code")}
              </Button>
              {errorsByLine.size > 0 && validRows.length > 0 && (
                <span className="text-muted-foreground text-sm">
                  Rows with problems are skipped.
                </span>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
