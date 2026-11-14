"use client";

import { downloadQRCode } from "qrdx";

export function DownloadSvgButton({ value }: { value: string }) {
  return (
    <button
      type="button"
      onClick={() =>
        downloadQRCode(
          { value, level: "Q", margin: 4 },
          {
            format: "svg",
            size: { width: 1024, height: 1024 },
            filename: "qr-code.svg",
          },
        )
      }
    >
      Download SVG
    </button>
  );
}
