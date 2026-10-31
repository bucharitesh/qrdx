import type { Metadata } from "next";
import { FAQSection } from "@/components/sections/faq-section";
import { PricingSection } from "@/components/sections/pricing-section";
import { createMetadata } from "@/lib/metadata";

export const metadata: Metadata = createMetadata({
  title: "Pricing — Free QR Code Generator, Optional Pro",
  description:
    "QRdx is free: unlimited QR code generation and PNG, JPG and SVG downloads, no credit card. Pro ($8/mo) adds unlimited saved themes and unlimited AI theme generation.",
  keywords: [
    "qrdx pricing",
    "free qr code generator",
    "qr code generator pro plan",
    "unlimited qr codes free",
  ],
  path: "/pricing",
});

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center divide-y divide-border min-h-screen w-full">
      <PricingSection />
      <FAQSection />
    </main>
  );
}
