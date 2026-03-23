import type { Metadata } from "next";
import { FAQSection } from "@/components/sections/faq-section";
import { PricingSection } from "@/components/sections/pricing-section";

export const metadata: Metadata = {
  title: "QRdx Pricing — Free Forever Plan + Pro | QR Code Generator",
  description:
    "QRdx is free forever — unlimited QR code generation, no credit card required. Upgrade to Pro for $8/mo to unlock unlimited saved themes, AI generation, and advanced analytics.",
  keywords:
    "qrdx pricing, free qr code generator, qr code pro plan, unlimited qr codes free, qr code plans",
  openGraph: {
    title: "QRdx Pricing — Free Forever + Pro Plans",
    description:
      "Free forever: unlimited QR code generation with no credit card. Pro at $8/mo for unlimited saved themes and AI-powered features.",
    url: "https://qrdx.dev/pricing",
  },
};

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center divide-y divide-border min-h-screen w-full">
      <PricingSection />
      <FAQSection />
    </main>
  );
}
