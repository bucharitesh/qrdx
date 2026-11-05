import { Button } from "@repo/design-system/components/ui/button";
import { Brush2, Verify } from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { CommunityTabs } from "@/components/community/community-tabs";
import { ItemRow } from "@/components/community/item-card";
import { AsciiField, Backdrop, MeshGradient } from "@/components/fx";
import { CommunityWall } from "@/components/showcase/community-wall";
import { getCommunityHome } from "@/lib/community/home";
import {
  COMMUNITY_LICENSE_NAME,
  COMMUNITY_LICENSE_URL,
} from "@/lib/community/licence";
import { MIN_GATE_SCORE } from "@/lib/community/scan-samples";
import { createMetadata } from "@/lib/metadata";

export const metadata: Metadata = createMetadata({
  title: "Community QR Code Frames & Themes",
  description:
    "Free QR code frames and themes shared by QRdx and its users. Every one scans, and every one is free under CC0. Open any of them in the QR code generator.",
  keywords: [
    "qr code frames",
    "qr code designs",
    "qr code themes",
    "custom qr code styles",
    "community qr codes",
  ],
  path: "/community",
  ownOgImage: true,
});

export default async function CommunityPage() {
  const home = await getCommunityHome();

  return (
    <main className="w-full border-b">
      <section className="relative w-full overflow-hidden border-b">
        <Backdrop>
          <MeshGradient tone="warm" />
          <AsciiField
            className="[mask-image:radial-gradient(ellipse_75%_90%_at_50%_45%,rgba(0,0,0,0.3)_15%,black_50%,transparent_82%)]"
            density={0.85}
            variant="noise"
          />
        </Backdrop>
        <div className="relative mx-auto flex max-w-[50rem] flex-col items-center gap-4 px-6 pt-16 pb-12 text-center md:pt-24 md:pb-14">
          <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
            Community
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-balance md:text-5xl">
            Frames and themes for your QR codes
          </h1>
          <p className="text-muted-foreground max-w-xl text-pretty md:text-lg">
            Made by QRdx and the people who use it. New items must scan Great (
            {MIN_GATE_SCORE}+) to be published, and every one is free to use.
          </p>
          <Button asChild className="mt-2">
            <Link href="/playground?tab=customisations">
              <Brush2 aria-hidden />
              Make your own
            </Link>
          </Button>
          <p className="text-muted-foreground text-xs">
            Published under{" "}
            <a
              className="underline underline-offset-2"
              href={COMMUNITY_LICENSE_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              {COMMUNITY_LICENSE_NAME}
            </a>
            : use them for anything, no credit needed.
          </p>
        </div>
      </section>

      <CommunityTabs
        active="home"
        showCollections={home.collections.length > 0}
        showTemplates={home.templates.length > 0}
      />

      <CommunityWall />

      <div className="mx-auto max-w-6xl space-y-12 px-4 py-10 sm:px-6">
        <ItemRow
          badge={
            <Verify aria-label="Verified" className="size-4" variant="Bold" />
          }
          cards={home.official}
          href="/community/frames"
          title="From QRdx"
        />
        <ItemRow cards={home.featured} title="Staff picks" />
        <ItemRow
          cards={home.collections}
          href="/community/collections"
          title="Collections"
        />
        <ItemRow
          cards={home.themes}
          href="/community/themes"
          title="Popular themes"
        />
        <ItemRow
          cards={home.fresh}
          href="/community/frames?from=community"
          title="New frames from the community"
        />
        <ItemRow
          cards={home.templates}
          href="/community/templates"
          title="New page templates"
        />
      </div>
    </main>
  );
}
