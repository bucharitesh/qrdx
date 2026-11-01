"use client";

import { Tick as Check } from "@repo/design-system/components/icons";
import { Share as Share2 } from "iconsax-reactjs";
import { useState } from "react";
import { buttonClass } from "./block-kit";

/** Native share sheet where available, otherwise copies the page link. */
export function ShareButton({
  title,
  label = "Share",
  blockId,
  shapeClassName,
}: {
  title: string;
  label?: string;
  blockId: string;
  /** buttonShapeClass(theme) */
  shapeClassName?: string;
}) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link", url);
    }
  };

  return (
    <button
      className={buttonClass("outline", shapeClassName)}
      data-lp-block={blockId}
      data-lp-target="share"
      data-qrdx-event="share"
      onClick={share}
      type="button"
    >
      {copied ? (
        <Check aria-hidden="true" className="size-4" />
      ) : (
        <Share2 aria-hidden="true" className="size-4" />
      )}
      <span aria-live="polite">{copied ? "Link copied" : label}</span>
    </button>
  );
}
