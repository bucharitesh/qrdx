"use client";

import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { Slider } from "@repo/design-system/components/ui/slider";
import { Switch } from "@repo/design-system/components/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/design-system/components/ui/tabs";
import {
  type DownloadSize,
  downloadPrintPDF,
  downloadPrintSVG,
  downloadQRCode,
  getFrameDimensions,
  getPrintLayout,
  getQRData,
  PRESET_SIZES,
  type PrintColorMode,
  type PrintLayout,
  type PrintUnit,
  validateSize,
} from "qrdx";
import React from "react";
import { Icons } from "@/components/icons";
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

export function DownloadDialog({ open, onOpenChange }: DownloadDialogProps) {
  const { value, themeState } = useQREditorStore();
  const { downloadOptions, updateDownloadOption } = usePreferencesStore();
  const [sizeError, setSizeError] = React.useState<string>("");
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [tab, setTab] = React.useState<"image" | "print">("image");
  const [printUnit, setPrintUnit] = React.useState<PrintUnit>("mm");
  const [printSize, setPrintSize] = React.useState(40);
  const [printBleed, setPrintBleed] = React.useState(0);
  const [cropMarks, setCropMarks] = React.useState(false);
  const [colorMode, setColorMode] = React.useState<PrintColorMode>("rgb");

  const qrProps = React.useMemo(
    () => ({
      ...getQRData({
        value,
        fgColor: themeState.styles.fgColor,
        bgColor:
          downloadOptions.transparent && downloadOptions.format !== "jpg"
            ? "transparent"
            : themeState.styles.bgColor,
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
      frame: themeState.styles.frame,
    }),
    [value, themeState, downloadOptions.transparent, downloadOptions.format],
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

  // Get the current size based on selection
  const getCurrentSize = (): DownloadSize => {
    if (downloadOptions.sizePreset === "custom") {
      return {
        width: downloadOptions.width,
        height: downloadOptions.height,
      };
    }
    return PRESET_SIZES[downloadOptions.sizePreset] || PRESET_SIZES.medium;
  };

  // Validate custom size when it changes
  React.useEffect(() => {
    if (downloadOptions.sizePreset === "custom") {
      const width = downloadOptions.width;
      const height = downloadOptions.height;

      if (Number.isNaN(width) || Number.isNaN(height)) {
        setSizeError("Please enter valid numbers");
        return;
      }

      const validation = validateSize(width, height);
      if (!validation.isValid) {
        setSizeError(validation.error || "Invalid size");
      } else {
        setSizeError("");
      }
    } else {
      setSizeError("");
    }
  }, [
    downloadOptions.sizePreset,
    downloadOptions.width,
    downloadOptions.height,
  ]);

  const handleDownload = async () => {
    //1. Get size based on current selection
    const size = getCurrentSize();
    //2. apply the multiplier only for the export
    const finalExportSize = {
      width: size.width * downloadOptions.multiplier,
      height: size.height * downloadOptions.multiplier,
    };
    // 3. Validate FINAL size
    const validation = validateSize(
      finalExportSize.width,
      finalExportSize.height,
    );
    if (!validation.isValid) {
      setSizeError(validation.error || "Invalid size");
      return;
    }
    setIsDownloading(true);
    setSizeError("");

    try {
      await downloadQRCode(qrProps, {
        format: downloadOptions.format,
        size: finalExportSize,
        filename: downloadOptions.filename,
      });
      toast.success(
        `QR code downloaded as ${downloadOptions.format.toUpperCase()}`,
      );
      onOpenChange(false);
    } catch (error) {
      console.error("Error downloading QR code:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to download QR code";
      setSizeError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePrintDownload = async (format: "pdf" | "svg") => {
    const { layout } = printLayout;
    if (!layout) {
      return;
    }
    setIsDownloading(true);
    const filename = `qr-code-print-${printSize}${printUnit}.${format}`;
    try {
      if (format === "pdf") {
        await downloadPrintPDF(printProps, {
          size: printSize,
          unit: printUnit,
          bleed: printBleed,
          cropMarks,
          colorMode,
          filename,
        });
      } else {
        await downloadPrintSVG(printProps, {
          size: printSize,
          unit: printUnit,
          filename,
        });
      }
      toast.success(`Print-ready ${format.toUpperCase()} downloaded`);
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

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent
        className="p-6 sm:max-w-md"
        showCloseButton={true}
      >
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Download QR Code</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {tab === "print"
              ? "Vector PDF at an exact physical size, ready for a print shop."
              : "Choose the size and format for your QR code download."}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <Tabs
          className="pt-2"
          onValueChange={(next) => setTab(next as "image" | "print")}
          value={tab}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="image">Image</TabsTrigger>
            <TabsTrigger value="print">Print</TabsTrigger>
          </TabsList>
          <TabsContent value="image">
            <div className="space-y-4 py-4">
              <div className="grid gap-4 grid-cols-2">
                {/* Size Selection */}
                <div className="space-y-2">
                  <Label htmlFor="size-select">Size</Label>
                  <Select
                    defaultValue={downloadOptions.sizePreset}
                    value={downloadOptions.sizePreset}
                    onValueChange={(value) =>
                      updateDownloadOption(
                        "sizePreset",
                        value as DownloadOptionsType["sizePreset"],
                      )
                    }
                  >
                    <SelectTrigger id="size-select" className="w-full">
                      <SelectValue placeholder="Select size" />
                    </SelectTrigger>
                    <SelectContent className="w-full z-100">
                      <SelectItem value="small">200 × 200</SelectItem>
                      <SelectItem value="medium">400 × 400</SelectItem>
                      <SelectItem value="large">800 × 800</SelectItem>
                      <SelectItem value="xlarge">1200 × 1200</SelectItem>
                      <SelectItem value="2xl">1600 × 1600</SelectItem>
                      <SelectItem value="3xl">2000 × 2000</SelectItem>
                      <SelectItem value="custom">Custom Size</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Format Selection */}
                <div className="space-y-2">
                  <Label htmlFor="format-select">Format</Label>
                  <Select
                    defaultValue={downloadOptions.format}
                    value={downloadOptions.format}
                    onValueChange={(value) =>
                      updateDownloadOption(
                        "format",
                        value as "png" | "jpg" | "svg" | "pdf",
                      )
                    }
                  >
                    <SelectTrigger id="format-select" className="w-full">
                      <SelectValue placeholder="Select format" />
                    </SelectTrigger>
                    <SelectContent className="w-full z-100">
                      <SelectItem value="png">PNG</SelectItem>
                      <SelectItem value="jpg">JPG</SelectItem>
                      <SelectItem value="svg">SVG</SelectItem>
                      <SelectItem value="pdf">PDF</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Size Multiplier Slider Implementation */}
              <div className="space-y-2 py-2">
                <div className="flex justify-between items-center">
                  <Label
                    htmlFor="multiplier-slider"
                    className="text-sm text-gray-400"
                  >
                    Scale{" "}
                    <span className="text-[0.6rem] text-muted-foreground">
                      X
                    </span>
                  </Label>
                </div>
                <div className="flex items-center gap-4">
                  <Slider
                    id="multiplier-slider"
                    min={1}
                    max={10}
                    step={1}
                    value={[downloadOptions.multiplier]}
                    onValueChange={(value) =>
                      updateDownloadOption("multiplier", value[0])
                    }
                  />
                  <InputGroup className="w-24">
                    <InputGroupInput
                      type="number"
                      min={1}
                      max={10}
                      value={downloadOptions.multiplier}
                      onBlur={(e) => {
                        const value = Number(e.target.value);
                        // If empty, NaN, or out of range, restore to current valid value
                        if (
                          !e.target.value ||
                          Number.isNaN(value) ||
                          value < 1 ||
                          value > 10
                        ) {
                          e.target.value = String(downloadOptions.multiplier);
                        } else {
                          updateDownloadOption("multiplier", value);
                        }
                      }}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        // Only update if valid
                        if (
                          e.target.value &&
                          !Number.isNaN(value) &&
                          value >= 1 &&
                          value <= 10
                        ) {
                          updateDownloadOption("multiplier", value);
                        }
                      }}
                      className="text-sm font-bold text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupText>x</InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                </div>
                <p className="text-xs italic pt-2 text-gray-500">
                  {(() => {
                    const output = getFrameDimensions(
                      getCurrentSize().width * downloadOptions.multiplier,
                      themeState.styles.frame,
                    );
                    return `${Math.round(output.width)} x ${Math.round(output.height)} px`;
                  })()}
                </p>
              </div>

              {/* Transparency toggle */}
              <div className="flex items-center space-x-3 py-2">
                <div className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    id="transparent-bg"
                    aria-label="Transparent Background"
                    className="h-5 w-5 rounded border-gray-700 bg-gray-800  accent-primary text-[#10b981] focus:ring-[#10b981]"
                    checked={downloadOptions.transparent}
                    onChange={(e) =>
                      updateDownloadOption("transparent", e.target.checked)
                    }
                  />
                </div>
                <Label
                  htmlFor="transparent-bg"
                  className="text-sm font-medium cursor-pointer"
                >
                  Transparent Background
                </Label>
              </div>

              {downloadOptions.format === "jpg" &&
                downloadOptions.transparent && (
                  <p className="text-[10px] text-amber-500 mt-1 italic">
                    Note: JPG format does not support transparency. Background
                    will be solid.
                  </p>
                )}

              {/* Custom Size Inputs */}
              {downloadOptions.sizePreset === "custom" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="custom-width">Width (px)</Label>
                    <Input
                      id="custom-width"
                      type="number"
                      min="50"
                      max="5000"
                      value={downloadOptions.width}
                      onChange={(e) =>
                        updateDownloadOption("width", Number(e.target.value))
                      }
                      placeholder="600"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="custom-height">Height (px)</Label>
                    <Input
                      id="custom-height"
                      type="number"
                      min="50"
                      max="5000"
                      value={downloadOptions.height}
                      onChange={(e) =>
                        updateDownloadOption("height", Number(e.target.value))
                      }
                      placeholder="600"
                    />
                  </div>
                </div>
              )}

              {/* Error Message */}
              {sizeError && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">
                  {sizeError}
                </div>
              )}

              {/* Download Button */}
              <Button
                variant="default"
                onClick={handleDownload}
                disabled={isDownloading || !!sizeError}
                className="w-full"
              >
                <Icons.DownloadIcon className="h-4 w-4" />
                {isDownloading
                  ? "Downloading..."
                  : `Download ${downloadOptions.format.toUpperCase()}`}
              </Button>
            </div>
          </TabsContent>
          <TabsContent value="print">
            <PrintOptions
              bleed={printBleed}
              colorMode={colorMode}
              cropMarks={cropMarks}
              isDownloading={isDownloading}
              layout={printLayout.layout}
              layoutError={printLayout.error}
              onBleedChange={setPrintBleed}
              onColorModeChange={setColorMode}
              onCropMarksChange={setCropMarks}
              onDownload={handlePrintDownload}
              onSizeChange={setPrintSize}
              onUnitChange={(unit) => {
                setPrintUnit(unit);
                setPrintSize(unit === "in" ? 1.5 : 40);
              }}
              size={printSize}
              unit={printUnit}
            />
          </TabsContent>
        </Tabs>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

interface PrintOptionsProps {
  size: number;
  unit: PrintUnit;
  bleed: number;
  cropMarks: boolean;
  colorMode: PrintColorMode;
  layout: PrintLayout | null;
  layoutError: string;
  isDownloading: boolean;
  onSizeChange: (size: number) => void;
  onUnitChange: (unit: PrintUnit) => void;
  onBleedChange: (bleed: number) => void;
  onCropMarksChange: (cropMarks: boolean) => void;
  onColorModeChange: (colorMode: PrintColorMode) => void;
  onDownload: (format: "pdf" | "svg") => void;
}

function PrintOptions({
  size,
  unit,
  bleed,
  cropMarks,
  colorMode,
  layout,
  layoutError,
  isDownloading,
  onSizeChange,
  onUnitChange,
  onBleedChange,
  onCropMarksChange,
  onColorModeChange,
  onDownload,
}: PrintOptionsProps) {
  const limits = PRINT_SIZE_LIMITS[unit];

  return (
    <div className="space-y-4 py-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="print-size">Code width</Label>
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
        <div className="space-y-2">
          <Label htmlFor="print-unit">Unit</Label>
          <Select
            onValueChange={(next) => onUnitChange(next as PrintUnit)}
            value={unit}
          >
            <SelectTrigger className="w-full" id="print-unit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-100 w-full">
              <SelectItem value="mm">Millimetres</SelectItem>
              <SelectItem value="in">Inches</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="print-bleed">Bleed</Label>
          <Select
            onValueChange={(next) => onBleedChange(Number(next))}
            value={String(bleed)}
          >
            <SelectTrigger className="w-full" id="print-bleed">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-100 w-full">
              <SelectItem value="0">None</SelectItem>
              <SelectItem value="3">3 mm</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="print-color-mode">Color mode</Label>
          <Select
            onValueChange={(next) => onColorModeChange(next as PrintColorMode)}
            value={colorMode}
          >
            <SelectTrigger className="w-full" id="print-color-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-100 w-full">
              <SelectItem value="rgb">RGB</SelectItem>
              <SelectItem value="cmyk">CMYK</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Label className="cursor-pointer" htmlFor="print-crop-marks">
          Crop marks
        </Label>
        <Switch
          checked={cropMarks}
          id="print-crop-marks"
          onCheckedChange={onCropMarksChange}
        />
      </div>

      {layout ? (
        <div className="bg-muted/50 space-y-1.5 rounded-md p-3 text-xs">
          <p>
            Finished size {formatLength(layout.trimWidth, unit)} ×{" "}
            {formatLength(layout.trimHeight, unit)}
            {layout.pageWidth !== layout.trimWidth &&
              ` (page ${formatLength(layout.pageWidth, unit)} × ${formatLength(layout.pageHeight, unit)})`}
          </p>
          <p className="text-muted-foreground">
            Scans from up to about{" "}
            {formatDistance(layout.maxScanDistance, unit)} away. Rule of thumb:
            code width ≈ scan distance ÷ 10 (2 cm wide at 20 cm).
          </p>
          {layout.codeWidth < 20 && (
            <p className="text-amber-600 dark:text-amber-400">
              Under 2 cm is hard for phones to scan; go bigger if you can.
            </p>
          )}
          {layout.moduleSize < MIN_PRINT_MODULE_MM && (
            <p className="text-amber-600 dark:text-amber-400">
              Each dot is only {Math.round(layout.moduleSize * 100) / 100} mm
              and may smear in print. Make the code bigger or shorten its
              content.
            </p>
          )}
          {colorMode === "cmyk" && (
            <p className="text-muted-foreground">
              CMYK uses a simple conversion without a color profile; ask your
              printer if exact brand colors matter.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">
          {layoutError}
        </div>
      )}

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Button
          disabled={isDownloading || !layout}
          onClick={() => onDownload("pdf")}
        >
          <Icons.DownloadIcon className="h-4 w-4" />
          {isDownloading ? "Preparing..." : "Download print PDF"}
        </Button>
        <Button
          disabled={isDownloading || !layout}
          onClick={() => onDownload("svg")}
          variant="outline"
        >
          Print SVG
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        The PDF draws every dot as a vector shape (logos stay images). Gradients
        print as their first color; Print SVG keeps them and uses RGB.
      </p>
    </div>
  );
}
