"use client";

import { cn } from "@repo/design-system/lib/utils";
import { TickCircle as CircleCheck } from "iconsax-reactjs";
import { useEffect, useState } from "react";
import { buttonClass, mutedTextClass } from "@/components/landing/block-kit";
import { COUPON_REDEEM_EVENT } from "./coupon-schema";

/** Same-origin beacon to the landing events endpoint (custom domains too). */
function sendLandingEvent(body: {
  pageId: string;
  qrCodeId: string | null;
  type: string;
  target: string;
}) {
  const payload = JSON.stringify(body);
  try {
    if (
      navigator.sendBeacon?.(
        "/api/events",
        new Blob([payload], { type: "application/json" }),
      )
    ) {
      return;
    }
  } catch {
    // Fall through to fetch.
  }
  fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {});
}

const formatTime = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
};

/**
 * "Redeem" button: counts a redemption (landing_event) and remembers it on
 * this device. It can't stop the code being used elsewhere.
 */
export function CouponRedeem({
  blockId,
  pageId,
  qrCodeId,
  live,
  unavailable,
}: {
  blockId: string;
  pageId: string | null;
  qrCodeId: string | null;
  /** false in the editor preview: nothing is recorded */
  live: boolean;
  /** Why it can't be redeemed right now ("This coupon has expired") */
  unavailable?: string;
}) {
  const storageKey = `qrdx:coupon:${pageId ?? "preview"}:${blockId}`;
  const [redeemedAt, setRedeemedAt] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!live) return;
    try {
      setRedeemedAt(localStorage.getItem(storageKey));
    } catch {
      // Storage blocked (private mode): the button just shows again.
    }
  }, [live, storageKey]);

  if (redeemedAt) {
    return (
      <output className="flex items-center justify-center gap-2 rounded-(--lp-radius) border border-(--lp-fg)/15 px-4 py-3 text-sm font-medium">
        <CircleCheck
          aria-hidden="true"
          className="size-4 text-(--lp-primary)"
        />
        Redeemed {formatTime(redeemedAt)}
      </output>
    );
  }

  if (unavailable) {
    return (
      <p className={cn(mutedTextClass, "text-center text-sm")}>{unavailable}</p>
    );
  }

  const redeem = () => {
    const now = new Date().toISOString();
    if (live && pageId) {
      sendLandingEvent({
        pageId,
        qrCodeId,
        type: COUPON_REDEEM_EVENT,
        target: blockId,
      });
      try {
        localStorage.setItem(storageKey, now);
      } catch {
        // Not remembered on this device; the redemption still counts.
      }
    }
    setRedeemedAt(now);
    setConfirming(false);
  };

  if (confirming) {
    return (
      <div className="space-y-3">
        <p className="text-center text-sm">
          Show this screen to staff, then tap <strong>Redeem now</strong>.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            className={buttonClass("soft")}
            onClick={() => setConfirming(false)}
            type="button"
          >
            Cancel
          </button>
          <button
            className={buttonClass("filled")}
            onClick={redeem}
            type="button"
          >
            Redeem now
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      className={buttonClass("filled")}
      onClick={() => setConfirming(true)}
      type="button"
    >
      Redeem coupon
    </button>
  );
}
