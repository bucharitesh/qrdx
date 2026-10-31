import type { Metadata } from "next";
import { Suspense } from "react";
import { SectionHeader } from "@/components/sections/section-header";
import { createMetadata } from "@/lib/metadata";
import { CommunityThemesContent } from "./components/community-themes-content";

export const metadata: Metadata = createMetadata({
  title: "Community QR Code Designs & Themes",
  description:
    "Browse free QR code designs and color themes shared by the QRdx community. Preview any style, then open it in the QR code generator to customize and download.",
  keywords: [
    "qr code designs",
    "qr code themes",
    "custom qr code styles",
    "community qr codes",
    "qr code color schemes",
  ],
  path: "/community",
});

export default function CommunityPage() {
  return (
    <section className="relative flex flex-col items-center justify-center gap-10 w-full border-b">
      <div className="absolute inset-0 -z-10 h-[335px] md:h-[370px] w-full [background:radial-gradient(125%_125%_at_50%_10%,var(--background)_40%,var(--primary)_100%)] rounded-b-sm"></div>
      <div className="w-full">
        <SectionHeader>
          <div className="relative z-10 pt-32 max-w-3xl mx-auto h-full w-full flex flex-col gap-10 items-center justify-center">
            <div className="flex flex-col items-center justify-center gap-5">
              <h1 className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-semibold tracking-tighter text-balance text-center text-secondary-foreground">
                Community Themes
              </h1>
              <p className="text-base md:text-lg text-center text-muted-foreground font-medium text-balance leading-relaxed tracking-tight">
                Discover and explore beautiful qrdx themes created by the
                community.
              </p>
            </div>
            {/* <div className="flex items-center gap-2.5 flex-wrap justify-center">
              <Link href={hero.cta.primary.href}>
                <Button>{hero.cta.primary.text}</Button>
              </Link>
              <Link href={hero.cta.secondary.href}>
                <Button variant="outline">{hero.cta.secondary.text}</Button>
              </Link>
            </div> */}
          </div>
        </SectionHeader>

        {/* nuqs reads search params; without a boundary the whole page renders client-side */}
        <Suspense fallback={<div className="min-h-[50vh] w-full" />}>
          <CommunityThemesContent />
        </Suspense>
      </div>
    </section>
  );
}
