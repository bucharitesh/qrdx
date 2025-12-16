/** biome-ignore-all lint/a11y/noStaticElementInteractions: false positive */
/** biome-ignore-all lint/a11y/noSvgWithoutTitle: false positive */

"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import {
  motion,
  useAnimationFrame,
  useMotionTemplate,
  useMotionValue,
} from "framer-motion";
import type React from "react";
import { useRef } from "react";
// import HeroImage from "@/assets/qrdx-bg-main.svg";
// import HeroImageOutline from "@/assets/qrdx-bg-outline.svg";

export const Hero = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const { left, top } = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - left);
    mouseY.set(e.clientY - top);
  };

  const gridOffsetX = useMotionValue(0);
  const gridOffsetY = useMotionValue(0);

  const speedX = 0.5;
  const speedY = 0.5;

  useAnimationFrame(() => {
    const currentX = gridOffsetX.get();
    const currentY = gridOffsetY.get();
    gridOffsetX.set((currentX + speedX) % 40);
    gridOffsetY.set((currentY + speedY) % 40);
  });

  const maskImage = useMotionTemplate`radial-gradient(300px circle at ${mouseX}px ${mouseY}px, black, transparent)`;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className={cn(
        "relative w-full h-dvh flex flex-col items-center justify-center overflow-hidden bg-background",
      )}
    >
      <div className="absolute inset-0 z-0 opacity-[0.05]">
        {/* <HeroImage
          alt="Hero Image Outline"
          className="w-full h-full object-cover"
        /> */}
        <img
          src={
            "./hero-light.svg"
          }
          alt="Hero Outline"
          className="dark:hidden w-full h-full object-cover"
        />
        <img
          src={
            "./hero-dark.svg"
          }
          alt="Hero Outline"
          className="hidden dark:block w-full h-full object-cover"
        />
      </div>
      <motion.div
        className="absolute inset-0 z-0 opacity-40"
        style={{ maskImage, WebkitMaskImage: maskImage }}
      >
        {/* <HeroImageOutline
          alt="Hero Image"
          className="w-full h-full object-cover"
        /> */}
        <img
          src={
            "./hero-overlay-light.svg"
          }
          alt="Hero Outline"
          className="dark:hidden w-full h-full object-cover"
        />
        <img
          src={
            "./hero-overlay-dark.svg"
          }
          alt="Hero Outline"
          className="hidden dark:block w-full h-full object-cover"
        />
      </motion.div>

      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute right-[-20%] top-[-20%] w-[40%] h-[40%] rounded-full bg-primary/40 blur-[120px]" />
        <div className="absolute right-[10%] top-[-10%] w-[20%] h-[20%] rounded-full bg-primary/30 blur-[100px]" />
        <div className="absolute left-[-10%] bottom-[-20%] w-[40%] h-[40%] rounded-full bg-primary/40 blur-[120px]" />
      </div>

      {/* <div className="relative z-10 flex flex-col items-center text-center px-4 max-w-3xl mx-auto space-y-6 pointer-events-none">
        <div className="space-y-2">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-foreground drop-shadow-sm">
            QRDX
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground">
            Generate QR codes for your business. <br />
            Share your website, social media, and more.
          </p>
        </div>
      </div> */}

      <section className="relative pt-[16px] pb-16">
        <div className="max-w-[1060px] mx-auto px-4">
          <div className="flex flex-col items-center gap-12">
            {/* Hero Content */}
            <div className="max-w-[937px] flex flex-col items-center gap-3">
              <div className="flex flex-col items-center gap-6">
                <h1 className="max-w-[748px] text-center text-foreground text-5xl md:text-[80px] font-normal leading-tight md:leading-[96px]">
                  The better way to create QR codes
                </h1>
                <p className="max-w-[620px] text-center text-muted-foreground text-lg font-medium leading-7">
                  AI-powered, fully customizable QR codes for designers crafting
                  beautiful brands, businesses tracking engagement, and
                  developers building QR platforms where users create QR codes.
                </p>
              </div>
            </div>

            {/* CTA Button */}
            <div className="flex justify-center">
              <Button className="h-10 px-12 bg-primary/50 hover:bg-primary/90 text-white rounded-full font-medium text-sm shadow-[0px_0px_0px_2.5px_rgba(255,255,255,0.08)_inset]">
                Start for free
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
