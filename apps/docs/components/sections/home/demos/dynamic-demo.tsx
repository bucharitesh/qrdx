"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowRight, Lock, Pencil } from "lucide-react";
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
} from "motion/react";
import { QRCode } from "qrdx";
import { useEffect, useRef, useState } from "react";
import { DURATION, EASE } from "@/components/mockups/motion";
import { PhoneFrame } from "@/components/mockups/phone-frame";
import { QrTile } from "./demo-ui";

const DESTINATIONS = [
  { url: "yourcafe.com/menu/summer", tint: "bg-amber-400" },
  { url: "yourcafe.com/menu/autumn", tint: "bg-orange-600" },
  { url: "yourcafe.com/events", tint: "bg-[#155dfc]" },
] as const;

const CYCLE_MS = 3200;

/** A printed dynamic code keeps working while its destination is edited. */
export function DynamicDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [auto, setAuto] = useState(true);
  const destination = DESTINATIONS[index] ?? DESTINATIONS[0];

  useEffect(() => {
    if (!auto || reduce || !inView) return;
    const timer = setInterval(
      () => setIndex((current) => (current + 1) % DESTINATIONS.length),
      CYCLE_MS,
    );
    return () => clearInterval(timer);
  }, [auto, reduce, inView]);

  return (
    <div ref={ref} className="flex h-full flex-col justify-center gap-3">
      <div className="flex items-center justify-center gap-4">
        <div className="flex flex-col items-center gap-2">
          <QrTile label="Printed dynamic QR code" className="w-24">
            <QRCode
              value="https://qrdx.dev/docs/dynamic-qr-codes"
              size={96}
              level="M"
              margin={0}
              hideLogo
              fgColor="#0f172a"
              bodyPattern="rounded"
              cornerEyePattern="rounded"
              cornerEyeDotPattern="rounded"
            />
          </QrTile>
          <span className="text-[11px] text-muted-foreground">
            Printed once
          </span>
        </div>
        <ArrowRight
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
        <PhoneFrame className="w-24 shrink-0">
          <div className="flex h-full flex-col gap-1.5 p-1.5">
            <div className="flex h-4 items-center gap-1 overflow-hidden rounded-full bg-muted px-1.5">
              <Lock
                aria-hidden="true"
                className="size-2 shrink-0 text-muted-foreground"
              />
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={destination.url}
                  initial={reduce ? false : { y: 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={reduce ? undefined : { y: -8, opacity: 0 }}
                  transition={{ duration: DURATION.slow, ease: EASE }}
                  className="truncate text-[7px] leading-none text-foreground"
                >
                  {destination.url}
                </motion.span>
              </AnimatePresence>
            </div>
            <motion.div
              key={destination.tint}
              initial={reduce ? false : { opacity: 0.3 }}
              animate={{ opacity: 1 }}
              transition={{ duration: DURATION.slow, ease: EASE }}
              aria-hidden="true"
              className={cn("h-12 rounded-md", destination.tint)}
            />
            <div aria-hidden="true" className="flex flex-col gap-1">
              <span className="h-1.5 w-4/5 rounded-full bg-muted" />
              <span className="h-1.5 w-3/5 rounded-full bg-muted" />
              <span className="h-1.5 w-2/3 rounded-full bg-muted" />
            </div>
          </div>
        </PhoneFrame>
      </div>
      <p
        className="text-center text-xs text-muted-foreground"
        aria-live="polite"
      >
        Now opens:{" "}
        <span className="font-medium text-foreground">{destination.url}</span>
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mx-auto"
        onClick={() => {
          setAuto(false);
          setIndex((current) => (current + 1) % DESTINATIONS.length);
        }}
      >
        <Pencil className="size-3.5" />
        Change destination
      </Button>
    </div>
  );
}
