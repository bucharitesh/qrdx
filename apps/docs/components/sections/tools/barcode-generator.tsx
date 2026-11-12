"use client";

import { toast } from "@repo/design-system";
import { Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { Slider } from "@repo/design-system/components/ui/slider";
import { Switch } from "@repo/design-system/components/ui/switch";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@repo/design-system/components/ui/toggle-group";
import { cn } from "@repo/design-system/lib/utils";
import {
  ArrowDown2,
  TickCircle as CircleCheck,
  CloseCircle as CircleX,
  Import as Download,
  Warning2,
} from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import {
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useContentText } from "@/components/i18n/content-text";
import { track } from "@/lib/analytics";
import {
  useTrackBarcodeGenerated,
  useTrackEditorOpened,
} from "@/lib/analytics/react";
import {
  barcodeColorWarnings,
  type ColorWarning,
  HEX_COLOR,
} from "@/lib/barcode/colors";
import {
  BARCODE_FILES,
  type BarcodeFileType,
  barcodeFileStem,
} from "@/lib/barcode/files";
import {
  BARCODE_FORMATS,
  type BarcodeFormatId,
  DEFAULT_BARCODE_FORMAT,
  getBarcodeFormat,
  isBarcodeFormatId,
  validateBarcodeInput,
} from "@/lib/barcode/formats";
import { canvasToBlob, saveFile, svgToCanvas } from "@/lib/barcode/raster";
import type { RenderedBarcode } from "@/lib/barcode/render";
import type { ScanCheckResult } from "@/lib/barcode/scan-check";
import {
  BARCODE_LIMITS,
  BARCODE_ROTATIONS,
  type BarcodeRotation,
  type BarcodeStyle,
  defaultBarcodeStyle,
  maxQuietZone,
} from "@/lib/barcode/style";
import { soundEvent } from "@/lib/sound/emit";

type RenderModule = typeof import("@/lib/barcode/render");

/** The buttons; the rest are in the More menu. */
const MAIN_FILES: BarcodeFileType[] = ["png", "svg", "pdf"];
const MORE_FILES: BarcodeFileType[] = ["jpg", "webp", "avif", "eps"];

/** A valid barcode as the form has it: what a Save button stores. */
export interface CurrentBarcode {
  format: BarcodeFormatId;
  /** The value drawn, check digit included */
  value: string;
  style: BarcodeStyle;
}

export interface BarcodeGeneratorProps {
  /** Start from a saved barcode instead of the EAN-13 example */
  initial?: {
    format: BarcodeFormatId;
    value: string;
    style?: Partial<BarcodeStyle>;
  };
  /** Fields above the barcode type (the dashboard's title) */
  formTop?: ReactNode;
  /** Under the downloads: Save to dashboard, or the editor's Save */
  renderActions?: (current: CurrentBarcode | null) => ReactNode;
  /** The line under the downloads; null for none */
  footnote?: ReactNode;
  /** Where downloads are counted from (analytics) */
  source?: "generator" | "dashboard";
}

const SCAN_CHECK_DELAY_MS = 400;
const LINEAR = BARCODE_FORMATS.filter((format) => format.kind === "linear");
const MATRIX = BARCODE_FORMATS.filter((format) => format.kind === "2d");
/** Linear formats that print text rather than a number under the bars */
const TEXT_FORMATS = new Set<BarcodeFormatId>(["code128", "code39", "gs1-128"]);

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("barcodeTool");
  const id = useId();
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const valid = HEX_COLOR.test(text);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <span
          className="relative size-9 shrink-0 overflow-hidden rounded-md border border-border shadow-xs"
          style={{ background: value }}
        >
          <input
            aria-label={t("pickColor", { label })}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
            type="color"
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        </span>
        <Input
          id={id}
          aria-invalid={!valid}
          autoComplete="off"
          className="font-mono uppercase"
          maxLength={7}
          spellCheck={false}
          value={text}
          onChange={(event) => {
            const next = event.target.value.trim();
            const withHash = next.startsWith("#") ? next : `#${next}`;
            setText(withHash);
            if (HEX_COLOR.test(withHash)) onChange(withHash.toLowerCase());
          }}
        />
      </div>
    </div>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  readout,
  onChange,
  children,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  readout: string;
  onChange: (value: number) => void;
  children?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label id={id}>{label}</Label>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {readout}
        </span>
      </div>
      <Slider
        aria-labelledby={id}
        max={max}
        min={min}
        step={step}
        value={[value]}
        onValueChange={([next]) => {
          if (next !== undefined) onChange(next);
        }}
      />
      {children}
    </div>
  );
}

function Notice({ warning }: { warning: ColorWarning }) {
  const tc = useContentText();
  return (
    <p
      className={cn(
        "flex gap-2 text-xs leading-snug",
        warning.level === "error" ? "text-destructive" : "text-foreground",
      )}
    >
      <Warning2
        aria-hidden
        className={cn(
          "mt-px size-4 shrink-0",
          warning.level === "error" ? "text-destructive" : "text-amber-500",
        )}
        variant="Bold"
      />
      <span>{tc(warning.message)}</span>
    </p>
  );
}

function ScanStatus({
  checking,
  result,
  label,
  value,
}: {
  checking: boolean;
  result: ScanCheckResult | "unavailable" | null;
  label: string;
  /** What was drawn; readers report some formats differently (UPC-E expanded) */
  value: string;
}) {
  const t = useTranslations("barcodeTool.scan");
  if (checking || !result) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Spinner className="size-4 animate-spin" />
        {t("checking")}
      </p>
    );
  }
  if (result === "unavailable") {
    return (
      <p className="flex gap-2 text-xs text-muted-foreground">
        <Warning2 aria-hidden className="mt-px size-4 shrink-0" />
        {t("unavailable")}
      </p>
    );
  }
  if (result.status === "pass") {
    return (
      <p className="flex gap-2 text-xs">
        <CircleCheck
          aria-hidden
          className="mt-px size-4 shrink-0 text-emerald-500"
          variant="Bold"
        />
        <span>
          {t.rich("passed", {
            label,
            value,
            mono: (chunks) => (
              <span className="break-all font-mono">{chunks}</span>
            ),
          })}
        </span>
      </p>
    );
  }
  return (
    <p className="flex gap-2 text-xs text-destructive">
      <CircleX aria-hidden className="mt-px size-4 shrink-0" variant="Bold" />
      <span>
        {result.status === "mismatch"
          ? t("mismatch", { decoded: result.decoded, label })
          : t("failed", { label })}
      </span>
    </p>
  );
}

/**
 * The /barcode-generator tool. Everything happens in the browser: bwip-js
 * (lib/barcode/render.ts) loads on this page only, through the dynamic
 * import below, and the scan check's decoder loads on first use.
 */
export function BarcodeGenerator({
  initial,
  formTop,
  renderActions,
  footnote,
  source = "generator",
}: BarcodeGeneratorProps = {}) {
  const t = useTranslations("barcodeTool");
  const tc = useContentText();
  const start = useRef({
    format: initial?.format ?? DEFAULT_BARCODE_FORMAT,
    value:
      initial?.value ??
      getBarcodeFormat(initial?.format ?? DEFAULT_BARCODE_FORMAT).example,
    style: {
      ...defaultBarcodeStyle(initial?.format ?? DEFAULT_BARCODE_FORMAT),
      ...initial?.style,
    },
  }).current;
  const [renderer, setRenderer] = useState<RenderModule | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [formatId, setFormatId] = useState<BarcodeFormatId>(start.format);
  const [input, setInput] = useState<string>(start.value);
  const [foreground, setForeground] = useState(start.style.foreground);
  const [background, setBackground] = useState(start.style.background);
  const [showText, setShowText] = useState(start.style.showText);
  const [barHeightMm, setBarHeightMm] = useState(start.style.barHeightMm);
  const [quietZone, setQuietZone] = useState(start.style.quietZone);
  const [scale, setScale] = useState(start.style.scale);
  const [rotation, setRotation] = useState<BarcodeRotation>(
    start.style.rotation ?? 0,
  );
  const [downloading, setDownloading] = useState<BarcodeFileType | null>(null);
  const [scan, setScan] = useState<ScanCheckResult | "unavailable" | null>(
    null,
  );
  const [checking, setChecking] = useState(false);

  const format = getBarcodeFormat(formatId);
  const linear = format.kind === "linear";
  const inputId = useId();

  useEffect(() => {
    let cancelled = false;
    import("@/lib/barcode/render")
      .then((module) => {
        if (!cancelled) setRenderer(module);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const checked = useMemo(
    () => validateBarcodeInput(formatId, input),
    [formatId, input],
  );
  const colorWarnings = useMemo(
    () => barcodeColorWarnings(foreground, background),
    [foreground, background],
  );

  const style = useMemo<BarcodeStyle>(
    () => ({
      foreground,
      background,
      showText,
      barHeightMm,
      quietZone,
      scale,
      rotation,
    }),
    [foreground, background, showText, barHeightMm, quietZone, scale, rotation],
  );

  const drawn = useMemo<
    { rendered: RenderedBarcode } | { error: string } | null
  >(() => {
    if (!(renderer && checked.ok)) return null;
    try {
      return {
        rendered: renderer.renderBarcodeSVG(formatId, checked.value, style),
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : t("drawFailed"),
      };
    }
  }, [renderer, checked, formatId, style, t]);
  const rendered = drawn && "rendered" in drawn ? drawn.rendered : null;
  const value = checked.ok ? checked.value : null;
  const current = useMemo<CurrentBarcode | null>(
    () => (rendered && value ? { format: formatId, value, style } : null),
    [rendered, value, formatId, style],
  );

  // The funnel's first two steps: the public generator opened, and a
  // barcode other than the page's own drawn (never its value).
  useTrackEditorOpened("barcode", source === "generator");
  useTrackBarcodeGenerated({
    source,
    symbology: formatId,
    value: input,
    rendered: Boolean(rendered),
    initial: { symbology: start.format, value: start.value },
  });

  // Scan check: decode the exact pixels the PNG download would have.
  useEffect(() => {
    if (!(rendered && value)) {
      setScan(null);
      setChecking(false);
      return;
    }
    let cancelled = false;
    setChecking(true);
    const timer = setTimeout(async () => {
      try {
        const canvas = await svgToCanvas(
          rendered.svg,
          rendered.width,
          rendered.height,
        );
        const { checkBarcodeScan } = await import("@/lib/barcode/scan-check");
        const result = await checkBarcodeScan(canvas, formatId, value);
        if (!cancelled) setScan(result);
      } catch {
        if (!cancelled) setScan("unavailable");
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, SCAN_CHECK_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [rendered, value, formatId]);

  const changeFormat = (next: string) => {
    if (!isBarcodeFormatId(next)) return;
    const nextFormat = getBarcodeFormat(next);
    setFormatId(next);
    // Keep what was typed when it's valid for the new format; an untouched
    // example becomes the new format's example.
    if (input === format.example || !validateBarcodeInput(next, input).ok) {
      setInput(nextFormat.example);
    }
    setQuietZone(nextFormat.quietZone.default);
    if (nextFormat.barHeightMm) setBarHeightMm(nextFormat.barHeightMm);
  };

  /** WebP and AVIF: browsers can't encode them, so the image API does. */
  const serverFile = async (type: BarcodeFileType): Promise<Blob> => {
    if (!value) throw new Error(t("fixFirst"));
    const response = await fetch("/api/v1/barcode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        format: formatId,
        data: value,
        type,
        fg: foreground,
        bg: background,
        scale,
        height: barHeightMm,
        quietZone,
        text: showText,
        rotate: rotation,
      }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        message?: string;
        data?: { details?: { message?: string }[] };
      } | null;
      throw new Error(
        body?.data?.details?.[0]?.message ?? body?.message ?? t("serverFailed"),
      );
    }
    return response.blob();
  };

  const download = async (type: BarcodeFileType) => {
    if (!(rendered && value)) return;
    setDownloading(type);
    const stem = barcodeFileStem(formatId, value);
    const title = `${format.label} barcode`;
    try {
      let blob: Blob;
      if (type === "png" || type === "jpg") {
        const canvas = await svgToCanvas(
          rendered.svg,
          rendered.width,
          rendered.height,
        );
        blob = await canvasToBlob(canvas, BARCODE_FILES[type].mime);
      } else if (type === "svg") {
        const svg = renderer?.printableSVG(rendered) ?? rendered.svg;
        blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      } else if (type === "pdf") {
        const { barcodePDF } = await import("@/lib/barcode/pdf");
        blob = new Blob([barcodePDF(rendered, { title }) as BlobPart], {
          type: "application/pdf",
        });
      } else if (type === "eps") {
        // The engine's SVG-to-EPS converter; loaded only when asked for.
        const { svgToEPS } = await import("@/lib/qrdx-lazy/eps");
        const eps = await svgToEPS(rendered.svg, {
          width: rendered.widthUnits,
          background,
          title,
        });
        blob = new Blob([eps], { type: "application/postscript" });
      } else {
        blob = await serverFile(type);
      }
      saveFile(blob, `${stem}.${type}`);
      soundEvent("download");
      track("barcode_downloaded", {
        format: type,
        symbology: formatId,
        source,
      });
    } catch (error) {
      soundEvent("error");
      toast.error(t("downloadFailed"), {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setDownloading(null);
    }
  };

  const error = checked.ok
    ? drawn && "error" in drawn
      ? drawn.error
      : null
    : checked.error;
  const quietZoneLow = quietZone < format.quietZone.min;
  const mm = (units: number, digits = 1) =>
    ((units * 25.4) / 72).toLocaleString("en-US", {
      maximumFractionDigits: digits,
    });
  const canDownload = Boolean(rendered) && downloading === null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5">
        {formTop}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${inputId}-format`}>{t("type")}</Label>
          <Select value={formatId} onValueChange={changeFormat}>
            <SelectTrigger id={`${inputId}-format`} className="w-full">
              {/* Just the name; the list shows what each one is for. */}
              <SelectValue>{format.label}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>{t("linear")}</SelectLabel>
                {LINEAR.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                    <span className="text-muted-foreground">
                      {" "}
                      · {tc(item.summary)}
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>2D</SelectLabel>
                {MATRIX.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                    <span className="text-muted-foreground">
                      {" "}
                      · {tc(item.summary)}
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={inputId}>
            {t(linear ? "linearInput" : "textInput")}
          </Label>
          {linear ? (
            <Input
              id={inputId}
              aria-describedby={`${inputId}-help`}
              aria-invalid={!checked.ok}
              autoComplete="off"
              className="font-mono"
              maxLength={format.maxLength}
              spellCheck={false}
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
          ) : (
            <Textarea
              id={inputId}
              aria-describedby={`${inputId}-help`}
              aria-invalid={!checked.ok}
              className="font-mono text-sm"
              maxLength={format.maxLength}
              rows={3}
              spellCheck={false}
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
          )}
          <div id={`${inputId}-help`} className="flex flex-col gap-1">
            {error ? (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : checked.ok && checked.note ? (
              <p className="text-xs text-foreground">{checked.note}</p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {tc(format.inputHint)}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ColorField
            label={t("barColor")}
            value={foreground}
            onChange={setForeground}
          />
          <ColorField
            label={t("background")}
            value={background}
            onChange={setBackground}
          />
        </div>

        {linear && (
          <RangeField
            label={t("barHeight")}
            max={60}
            min={5}
            readout={`${barHeightMm} mm`}
            value={barHeightMm}
            onChange={setBarHeightMm}
          />
        )}

        <RangeField
          label={t("quietZone")}
          max={maxQuietZone(formatId)}
          min={0}
          readout={t("modules", { count: quietZone })}
          value={quietZone}
          onChange={setQuietZone}
        >
          <p
            className={cn(
              "text-xs",
              quietZoneLow ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {quietZoneLow
              ? t("quietZoneLow", {
                  format: format.label,
                  min: format.quietZone.min,
                  kind: linear ? "linear" : "matrix",
                })
              : t("quietZoneHelp", {
                  format: format.label,
                  min: format.quietZone.min,
                  kind: linear ? "linear" : "matrix",
                })}
          </p>
        </RangeField>

        <RangeField
          label={t("imageSize")}
          max={BARCODE_LIMITS.scale.max}
          min={BARCODE_LIMITS.scale.min}
          readout={
            rendered
              ? `${Math.round(rendered.width)} × ${Math.round(rendered.height)} px`
              : `${scale}×`
          }
          value={scale}
          onChange={setScale}
        />

        {linear && (
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor={`${inputId}-text`}>
              {t(TEXT_FORMATS.has(format.id) ? "showText" : "showDigits")}
            </Label>
            <Switch
              id={`${inputId}-text`}
              checked={showText}
              onCheckedChange={setShowText}
            />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <Label id={`${inputId}-rotation`}>{t("rotation")}</Label>
          <ToggleGroup
            aria-labelledby={`${inputId}-rotation`}
            onValueChange={(next) => {
              if (next) setRotation(Number(next) as BarcodeRotation);
            }}
            size="sm"
            type="single"
            value={String(rotation)}
            variant="outline"
          >
            {BARCODE_ROTATIONS.map((angle) => (
              <ToggleGroupItem
                aria-label={t("degrees", { angle })}
                className="px-2.5 font-mono text-xs tabular-nums"
                key={angle}
                value={String(angle)}
              >
                {angle}°
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <div
          aria-live="polite"
          className="flex min-h-56 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40 p-4"
        >
          {rendered ? (
            // A data URL in an <img>: the SVG never becomes page markup.
            <img
              alt={t("alt", { format: format.label, value: value ?? "" })}
              className="h-auto max-h-80 w-auto max-w-full"
              height={rendered.height}
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(rendered.svg)}`}
              width={rendered.width}
            />
          ) : loadError ? (
            <p className="max-w-xs text-center text-sm text-destructive">
              {t("loadFailed")}
            </p>
          ) : !renderer && checked.ok ? (
            <Spinner className="size-6 animate-spin text-muted-foreground" />
          ) : (
            <p className="max-w-xs text-center text-sm text-muted-foreground">
              {t("fixInput")}
            </p>
          )}
        </div>

        {rendered && renderer && (
          <p className="text-xs text-muted-foreground">
            {t("sizes", {
              width: Math.round(rendered.width),
              height: Math.round(rendered.height),
              widthMm: mm(rendered.widthUnits),
              heightMm: mm(rendered.heightUnits),
              moduleMm: mm(renderer.MODULE_UNITS[formatId], 2),
            })}
          </p>
        )}

        {(rendered || colorWarnings.length > 0) && (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            {rendered && (
              <ScanStatus
                checking={checking}
                label={format.label}
                result={scan}
                value={value ?? ""}
              />
            )}
            {colorWarnings.map((warning) => (
              <Notice key={warning.message} warning={warning} />
            ))}
          </div>
        )}

        <div className="mt-auto grid grid-cols-4 gap-2">
          {MAIN_FILES.map((type) => (
            <Button
              key={type}
              disabled={!canDownload}
              onClick={() => download(type)}
              variant={type === "png" ? "default" : "outline"}
            >
              {downloading === type ? (
                <Spinner className="size-4 animate-spin" />
              ) : (
                <Download aria-hidden className="size-4" />
              )}
              {BARCODE_FILES[type].label}
            </Button>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button disabled={!canDownload} variant="outline">
                {downloading && MORE_FILES.includes(downloading) ? (
                  <Spinner className="size-4 animate-spin" />
                ) : null}
                {t("more")}
                <ArrowDown2 aria-hidden className="size-3.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>{t("moreFormats")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {MORE_FILES.map((type) => (
                <DropdownMenuItem key={type} onSelect={() => download(type)}>
                  <span className="w-10 font-medium">
                    {BARCODE_FILES[type].label}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {tc(BARCODE_FILES[type].hint)}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {renderActions?.(current)}
        {footnote === null ? null : (
          <p className="text-center text-[11px] text-muted-foreground text-pretty">
            {footnote ?? t("footnote")}
          </p>
        )}
      </div>
    </div>
  );
}
