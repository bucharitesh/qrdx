"use client";

import { CANONICAL_HOST } from "@repo/config";
import { Info, Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { DocumentUpload } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { type FrameSpec, QRCodeSVG } from "qrdx";
import { useEffect, useId, useRef, useState } from "react";
import {
  type ImportedFrame,
  importCommunityFrameSvg,
} from "@/actions/community";

const MAX_BYTES = 200_000;

/**
 * Import an SVG as a frame: the file is converted on the server
 * (qrdx importFrameSvg), which keeps only plain shapes and says what it
 * dropped. The SVG itself is never stored.
 */
export function ImportFrameDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (spec: FrameSpec) => void;
}) {
  const t = useTranslations("community.importFrameDialog");
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ImportedFrame | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) {
      setFileName(null);
      setResult(null);
      setError(null);
      setPending(false);
    }
  }, [open]);

  const read = async (file: File) => {
    setFileName(file.name);
    setResult(null);
    setError(null);
    if (file.size > MAX_BYTES) {
      setError("SVG files can be up to 200 KB.");
      return;
    }
    setPending(true);
    try {
      const response = await importCommunityFrameSvg(await file.text());
      if (response.ok) setResult(response.data);
      else setError(response.message);
    } catch {
      setError("The file couldn't be read. Try another SVG.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("importAnSvgFrame")}</DialogTitle>
          <DialogDescription>{t("shapesAndColorsBecomeA")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label
            className="hover:bg-accent/40 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-4 text-sm transition-colors"
            htmlFor={inputId}
          >
            <DocumentUpload aria-hidden className="size-5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              {fileName ?? t("chooseAnSvgFileUp")}
            </span>
            {pending && <Spinner className="size-4" />}
          </label>
          <input
            accept=".svg,image/svg+xml"
            className="sr-only"
            id={inputId}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void read(file);
              event.target.value = "";
            }}
            ref={input}
            type="file"
          />

          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}

          {result && (
            <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
              <div className="grid aspect-square place-items-center rounded-lg bg-white p-3 ring-1 ring-black/5">
                <QRCodeSVG
                  bgColor="#ffffff"
                  bodyPattern="square"
                  cornerEyeDotPattern="square"
                  cornerEyePattern="square"
                  fgColor="#000000"
                  frame={{ style: "custom", spec: result.spec }}
                  size={96}
                  style={{ maxHeight: "100%", maxWidth: "100%" }}
                  value={CANONICAL_HOST}
                />
              </div>
              <div className="min-w-0 space-y-3 text-xs">
                {result.palette.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="font-medium">{t("colors")}</p>
                    <ul className="space-y-1">
                      {result.palette.map((color) => (
                        <li
                          className="flex items-center gap-2"
                          key={`${color.color}-${color.ref}`}
                        >
                          <span
                            className="size-3.5 shrink-0 rounded-full border"
                            style={{ backgroundColor: color.color }}
                          />
                          <span className="font-mono">{color.color}</span>
                          <span className="text-muted-foreground">
                            {t(`refs.${color.ref}`)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.warnings.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="font-medium">{t("whatChanged")}</p>
                    <ul className="text-muted-foreground space-y-1">
                      {result.warnings.map((warning) => (
                        <li className="flex gap-1.5" key={warning.code}>
                          <Info
                            aria-hidden
                            className="mt-0.5 size-3 shrink-0"
                          />
                          <span>{warning.message}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            {t("cancel")}
          </Button>
          <Button
            disabled={!result}
            onClick={() => {
              if (!result) return;
              onImported(result.spec);
              onOpenChange(false);
            }}
          >
            {t("useThisFrame")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
