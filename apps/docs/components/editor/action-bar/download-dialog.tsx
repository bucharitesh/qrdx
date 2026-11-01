"use client";

import { toast } from "@repo/design-system";
import { Spinner, Tick } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@repo/design-system/components/ui/input-group";
import { Label } from "@repo/design-system/components/ui/label";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@repo/design-system/components/ui/revola";
import { Switch } from "@repo/design-system/components/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/design-system/components/ui/tabs";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@repo/design-system/components/ui/toggle-group";
import {
  Bezier,
  Copy,
  DocumentText,
  Gallery,
  type Icon,
  Image,
  Import,
  InfoCircle,
  Printer,
} from "iconsax-reactjs";
import {
  type DownloadSize,
  downloadPrintEPS,
  downloadPrintPDF,
  downloadPrintSVG,
  downloadQRCode,
  getFrameDimensions,
  getPrintLayout,
  getQRData,
  getSVGString,
  PRESET_SIZES,
  type PrintColorMode,
  type PrintLayout,
  type PrintUnit,
  QRCodeSVG,
  validateSize,
} from "qrdx";
import type { QRArt } from "qrdx/types";
import React from "react";
import { DialogCloseButton } from "@/components/editor/dialog-close-button";
import { emitSound } from "@/components/editor/sound";
import { InfoHint } from "@/components/help/info-hint";
import { track } from "@/lib/analytics";
import { DEFAULT_QR_LOGO } from "@/lib/constants";
import { useQREditorStore } from "@/store/editor-store";
import { usePreferencesStore } from "@/store/preferences-store";
import type { DownloadOptions as DownloadOptionsType } from "@/types/theme";

interface DownloadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PRINT_SIZE_LIMITS: Record<PrintUnit, { min: number; max: number }> = {
  mm: { min: 5, max: 2000 },
  in: { min: 0.2, max: 78 },
};

// Modules smaller than this tend to smear on paper.
const MIN_PRINT_MODULE_MM = 0.3;

function formatLength(mm: number, unit: PrintUnit): string {
  return unit === "in"
    ? `${Math.round((mm / 25.4) * 100) / 100} in`
    : `${Math.round(mm * 10) / 10} mm`;
}

function formatDistance(mm: number, unit: PrintUnit): string {
  if (unit === "in") {
    const inches = mm / 25.4;
    return inches >= 24
      ? `${Math.round((inches / 12) * 10) / 10} ft`
      : `${Math.round(inches)} in`;
  }
  return mm >= 1000
    ? `${Math.round(mm / 100) / 10} m`
    : `${Math.round(mm / 10)} cm`;
}

type ImageFormat = DownloadOptionsType["format"];
type SizePreset = DownloadOptionsType["sizePreset"];

const FORMATS: {
  id: ImageFormat;
  label: string;
  bestFor: string;
  Icon: Icon;
  vector?: boolean;
}[] = [
  { id: "png", label: "PNG", bestFor: "Web, docs and slides", Icon: Gallery },
  { id: "jpg", label: "JPG", bestFor: "Email and small files", Icon: Image },
  {
    id: "svg",
    label: "SVG",
    bestFor: "Figma, Illustrator, websites",
    Icon: Bezier,
    vector: true,
  },
  {
    id: "pdf",
    label: "PDF",
    bestFor: "Documents and quick prints",
    Icon: DocumentText,
    vector: true,
  },
  {
    id: "eps",
    label: "EPS",
    bestFor: "Print shops and vector apps",
    Icon: Printer,
    vector: true,
  },
];

const SIZE_PRESETS: { id: Exclude<SizePreset, "custom">; label: string }[] = [
  { id: "small", label: "Email" },
  { id: "medium", label: "Web" },
  { id: "large", label: "Social" },
  { id: "xlarge", label: "Print" },
  { id: "3xl", label: "Poster" },
];

const SCALES = [1, 2, 3, 4];
const PRINT_DPI = 300;

/** Physical width of `px` printed at 300 dpi. */
function physicalSize(px: number): string {
  const cm = (px / PRINT_DPI) * 2.54;
  const inches = px / PRINT_DPI;
  return `${cm < 10 ? cm.toFixed(1) : Math.round(cm)} cm · ${inches < 10 ? inches.toFixed(1) : Math.round(inches)} in`;
}

const CHECKERBOARD: React.CSSProperties = {
  backgroundColor: "#ffffff",
  backgroundImage:
    "conic-gradient(#e4e4e7 25%, transparent 0 50%, #e4e4e7 0 75%, transparent 0)",
  backgroundSize: "16px 16px",
};

export function DownloadDialog({ open, onOpenChange }: DownloadDialogProps) {
  const { value, themeState } = useQREditorStore();
  const { downloadOptions, updateDownloadOption } = usePreferencesStore();
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [svgCopied, setSvgCopied] = React.useState(false);
  const [tab, setTab] = React.useState<"image" | "print">("image");
  const [printUnit, setPrintUnit] = React.useState<PrintUnit>("mm");
  const [printSize, setPrintSize] = React.useState(40);
  const [printBleed, setPrintBleed] = React.useState(0);
  const [cropMarks, setCropMarks] = React.useState(false);
  const [colorMode, setColorMode] = React.useState<PrintColorMode>("rgb");

  const format = downloadOptions.format;
  const formatInfo = FORMATS.find((item) => item.id === format) ?? FORMATS[0];
  const canBeTransparent = format !== "jpg";
  const transparent = downloadOptions.transparent && canBeTransparent;

  const qrProps = React.useMemo(
    () => ({
      ...getQRData({
        value,
        fgColor: themeState.styles.fgColor,
        bgColor: transparent ? "transparent" : themeState.styles.bgColor,
        eyeColor: themeState.styles.eyeColor,
        dotColor: themeState.styles.dotColor,
        bodyPattern: themeState.styles.bodyPattern,
        hideLogo: !themeState.styles.showLogo,
        logo: themeState.styles.customLogo ?? DEFAULT_QR_LOGO,
      }),
      level: themeState.styles.level,
      cornerEyePattern: themeState.styles.cornerEyePattern,
      cornerEyeDotPattern: themeState.styles.cornerEyeDotPattern,
      templateId: themeState.styles.templateId,
      margin: themeState.styles.margin,
      frame: themeState.styles.frame,
      art: (themeState.styles as { art?: QRArt }).art,
    }),
    [value, themeState, transparent],
  );

  // Print files always use the real background color.
  const printProps = React.useMemo(
    () => ({ ...qrProps, bgColor: themeState.styles.bgColor }),
    [qrProps, themeState.styles.bgColor],
  );

  const printLayout = React.useMemo((): {
    layout: PrintLayout | null;
    error: string;
  } => {
    const limits = PRINT_SIZE_LIMITS[printUnit];
    if (
      !Number.isFinite(printSize) ||
      printSize < limits.min ||
      printSize > limits.max
    ) {
      return {
        layout: null,
        error: `Enter a size between ${limits.min} and ${limits.max} ${printUnit}`,
      };
    }
    try {
      return {
        layout: getPrintLayout(printProps, {
          size: printSize,
          unit: printUnit,
          bleed: printBleed,
          cropMarks,
        }),
        error: "",
      };
    } catch (error) {
      return {
        layout: null,
        error: error instanceof Error ? error.message : "Invalid print size",
      };
    }
  }, [printProps, printSize, printUnit, printBleed, cropMarks]);

  const baseSize: DownloadSize =
    downloadOptions.sizePreset === "custom"
      ? { width: downloadOptions.width, height: downloadOptions.height }
      : (PRESET_SIZES[downloadOptions.sizePreset] ?? PRESET_SIZES.medium);
  const multiplier = downloadOptions.multiplier || 1;
  const exportSize = {
    width: baseSize.width * multiplier,
    height: baseSize.height * multiplier,
  };
  const output = getFrameDimensions(exportSize.width, themeState.styles.frame);
  const outputWidth = Math.round(output.width);
  const outputHeight = Math.round(output.height);
  const validation =
    Number.isNaN(exportSize.width) || Number.isNaN(exportSize.height)
      ? { isValid: false, error: "Enter a width and height in pixels." }
      : validateSize(exportSize.width, exportSize.height);
  const sizeError = validation.isValid ? "" : (validation.error ?? "");
  const filename =
    downloadOptions.filename ||
    `qr-code-${exportSize.width}x${exportSize.height}.${format}`;

  const handleDownload = async () => {
    if (sizeError) return;
    setIsDownloading(true);
    try {
      await downloadQRCode(qrProps, {
        format,
        size: exportSize,
        filename: downloadOptions.filename,
      });
      emitSound("download");
      track("qr_downloaded", {
        format,
        source: "playground",
        content_type: useQREditorStore.getState().contentType,
      });
      toast.success(`Downloaded ${filename}`);
      onOpenChange(false);
    } catch (error) {
      console.error("Error downloading QR code:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to download QR code",
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePrintDownload = async (printFormat: PrintFormat) => {
    const { layout } = printLayout;
    if (!layout) {
      return;
    }
    setIsDownloading(true);
    const printFilename = `qr-code-print-${printSize}${printUnit}.${printFormat}`;
    try {
      if (printFormat === "eps") {
        await downloadPrintEPS(printProps, {
          sizeMm: printUnit === "in" ? printSize * 25.4 : printSize,
          bleedMm: printBleed,
          colorMode,
          filename: printFilename,
        });
      } else if (printFormat === "pdf") {
        await downloadPrintPDF(printProps, {
          size: printSize,
          unit: printUnit,
          bleed: printBleed,
          cropMarks,
          colorMode,
          filename: printFilename,
        });
      } else {
        await downloadPrintSVG(printProps, {
          size: printSize,
          unit: printUnit,
          filename: printFilename,
        });
      }
      emitSound("download");
      track("qr_downloaded", {
        format: `print-${printFormat}`,
        source: "playground",
        content_type: useQREditorStore.getState().contentType,
      });
      toast.success(`Downloaded ${printFilename}`);
      onOpenChange(false);
    } catch (error) {
      console.error("Error creating print file:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create print file",
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const copySvg = async () => {
    try {
      await navigator.clipboard.writeText(await getSVGString(qrProps));
      setSvgCopied(true);
      emitSound("copy");
      track("qr_copied", { format: "svg", source: "playground" });
      setTimeout(() => setSvgCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy the SVG");
    }
  };

  const preview = (
    <div className="flex flex-col gap-4 sm:sticky sm:top-0">
      <div
        className="mx-auto grid aspect-square w-full max-w-36 place-items-center overflow-hidden rounded-[14px] border p-3 sm:max-w-none [&_svg]:h-auto [&_svg]:max-h-full [&_svg]:max-w-full"
        style={
          tab === "image" && transparent
            ? CHECKERBOARD
            : { backgroundColor: "#ffffff" }
        }
      >
        {value ? (
          <QRCodeSVG {...(tab === "print" ? printProps : qrProps)} size={220} />
        ) : (
          <p className="text-muted-foreground px-4 text-center text-xs">
            Add content to see your code.
          </p>
        )}
      </div>
      <dl className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        {tab === "image" ? (
          <>
            <dt>Format</dt>
            <dd className="text-foreground text-right">
              {formatInfo?.label}
              {formatInfo?.vector ? " · vector" : ""}
            </dd>
            <dt>Pixels</dt>
            <dd className="text-foreground text-right tabular-nums">
              {outputWidth} × {outputHeight}
            </dd>
            <dt>At 300 dpi</dt>
            <dd className="text-foreground text-right tabular-nums">
              {formatInfo?.vector ? "Any size" : physicalSize(outputWidth)}
            </dd>
          </>
        ) : (
          <>
            <dt>Width</dt>
            <dd className="text-foreground text-right tabular-nums">
              {printSize} {printUnit}
            </dd>
            <dt>Colour</dt>
            <dd className="text-foreground text-right uppercase">
              {colorMode}
            </dd>
            <dt>Bleed</dt>
            <dd className="text-foreground text-right">
              {printBleed ? `${printBleed} mm` : "None"}
            </dd>
          </>
        )}
      </dl>
    </div>
  );

  const sectionLabel = "text-muted-foreground mb-2.5 block text-xs font-medium";

  return (
    <ResponsiveDialog onOpenChange={onOpenChange} open={open}>
      <ResponsiveDialogContent className="max-h-[92dvh] gap-0 overflow-hidden p-0 sm:max-w-[46rem] dark:!border-border">
        <div className="flex max-h-[inherit] min-h-0 flex-col">
          <ResponsiveDialogHeader className="flex-row items-start gap-3 px-6 pt-1 pb-0 text-left sm:pt-6">
            <div className="min-w-0 flex-1 space-y-1">
              <ResponsiveDialogTitle>Download QR code</ResponsiveDialogTitle>
              <ResponsiveDialogDescription>
                {tab === "print"
                  ? "Vector PDF or EPS at an exact physical size, ready for a print shop."
                  : "Pick a format and size. The preview shows what you get."}
              </ResponsiveDialogDescription>
            </div>
            <DialogCloseButton className="-mt-1 -mr-2 hidden sm:inline-flex" />
          </ResponsiveDialogHeader>

          <Tabs
            className="flex min-h-0 flex-1 flex-col gap-0"
            onValueChange={(next) => setTab(next as "image" | "print")}
            value={tab}
          >
            <div className="px-6 pt-5">
              <TabsList className="grid w-full grid-cols-2 sm:w-72">
                <TabsTrigger value="image">
                  <Gallery className="size-4" />
                  Image file
                </TabsTrigger>
                <TabsTrigger value="print">
                  <Printer className="size-4" />
                  Print-ready
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto px-6 py-6 sm:grid-cols-[12.5rem_1fr]">
              {preview}

              <TabsContent className="mt-0 min-w-0 space-y-6" value="image">
                <section>
                  <span className={sectionLabel}>
                    <span id="dl-format">Format</span>{" "}
                    <InfoHint align="start" id="download-formats" />
                  </span>
                  <ToggleGroup
                    aria-labelledby="dl-format"
                    className="grid w-full grid-cols-5"
                    onValueChange={(next) => {
                      if (next)
                        updateDownloadOption("format", next as ImageFormat);
                    }}
                    type="single"
                    value={format}
                    variant="outline"
                  >
                    {FORMATS.map((item) => (
                      <ToggleGroupItem
                        className="h-14 flex-col gap-1 px-1 text-xs font-medium"
                        key={item.id}
                        value={item.id}
                      >
                        <item.Icon className="size-4" />
                        {item.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <p className="text-muted-foreground mt-2 text-xs">
                    Best for {formatInfo?.bestFor.toLowerCase()}
                    {formatInfo?.vector ? " · stays sharp at any size" : ""}.
                  </p>
                </section>

                <section>
                  <span className={sectionLabel} id="dl-size">
                    Size
                  </span>
                  <ToggleGroup
                    aria-labelledby="dl-size"
                    className="grid w-full grid-cols-3 sm:grid-cols-6"
                    onValueChange={(next) => {
                      if (next)
                        updateDownloadOption("sizePreset", next as SizePreset);
                    }}
                    type="single"
                    value={downloadOptions.sizePreset}
                    variant="outline"
                  >
                    {SIZE_PRESETS.map((preset) => (
                      <ToggleGroupItem
                        className="h-14 flex-col gap-0.5 px-1"
                        key={preset.id}
                        value={preset.id}
                      >
                        <span className="text-xs font-medium">
                          {preset.label}
                        </span>
                        <span className="text-muted-foreground text-[11px] tabular-nums">
                          {PRESET_SIZES[preset.id]?.width}
                        </span>
                      </ToggleGroupItem>
                    ))}
                    <ToggleGroupItem
                      className="h-14 flex-col gap-0.5 px-1"
                      value="custom"
                    >
                      <span className="text-xs font-medium">Custom</span>
                      <span className="text-muted-foreground text-[11px]">
                        px
                      </span>
                    </ToggleGroupItem>
                  </ToggleGroup>
                  {downloadOptions.sizePreset === "custom" && (
                    <div className="mt-2.5 flex items-center gap-2">
                      <Label className="text-xs" htmlFor="custom-size">
                        Width and height
                      </Label>
                      <InputGroup className="w-36">
                        <InputGroupInput
                          id="custom-size"
                          inputMode="numeric"
                          max={5000}
                          min={50}
                          onChange={(event) => {
                            const next = Number(event.target.value);
                            updateDownloadOption("width", next);
                            updateDownloadOption("height", next);
                          }}
                          type="number"
                          value={downloadOptions.width}
                        />
                        <InputGroupAddon align="inline-end">
                          <InputGroupText>px</InputGroupText>
                        </InputGroupAddon>
                      </InputGroup>
                    </div>
                  )}
                </section>

                <section className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="text-muted-foreground text-xs font-medium"
                      id="dl-scale"
                    >
                      Scale
                    </span>
                    <ToggleGroup
                      aria-labelledby="dl-scale"
                      onValueChange={(next) => {
                        if (next)
                          updateDownloadOption("multiplier", Number(next));
                      }}
                      size="sm"
                      type="single"
                      value={String(multiplier)}
                      variant="outline"
                    >
                      {SCALES.map((scale) => (
                        <ToggleGroupItem
                          aria-label={`${scale}×`}
                          className="px-2.5 text-xs tabular-nums"
                          key={scale}
                          value={String(scale)}
                        >
                          {scale}×
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Switch
                      checked={transparent}
                      disabled={!canBeTransparent}
                      id="transparent-bg"
                      onCheckedChange={(checked) =>
                        updateDownloadOption("transparent", checked)
                      }
                    />
                    <Label
                      className="cursor-pointer text-xs"
                      htmlFor="transparent-bg"
                      title={
                        canBeTransparent
                          ? undefined
                          : "JPG can't be transparent"
                      }
                    >
                      Transparent background
                    </Label>
                  </div>
                </section>

                {sizeError && (
                  <p className="text-destructive flex items-center gap-1.5 text-sm">
                    <InfoCircle className="size-4 shrink-0" />
                    {sizeError}
                  </p>
                )}
              </TabsContent>

              <TabsContent className="mt-0 min-w-0" value="print">
                <PrintOptions
                  bleed={printBleed}
                  colorMode={colorMode}
                  cropMarks={cropMarks}
                  layout={printLayout.layout}
                  layoutError={printLayout.error}
                  onBleedChange={setPrintBleed}
                  onColorModeChange={setColorMode}
                  onCropMarksChange={setCropMarks}
                  onSizeChange={setPrintSize}
                  onUnitChange={(unit) => {
                    setPrintUnit(unit);
                    setPrintSize(unit === "in" ? 1.5 : 40);
                  }}
                  size={printSize}
                  unit={printUnit}
                />
              </TabsContent>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t px-6 py-4 sm:flex-row sm:items-center">
              {tab === "image" ? (
                <>
                  <Button
                    disabled={!value}
                    onClick={copySvg}
                    type="button"
                    variant="ghost"
                  >
                    {svgCopied ? <Tick /> : <Copy />}
                    {svgCopied ? "SVG copied" : "Copy SVG"}
                  </Button>
                  <Button
                    className="min-w-0 sm:flex-1"
                    disabled={isDownloading || !!sizeError || !value}
                    onClick={handleDownload}
                  >
                    {isDownloading ? <Spinner /> : <Import />}
                    <span className="truncate">
                      {isDownloading ? "Preparing…" : `Download ${filename}`}
                    </span>
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex gap-2">
                    <Button
                      disabled={isDownloading || !printLayout.layout}
                      onClick={() => handlePrintDownload("svg")}
                      variant="ghost"
                    >
                      SVG
                    </Button>
                    <Button
                      disabled={isDownloading || !printLayout.layout}
                      onClick={() => handlePrintDownload("eps")}
                      variant="ghost"
                    >
                      EPS
                    </Button>
                  </div>
                  <Button
                    className="min-w-0 sm:flex-1"
                    disabled={isDownloading || !printLayout.layout}
                    onClick={() => handlePrintDownload("pdf")}
                  >
                    {isDownloading ? <Spinner /> : <Import />}
                    <span className="truncate">
                      {isDownloading
                        ? "Preparing…"
                        : `Download qr-code-print-${printSize}${printUnit}.pdf`}
                    </span>
                  </Button>
                </>
              )}
            </div>
          </Tabs>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

type PrintFormat = "pdf" | "svg" | "eps";

interface PrintOptionsProps {
  size: number;
  unit: PrintUnit;
  bleed: number;
  cropMarks: boolean;
  colorMode: PrintColorMode;
  layout: PrintLayout | null;
  layoutError: string;
  onSizeChange: (size: number) => void;
  onUnitChange: (unit: PrintUnit) => void;
  onBleedChange: (bleed: number) => void;
  onCropMarksChange: (cropMarks: boolean) => void;
  onColorModeChange: (colorMode: PrintColorMode) => void;
}

function PrintOptions({
  size,
  unit,
  bleed,
  cropMarks,
  colorMode,
  layout,
  layoutError,
  onSizeChange,
  onUnitChange,
  onBleedChange,
  onCropMarksChange,
  onColorModeChange,
}: PrintOptionsProps) {
  const limits = PRINT_SIZE_LIMITS[unit];
  const label = "text-muted-foreground mb-2.5 block text-xs font-medium";

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-2">
        <div>
          <Label className={label} htmlFor="print-size">
            Code width
          </Label>
          <InputGroup>
            <InputGroupInput
              id="print-size"
              max={limits.max}
              min={limits.min}
              onChange={(event) => onSizeChange(Number(event.target.value))}
              step={unit === "in" ? 0.1 : 1}
              type="number"
              value={Number.isNaN(size) ? "" : size}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText>{unit}</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
        </div>
        <div>
          <span className={label} id="print-unit">
            Unit
          </span>
          <ToggleGroup
            aria-labelledby="print-unit"
            className="grid w-full grid-cols-2"
            onValueChange={(next) => {
              if (next) onUnitChange(next as PrintUnit);
            }}
            type="single"
            value={unit}
            variant="outline"
          >
            <ToggleGroupItem className="text-xs" value="mm">
              mm
            </ToggleGroupItem>
            <ToggleGroupItem className="text-xs" value="in">
              inches
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2">
        <div>
          <span className={label} id="print-color-mode">
            Colour mode
          </span>
          <ToggleGroup
            aria-labelledby="print-color-mode"
            className="grid w-full grid-cols-2"
            onValueChange={(next) => {
              if (next) onColorModeChange(next as PrintColorMode);
            }}
            type="single"
            value={colorMode}
            variant="outline"
          >
            <ToggleGroupItem className="text-xs" value="rgb">
              RGB
            </ToggleGroupItem>
            <ToggleGroupItem className="text-xs" value="cmyk">
              CMYK
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div>
          <span className={label}>
            <span id="print-bleed">Bleed</span>{" "}
            <InfoHint align="end" id="print-ready" />
          </span>
          <ToggleGroup
            aria-labelledby="print-bleed"
            className="grid w-full grid-cols-2"
            onValueChange={(next) => {
              if (next) onBleedChange(Number(next));
            }}
            type="single"
            value={String(bleed)}
            variant="outline"
          >
            <ToggleGroupItem className="text-xs" value="0">
              None
            </ToggleGroupItem>
            <ToggleGroupItem className="text-xs" value="3">
              3 mm
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </section>

      <section className="flex items-center gap-2.5">
        <Switch
          checked={cropMarks}
          id="print-crop-marks"
          onCheckedChange={onCropMarksChange}
        />
        <Label className="cursor-pointer text-xs" htmlFor="print-crop-marks">
          Crop marks (PDF)
        </Label>
      </section>

      {layout ? (
        <section className="text-muted-foreground space-y-1.5 text-xs">
          <p className="text-foreground">
            Finished size {formatLength(layout.trimWidth, unit)} ×{" "}
            {formatLength(layout.trimHeight, unit)}
            {layout.pageWidth !== layout.trimWidth &&
              ` (page ${formatLength(layout.pageWidth, unit)} × ${formatLength(layout.pageHeight, unit)})`}
          </p>
          <p>
            Scans from up to about{" "}
            {formatDistance(layout.maxScanDistance, unit)} away (code width ≈
            scan distance ÷ 10).
          </p>
          {layout.codeWidth < 20 && (
            <p className="text-amber-700 dark:text-amber-400">
              Under 2 cm is hard for phones to scan; go bigger if you can.
            </p>
          )}
          {layout.moduleSize < MIN_PRINT_MODULE_MM && (
            <p className="text-amber-700 dark:text-amber-400">
              Each dot is only {Math.round(layout.moduleSize * 100) / 100} mm
              and may smear in print. Make the code bigger or shorten its
              content.
            </p>
          )}
          {colorMode === "cmyk" && (
            <p>
              CMYK uses a simple conversion without a colour profile; ask your
              printer if exact brand colours matter.
            </p>
          )}
          <p>
            PDF and EPS draw every dot as a vector shape and keep linear and
            radial gradients as smooth vector shadings.
          </p>
        </section>
      ) : (
        <p className="text-destructive flex items-center gap-1.5 text-sm">
          <InfoCircle className="size-4 shrink-0" />
          {layoutError}
        </p>
      )}
    </div>
  );
}
