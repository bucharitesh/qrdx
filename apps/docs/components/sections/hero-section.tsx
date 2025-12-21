"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  motion,
  useAnimationFrame,
  useMotionTemplate,
  useMotionValue,
} from "framer-motion";
import Link from "next/link";
import { useRef } from "react";
import { HeroVideoSection } from "@/components/sections/hero-video-section";
import { siteConfig } from "@/config/site";

export function HeroSection() {
  const { hero } = siteConfig;

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
    <section
      ref={containerRef}
      onMouseMove={handleMouseMove}
      id="hero"
      className="w-full relative"
    >
      <div className="absolute inset-0">
        <div className="absolute inset-0 -z-10 h-[600px] md:h-[800px] w-full [background:radial-gradient(125%_125%_at_50%_10%,var(--background)_40%,var(--primary)_100%)] rounded-b-xl"></div>
      </div>
      {/* <div className="absolute inset-0 z-0 opacity-[0.05]">
        <img
          src={
            "./hero-light.svg"
          }
          alt="Hero Outline"
          className="dark:hidden h-[600px] md:h-[800px] w-full object-cover"
        />
        <img
          src={
            "./hero-dark.svg"
          }
          alt="Hero Outline"
          className="hidden dark:block h-[600px] md:h-[800px] w-full object-cover"
        />
      </div>
      <motion.div
        className="absolute inset-0 z-0 opacity-40"
        style={{ maskImage, WebkitMaskImage: maskImage }}
      >
        <img
          src={
            "./hero-overlay-light.svg"
          }
          alt="Hero Outline"
          className="dark:hidden h-[600px] md:h-[800px] w-full object-cover"
        />
        <img
          src={
            "./hero-overlay-dark.svg"
          }
          alt="Hero Outline"
          className="hidden dark:block h-[600px] md:h-[800px] w-full object-cover"
        />
      </motion.div> */}
      <div className="relative flex flex-col items-center w-full px-6">
        <div className="relative z-10 pt-32 max-w-3xl mx-auto h-full w-full flex flex-col gap-10 items-center justify-center">
          <p className="border border-border bg-muted rounded-full text-sm h-8 px-3 flex items-center gap-2">
            {hero.badgeIcon}
            {hero.badge}
          </p>
          <div className="flex flex-col items-center justify-center gap-5">
            <h1 className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-semibold tracking-tighter text-balance text-center text-secondary-foreground">
              {hero.title}
            </h1>
            <p className="text-base md:text-lg text-center text-muted-foreground font-medium text-balance leading-relaxed tracking-tight">
              {hero.description}
            </p>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap justify-center">
            <Link href={hero.cta.primary.href}>
              <Button>{hero.cta.primary.text}</Button>
            </Link>
            <Link href={hero.cta.secondary.href}>
              <Button variant="outline">{hero.cta.secondary.text}</Button>
            </Link>
          </div>
        </div>
      </div>
      <HeroVideoSection />
    </section>
  );
}
