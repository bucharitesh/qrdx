"use client";

import { QrCode as QrCodeIcon, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { QRCode } from "qrdx";
import type React from "react";
import { useQREditorStore } from "@/store/editor-store";
import type { QRStyle } from "@/types/theme";
import { QrdxLogoAnimation } from "./qrdx-logo-animation";

interface QRPreviewPanelProps {
  style: Partial<QRStyle>;
}

const QRPreviewPanel: React.FC<QRPreviewPanelProps> = ({ style }) => {
  const { value } = useQREditorStore();

  // Check if value is empty or invalid
  const hasValidContent = value && value.trim().length > 0;

  if (!hasValidContent) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="relative flex size-full items-center justify-center overflow-hidden p-4">
          <div className="relative isolate flex size-full items-center justify-center overflow-hidden rounded-lg p-8">
            <div className="flex flex-col items-center justify-center gap-4 text-center">
              <QrdxLogoAnimation size={80} />
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">
                  Fill in the content to generate your QR code
                </h3>
                <p className="text-muted-foreground text-sm">
                  Select a content type and enter the required information to
                  see your QR code preview
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Preview Content */}
      <div className="relative flex size-full items-center justify-center overflow-hidden p-4">
        <div
          className="relative isolate flex size-full items-center justify-center overflow-hidden rounded-lg p-8"
          style={{
            backgroundColor: style.bgColor,
          }}
        >
          <div key={`${value}`} className="flex items-center justify-center">
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default QRPreviewPanel;
