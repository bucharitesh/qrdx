import { FAQSection } from "@/components/sections/faq-section";
import { PricingSection } from "@/components/sections/pricing-section";

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center divide-y divide-border min-h-screen w-full">
      <PricingSection />
      <FAQSection />
    </main>
  );
}
