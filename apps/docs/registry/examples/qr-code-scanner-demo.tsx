"use client";

import { useState } from "react";
import { QrCode } from "@/registry/qrdx/qr-code";
import { QrCodeScanner } from "@/registry/qrdx/qr-code-scanner";

export default function QrCodeScannerDemo() {
  const [scans, setScans] = useState(0);

  return (
    <div className="flex w-full flex-col items-center gap-8 sm:flex-row sm:items-start sm:justify-center">
      <QrCode
        caption="Download this sample, then drop it in"
        downloadFormats={["png"]}
        filename="qrdx-sample"
        size={120}
        value="https://qrdx.dev/docs/components/qr-code-scanner"
      />
      <div className="flex w-full max-w-sm flex-col gap-2">
        <QrCodeScanner onResult={() => setScans((count) => count + 1)} />
        <p className="text-muted-foreground text-xs">Codes found: {scans}</p>
      </div>
    </div>
  );
}
