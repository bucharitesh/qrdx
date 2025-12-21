"use client";

import { Globe } from "lucide-react";
import lottieAnimation from "@/public/lottie.json";
import {
  AIThemeGenerator,
  BentoCard,
  ExportFormats,
  LogoShowcase,
  LottiePlayer,
  PatternAnimation,
  TypeTester,
} from "./bento-grid";
import { SectionHeader } from "./section-header";

function BentoGridSection() {
  return (
    <section className="flex flex-col items-center justify-center w-full">
      <SectionHeader>
        <h2 className="text-3xl md:text-4xl font-medium tracking-tighter text-center text-balance">
          Built for Flexibility
        </h2>
        <p className="text-muted-foreground text-center text-balance font-medium">
          Customize every aspect of your QR codes with powerful features
          designed for developers and designers.
        </p>
      </SectionHeader>

      <div className="max-w-7xl w-full mx-auto px-10 py-6">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 auto-rows-[180px]">
          <BentoCard
            gridClass="md:col-span-2 md:row-span-2"
            title="Templates"
            description="Pre-built templates for quick customization."
            footerClassName="mt-4"
          >
            <TypeTester />
          </BentoCard>

          {/* 2. Logo Integration - Standard (2x1) */}
          <BentoCard
            gridClass="md:col-span-2"
            title="Brand Your QR"
            description="Add custom logos while maintaining scannability."
            footerClassName="mt-4"
          >
            <LogoShowcase />
          </BentoCard>

          {/* 3. Global Network - Tall (2x2) - Swapped with Layouts */}
          <BentoCard
            gridClass="md:col-span-2 md:row-span-2"
            padding="p-6"
            title="Patterns"
            description="Flexible patterns that can be customized."
            icon={<Globe className="w-5 h-5" />}
            contentClassName="flex-1 flex items-center justify-center"
            footerClassName="mt-auto relative z-20 p-2"
          >
            <div className="relative">
              <PatternAnimation />
            </div>
          </BentoCard>

          {/* 4. Export Formats - Standard (2x1) */}
          <BentoCard
            gridClass="md:col-span-2"
            padding="p-6"
            title="Export Anywhere"
            description="Download as SVG, PNG, or embed directly."
            contentClassName="flex-1 flex items-center justify-center"
            footerClassName="mt-4"
          >
            <ExportFormats />
          </BentoCard>

          {/* 5. QR Scan Animation - Wide (3x2) - Taller */}
          <BentoCard
            gridClass="md:col-span-3 md:row-span-2"
            title="Scan Ready"
            description="Instant QR code scanning with modern detection."
            contentClassName="flex-1 flex items-center justify-center"
          >
            <LottiePlayer
              animationData={lottieAnimation}
              className="absolute w-full h-full max-w-[320px] -translate-y-10 translate-x-20"
            />
          </BentoCard>

          {/* 6. AI Theme Generation - Wide (3x1) - Taller */}
          <BentoCard
            gridClass="md:col-span-3 md:row-span-2"
            title="AI Theme Generation"
            description="Generate beautiful themes with artificial intelligence."
            contentClassName="flex-1 flex items-center justify-center"
          >
            <AIThemeGenerator />
          </BentoCard>
        </div>
      </div>
    </section>
  );
}

export default BentoGridSection;
