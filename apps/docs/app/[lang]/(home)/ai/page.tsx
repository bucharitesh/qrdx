import { ArrowRight } from "iconsax-reactjs";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AsciiField, Backdrop, RadialHalo } from "@/components/fx";
import { ClientMessages } from "@/components/i18n/client-messages";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { HairlineFigure } from "@/components/mockups/hairline";
import { isArtAvailable } from "@/lib/ai/art-availability";
import { AI_REQUEST_FREE_TIER_LIMIT } from "@/lib/constants";
import { localizedMetadata } from "@/lib/i18n/metadata";
import { requireLocale } from "@/lib/i18n/server";
import { AIAnnouncement } from "./components/ai-announcement";
import { AIChatHero } from "./components/ai-chat-hero";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requireLocale();
  const t = await getTranslations({ locale, namespace: "ai" });
  return localizedMetadata({
    locale,
    path: "/ai",
    title: t("metaTitle"),
    description: t("metaDescription", { count: AI_REQUEST_FREE_TIER_LIMIT }),
    keywords: KEYWORDS,
    ownOgImage: true,
  });
}

const KEYWORDS = [
  "ai qr code generator",
  "ai qr code design",
  "ai qr code maker",
  "branded qr codes",
  "qr code style generator",
  "custom qr code ai",
];

export default async function AiPage() {
  const locale = await requireLocale();
  const t = await getTranslations({ locale, namespace: "ai" });
  return (
    <div className="relative isolate container mx-auto flex flex-1 flex-col gap-12 overflow-x-hidden overflow-y-auto px-6">
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
        <ClientMessages namespaces={["ai.chat"]}>
          <AIAnnouncement />
          <AIChatHero />
        </ClientMessages>
        {isArtAvailable && (
          <Link
            href="/ai/art"
            className="group text-muted-foreground hover:text-foreground mx-auto flex items-center gap-2 text-sm font-medium transition-colors"
          >
            {t("artLink")}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
      </section>

      <div className="flex justify-center pb-16">
        <HairlineFigure
          figure="Prompt"
          className="aspect-[2/1] w-full max-w-xl opacity-80"
        />
      </div>
    </div>
  );
}
