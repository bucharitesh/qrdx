"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/ui/alert";
import { Button } from "@repo/design-system/components/ui/button";
import { Progress } from "@repo/design-system/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { strToU8 } from "fflate";
import {
  InfoCircle as CircleAlert,
  TickCircle as CircleCheck,
  Import as Download,
  Gallery as Images,
} from "iconsax-reactjs";
import Link from "next/link";
import Papa from "papaparse";
import { useEffect, useRef, useState } from "react";
import { plural } from "@/app/dashboard/codes/_components/use-organize-action";
import {
  createLogoCache,
  renderCodeImage,
} from "@/app/dashboard/codes/_components/zip-download";
import {
  createFilenameAllocator,
  sanitizeFilename,
} from "@/components/sections/tools/bulk-utils";
import { formatCount } from "@/lib/bulk-limits";
import { soundEvent } from "@/lib/sound/emit";
import { createZipParts, saveBlob } from "@/lib/zip-stream";
import {
  createdCodes,
  type ImportJob,
  jobProgress,
  resultRows,
} from "../_lib/job";

type ImageFormat = "png" | "svg";
/** Images rendered at a time (each is a canvas draw). */
const RENDER_BATCH = 8;

const baseName = (fileName: string) =>
  sanitizeFilename(fileName.replace(/\.[^.]+$/, "")) || "qrdx-import";

function saveCsv(rows: Record<string, unknown>[], filename: string) {
  saveBlob(
    new Blob([`﻿${Papa.unparse(rows)}`], {
      type: "text/csv;charset=utf-8",
    }),
    filename,
  );
  soundEvent("download");
}

/** A finished import: what it made, the results CSV and the images. */
export function ImportResults({
  job,
  basePath,
  onReset,
}: {
  job: ImportJob;
  basePath: string;
  onReset: () => void;
}) {
  const progress = jobProgress(job);
  const failed = Object.values(job.results).filter((row) => !row.ok);
  const notes = Object.values(job.results).filter(
    (row) => row.ok && row.message,
  );
  const notSent = progress.total - progress.sent;
  const [format, setFormat] = useState<ImageFormat>("png");
  const [zipping, setZipping] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [zipNote, setZipNote] = useState<string | null>(null);
  const cancel = useRef({ cancelled: false });

  useEffect(
    () => () => {
      cancel.current.cancelled = true;
    },
    [],
  );

  const downloadImages = async () => {
    const codes = createdCodes(job);
    if (codes.length === 0) return;
    const run = { cancelled: false };
    cancel.current = run;
    setZipNote(null);
    setZipping({ done: 0, total: codes.length });
    const zip = createZipParts(`${baseName(job.fileName)}-${format}`);
    const logoFor = createLogoCache();
    const allocate = createFilenameAllocator();
    const index: Record<string, string>[] = [];
    let failedImages = 0;
    for (let start = 0; start < codes.length; start += RENDER_BATCH) {
      if (run.cancelled) {
        zip.abort();
        setZipping(null);
        return;
      }
      const batch = codes.slice(start, start + RENDER_BATCH);
      const images = await Promise.all(
        batch.map((code) =>
          renderCodeImage(
            { shortLink: code.shortLink, style: job.style },
            format,
            logoFor,
          ),
        ),
      );
      for (const [offset, bytes] of images.entries()) {
        const code = batch[offset];
        if (!code) continue;
        if (!bytes) {
          failedImages++;
          continue;
        }
        const name = allocate(
          sanitizeFilename(code.title ?? "") || `qrdx-${code.slug}`,
          format,
        );
        await zip.add(name, bytes, format === "svg");
        index.push({
          file: name,
          title: code.title ?? "",
          short_link: code.shortLink,
        });
      }
      setZipping({
        done: Math.min(start + RENDER_BATCH, codes.length),
        total: codes.length,
      });
      // Let the browser paint progress between batches.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    try {
      await zip.add("codes.csv", strToU8(Papa.unparse(index)), true);
      const { blob, filename, parts } = await zip.finish();
      saveBlob(blob, filename);
      soundEvent("download");
      setZipNote(
        [
          parts > 1 &&
            `Saved as ${parts} ZIP files (large batches come in parts of about 500 MB; codes.csv is in the last).`,
          failedImages > 0 &&
            `${plural(failedImages, "image")} couldn't be drawn and ${failedImages === 1 ? "is" : "are"} missing.`,
        ]
          .filter(Boolean)
          .join(" ") || null,
      );
    } catch (error) {
      setZipNote(
        error instanceof Error ? error.message : "The ZIP couldn't be made.",
      );
      soundEvent("error");
    }
    setZipping(null);
  };

  return (
    <div className="space-y-4">
      <Alert variant={progress.created > 0 ? "default" : "destructive"}>
        {progress.created > 0 ? <CircleCheck /> : <CircleAlert />}
        <AlertTitle>
          {progress.created > 0
            ? `Created ${plural(progress.created, "code")}`
            : "No codes were created"}
        </AlertTitle>
        <AlertDescription>
          {[
            failed.length > 0 &&
              `${plural(failed.length, "row")} couldn't be imported.`,
            notSent > 0 &&
              `${plural(notSent, "row")} ${notSent === 1 ? "wasn't" : "weren't"} sent (the import ended early).`,
            job.skipped.length > 0 &&
              `${plural(job.skipped.length, "row")} with problems in the file ${job.skipped.length === 1 ? "was" : "were"} skipped.`,
          ]
            .filter(Boolean)
            .join(" ") || "Every row was imported."}
        </AlertDescription>
      </Alert>

      {(failed.length > 0 || notes.length > 0) && (
        <ul className="max-h-60 space-y-1 overflow-auto rounded-lg border p-3 text-sm">
          {[...failed, ...notes].slice(0, 50).map((result) => (
            <li key={result.line}>
              <span className="text-muted-foreground">Line {result.line}:</span>{" "}
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
            saveCsv(resultRows(job), `${baseName(job.fileName)}-results.csv`)
          }
          variant="outline"
        >
          <Download />
          Results CSV
        </Button>
        <Button onClick={onReset} variant="ghost">
          Import another file
        </Button>
      </div>

      {progress.created > 0 && (
        <section className="space-y-3 rounded-lg border p-4">
          <div>
            <h2 className="text-sm font-semibold">Images of the new codes</h2>
            <p className="text-muted-foreground text-xs">
              {formatCount(progress.created)} files, drawn in your browser with
              the workspace's default design, plus a codes.csv index. Large
              batches are saved in parts of about 500 MB.
            </p>
          </div>
          {zipping ? (
            <div className="space-y-2">
              <Progress
                aria-label="Images progress"
                value={(zipping.done / Math.max(1, zipping.total)) * 100}
              />
              <div className="text-muted-foreground flex items-center justify-between text-xs tabular-nums">
                <span>
                  {formatCount(zipping.done)} of {formatCount(zipping.total)}
                </span>
                <Button
                  onClick={() => {
                    cancel.current.cancelled = true;
                  }}
                  size="sm"
                  variant="ghost"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Select
                onValueChange={(value) => setFormat(value as ImageFormat)}
                value={format}
              >
                <SelectTrigger aria-label="Image format" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="png">PNG (1024 px)</SelectItem>
                  <SelectItem value="svg">SVG (vector)</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={downloadImages} variant="outline">
                <Images />
                Download images
              </Button>
            </div>
          )}
          {zipNote && (
            <p className="text-muted-foreground text-xs">{zipNote}</p>
          )}
        </section>
      )}
    </div>
  );
}
