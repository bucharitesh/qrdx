"use client";

import {
  Spinner as Loader2,
  Close as X,
} from "@repo/design-system/components/icons";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/ui/alert";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Label } from "@repo/design-system/components/ui/label";
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
  Import as Download,
  TableDocument as FileSpreadsheet,
  Diamonds as Gem,
  Export as Upload,
} from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import Papa from "papaparse";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { previewQrCodeImport } from "@/actions/bulk-codes";
import { useKnownCodeOptionPlans } from "@/app/(app)/dashboard/codes/_components/code-options";
import {
  DomainPicker,
  useDomainOptions,
} from "@/app/(app)/dashboard/codes/_components/domain-picker";
import { formatPlanList } from "@/app/(app)/dashboard/codes/_lib/code-options";
import { MAX_TAGS_PER_CODE } from "@/app/(app)/dashboard/codes/_lib/organize-shared";
import type { ImportPreview } from "@/app/(app)/dashboard/codes/import/_lib/import";
import { useShowLimit } from "@/components/limits/limit-dialog";
import { track } from "@/lib/analytics";
import { formatCount } from "@/lib/bulk-limits";
import { PLAN_NAMES, type Plan } from "@/lib/pricing";
import { soundEvent } from "@/lib/sound/emit";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";
import {
  type ColumnMapping,
  checkImportRow,
  duplicateSlugLines,
  guessMapping,
  IMPORT_CHUNK_SIZE,
  IMPORT_FIELD_LABELS,
  IMPORT_FIELDS,
  type ImportField,
  type ImportRowInput,
  importBlocked,
  MAX_CHUNK_BYTES,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  PREVIEW_CHUNK_SIZE,
  rowsFromTable,
  SAMPLE_IMPORT_ROWS,
} from "../_lib/csv";
import { createImportJob } from "../_lib/job";
import { BatchOrganize, type BatchTargets } from "./batch-organize";
import { ImportProgress } from "./import-progress";
import { ImportResults } from "./import-results";
import { useImportRunner } from "./use-import-runner";

const NOT_MAPPED = "none";
const PREVIEW_ROWS = 200;

interface ParsedFile {
  name: string;
  columns: string[];
  rows: string[][];
  truncated: boolean;
}

const NO_TARGETS: BatchTargets = { folder: null, tags: [] };

/** Server checks of every row, a request per PREVIEW_CHUNK_SIZE rows, merged. */
async function previewInChunks(
  rows: ImportRowInput[],
  domainId: string | null,
  isCancelled: () => boolean,
): Promise<{ preview: ImportPreview } | { error: string } | null> {
  let merged: ImportPreview | null = null;
  const folders = new Map<string, string>();
  const tags = new Map<string, string>();
  for (let start = 0; start < rows.length; start += PREVIEW_CHUNK_SIZE) {
    const result = await previewQrCodeImport({
      rows: rows.slice(start, start + PREVIEW_CHUNK_SIZE),
      domainId,
    });
    if (isCancelled()) return null;
    if (!result.success) return { error: result.error.message };
    const part = result.data;
    for (const name of part.newFolders) folders.set(name.toLowerCase(), name);
    for (const name of part.newTags) tags.set(name.toLowerCase(), name);
    merged = merged
      ? {
          ...part,
          errors: [...merged.errors, ...part.errors],
          valid: merged.valid + part.valid,
          invalid: merged.invalid + part.invalid,
        }
      : part;
  }
  if (!merged) return null;
  return {
    preview: {
      ...merged,
      newFolders: [...folders.values()],
      newTags: [...tags.values()],
    },
  };
}

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
  soundEvent("download");
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ImportWizard({
  canBulk,
  plan,
  bulkPlans,
  basePath,
  storeKey,
}: {
  /** The workspace's plan may import more than one row */
  canBulk: boolean;
  /** The workspace's plan */
  plan: Plan;
  /** Plans that import more than one row, cheapest first (lib/plans.ts) */
  bulkPlans: Plan[];
  /** Codes list to link to afterwards */
  basePath: string;
  /** Where this person's import in this workspace is kept (for resume) */
  storeKey: string;
}) {
  const t = useTranslations("app.dashboard.codes.import.importWizard");
  const openGetProDialog = useGetProDialogStore(
    (state) => state.openGetProDialog,
  );
  const showLimit = useShowLimit();
  // Plans with custom back-halves, for the column help (lib/plans.ts).
  const slugPlans = useKnownCodeOptionPlans()?.upgrades.customSlugs ?? [];
  const domainOptions = useDomainOptions(true);
  const [file, setFile] = useState<ParsedFile | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [domainId, setDomainId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [targets, setTargets] = useState<BatchTargets>(NO_TARGETS);
  const runner = useImportRunner(storeKey, {
    // The active-code cap: its limit card (and upgrade, when it can be
    // bought). A plan feature: the upgrade dialog.
    onStop: (error) => {
      if (error.meter) showLimit(error.meter);
      else if (error.code === "PLAN_REQUIRED") openGetProDialog();
    },
  });

  const onDrop = useCallback(
    (accepted: File[]) => {
      const picked = accepted[0];
      if (!picked) return;
      setParseError(null);
      setPreview(null);
      Papa.parse<string[]>(picked, {
        skipEmptyLines: "greedy",
        preview: MAX_IMPORT_ROWS + 2,
        complete: (results) => {
          const [header, ...body] = results.data;
          if (!header || body.length === 0) {
            setParseError(t("needsHeaderAndRows"));
            setFile(null);
            return;
          }
          const columns = header.map(
            (name, index) =>
              name.replace(/^﻿/, "").trim() ||
              t("columnNumber", { number: String(index + 1) }),
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
    },
    [t],
  );

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
      ? t("fileTooLarge", { size: String(MAX_IMPORT_FILE_BYTES / 1024 / 1024) })
      : rejection?.message;

  const rows = useMemo<ImportRowInput[]>(
    () => (file && mapping ? rowsFromTable(file.rows, mapping) : []),
    [file, mapping],
  );
  const destinationMapped = mapping !== null && mapping.destination >= 0;

  // Quick checks in the browser (every row, repeats of a back-half across the
  // whole file, room for the batch's tags); the server preview adds slug
  // availability and destination rules.
  const localErrors = useMemo(() => {
    const errors = new Map<number, string[]>();
    const normalized = rows.map((row) => {
      const { errors: problems, normalized } = checkImportRow(row, {
        onCustomDomain: Boolean(domainId),
      });
      if (
        normalized.tagNames.length + targets.tags.length >
        MAX_TAGS_PER_CODE
      ) {
        problems.push(t("tooManyTags", { max: String(MAX_TAGS_PER_CODE) }));
      }
      if (problems.length > 0) errors.set(row.line, problems);
      return normalized;
    });
    for (const line of duplicateSlugLines(normalized)) {
      errors.set(line, [...(errors.get(line) ?? []), t("duplicateBackHalf")]);
    }
    return errors;
  }, [rows, domainId, targets.tags.length, t]);

  useEffect(() => {
    if (!destinationMapped || rows.length === 0) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setChecking(true);
    setPreviewError(null);
    const timer = setTimeout(async () => {
      // Rows the browser already rejected aren't sent.
      const candidates = rows.filter((row) => !localErrors.has(row.line));
      const result =
        candidates.length > 0
          ? await previewInChunks(candidates, domainId, () => cancelled)
          : null;
      if (cancelled) return;
      setChecking(false);
      if (result && "error" in result) {
        setPreview(null);
        setPreviewError(result.error);
      } else {
        setPreview(result?.preview ?? null);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [rows, destinationMapped, domainId, localErrors]);

  const errorsByLine = useMemo(() => {
    if (!preview) return localErrors;
    const merged = new Map(localErrors);
    for (const item of preview.errors) {
      merged.set(item.line, [
        ...new Set([...(merged.get(item.line) ?? []), ...item.messages]),
      ]);
    }
    return merged;
  }, [preview, localErrors]);
  const validRows = rows.filter((row) => !errorsByLine.has(row.line));
  const blocked = preview
    ? importBlocked({
        valid: validRows.length,
        canBulk: preview.canBulk,
        remaining: preview.remaining,
        bulkPlanName: bulkPlans[0] ? PLAN_NAMES[bulkPlans[0]] : null,
      })
    : null;

  const reset = () => {
    setFile(null);
    setMapping(null);
    setPreview(null);
    setParseError(null);
    setTargets(NO_TARGETS);
  };

  const runImport = () => {
    if (!file || validRows.length === 0) return;
    track("import_started", { provider: "csv", count: validRows.length });
    void runner.start(
      createImportJob({
        id: crypto.randomUUID(),
        fileName: file.name,
        rows: validRows,
        skipped: rows.flatMap((row) => {
          const errors = errorsByLine.get(row.line);
          return errors
            ? [
                {
                  line: row.line,
                  destination: row.destination,
                  message: errors.join(". "),
                },
              ]
            : [];
        }),
        domainId,
        folder: targets.folder,
        tags: targets.tags,
        maxRows: IMPORT_CHUNK_SIZE,
        maxBytes: MAX_CHUNK_BYTES,
      }),
    );
    reset();
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

  if (!runner.loaded) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" />
        {t("loading")}
      </p>
    );
  }
  if (runner.job?.status === "done") {
    return (
      <ImportResults
        basePath={basePath}
        job={runner.job}
        onReset={runner.discard}
      />
    );
  }
  if (runner.job) {
    return (
      <ImportProgress
        interrupted={runner.interrupted}
        job={runner.job}
        onFinish={runner.finish}
        onPause={runner.pause}
        onResume={runner.resume}
        onRetryFailed={runner.retryFailed}
        onUpgrade={openGetProDialog}
        waiting={runner.waiting}
      />
    );
  }

  return (
    <div className="space-y-6">
      {!canBulk && (
        <Alert>
          <Gem />
          <AlertTitle>
            {bulkPlans[0]
              ? t("bulkImportIsAValue", { value: PLAN_NAMES[bulkPlans[0]] })
              : t("bulkImportIsntOnYour")}
          </AlertTitle>
          <AlertDescription>
            <p>
              {t("oneCodeAtATime", { plan: PLAN_NAMES[plan] })}
              {bulkPlans.length > 0 &&
                ` ${t("bulkplansImportUpToMax", {
                  bulkPlans: formatPlanList(bulkPlans),
                  MAX_IMPORT_ROWS: formatCount(MAX_IMPORT_ROWS),
                })}`}
            </p>
            <Button className="mt-2" onClick={openGetProDialog} size="sm">
              {t("upgrade")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{t("n1ChooseACsvFile")}</h2>
          <Button onClick={downloadSample} size="sm" variant="ghost">
            <Download />
            {t("sampleCsv")}
          </Button>
        </div>
        {file ? (
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <FileSpreadsheet className="text-muted-foreground size-5" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-muted-foreground text-xs">
                {t("rowsAndColumns", {
                  rows: rows.length,
                  columns: file.columns.length,
                })}
              </p>
            </div>
            <Button
              aria-label={t("removeFile")}
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
            <p className="text-sm font-medium">{t("dropACsvFileHere")}</p>
            <p className="text-muted-foreground max-w-md text-xs">
              {slugPlans.length > 0
                ? t("csvColumnsSlugOnPlans", {
                    slugPlans: formatPlanList(slugPlans),
                    rows: formatCount(MAX_IMPORT_ROWS),
                    size: String(MAX_IMPORT_FILE_BYTES / 1024 / 1024),
                  })
                : t("csvColumns", {
                    rows: formatCount(MAX_IMPORT_ROWS),
                    size: String(MAX_IMPORT_FILE_BYTES / 1024 / 1024),
                  })}
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
            {t("thisFileHasMoreThan", {
              MAX_IMPORT_ROWS: formatCount(MAX_IMPORT_ROWS),
              MAX_IMPORT_ROWS2: formatCount(MAX_IMPORT_ROWS),
            })}
          </p>
        )}
      </section>

      {file && mapping && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">{t("n2MatchTheColumns")}</h2>
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
                    <SelectItem value={NOT_MAPPED}>
                      {t("notInThisFile")}
                    </SelectItem>
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
              onChange={setDomainId}
              options={domainOptions}
              value={domainId}
            />
          </div>
          {!destinationMapped && (
            <p className="text-destructive text-sm">
              {t("chooseTheColumnWithThe")}
            </p>
          )}
        </section>
      )}

      {file && destinationMapped && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">{t("n3Organize")}</h2>
          <BatchOrganize onChange={setTargets} value={targets} />
        </section>
      )}

      {file && destinationMapped && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              {t("n4Review")}
              {checking && (
                <Loader2 className="text-muted-foreground size-4 animate-spin" />
              )}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">
                {t("validRows", { count: validRows.length })}
              </Badge>
              {errorsByLine.size > 0 && (
                <>
                  <Badge variant="destructive">
                    {t("valueWithProblems", { count: errorsByLine.size })}
                  </Badge>
                  <Button onClick={downloadErrors} size="sm" variant="ghost">
                    <Download />
                    {t("problemsCsv")}
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
                  t("newFoldersValue", {
                    value: preview.newFolders.join(", "),
                  })}
                {preview.newFolders.length > 0 &&
                  preview.newTags.length > 0 &&
                  " "}
                {preview.newTags.length > 0 &&
                  t("newTagsValue", { value: preview.newTags.join(", ") })}
              </p>
            )}

          <div className="max-h-[28rem] overflow-auto rounded-lg border">
            <Table>
              <TableHeader className="bg-background sticky top-0">
                <TableRow>
                  <TableHead className="w-14">{t("line")}</TableHead>
                  <TableHead>{t("destination")}</TableHead>
                  <TableHead>{t("title")}</TableHead>
                  <TableHead>{t("folder")}</TableHead>
                  <TableHead>{t("tags")}</TableHead>
                  <TableHead>{t("slug")}</TableHead>
                  <TableHead>{t("check")}</TableHead>
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
                        {row.slug || t("auto")}
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
              {t("showingTheFirstPreviewRows", {
                PREVIEW_ROWS,
                length: formatCount(rows.length),
              })}
            </p>
          )}

          {blocked && (
            <Alert>
              <Gem />
              <AlertTitle>{t("upgradeToImportTheseCodes")}</AlertTitle>
              <AlertDescription>
                <p>{blocked}</p>
                <Button className="mt-2" onClick={openGetProDialog} size="sm">
                  {t("seePlans")}
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={
                checking ||
                !preview ||
                Boolean(blocked) ||
                validRows.length === 0
              }
              onClick={runImport}
            >
              {t("importValue", { count: validRows.length })}
            </Button>
            <span className="text-muted-foreground text-sm">
              {errorsByLine.size > 0 && validRows.length > 0
                ? `${t("rowsWithProblemsAreSkipped")} `
                : ""}
              {validRows.length > IMPORT_CHUNK_SIZE &&
                t("sentImportChunkSizeAt", {
                  IMPORT_CHUNK_SIZE: formatCount(IMPORT_CHUNK_SIZE),
                })}
            </span>
          </div>
        </section>
      )}
    </div>
  );
}
