import { Button } from "@repo/design-system/components/ui/button";
import { Brush2 } from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AsciiField, Backdrop, MeshGradient } from "@/components/fx";
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
    <main className="w-full border-b">
      <section className="relative w-full overflow-hidden border-b">
        <Backdrop>
          <MeshGradient tone="warm" />
          <AsciiField
            variant="noise"
            density={0.85}
            className="[mask-image:radial-gradient(ellipse_75%_90%_at_50%_45%,rgba(0,0,0,0.3)_15%,black_50%,transparent_82%)]"
          />
        </Backdrop>
        <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-4 px-6 pt-16 pb-14 text-center md:pt-24 md:pb-16">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Community
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-balance md:text-5xl">
            Community themes
          </h1>
          <p className="max-w-xl text-pretty text-muted-foreground md:text-lg">
            QR code styles shared by QRdx users. Preview any theme, then open it
            in the editor to make it yours.
          </p>
          <Button asChild className="mt-3">
            <Link href="/playground?tab=customisations">
              <Brush2 aria-hidden />
              Make your own theme
            </Link>
          </Button>
        </div>
      </section>

      {/* nuqs reads search params; without a boundary the whole page renders client-side */}
      <Suspense fallback={<div className="min-h-[50vh] w-full" />}>
        <CommunityThemesContent />
      </Suspense>
    </main>
  );
}
