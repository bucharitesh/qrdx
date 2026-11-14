"use client";

import { track } from "@repo/analytics";
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
  Global,
  type Icon,
  Image,
  Import,
  InfoCircle,
  Printer,
  TableDocument,
} from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import {
  type DownloadSize,
  downloadPrintEPS,
  downloadPrintPDF,
  downloadPrintSVG,
  downloadQRCode,
  EPS_IMAGE_FILL_REASON,
  getDownloadFilename,
  getFrameDimensions,
  getPrintLayout,
  getQRData,
  getQRModuleCount,
  getSVGString,
  hasImageFill,
  PRESET_SIZES,
  type PrintColorMode,
  type PrintLayout,
  type PrintUnit,
  QRCodeSVG,
  validateSize,
} from "qrdx";
import type { QRArt } from "qrdx/types";
import React from "react";
import { AIArtDownloadDialog } from "@/components/editor/art/ai-art-download";
import { useShownArt } from "@/components/editor/art/art-canvas";
import { DialogCloseButton } from "@/components/editor/dialog-close-button";
import { emitSound } from "@/components/editor/sound";
import { InfoHint } from "@/components/help/info-hint";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { DEFAULT_QR_LOGO } from "@/lib/constants";
import {
  fromMillimeters,
  MIN_MODULE_MM,
  moduleForPrintWidth,
  PRINT_SIZE_LIMITS,
  printTabForDistance,
  printWidthForScanDistance,
  scanDistanceForModule,
  scanDistanceForPrintWidth,
  scanDistanceUnit,
} from "@/lib/print-size";
import { styleEngineOptions } from "@/lib/qr-design/engine-options";
import { useQREditorStore } from "@/store/editor-store";
import { usePreferencesStore } from "@/store/preferences-store";
import type { DownloadOptions as DownloadOptionsType } from "@/types/theme";
import { useDownloadDialogStore } from "./download-dialog-store";
import { BULK_FROM_EDITOR_HREF } from "./more-menu";

interface DownloadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatLength(mm: number, unit: PrintUnit): string {
  return unit === "in"
    ? `${Math.round((mm / 25.4) * 100) / 100} in`
    : `${Math.round(mm * 10) / 10} mm`;
}

function roundTo(
  value: number,
  decimals: number,
  round: (value: number) => number = Math.round,
): number {
  const factor = 10 ** decimals;
  return round(value * factor) / factor;
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
  Icon: Icon;
  vector?: boolean;
}[] = [
  // What each is best for: editor.actionBar.downloadDialog.formatHints.
  { id: "png", label: "PNG", Icon: Gallery },
  { id: "jpg", label: "JPG", Icon: Image },
  {
    id: "webp",
    label: "WebP",
    Icon: Global,
  },
  {
    id: "svg",
    label: "SVG",
    Icon: Bezier,
    vector: true,
  },
  {
    id: "pdf",
    label: "PDF",
    // A PNG on a PDF page (packages/qrdx download.tsx), so not vector: the
    // Print-ready tab makes the vector PDF (see its hint).
    Icon: DocumentText,
  },
  {
    id: "eps",
    label: "EPS",
    Icon: Printer,
    vector: true,
  },
];

// Names in messages/en.json: editor.actionBar.downloadDialog.sizePresets.
const SIZE_PRESETS = [
  { id: "small" },
  { id: "medium" },
  { id: "large" },
  { id: "xlarge" },
  { id: "3xl" },
] as const satisfies readonly { id: Exclude<SizePreset, "custom"> }[];

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
  const t = useTranslations("editor.actionBar.downloadDialog");
  const { value, themeState } = useQREditorStore();
  // An AI art result over the preview is an image: PNG and Print PNG only.
  const shownArt = useShownArt();
  const { downloadOptions, updateDownloadOption } = usePreferencesStore();
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [svgCopied, setSvgCopied] = React.useState(false);
  const [tab, setTab] = React.useState<"image" | "print">("image");
  const [printUnit, setPrintUnit] = React.useState<PrintUnit>("mm");
  const [printSize, setPrintSize] = React.useState(40);
  const [printBleed, setPrintBleed] = React.useState(0);
  const [cropMarks, setCropMarks] = React.useState(false);
  const [colorMode, setColorMode] = React.useState<PrintColorMode>("rgb");

  // What the "Scanned from about" field shows while it differs from the
  // width's own distance: someone typing, or a link's printDistance.
  const [distanceDraft, setDistanceDraft] = React.useState<string | null>(null);
  // The code can change while the dialog is closed; reopened, the field
  // follows the width again.
  React.useEffect(() => {
    if (!open) setDistanceDraft(null);
  }, [open]);

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
        // Logo clear space and position are in modules
        level: themeState.styles.level,
        margin: themeState.styles.margin,
        ...styleEngineOptions(themeState.styles),
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
  // EPS can't carry an image fill (see EPS_IMAGE_FILL_REASON)
  const epsBlocked = hasImageFill(printProps);
  React.useEffect(() => {
    if (epsBlocked && format === "eps") updateDownloadOption("format", "pdf");
  }, [epsBlocked, format, updateDownloadOption]);
  // Modules across the print, quiet zone included (what getPrintLayout
  // divides the width into): the scan distance rule works per module.
  const printModuleCount = React.useMemo(() => {
    try {
      return getQRModuleCount(printProps);
    } catch {
      return null;
    }
  }, [printProps]);

  // A playground link asks for a tab once: a width (print=40mm), or a scan
  // distance (printDistance=1m) sized for this code's modules.
  const request = useDownloadDialogStore((state) => state.request);
  const setRequest = useDownloadDialogStore((state) => state.setRequest);
  React.useEffect(() => {
    if (!(open && request)) return;
    setTab(request.tab);
    if (request.printDistance && printModuleCount) {
      const print = printTabForDistance(
        request.printDistance,
        printModuleCount,
      );
      setPrintUnit(print.unit);
      setPrintSize(print.size);
      setDistanceDraft(String(roundTo(print.fieldDistance, 2)));
    } else if (request.print) {
      setPrintUnit(request.print.unit);
      setPrintSize(request.print.size);
      setDistanceDraft(null);
    }
    setRequest(null);
  }, [open, request, setRequest, printModuleCount]);

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
  // The pixel size of the file saved (a frame adds to the code), or none
  // for SVG and EPS; the same name downloadQRCode saves under.
  const filename =
    downloadOptions.filename ||
    getDownloadFilename(format, exportSize, themeState.styles.frame);

  const handleDownload = async () => {
    if (sizeError) return;
    setIsDownloading(true);
    try {
      await downloadQRCode(qrProps, {
        format,
        size: exportSize,
        filename,
      });
      emitSound("download");
      track("qr_downloaded", {
        format,
        source: "playground",
        content_type: useQREditorStore.getState().contentType,
      });
      toast.success(t("downloadedFilename", { filename }));
      onOpenChange(false);
    } catch (error) {
      console.error("Error downloading QR code:", error);
      toast.error(
        error instanceof Error ? error.message : t("failedToDownloadQrCode"),
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
      toast.success(t("downloadedPrintfilename", { printFilename }));
      onOpenChange(false);
    } catch (error) {
      console.error("Error creating print file:", error);
      toast.error(
        error instanceof Error ? error.message : t("failedToCreatePrintFile"),
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
      toast.error(t("couldntCopyTheSvg"));
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
            {t("addContentToSeeYour")}
          </p>
        )}
      </div>
      <dl className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        {tab === "image" ? (
          <>
            <dt>{t("format")}</dt>
            <dd className="text-foreground text-right">
              {formatInfo?.label}
              {formatInfo?.vector ? t("vector") : ""}
            </dd>
            <dt>{t("pixels")}</dt>
            <dd className="text-foreground text-right tabular-nums">
              {outputWidth} × {outputHeight}
            </dd>
            <dt>{t("at300Dpi")}</dt>
            <dd className="text-foreground text-right tabular-nums">
              {formatInfo?.vector ? t("anySize") : physicalSize(outputWidth)}
            </dd>
          </>
        ) : (
          <>
            <dt>{t("width")}</dt>
            <dd className="text-foreground text-right tabular-nums">
              {printSize} {printUnit}
            </dd>
            <dt>{t("color")}</dt>
            <dd className="text-foreground text-right uppercase">
              {colorMode}
            </dd>
            <dt>{t("bleed")}</dt>
            <dd className="text-foreground text-right">
              {printBleed ? t("printbleedMm", { printBleed }) : t("none")}
            </dd>
          </>
        )}
      </dl>
    </div>
  );

  const sectionLabel = "text-muted-foreground mb-2.5 block text-xs font-medium";

  if (shownArt.result && shownArt.variant) {
    return (
      <AIArtDownloadDialog
        onOpenChange={onOpenChange}
        open={open}
        result={shownArt.result}
        variant={shownArt.variant}
      />
    );
  }

  return (
    <ResponsiveDialog onOpenChange={onOpenChange} open={open}>
      <ResponsiveDialogContent className="max-h-[92dvh] gap-0 overflow-hidden p-0 sm:max-w-[46rem] dark:!border-border">
        <div className="flex max-h-[inherit] min-h-0 flex-col">
          <ResponsiveDialogHeader className="flex-row items-start gap-3 px-6 pt-1 pb-0 text-left sm:pt-6">
            <div className="min-w-0 flex-1 space-y-1">
              <ResponsiveDialogTitle>
                {t("downloadQrCode")}
              </ResponsiveDialogTitle>
              <ResponsiveDialogDescription>
                {tab === "print"
                  ? t("vectorPdfOrEpsAt")
                  : t("pickAFormatAndSize")}
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
                  {t("imageFile")}
                </TabsTrigger>
                <TabsTrigger value="print">
                  <Printer className="size-4" />
                  {t("printReady")}
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto px-6 py-6 sm:grid-cols-[12.5rem_1fr]">
              {preview}

              <TabsContent className="mt-0 min-w-0 space-y-6" value="image">
                <section>
                  <span className={sectionLabel}>
                    <span id="dl-format">{t("format")}</span>{" "}
                    <InfoHint align="start" id="download-formats" />
                  </span>
                  <ToggleGroup
                    aria-labelledby="dl-format"
                    className="grid w-full grid-cols-6"
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
                        disabled={item.id === "eps" && epsBlocked}
                        key={item.id}
                        title={
                          item.id === "eps" && epsBlocked
                            ? EPS_IMAGE_FILL_REASON
                            : undefined
                        }
                        value={item.id}
                      >
                        <item.Icon className="size-4" />
                        {item.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <p className="text-muted-foreground mt-2 text-xs text-pretty">
                    {t(`formatHints.${formatInfo?.id ?? "png"}`)}
                  </p>
                  {epsBlocked && (
                    <p className="text-muted-foreground mt-1 text-xs text-pretty">
                      {EPS_IMAGE_FILL_REASON}
                    </p>
                  )}
                </section>

                <section>
                  <span className={sectionLabel} id="dl-size">
                    {t("size")}
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
                          {t(`sizePresets.${preset.id}`)}
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
                      <span className="text-xs font-medium">{t("custom")}</span>
                      <span className="text-muted-foreground text-[11px]">
                        {t("px")}
                      </span>
                    </ToggleGroupItem>
                  </ToggleGroup>
                  {downloadOptions.sizePreset === "custom" && (
                    <div className="mt-2.5 flex items-center gap-2">
                      <Label className="text-xs" htmlFor="custom-size">
                        {t("widthAndHeight")}
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
                          <InputGroupText>{t("px")}</InputGroupText>
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
                      {t("scale")}
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
                        canBeTransparent ? undefined : t("jpgCantBeTransparent")
                      }
                    >
                      {t("transparentBackground")}
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
                  moduleCount={printModuleCount}
                  distanceDraft={distanceDraft}
                  onDistanceDraftChange={setDistanceDraft}
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
                    {svgCopied ? t("svgCopied") : t("copySvg")}
                  </Button>
                  <Button
                    className="min-w-0 sm:flex-1"
                    disabled={isDownloading || !!sizeError || !value}
                    onClick={handleDownload}
                  >
                    {isDownloading ? <Spinner /> : <Import />}
                    <span className="truncate">
                      {isDownloading
                        ? t("preparing")
                        : t("downloadFilename", { filename })}
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
                      disabled={
                        isDownloading || !printLayout.layout || epsBlocked
                      }
                      onClick={() => handlePrintDownload("eps")}
                      title={epsBlocked ? EPS_IMAGE_FILL_REASON : undefined}
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
                        ? t("preparing")
                        : t("downloadQrCodePrintPrintsize", {
                            printSize,
                            printUnit,
                          })}
                    </span>
                  </Button>
                </>
              )}
            </div>
            <div className="border-t px-6 py-3">
              <Link
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs underline-offset-4 transition-colors hover:underline"
                href={BULK_FROM_EDITOR_HREF}
                onNavigate={() => onOpenChange(false)}
              >
                <TableDocument className="size-3.5 shrink-0" />
                {t("makeManyFromACsv")}
              </Link>
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
  /** Modules across the code, quiet zone included; null when it can't be encoded. */
  moduleCount: number | null;
  /** The distance field's text while it differs from the width's distance */
  distanceDraft: string | null;
  onDistanceDraftChange: (draft: string | null) => void;
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
  moduleCount,
  distanceDraft,
  onDistanceDraftChange: setDistanceDraft,
  onSizeChange,
  onUnitChange,
  onBleedChange,
  onCropMarksChange,
  onColorModeChange,
}: PrintOptionsProps) {
  const t = useTranslations("editor.actionBar.downloadDialog");
  const limits = PRINT_SIZE_LIMITS[unit];
  const label = "text-muted-foreground mb-2.5 block text-xs font-medium";

  // "Scanned from about": the readout below, run backwards, per module
  // (lib/print-size.ts, the same rule as /tools/print-size). While someone
  // types, their text stays as typed; otherwise it follows the width, and
  // stays empty when the modules are too small to promise a distance.
  const distanceUnit = scanDistanceUnit(unit);
  const widthDistance =
    moduleCount && Number.isFinite(size) && size > 0
      ? scanDistanceForPrintWidth(size, unit, moduleCount, distanceUnit)
      : null;
  const shownDistance =
    distanceDraft ??
    (widthDistance === null ? "" : String(roundTo(widthDistance, 2)));
  // The nearest distance is the smallest printable module (or the smallest
  // width, when that's bigger); the farthest is the largest width.
  const distanceMin = moduleCount
    ? roundTo(
        fromMillimeters(
          scanDistanceForModule(
            Math.max(
              moduleForPrintWidth(limits.min, unit, moduleCount),
              MIN_MODULE_MM,
            ),
          ),
          distanceUnit,
        ),
        2,
        Math.ceil,
      )
    : null;
  const distanceMax = moduleCount
    ? roundTo(
        fromMillimeters(
          scanDistanceForModule(
            moduleForPrintWidth(limits.max, unit, moduleCount),
          ),
          distanceUnit,
        ),
        2,
        Math.floor,
      )
    : null;
  const outOfRange =
    Number.isFinite(size) && (size < limits.min || size > limits.max);

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 items-end gap-2">
        <div>
          <Label className={label} htmlFor="print-distance">
            {t("scannedFromAbout")}
          </Label>
          <InputGroup>
            <InputGroupInput
              disabled={!moduleCount}
              id="print-distance"
              inputMode="decimal"
              max={distanceMax ?? undefined}
              min={distanceMin ?? undefined}
              onBlur={() => setDistanceDraft(null)}
              onChange={(event) => {
                const text = event.target.value;
                setDistanceDraft(text);
                const distance = Number(text);
                if (
                  moduleCount &&
                  text.trim() &&
                  Number.isFinite(distance) &&
                  distance > 0
                ) {
                  onSizeChange(
                    printWidthForScanDistance(
                      distance,
                      distanceUnit,
                      unit,
                      moduleCount,
                    ),
                  );
                }
              }}
              step={0.1}
              type="number"
              value={shownDistance}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText>{distanceUnit}</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
        </div>
        <p className="text-muted-foreground pb-3 text-xs">
          {t("setsTheCodeWidthBelow")}
        </p>
      </section>

      <section className="grid grid-cols-2 gap-2">
        <div>
          <Label className={label} htmlFor="print-size">
            {t("codeWidth")}
          </Label>
          <InputGroup>
            <InputGroupInput
              id="print-size"
              max={limits.max}
              min={limits.min}
              onChange={(event) => {
                setDistanceDraft(null);
                onSizeChange(Number(event.target.value));
              }}
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
            {t("unit")}
          </span>
          <ToggleGroup
            aria-labelledby="print-unit"
            className="grid w-full grid-cols-2"
            onValueChange={(next) => {
              if (!next) return;
              setDistanceDraft(null);
              onUnitChange(next as PrintUnit);
            }}
            type="single"
            value={unit}
            variant="outline"
          >
            <ToggleGroupItem className="text-xs" value="mm">
              {t("mm")}
            </ToggleGroupItem>
            <ToggleGroupItem className="text-xs" value="in">
              {t("inches")}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2">
        <div>
          <span className={label} id="print-color-mode">
            {t("colorMode")}
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
            <span id="print-bleed">{t("bleed")}</span>{" "}
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
              {t("none")}
            </ToggleGroupItem>
            <ToggleGroupItem className="text-xs" value="3">
              {t("n3Mm")}
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
          {t("cropMarksPdf")}
        </Label>
      </section>

      {layout ? (
        <section className="text-muted-foreground space-y-1.5 text-xs">
          <p className="text-foreground">
            {layout.pageWidth === layout.trimWidth
              ? t("finishedSize", {
                  width: formatLength(layout.trimWidth, unit),
                  height: formatLength(layout.trimHeight, unit),
                })
              : t("finishedSizeOnPage", {
                  width: formatLength(layout.trimWidth, unit),
                  height: formatLength(layout.trimHeight, unit),
                  pageWidth: formatLength(layout.pageWidth, unit),
                  pageHeight: formatLength(layout.pageHeight, unit),
                })}
          </p>
          {layout.moduleSize >= MIN_MODULE_MM - 1e-9 && (
            <p>
              {t("scansFromUpToAbout", {
                value: formatDistance(
                  scanDistanceForModule(layout.moduleSize),
                  unit,
                ),
              })}
            </p>
          )}
          {layout.codeWidth < 20 && (
            <p className="text-amber-700 dark:text-amber-400">
              {t("under2CmIsHard")}
            </p>
          )}
          {layout.moduleSize < MIN_MODULE_MM - 1e-9 && (
            <p className="text-amber-700 dark:text-amber-400">
              {t("eachDotIsOnlyValue", {
                value: Math.round(layout.moduleSize * 100) / 100,
              })}
            </p>
          )}
          {colorMode === "cmyk" && <p>{t("cmykUsesASimpleConversion")}</p>}
          <p>{t("pdfAndEpsDrawEvery")}</p>
        </section>
      ) : (
        <p className="text-destructive flex items-center gap-1.5 text-sm">
          <InfoCircle className="size-4 shrink-0" />
          {outOfRange
            ? distanceMin !== null && distanceMax !== null
              ? t("enterMinMaxUnitOr", {
                  min: limits.min,
                  max: limits.max,
                  unit,
                  distanceMin,
                  distanceMax,
                  distanceUnit,
                })
              : t("enterMinMaxUnit", { min: limits.min, max: limits.max, unit })
            : layoutError}
        </p>
      )}
    </div>
  );
}
