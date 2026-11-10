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
import {
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { track } from "@/lib/analytics";
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
            aria-label={`Pick the ${label.toLowerCase()}`}
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
      <span>{warning.message}</span>
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
  if (checking || !result) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Spinner className="size-4 animate-spin" />
        Checking the PNG with a barcode reader…
      </p>
    );
  }
  if (result === "unavailable") {
    return (
      <p className="flex gap-2 text-xs text-muted-foreground">
        <Warning2 aria-hidden className="mt-px size-4 shrink-0" />
        The scan check couldn't load its decoder, so this barcode wasn't
        checked. Test the printed code with a scanner.
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
          Scan check passed: a barcode reader decodes the PNG as {label}{" "}
          <span className="break-all font-mono">{value}</span>
        </span>
      </p>
    );
  }
  return (
    <p className="flex gap-2 text-xs text-destructive">
      <CircleX aria-hidden className="mt-px size-4 shrink-0" variant="Bold" />
      <span>
        {result.status === "mismatch"
          ? `Scan check failed: the reader got "${result.decoded}" instead of this ${label}.`
          : `Scan check failed: the reader couldn't decode this ${label}. Raise the contrast, the size or the quiet zone.`}
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
  footnote = (
    <>
      Made in your browser; nothing you type is sent to QRdx. WebP and AVIF are
      encoded by QRdx's server when you pick them, and nothing is kept.
    </>
  ),
  source = "generator",
}: BarcodeGeneratorProps = {}) {
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
        error:
          error instanceof Error
            ? error.message
            : "Couldn't draw this barcode.",
      };
    }
  }, [renderer, checked, formatId, style]);
  const rendered = drawn && "rendered" in drawn ? drawn.rendered : null;
  const value = checked.ok ? checked.value : null;
  const current = useMemo<CurrentBarcode | null>(
    () => (rendered && value ? { format: formatId, value, style } : null),
    [rendered, value, formatId, style],
  );

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
    if (!value) throw new Error("Fix the input first.");
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
        body?.data?.details?.[0]?.message ??
          body?.message ??
          "The server couldn't make this file.",
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
        const { svgToEPS } = await import("qrdx");
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
      toast.error("Download failed", {
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
          <Label htmlFor={`${inputId}-format`}>Barcode type</Label>
          <Select value={formatId} onValueChange={changeFormat}>
            <SelectTrigger id={`${inputId}-format`} className="w-full">
              {/* Just the name; the list shows what each one is for. */}
              <SelectValue>{format.label}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Linear (1D)</SelectLabel>
                {LINEAR.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                    <span className="text-muted-foreground">
                      {" "}
                      · {item.summary}
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
                      · {item.summary}
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={inputId}>
            {linear ? "Number or text to encode" : "Text to encode"}
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
            <p className="text-xs text-muted-foreground">{format.inputHint}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ColorField
            label="Bar color"
            value={foreground}
            onChange={setForeground}
          />
          <ColorField
            label="Background"
            value={background}
            onChange={setBackground}
          />
        </div>

        {linear && (
          <RangeField
            label="Bar height"
            max={60}
            min={5}
            readout={`${barHeightMm} mm`}
            value={barHeightMm}
            onChange={setBarHeightMm}
          />
        )}

        <RangeField
          label="Quiet zone"
          max={maxQuietZone(formatId)}
          min={0}
          readout={`${quietZone} ${quietZone === 1 ? "module" : "modules"}`}
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
              ? `${format.label} needs at least ${format.quietZone.min} modules of blank space ${linear ? "on each side" : "all round"}. Leave it in your layout if you trim it here.`
              : `The blank margin ${linear ? "left and right of the bars" : "around the code"}, in modules (the width of the narrowest bar${linear ? "" : " or one cell"}). ${format.label} needs ${format.quietZone.min === 0 ? "none" : `at least ${format.quietZone.min}`}.`}
          </p>
        </RangeField>

        <RangeField
          label="Image size"
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
              Show the {TEXT_FORMATS.has(format.id) ? "text" : "digits"} under
              the bars
            </Label>
            <Switch
              id={`${inputId}-text`}
              checked={showText}
              onCheckedChange={setShowText}
            />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <Label id={`${inputId}-rotation`}>Rotation</Label>
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
                aria-label={`${angle} degrees`}
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
              alt={`${format.label} barcode for ${value}`}
              className="h-auto max-h-80 w-auto max-w-full"
              height={rendered.height}
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(rendered.svg)}`}
              width={rendered.width}
            />
          ) : loadError ? (
            <p className="max-w-xs text-center text-sm text-destructive">
              The barcode drawing code didn't load. Check your connection and
              reload the page.
            </p>
          ) : !renderer && checked.ok ? (
            <Spinner className="size-6 animate-spin text-muted-foreground" />
          ) : (
            <p className="max-w-xs text-center text-sm text-muted-foreground">
              Fix the highlighted input to see the barcode.
            </p>
          )}
        </div>

        {rendered && renderer && (
          <p className="text-xs text-muted-foreground">
            PNG, JPG, WebP and AVIF {Math.round(rendered.width)} ×{" "}
            {Math.round(rendered.height)} px. SVG, PDF and EPS are vectors sized{" "}
            {mm(rendered.widthUnits)} × {mm(rendered.heightUnits)} mm, with a{" "}
            {mm(renderer.MODULE_UNITS[formatId], 2)} mm module; scale them in
            your layout as needed.
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
                More
                <ArrowDown2 aria-hidden className="size-3.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>More formats</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {MORE_FILES.map((type) => (
                <DropdownMenuItem key={type} onSelect={() => download(type)}>
                  <span className="w-10 font-medium">
                    {BARCODE_FILES[type].label}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {BARCODE_FILES[type].hint}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {renderActions?.(current)}
        {footnote ? (
          <p className="text-center text-[11px] text-muted-foreground text-pretty">
            {footnote}
          </p>
        ) : null}
      </div>
    </div>
  );
}
