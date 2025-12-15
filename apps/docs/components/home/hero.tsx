/** biome-ignore-all lint/a11y/noStaticElementInteractions: false positive */
/** biome-ignore-all lint/a11y/noSvgWithoutTitle: false positive */

"use client";

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
            "https://storage.googleapis.com/bucket-fi-production-apps-0672ab2d/original/images/pi5y38xg074hmbj9pktb33qm.svg"
          }
          alt="Hero Outline"
          className="w-full h-full object-cover"
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
            "https://storage.googleapis.com/bucket-fi-production-apps-0672ab2d/original/images/pjcz89c7hhv518ey345mpgvj.svg"
          }
          alt="Hero Outline"
          className="w-full h-full object-cover"
        />
      </motion.div>

      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute right-[-20%] top-[-20%] w-[40%] h-[40%] rounded-full bg-primary/40 blur-[120px]" />
        <div className="absolute right-[10%] top-[-10%] w-[20%] h-[20%] rounded-full bg-primary/30 blur-[100px]" />
        <div className="absolute left-[-10%] bottom-[-20%] w-[40%] h-[40%] rounded-full bg-primary/40 blur-[120px]" />
      </div>

      <div className="relative z-10 flex flex-col items-center text-center px-4 max-w-3xl mx-auto space-y-6 pointer-events-none">
        <div className="space-y-2">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-foreground drop-shadow-sm">
            QRDX
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground">
            Generate QR codes for your business. <br />
            Share your website, social media, and more.
          </p>
        </div>
      </div>
    </div>
  );
};
