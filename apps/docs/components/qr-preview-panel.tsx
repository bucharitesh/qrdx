import React from "react";
import type { QRStyle } from "@/types/qr";
import { QRCode } from "qrdx";
import { useQREditorStore } from "@/store/editor-store";

interface QRPreviewPanelProps {
  style: Partial<QRStyle>;
}

const QRPreviewPanel: React.FC<QRPreviewPanelProps> = ({ style }) => {
  const { value } = useQREditorStore();

  return (
    <div className="flex h-full flex-col items-center justify-center overflow-auto p-4">
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-center font-semibold text-lg">Preview</h2>
        <div className="flex items-center justify-center">
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
      </div>
    </div>
  );
};

export default QRPreviewPanel;
