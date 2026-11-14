"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { useTranslations } from "next-intl";
import { type AnyQRFrame, DEFAULT_FRAME_TEXT } from "qrdx";
import { useEditableStyle } from "@/components/editor/style-scope";
import { DEFAULT_FRAME_STYLE } from "@/lib/frames/built-in";
import { soundEvent } from "@/lib/sound/emit";
import { withoutShape } from "./frame-shapes";
import { withoutTemplate } from "./frame-templates";

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
 * the default frame (the first built-in one), so the label shows right away.
 */
export function FrameTextPresets() {
  const t = useTranslations("editor.controlSections.frameTextPresets");
  const { style, setStyle } = useEditableStyle();
  const frame: AnyQRFrame = style.frame ?? { style: "none" };
  const current = frame.text ?? DEFAULT_FRAME_TEXT;
  const framed = frame.style !== "none";

  const apply = (text: string) => {
    setStyle({
      // With no frame yet, the label's frame replaces a shaped code or a
      // template (one frame at a time)
      ...(framed ? style : withoutTemplate(withoutShape(style))),
      frame: framed
        ? { ...frame, text }
        : { ...frame, style: DEFAULT_FRAME_STYLE, text },
    });
    soundEvent("tick");
  };

  return (
    <fieldset
      aria-label={t("labelIdeas")}
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
