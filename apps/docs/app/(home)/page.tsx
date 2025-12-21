import { HeroSection } from "@/components/sections/hero-section";
import { CTASection } from "@/components/sections/cta-section";
import { GrowthSection } from "@/components/sections/growth-section";
import {FAQSection } from "@/components/sections/faq-section"

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center divide-y divide-border min-h-screen w-full">
      <HeroSection />
      <GrowthSection />
      <FAQSection />
      <CTASection />
    </main>
  );
}