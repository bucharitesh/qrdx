"use client";

import { cn } from "@repo/design-system/lib/utils";
import { Scan } from "iconsax-reactjs";
import dynamic from "next/dynamic";
import { useEffect, useId, useRef, useState } from "react";

// The QR encoder loads the first time someone opens a code, not with the page.
const DemoQr = dynamic(() => import("./demo-qr").then((mod) => mod.DemoQr), {
  ssr: false,
  loading: () => <span className="block size-36 rounded-md bg-white" />,
});

/**
 * "Scan" on a template card: shows a QR code that opens the demo on a phone,
 * over the card's preview. Closes on Escape, on a click elsewhere and when
 * focus leaves it.
 */
export function DemoQrButton({ url, name }: { url: string; name: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    // A click or focus anywhere else closes it.
    const onOutside = (event: Event) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("focusin", onOutside);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("focusin", onOutside);
    };
  }, [open]);

  return (
    <div className="contents" ref={rootRef}>
      <button
        aria-controls={open ? panelId : undefined}
        aria-expanded={open}
        aria-label={`Show a QR code that opens the ${name} demo on your phone`}
        className={cn(
          "absolute right-5 bottom-5 z-20 hidden h-8 items-center gap-1.5 rounded-full border bg-background/90 px-3 text-xs font-medium text-foreground shadow-xs backdrop-blur-sm transition-[opacity,background-color] hover:bg-background focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
          // Not on phones (they're already there); on larger screens, quiet
          // until the card is hovered or focused.
          "md:inline-flex md:opacity-0 md:group-focus-within/card:opacity-100 md:group-hover/card:opacity-100",
          open && "md:opacity-100",
        )}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <Scan aria-hidden className="size-3.5" />
        Scan
      </button>
      {open && (
        <div
          className="absolute inset-x-5 bottom-16 z-20 flex flex-col items-center gap-3 rounded-2xl border bg-background/95 p-5 text-center shadow-lg backdrop-blur-sm"
          id={panelId}
          role="dialog"
          aria-label={`QR code for the ${name} demo`}
        >
          <DemoQr className="size-36" value={url} />
          <p className="text-muted-foreground text-xs text-pretty">
            Scan with your phone's camera to open the live demo.
          </p>
        </div>
      )}
    </div>
  );
}
