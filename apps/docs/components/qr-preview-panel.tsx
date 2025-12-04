"use client";

import React from "react";
import type { QRStyle } from "@/types/qr";
import { QRCode } from "qrdx";
import { ScrollArea } from "@repo/design-system/components/ui/scroll-area";
import { useQREditorStore } from "@/store/editor-store";
import { DownloadOptions } from "@/components/playground/download-options";
import { ActionBar } from "@/components/editor/action-bar";

interface QRPreviewPanelProps {
  style: Partial<QRStyle>;
}

const QRPreviewPanel: React.FC<QRPreviewPanelProps> = ({ style }) => {
  const { value } = useQREditorStore();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Action Bar */}
      <ActionBar />

      {/* Preview Content */}
      <div className="relative size-full overflow-hidden p-4 pt-1">
        <div className="relative isolate size-full overflow-hidden rounded-lg border">
          <ScrollArea className="size-full">
            <div className="flex min-h-full flex-col items-center justify-center gap-8 p-8">
              {/* QR Code Preview */}
              <div className="flex flex-col items-center gap-6">
                <div className="rounded-xl bg-card p-8 shadow-sm">
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
                    scale={2}
                    templateId={style.templateId}
                    value={value}
                  />
                </div>
                
                {/* URL Display */}
                <div className="w-full max-w-md space-y-2">
                  <p className="text-muted-foreground text-center text-xs font-medium">
                    Content
                  </p>
                  <p className="break-all rounded-md bg-muted px-4 py-2 text-center font-mono text-sm">
                    {value || "No content"}
                  </p>
                </div>
              </div>

              {/* Download Options */}
              <div className="w-full max-w-md">
                <DownloadOptions />
              </div>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
};

export default QRPreviewPanel;
