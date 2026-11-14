"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/design-system/components/ui/tooltip";
import { AsciiQr } from "@/components/fx/ascii-qr";
import { EGG_QR } from "@/components/fx/qr-matrix";

/**
 * The scannable "404" code on the not-found page. A client component on
 * purpose: when a server component passes the trigger's child, `next dev`
 * sends it as a lazy reference, and the Slot inside @radix-ui/react-tooltip
 * (react-slot 1.2.3) renders nothing for it, so hydration failed and the
 * code disappeared. Built here, the child is a plain element.
 */
export function NotFoundCode() {
  return (
    <Tooltip delayDuration={500}>
      <TooltipTrigger asChild>
        <div className="relative rounded-[28px] bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_30px_60px_-30px_rgba(0,0,0,0.35)] ring-1 ring-black/5">
          <AsciiQr code={EGG_QR.lost} knockout={[11, 5]} cell={9} />
          <span className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="font-mono text-3xl font-semibold tracking-tight text-neutral-950">
              404
            </span>
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">Go on, scan it</TooltipContent>
    </Tooltip>
  );
}
