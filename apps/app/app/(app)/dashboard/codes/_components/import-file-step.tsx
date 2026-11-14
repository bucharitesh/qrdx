"use client";

import { Info } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { cn } from "@repo/design-system/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  DocumentUpload,
  TableDocument,
  Warning2,
} from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import Papa from "papaparse";
import { useCallback, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  detectFileProvider,
  FILE_FIELD_LABELS,
  FILE_FIELDS,
  type FileField,
  type FileMapping,
  guessFileMapping,
  linksFromRows,
  MAX_FILE_BYTES,
} from "@/lib/migrate/files";
import {
  FILE_PROVIDER_IDS,
  FILE_PROVIDERS,
  type FileProviderId,
} from "@/lib/migrate/providers";
import { MAX_JOB_LINKS, type SourceLink } from "@/lib/migrate/types";
import { Note, StepLayout } from "./import-shared";

const NONE = "none";

interface ParsedFile {
  name: string;
  headers: string[];
  rows: string[][];
  truncated: boolean;
}

export function FileStep({
  provider,
  onProvider,
  onBack,
  onContinue,
}: {
  provider: FileProviderId;
  onProvider: (provider: FileProviderId) => void;
  onBack: () => void;
  onContinue: (links: SourceLink[]) => void;
}) {
  const t = useTranslations("app.dashboard.codes.importFileStep");
  const info = FILE_PROVIDERS[provider];
  const [file, setFile] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<FileMapping | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detected, setDetected] = useState<FileProviderId | null>(null);

  const onDrop = useCallback(
    (accepted: File[]) => {
      const picked = accepted[0];
      if (!picked) return;
      setError(null);
      if (/\.xlsx?$/i.test(picked.name)) {
        setError(
          "Excel files can't be read here yet. In Excel or Google Sheets, save or download the sheet as CSV, then upload that.",
        );
        return;
      }
      if (picked.size > MAX_FILE_BYTES) {
        setError("That file is over 2 MB. Split it, or remove unused columns.");
        return;
      }
      Papa.parse<string[]>(picked, {
        skipEmptyLines: "greedy",
        preview: MAX_JOB_LINKS + 1,
        complete: (results) => {
          const [header, ...body] = results.data;
          if (!header || body.length === 0) {
            setError(
              "The file needs a header row and at least one row of codes.",
            );
            setFile(null);
            return;
          }
          const headers = header.map(
            (name, index) =>
              name.replace(/^﻿/, "").trim() || `Column ${index + 1}`,
          );
          const detection = detectFileProvider(headers, body);
          const use =
            provider === "csv" && detection.provider !== "csv"
              ? detection.provider
              : provider;
          if (use !== provider) onProvider(use);
          setDetected(
            detection.confidence === "low" ? null : detection.provider,
          );
          setFile({
            name: picked.name,
            headers,
            rows: body,
            truncated: body.length >= MAX_JOB_LINKS,
          });
          setMapping(guessFileMapping(headers, use));
        },
        error: () => setError("Couldn't read that file. Is it a CSV?"),
      });
    },
    [provider, onProvider],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    multiple: false,
    noClick: true,
    accept: {
      "text/csv": [".csv"],
      "text/plain": [".txt"],
      "application/vnd.ms-excel": [".csv", ".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
    },
  });

  const links = useMemo(
    () => (file && mapping ? linksFromRows(file.rows, mapping) : []),
    [file, mapping],
  );
  const missingDestination = mapping ? mapping.destination < 0 : true;
  const sample = file?.rows.slice(0, 3) ?? [];

  const setField = (field: FileField, value: string) =>
    setMapping((current) =>
      current
        ? { ...current, [field]: value === NONE ? -1 : Number(value) }
        : current,
    );

  return (
    <StepLayout
      footer={
        <>
          <Button onClick={onBack} size="sm" variant="ghost">
            <ArrowLeft />
            {t("allProviders")}
          </Button>
          <Button
            disabled={!file || missingDestination || links.length === 0}
            onClick={() => onContinue(links)}
          >
            {links.length > 0
              ? t("previewRows", { count: links.length })
              : t("previewImport")}
            <ArrowRight />
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              {info.name === FILE_PROVIDERS.csv.name
                ? t("getTheFileFromYourProvider")
                : t("getTheFileFrom", { provider: info.name })}
            </h3>
            <Select
              onValueChange={(value) => {
                onProvider(value as FileProviderId);
                if (file)
                  setMapping(
                    guessFileMapping(file.headers, value as FileProviderId),
                  );
              }}
              value={provider}
            >
              <SelectTrigger
                aria-label={t("provider")}
                className="h-8 w-56 text-xs"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILE_PROVIDER_IDS.map((id) => (
                  <SelectItem key={id} value={id}>
                    {FILE_PROVIDERS[id].name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ol className="text-muted-foreground list-decimal space-y-1 pl-5 text-sm">
            {info.exportSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>

        <div
          {...getRootProps()}
          className={cn(
            "flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-8 text-center transition-colors",
            isDragActive ? "border-foreground/40 bg-accent/40" : "bg-muted/20",
          )}
        >
          <input
            {...getInputProps()}
            aria-label={t("exportFile")}
            data-testid="migrate-file"
          />
          <span className="grid size-9 place-items-center rounded-lg border bg-background">
            {file ? (
              <TableDocument
                aria-hidden
                className="size-4 text-foreground/80"
              />
            ) : (
              <DocumentUpload
                aria-hidden
                className="size-4 text-foreground/80"
              />
            )}
          </span>
          {file ? (
            <p className="text-sm">
              <span className="font-medium">{file.name}</span>
              <span className="text-muted-foreground">
                {" "}
                ·{" "}
                {file.truncated
                  ? t("rowsFirst", { count: file.rows.length, MAX_JOB_LINKS })
                  : t("rows", { count: file.rows.length })}
              </span>
            </p>
          ) : (
            <p className="text-sm">
              {t.rich("dropTheCsvHereUp", {
                span: (chunks) => (
                  <span className="text-muted-foreground">{chunks}</span>
                ),
              })}
            </p>
          )}
          <Button onClick={open} size="sm" type="button" variant="outline">
            {file ? t("chooseAnotherFile") : t("chooseFile")}
          </Button>
        </div>

        {error && (
          <Note icon={<Warning2 />} tone="warning">
            <p>{error}</p>
          </Note>
        )}

        {file && mapping && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">{t("matchTheColumns")}</h3>
              {detected && detected !== "csv" && (
                <span className="text-muted-foreground text-xs">
                  {t("looksLikeANameExport", {
                    name: FILE_PROVIDERS[detected].name,
                  })}
                </span>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {FILE_FIELDS.map((field) => (
                <div className="space-y-1.5" key={field}>
                  <Label className="text-xs" htmlFor={`map-${field}`}>
                    {FILE_FIELD_LABELS[field]}
                    {field === "destination" && (
                      <span className="text-muted-foreground">
                        {" "}
                        {t("required")}
                      </span>
                    )}
                  </Label>
                  <Select
                    onValueChange={(value) => setField(field, value)}
                    value={mapping[field] >= 0 ? String(mapping[field]) : NONE}
                  >
                    <SelectTrigger className="w-full" id={`map-${field}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t("notInTheFile")}</SelectItem>
                      {file.headers.map((header, index) => (
                        <SelectItem key={index} value={String(index)}>
                          {header}
                          {sample[0]?.[index] ? (
                            <span className="text-muted-foreground ml-1.5 max-w-40 truncate">
                              {sample[0][index]}
                            </span>
                          ) : null}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            {missingDestination ? (
              <Note icon={<Warning2 />} tone="warning">
                <p>{t("pickTheColumnWithEach")}</p>
              </Note>
            ) : (
              <Note icon={<Info />}>
                <p>{t("theOldShortLinkOr")}</p>
              </Note>
            )}
          </div>
        )}
      </div>
    </StepLayout>
  );
}
