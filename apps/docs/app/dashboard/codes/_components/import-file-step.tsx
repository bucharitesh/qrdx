"use client";

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
  InfoCircle,
  TableDocument,
  Warning2,
} from "iconsax-reactjs";
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
import { Note, plural, StepLayout } from "./import-shared";

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
            setError("The file needs a header row and at least one row of codes.");
            setFile(null);
            return;
          }
          const headers = header.map(
            (name, index) => name.replace(/^﻿/, "").trim() || `Column ${index + 1}`,
          );
          const detection = detectFileProvider(headers, body);
          const use =
            provider === "csv" && detection.provider !== "csv"
              ? detection.provider
              : provider;
          if (use !== provider) onProvider(use);
          setDetected(detection.confidence === "low" ? null : detection.provider);
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
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
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
      current ? { ...current, [field]: value === NONE ? -1 : Number(value) } : current,
    );

  return (
    <StepLayout
      footer={
        <>
          <Button onClick={onBack} size="sm" variant="ghost">
            <ArrowLeft />
            All providers
          </Button>
          <Button
            disabled={!file || missingDestination || links.length === 0}
            onClick={() => onContinue(links)}
          >
            Preview {links.length > 0 ? plural(links.length, "row") : "import"}
            <ArrowRight />
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              Get the file from {info.name === FILE_PROVIDERS.csv.name ? "your provider" : info.name}
            </h3>
            <Select
              onValueChange={(value) => {
                onProvider(value as FileProviderId);
                if (file) setMapping(guessFileMapping(file.headers, value as FileProviderId));
              }}
              value={provider}
            >
              <SelectTrigger aria-label="Provider" className="h-8 w-56 text-xs">
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
          <input {...getInputProps()} aria-label="Export file" data-testid="migrate-file" />
          <span className="grid size-9 place-items-center rounded-lg border bg-background">
            {file ? (
              <TableDocument aria-hidden className="size-4 text-foreground/80" />
            ) : (
              <DocumentUpload aria-hidden className="size-4 text-foreground/80" />
            )}
          </span>
          {file ? (
            <p className="text-sm">
              <span className="font-medium">{file.name}</span>
              <span className="text-muted-foreground">
                {" "}
                · {plural(file.rows.length, "row")}
                {file.truncated ? ` (first ${MAX_JOB_LINKS})` : ""}
              </span>
            </p>
          ) : (
            <p className="text-sm">
              Drop the CSV here{" "}
              <span className="text-muted-foreground">(up to 2 MB)</span>
            </p>
          )}
          <Button onClick={open} size="sm" type="button" variant="outline">
            {file ? "Choose another file" : "Choose file"}
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
              <h3 className="text-sm font-semibold">Match the columns</h3>
              {detected && detected !== "csv" && (
                <span className="text-muted-foreground text-xs">
                  Looks like a {FILE_PROVIDERS[detected].name} export
                </span>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {FILE_FIELDS.map((field) => (
                <div className="space-y-1.5" key={field}>
                  <Label className="text-xs" htmlFor={`map-${field}`}>
                    {FILE_FIELD_LABELS[field]}
                    {field === "destination" && (
                      <span className="text-muted-foreground"> (required)</span>
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
                      <SelectItem value={NONE}>Not in the file</SelectItem>
                      {file.headers.map((header, index) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: headers can repeat
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
                <p>Pick the column with each code's destination URL.</p>
              </Note>
            ) : (
              <Note icon={<InfoCircle />}>
                <p>
                  The old short link (or code ID) is what makes a re-upload of
                  the same file skip codes it already imported, and it goes
                  into the mapping of old to new links.
                </p>
              </Note>
            )}
          </div>
        )}
      </div>
    </StepLayout>
  );
}
