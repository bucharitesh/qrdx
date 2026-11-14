"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Edit2 } from "iconsax-reactjs";
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
} from "motion/react";
import { QRCodeSVG } from "qrdx";
import { useEffect, useRef, useState } from "react";
import { DURATION, EASE } from "@/components/mockups/motion";
import { PhoneFrame } from "@/components/mockups/phone-frame";
import { HOME_CODES } from "./codes";
import { ControlBar, ExampleTag, QrTile, Readout } from "./demo-ui";

// Illustrative destinations for one printed code.
const DESTINATIONS = [
  {
    url: "yourcafe.com/menu",
    title: "Summer menu",
    rows: [
      ["Iced latte", "4.50"],
      ["Peach tart", "5.00"],
      ["Lemonade", "3.50"],
    ],
  },
  {
    url: "yourcafe.com/fall",
    title: "Fall menu",
    rows: [
      ["Chai latte", "4.80"],
      ["Crumble", "5.50"],
      ["Cider", "3.90"],
    ],
  },
  {
    url: "yourcafe.com/jazz",
    title: "Tonight",
    rows: [
      ["Live jazz", "8 pm"],
      ["Open mic", "Thu"],
      ["Quiz", "Sun"],
    ],
  },
] as const;

const CYCLE_MS = 4200;
const SITE = "yourcafe.com";

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
    <div ref={ref} className="flex h-full flex-col">
      <div className="relative flex min-h-0 flex-1 items-center justify-center gap-3 px-5 pt-6 sm:gap-6">
        <ExampleTag />
        <div className="flex shrink-0 flex-col items-center gap-2">
          <div className="flex w-24 flex-col items-center gap-1.5 rounded-2xl bg-white p-2 pb-1.5 sm:w-32 sm:p-2.5 sm:pb-2 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_10px_24px_-14px_rgba(0,0,0,0.28)] ring-1 ring-black/5">
            <QrTile
              label="Printed dynamic QR code"
              className="w-full p-0 shadow-none ring-0"
            >
              <QRCodeSVG {...HOME_CODES.dynamic} />
            </QrTile>
            <span className="text-[10px] font-medium text-neutral-500">
              Scan for menu
            </span>
          </div>
          <Readout>printed once</Readout>
        </div>

        <span
          aria-hidden="true"
          className="h-px w-5 shrink-0 bg-foreground/25 sm:w-10"
        />

        <PhoneFrame className="w-[84px] shrink-0 shadow-lg sm:w-[100px]">
          <div className="flex h-full flex-col bg-background">
            {/* Phone browsers show only the domain in the address bar. */}
            <div className="mx-1 mt-0.5 flex h-4 items-center justify-center rounded-full bg-muted px-1">
              <span className="whitespace-nowrap text-[6.5px] leading-none text-foreground">
                {SITE}
              </span>
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={destination.title}
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: DURATION.slow, ease: EASE }}
                aria-hidden="true"
                className="flex flex-1 flex-col gap-1.5 p-1.5"
              >
                <div className="aspect-[16/10] rounded-md bg-foreground/[0.07]" />
                <p className="text-[8px] font-semibold leading-none">
                  {destination.title}
                </p>
                <div className="flex flex-col gap-1">
                  {destination.rows.map(([item, price]) => (
                    <div
                      key={item}
                      className="flex items-center justify-between gap-1 whitespace-nowrap border-b border-border/60 pb-0.5 text-[6.5px]"
                    >
                      <span className="text-foreground/80">{item}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {price}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </PhoneFrame>
      </div>
      <ControlBar className="gap-2.5 sm:gap-3">
        <Readout className="shrink-0">opens</Readout>
        {/* Announced only when the visitor changes it, not on the auto cycle. */}
        <span
          aria-live={auto ? "off" : "polite"}
          className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground sm:text-xs"
        >
          {destination.url}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label="Change the link"
          // On phones the pencil alone keeps the whole link in view.
          className="size-8 shrink-0 px-0 sm:w-auto sm:px-3"
          onClick={() => {
            setAuto(false);
            setIndex((current) => (current + 1) % DESTINATIONS.length);
          }}
        >
          <Edit2 aria-hidden="true" className="size-3.5" />
          <span className="hidden sm:inline">Change</span>
        </Button>
      </ControlBar>
    </div>
  );
}
