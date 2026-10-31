"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Edit2, Lock } from "iconsax-reactjs";
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
import { easterEggUrl } from "@/lib/easter-eggs";
import { DemoStage, QrTile, Readout } from "./demo-ui";
import { FAMILY } from "./qr-family";

// Illustrative destinations for one printed code.
const DESTINATIONS = [
  {
    url: "yourcafe.com/menu/summer",
    title: "Summer menu",
    rows: [
      ["Iced latte", "4.50"],
      ["Peach tart", "5.00"],
      ["Lemonade", "3.50"],
    ],
  },
  {
    url: "yourcafe.com/menu/autumn",
    title: "Autumn menu",
    rows: [
      ["Chai latte", "4.80"],
      ["Apple crumble", "5.50"],
      ["Hot cider", "3.90"],
    ],
  },
  {
    url: "yourcafe.com/events",
    title: "Tonight",
    rows: [
      ["Live jazz", "8 pm"],
      ["Open mic", "Thu"],
      ["Book club", "Sun"],
    ],
  },
] as const;

const CYCLE_MS = 3400;

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
      <DemoStage
        pattern="rain"
        className="flex flex-1 items-center justify-center gap-3 px-5 sm:gap-5"
      >
        <div className="flex shrink-0 flex-col items-center gap-2">
          <div className="flex w-28 flex-col items-center gap-1.5 rounded-2xl bg-white p-2.5 pb-2 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_14px_30px_-14px_rgba(0,0,0,0.3)] ring-1 ring-black/5 sm:w-32">
            <QrTile
              label="Printed dynamic QR code"
              className="w-full p-0 shadow-none ring-0"
            >
              <QRCode
                value={easterEggUrl("menu")}
                size={112}
                level="M"
                margin={0}
                hideLogo
                fgColor={FAMILY.fgColor}
                eyeColor={FAMILY.eyeColor}
                dotColor={FAMILY.dotColor}
                bodyPattern={FAMILY.bodyPattern}
                cornerEyePattern={FAMILY.cornerEyePattern}
                cornerEyeDotPattern={FAMILY.cornerEyeDotPattern}
              />
            </QrTile>
            <span className="text-[10px] font-medium text-neutral-500">
              Table 4 · Scan for menu
            </span>
          </div>
          <Readout>printed once</Readout>
        </div>

        <div
          aria-hidden="true"
          className="relative h-px w-8 shrink-0 bg-foreground/20 sm:w-14"
        >
          {!reduce && inView && (
            <motion.span
              className="absolute -top-[3px] size-[7px] rounded-full bg-foreground"
              animate={{ left: ["0%", "100%"], opacity: [0, 1, 1, 0] }}
              transition={{
                duration: 1.6,
                ease: "easeInOut",
                repeat: Number.POSITIVE_INFINITY,
                repeatDelay: 0.4,
              }}
            />
          )}
        </div>

        <PhoneFrame className="w-[92px] shrink-0 sm:w-[100px]">
          <div className="flex h-full flex-col bg-background">
            <div className="mx-1.5 mt-0.5 flex h-4 items-center gap-1 overflow-hidden rounded-full bg-muted px-1.5">
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
                  className="truncate text-[6.5px] leading-none text-foreground"
                >
                  {destination.url}
                </motion.span>
              </AnimatePresence>
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
                <div className="aspect-[16/10] rounded-md bg-[linear-gradient(135deg,color-mix(in_oklab,var(--foreground)_10%,transparent),color-mix(in_oklab,var(--foreground)_4%,transparent))]" />
                <p className="text-[8px] font-semibold leading-none">
                  {destination.title}
                </p>
                <div className="flex flex-col gap-1">
                  {destination.rows.map(([item, price]) => (
                    <div
                      key={item}
                      className="flex items-center justify-between border-b border-border/60 pb-0.5 text-[6.5px]"
                    >
                      <span className="text-foreground/80">{item}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {price}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </PhoneFrame>
      </DemoStage>
      <div className="flex items-center gap-3 border-t px-4 py-3">
        <Readout className="shrink-0">opens</Readout>
        <span
          aria-live="polite"
          className="min-w-0 flex-1 truncate font-mono text-xs text-foreground"
        >
          {destination.url}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setAuto(false);
            setIndex((current) => (current + 1) % DESTINATIONS.length);
          }}
        >
          <Edit2 className="size-3.5" />
          Change
        </Button>
      </div>
    </div>
  );
}
