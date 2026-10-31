import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AI_REQUEST_FREE_TIER_LIMIT } from "@/lib/constants";
import { env } from "@/lib/env";
import { createMetadata } from "@/lib/metadata";
import { AIAnnouncement } from "./components/ai-announcement";
import { AIChatHero } from "./components/ai-chat-hero";

export const metadata: Metadata = createMetadata({
  title: "AI QR Code Generator — Design QR Codes From a Prompt",
  description: `Describe your brand or style and QRdx's AI designs a custom QR code theme with live preview. Free accounts include ${AI_REQUEST_FREE_TIER_LIMIT} AI generations; Pro unlocks unlimited.`,
  keywords: [
    "ai qr code generator",
    "ai qr code design",
    "ai qr code maker",
    "branded qr codes",
    "qr code style generator",
    "custom qr code ai",
  ],
  path: "/ai",
});

export default function AiPage() {
  return (
    <div className="relative isolate container mx-auto flex flex-1 flex-col gap-24 overflow-x-hidden overflow-y-auto px-4 md:px-6">
      {/* AI Chat entry point section */}
      <section className="relative isolate flex flex-col gap-4 py-100">
        <AIAnnouncement />
        <AIChatHero />
        {Boolean(env.FAL_KEY) && (
          <Link
            href="/ai/art"
            className="group text-muted-foreground hover:text-foreground mx-auto flex items-center gap-2 text-sm font-medium transition-colors"
          >
            Or turn a link into scannable AI QR art
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
      </section>
    </div>
  );
}
