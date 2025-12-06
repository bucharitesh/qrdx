"use client";

import { QrCode as QrCodeIcon, Sparkles } from "lucide-react";
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

  // Check if value is empty or invalid
  const hasValidContent = value && value.trim().length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Preview Content */}
      <div className="relative flex size-full items-center justify-center overflow-hidden p-4 pt-1">
        <div className="relative isolate flex size-full items-center justify-center overflow-hidden rounded-lg p-8">
          {!hasValidContent ? (
            // Empty State
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.4,
                ease: [0.4, 0, 0.2, 1],
              }}
              className="flex max-w-md flex-col items-center justify-center gap-4 text-center"
            >
              <div className="relative">
                <div className="bg-muted/50 flex size-24 items-center justify-center rounded-2xl">
                  <QrCodeIcon
                    className="text-muted-foreground size-12"
                    strokeWidth={1.5}
                  />
                </div>
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{
                    duration: 0.5,
                    delay: 0.2,
                    ease: [0.4, 0, 0.2, 1],
                  }}
                  className="absolute -right-2 -top-2"
                >
                  <div className="bg-primary/10 flex size-10 items-center justify-center rounded-full">
                    <Sparkles className="text-primary size-5" />
                  </div>
                </motion.div>
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-semibold">
                  Fill in the content to generate your QR code
                </h3>
                <p className="text-muted-foreground text-sm">
                  Select a content type and enter the required information to
                  see your QR code preview
                </p>
              </div>
            </motion.div>
          ) : (
            // QR Code Preview
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
          )}
        </div>
      </div>
    </div>
  );
};

export default QRPreviewPanel;
