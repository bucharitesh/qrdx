"use client";

import { CANONICAL_ORIGIN } from "@repo/config";
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
import { PartOverlay } from "./editor/part-inline/part-overlay";
import { usePhotoScanDialogStore } from "./editor/photo-scan-dialog-store";
import { previewEditors } from "./editor/preview-editors";
import { ScanScoreBadge } from "./editor/scan-score";
import ExamplesPreviewContainer from "./editor/theme-preview/examples-preview-container";

interface QRPreviewPanelProps {
  style: Partial<QRStyle>;
  /**
   * No enter animation. The server snapshot (components/editor/editor-snapshot.tsx)
   * never runs one, so it renders the settled look.
   */
  still?: boolean;
  /**
   * The sample as an image file instead of a drawn code, for the server
   * snapshot: an <img> is the page's largest paint, an inline SVG isn't.
   * Only for the default look, which the file shows.
   */
  sampleSrc?: string;
}

const QRCode = lazy(() =>
  import("@/lib/qrdx-lazy/qr-code").then((module) => ({
    default: module.QRCode,
  })),
);

/**
 * What the preview encodes until there's content: our own site. It is shown
 * blurred past scanning, faded and labelled, and it never reaches a download
 * (Download, Copy SVG and the dialog read the store's value, which stays
 * empty).
 */
export const SAMPLE_PREVIEW_VALUE = CANONICAL_ORIGIN;

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

const QRPreviewPanel: React.FC<QRPreviewPanelProps> = ({
  style,
  still,
  sampleSrc,
}) => {
  const storedValue = useQREditorStore((state) => state.value);
  const hasContent = storedValue.trim().length > 0;
  const value = hasContent ? storedValue : SAMPLE_PREVIEW_VALUE;
  const rootRef = useRef<HTMLDivElement>(null);
  const shownArt = useShownArt();
  const editors = previewEditors({
    hasContent,
    frameActive: isFrameActive(style.frame),
  });

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
                initial={still ? false : { filter: "blur(2px)", opacity: 0.4 }}
                animate={{ filter: "blur(0px)", opacity: 1 }}
                exit={{ filter: "blur(2px)", opacity: 0.4 }}
                transition={{ duration: 0.1 }}
                className="relative flex size-full items-center justify-center [container-type:size]"
              >
                {/* Fit the whole code (and frame) in the panel: on phones the
                    editor sheet leaves a short area, and a fixed 512px code
                    was cropped at the bottom. The SVG scales by its viewBox.
                    The sample is blurred so nobody takes it for a real code.
                    The blur scales with the code (cqmin): about 16px on a
                    desktop, where zbar stops reading at 12 to 14px. */}
                <div
                  aria-hidden={hasContent ? undefined : true}
                  className={cn(
                    "flex items-center justify-center transition-[opacity,filter] [&>img]:size-full [&>svg]:size-full",
                    !hasContent && "opacity-40 blur-[2.5cqmin]",
                  )}
                  data-preview-code=""
                  style={{
                    width: "min(100cqw, 100cqh)",
                    height: "min(100cqw, 100cqh)",
                  }}
                >
                  {sampleSrc && !hasContent ? (
                    <img
                      alt=""
                      decoding="async"
                      fetchPriority="high"
                      height={512}
                      src={sampleSrc}
                      width={512}
                    />
                  ) : (
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
                      partMarkers
                      hideLogo={!style.showLogo}
                      logo={style.customLogo ?? DEFAULT_QR_LOGO}
                      scale={previewScale}
                      margin={style.margin}
                      templateId={style.templateId}
                      value={value}
                      {...styleEngineOptions(style)}
                    />
                  )}
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
        {/* The eyes, dots, logo, background and frame are edited where
            they're drawn (part-inline/), under the frame text's buttons,
            and frame text too (frame-inline/). Neither on the blurred
            sample: unmounting keeps an open edit and closes it. */}
        {editors.parts && (
          <PartOverlay
            disabled={shownArt.visible}
            frame={isFrameActive(style.frame)}
            rootRef={rootRef}
          />
        )}
        {editors.frameText && (
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
