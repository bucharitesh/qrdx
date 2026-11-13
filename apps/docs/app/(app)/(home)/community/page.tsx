import { Button } from "@repo/design-system/components/ui/button";
import { Brush2, Verify } from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CommunityTabs } from "@/components/community/community-tabs";
import { DeferredRowCards } from "@/components/community/deferred-community";
import { ItemRowShell } from "@/components/community/item-card";
import { AsciiField, Backdrop, MeshGradient } from "@/components/fx";
import { CommunityWall } from "@/components/showcase/community-wall";
import { readsDatabaseWhileRendering } from "@/lib/build-without-database";
import { type CommunityHome, getCommunityHome } from "@/lib/community/home";
import {
  COMMUNITY_LICENSE_NAME,
  COMMUNITY_LICENSE_URL,
} from "@/lib/community/licence";
import { MIN_GATE_SCORE } from "@/lib/community/scan-samples";
import { createMetadata } from "@/lib/metadata";
import { playgroundHref } from "@/lib/playground-links";

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
  await readsDatabaseWhileRendering();
  const [home, t] = await Promise.all([
    getCommunityHome(),
    getTranslations("community.more"),
  ]);
  const labels = {
    load: t("load"),
    loading: t("loading"),
    failed: t("failed"),
  };

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
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href={playgroundHref({ tab: "design" })}>
                <Brush2 aria-hidden />
                Make your own
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/community/new">Make a collection</Link>
            </Button>
          </div>
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

      <CommunityWall labels={labels} />

      {/* Under the wall, far from the first screen: each row's cards load
          as it nears the screen (components/community/deferred-community). */}
      <div className="mx-auto max-w-6xl space-y-12 px-4 py-10 sm:px-6">
        {ROWS.map((row) =>
          home[row.name].length === 0 ? null : (
            <ItemRowShell
              badge={
                row.verified ? (
                  <Verify
                    aria-label="Verified"
                    className="size-4"
                    variant="Bold"
                  />
                ) : undefined
              }
              href={row.href}
              key={row.name}
              title={row.title}
            >
              <DeferredRowCards
                count={home[row.name].length}
                labels={labels}
                row={row.name}
              />
            </ItemRowShell>
          ),
        )}
      </div>
    </main>
  );
}

/** The overview's rows of cards, in order (lib/community/home.ts). */
const ROWS: {
  name: keyof CommunityHome;
  title: string;
  href?: string;
  verified?: boolean;
}[] = [
  {
    name: "official",
    title: "From QRdx",
    href: "/community/frames",
    verified: true,
  },
  { name: "featured", title: "Staff picks" },
  { name: "collections", title: "Collections", href: "/community/collections" },
  { name: "themes", title: "Popular themes", href: "/community/themes" },
  {
    name: "fresh",
    title: "New frames from the community",
    href: "/community/frames?from=community",
  },
  {
    name: "templates",
    title: "New page templates",
    href: "/community/templates",
  },
];
