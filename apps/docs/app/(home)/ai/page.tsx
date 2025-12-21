import type { Metadata } from "next";
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
    <div className="relative isolate flex min-h-[calc(100vh-4rem)] flex-1 flex-col items-center justify-center px-4 py-16 md:px-6">
      <AIChatHero />
    </div>
  );
}
