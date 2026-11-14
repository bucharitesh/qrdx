"use client";

import { downloadQRCode } from "qrdx";

const menuCode = {
  value: "https://example.com/menu",
  margin: 4,
  fgColor: "#1d4ed8",
  bodyPattern: "rounded",
  frame: { style: "banner-bottom", text: "Scan for the menu" },
} as const;

export function DownloadSvgButton() {
  return (
    <button
      type="button"
      onClick={() =>
        downloadQRCode(menuCode, {
          format: "svg",
          size: { width: 1024, height: 1024 },
          filename: "menu.svg",
        })
      }
    >
      Download SVG
    </button>
  );
}
