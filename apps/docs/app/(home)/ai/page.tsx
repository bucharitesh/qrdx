import type { Metadata } from "next";
import { AIAnnouncement } from "./components/ai-announcement";
import { AIChatHero } from "./components/ai-chat-hero";

export const metadata: Metadata = {
  title: "AI QR Code Generator — Free, Instant, No Signup | QRdx",
  description:
    "Generate stunning AI-designed QR codes for free. Describe your vision and our AI creates custom QR code styles with real-time preview. Beautiful, branded QR codes in seconds — no signup required.",
  keywords:
    "ai qr code generator, free ai qr code, qr code ai design, ai qr code maker, branded qr codes, qr code style generator, ai custom qr code",
  robots: "index, follow",
  openGraph: {
    title: "AI QR Code Generator — Free, Instant, No Signup | QRdx",
    description:
      "Generate beautiful AI-designed QR codes for free. Describe your brand vision and get a custom QR code in seconds.",
    url: "https://qrdx.dev/ai",
  },
};

export default function AiPage() {
  return (
    <div className="relative isolate container mx-auto flex flex-1 flex-col gap-24 overflow-x-hidden overflow-y-auto px-4 md:px-6">
      {/* AI Chat entry point section */}
      <section className="relative isolate flex flex-col gap-4 py-100">
        <AIAnnouncement />
        <AIChatHero />
      </section>
    </div>
  );
}
