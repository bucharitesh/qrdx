"use client";

import { ScrollArea } from "@repo/design-system/components/ui/scroll-area";
import { motion } from "motion/react";
import { QRCode } from "qrdx";
import type React from "react";
import { useQREditorStore } from "@/store/editor-store";
import type { QRStyle } from "@/types/qr";

interface QRPreviewPanelProps {
  style: Partial<QRStyle>;
}

const QRPreviewPanel: React.FC<QRPreviewPanelProps> = ({ style }) => {
  const { value } = useQREditorStore();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Preview Content */}
      <div className="relative size-full overflow-hidden p-4 pt-1">
        <div className="relative isolate size-full overflow-hidden rounded-lg">
          <ScrollArea className="size-full">
            <div className="flex min-h-full w-full items-center justify-center p-8">
              {/* QR Code Preview */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  duration: 0.3,
                  ease: [0.4, 0, 0.2, 1],
                }}
                className="flex items-center justify-center"
              >
                <motion.div
                  key={`${value}-${JSON.stringify(style)}`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{
                    duration: 0.4,
                    ease: [0.4, 0, 0.2, 1],
                  }}
                  className="flex items-center justify-center"
                >
                  <QRCode
                    bgColor={style.bgColor}
                    cornerEyeDotPattern={style.cornerEyeDotPattern}
                    cornerEyePattern={style.cornerEyePattern}
                    dotColor={style.dotColor}
                    bodyPattern={style.bodyPattern}
                    level={style.level}
                    eyeColor={style.eyeColor}
                    fgColor={style.fgColor}
                    hideLogo={!style.showLogo}
                    logo={style.customLogo}
                    scale={4}
                    templateId={style.templateId}
                    value={value}
                  />
                </motion.div>
              </motion.div>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
};

export default QRPreviewPanel;
