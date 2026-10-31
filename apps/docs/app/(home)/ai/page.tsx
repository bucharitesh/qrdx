import { ArrowRight } from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { AsciiField, Backdrop, RadialHalo } from "@/components/fx";
import { HairlineFigure } from "@/components/mockups/hairline";
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
    <div className="relative isolate container mx-auto flex flex-1 flex-col gap-12 overflow-x-hidden overflow-y-auto px-4 md:px-6">
      {/* AI Chat entry point section */}
      <section className="relative isolate flex flex-col gap-4 pt-20 md:pt-28">
        <Backdrop className="-z-10">
          <RadialHalo tone="violet" y="58%" width={820} follow />
          <AsciiField
            variant="rain"
            seed={23}
            className="[mask-image:radial-gradient(ellipse_70%_85%_at_50%_45%,rgba(0,0,0,0.3)_20%,black_55%,transparent_85%)]"
          />
        </Backdrop>
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

      <div className="flex justify-center pb-16">
        <HairlineFigure
          figure="Phosphor"
          className="aspect-[2/1] w-full max-w-xl opacity-80"
        />
      </div>
    </div>
  );
}
