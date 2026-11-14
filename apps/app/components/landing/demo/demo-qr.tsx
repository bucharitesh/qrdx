"use client";

import { cn } from "@repo/design-system/lib/utils";
import { QRCodeCanvas } from "qrdx";

/**
 * Plain, high-contrast QR code that opens a template demo on a phone. Drawn
 * on a canvas: a gallery of SVG codes would add megabytes of markup.
 */
export function DemoQr({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "block aspect-square rounded-md bg-white p-1.5 ring-1 ring-black/5 [&_canvas]:size-full!",
        className,
      )}
    >
      <QRCodeCanvas
        bgColor="#ffffff"
        fgColor="#0a0a0a"
        level="M"
        margin={0}
        size={160}
        value={value}
      />
    </span>
  );
}
