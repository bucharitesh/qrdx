import React from "react";
import type { QRStyle } from "@/types/qr";

interface QRControlPanelProps {
  style: Partial<QRStyle>;
  onChange: (style: Partial<QRStyle>) => void;
}

const QRControlPanel: React.FC<QRControlPanelProps> = ({ style, onChange }) => {
  return (
    <div className="flex h-full flex-col overflow-auto p-4">
      <h2 className="mb-4 font-semibold text-lg">QR Code Controls</h2>
      {/* Add your control components here */}
      <div className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Control panel for QR code customization
        </p>
      </div>
    </div>
  );
};

export default QRControlPanel;
