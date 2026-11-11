"use client";

import { cn } from "@repo/design-system/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { getFrameDimensions, isFrameActive } from "qrdx";
import type React from "react";
import { lazy, useRef } from "react";
import { DEFAULT_QR_LOGO } from "@/lib/constants";
import { styleEngineOptions } from "@/lib/qr-design/engine-options";
import { useQREditorStore } from "@/store/editor-store";
import type { QRStyle } from "@/types/theme";
import { ArtCanvas, useShownArt } from "./editor/art/art-canvas";
import { FrameTextOverlay } from "./editor/frame-inline/frame-text-overlay";
import { usePhotoScanDialogStore } from "./editor/photo-scan-dialog-store";
import { ScanScoreBadge } from "./editor/scan-score";
import ExamplesPreviewContainer from "./editor/theme-preview/examples-preview-container";

interface QRPreviewPanelProps {
  style: Partial<QRStyle>;
}

const QRCode = lazy(() =>
  import("@/lib/qrdx-lazy/qr-code").then((module) => ({
    default: module.QRCode,
  })),
);

/**
 * What the preview encodes until there's content: our own site, so the
 * sample scans to something real. It is shown faded and labelled, and it
 * never reaches a download (Download, Copy SVG and the dialog read the store's
 * value, which stays empty).
 */
export const SAMPLE_PREVIEW_VALUE = "https://qrdx.dev";

/** The scan score popover's "Check a photo of the print" (PhotoScanDialog). */
const openPhotoCheck = () => usePhotoScanDialogStore.getState().setOpen(true);

function SampleLabel({ className }: { className?: string }) {
  const t = useTranslations("editor.qrPreviewPanel");
  const contentType = useQREditorStore((state) => state.contentType);
  return (
    <p
      className={cn(
        "bg-background/90 text-muted-foreground flex max-w-[calc(100%-2rem)] items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-xs whitespace-nowrap shadow-xs backdrop-blur-sm",
        className,
      )}
    >
      <span className="bg-muted text-foreground rounded-full px-2 py-0.5 text-[11px] font-medium">
        {t("sample")}
      </span>
      <span className="truncate">
        {contentType === "url"
          ? t("addYourLinkToMake")
          : t("addYourDetailsToMake")}
      </span>
    </p>
  );
}

const QRPreviewPanel: React.FC<QRPreviewPanelProps> = ({ style }) => {
  const storedValue = useQREditorStore((state) => state.value);
  const hasContent = storedValue.trim().length > 0;
  const value = hasContent ? storedValue : SAMPLE_PREVIEW_VALUE;
  const rootRef = useRef<HTMLDivElement>(null);
  const shownArt = useShownArt();

  // Keep a framed code inside the same 512px box as a plain one
  const framed = getFrameDimensions(512, style.frame);
  const previewScale = (4 * 512) / Math.max(framed.width, framed.height);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Preview Content */}
      <div
        className="relative flex size-full items-center justify-center overflow-hidden p-4"
        ref={rootRef}
      >
        {/* Taller top and bottom padding: the seasonal style strip sits over
            the top edge and the scan score badge over the bottom one. */}
        <div className="relative isolate flex size-full items-center justify-center overflow-hidden rounded-lg px-8 py-10 md:py-12">
          <ExamplesPreviewContainer className="size-full">
            <AnimatePresence mode="wait">
              <motion.div
                key={hasContent ? value : "sample"}
                initial={{ filter: "blur(2px)", opacity: 0.4 }}
                animate={{ filter: "blur(0px)", opacity: 1 }}
                exit={{ filter: "blur(2px)", opacity: 0.4 }}
                transition={{ duration: 0.1 }}
                className="relative flex size-full items-center justify-center [container-type:size]"
              >
                {/* Fit the whole code (and frame) in the panel: on phones the
                    editor sheet leaves a short area, and a fixed 512px code
                    was cropped at the bottom. The SVG scales by its viewBox. */}
                <div
                  aria-hidden={hasContent ? undefined : true}
                  className={cn(
                    "flex items-center justify-center transition-opacity [&>svg]:size-full",
                    !hasContent && "opacity-40",
                  )}
                  data-preview-code=""
                  style={{
                    width: "min(100cqw, 100cqh)",
                    height: "min(100cqw, 100cqh)",
                  }}
                >
                  <QRCode
                    art={style.art}
                    bgColor={style.bgColor}
                    cornerEyeDotPattern={style.cornerEyeDotPattern}
                    cornerEyePattern={style.cornerEyePattern}
                    dotColor={style.dotColor}
                    bodyPattern={style.bodyPattern}
                    level={style.level}
                    eyeColor={style.eyeColor}
                    fgColor={style.fgColor}
                    frame={style.frame}
                    frameLabelMarkers
                    hideLogo={!style.showLogo}
                    logo={style.customLogo ?? DEFAULT_QR_LOGO}
                    scale={previewScale}
                    margin={style.margin}
                    templateId={style.templateId}
                    value={value}
                    {...styleEngineOptions(style)}
                  />
                </div>
              </motion.div>
            </AnimatePresence>
          </ExamplesPreviewContainer>
        </div>
        {hasContent ? (
          <ScanScoreBadge
            className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2"
            onCheckPhoto={openPhotoCheck}
            style={style}
            value={value}
          />
        ) : (
          <SampleLabel className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2" />
        )}
        {/* Frame text is edited where it's drawn (frame-inline/). */}
        {isFrameActive(style.frame) && (
          <FrameTextOverlay
            disabled={shownArt.visible}
            frame={style.frame}
            rootRef={rootRef}
          />
        )}
        {/* An AI art result from the Art tab covers the code until Back to code. */}
        <ArtCanvas />
      </div>
    </div>
  );
};

export default QRPreviewPanel;
