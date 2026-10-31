"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { DEFAULT_FRAME_TEXT, type QRFrame } from "qrdx";
import { soundEvent } from "@/lib/sound/emit";
import { useQREditorStore } from "@/store/editor-store";

const CTA_LABELS = [
  "Scan me",
  "Scan for menu",
  "Join Wi-Fi",
  "Leave a review",
  "Follow us",
  "Pay here",
  "Save contact",
  "Download the app",
];

/**
 * Call-to-action labels for the frame. Picking one with no frame yet adds
 * the Banner frame, so the label shows right away.
 */
export function FrameTextPresets() {
  const themeState = useQREditorStore((state) => state.themeState);
  const setThemeState = useQREditorStore((state) => state.setThemeState);
  const style = themeState.styles;
  const frame: QRFrame = style.frame ?? { style: "none" };
  const current = frame.text ?? DEFAULT_FRAME_TEXT;
  const framed = frame.style !== "none";

  const apply = (text: string) => {
    setThemeState({
      ...themeState,
      styles: {
        ...style,
        frame: {
          ...frame,
          style: framed ? frame.style : "banner-bottom",
          text,
        },
      },
    });
    soundEvent("tick");
  };

  return (
    <fieldset
      aria-label="Label ideas"
      className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0"
    >
      {CTA_LABELS.map((label) => {
        const selected = framed && current === label;
        return (
          <Button
            aria-pressed={selected}
            className="h-7 px-2.5 text-xs"
            key={label}
            onClick={() => apply(label)}
            size="sm"
            type="button"
            variant={selected ? "secondary" : "outline"}
          >
            {label}
          </Button>
        );
      })}
    </fieldset>
  );
}
