import type { Metadata } from "next";
import { AIAnnouncement } from "./components/ai-announcement";
import { AIChatHero } from "./components/ai-chat-hero";

export const metadata: Metadata = {
  title: "AI QR Code Theme Generator - qrdx",
  description:
    "Generate stunning QR code themes with AI. Describe your vision or upload images - our AI creates custom QR code styles with real-time preview. Perfect for creating beautiful, branded QR codes in seconds.",
  keywords:
    "ai qr code generator, qr code theme, ai design tool, qr code customizer, branded qr codes, qr code style generator, qrdx",
  robots: "index, follow",
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
