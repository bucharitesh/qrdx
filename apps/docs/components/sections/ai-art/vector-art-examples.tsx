"use client";

// Live Logo QR and Image QR examples (vector art modes from the qrdx library,
// no AI). Each card opens the playground's Art tab on its mode.

import { Badge } from "@repo/design-system/components/ui/badge";
import { Card } from "@repo/design-system/components/ui/card";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowRight } from "iconsax-reactjs";
import Link from "next/link";
import { loadQRArtImage, QRCodeSVG } from "qrdx";
import type { QRArtImage, QRArtMode } from "qrdx/types";
import { useEffect, useState } from "react";
import { SpotlightCard } from "@/components/fx";
import { PRESSABLE } from "@/components/mockups/motion";
import {
  SHOWCASE_PLACEMENTS as AT,
  SHOWCASE_STYLES,
  type ShowcaseStyleName,
  showcaseProps,
} from "@/lib/landing/showcase-styles";
import { artPlaygroundHref } from "./config";

const VALUE = "https://qrdx.dev";

// Samples from public/images/art-samples (the editor's Art tab offers
// the same ones), styled in lib/landing/showcase-styles.ts.
const EXAMPLES: {
  style: ShowcaseStyleName;
  /** The Art tab mode the card opens */
  mode: "logo" | "image";
  title: string;
  description: string;
}[] = [
  {
    style: AT["ai-art.logo"],
    mode: "logo",
    title: "Logo QR",
    description:
      "Your logo's colors flow into the modules inside its shape; the finder patterns stay solid.",
  },
  {
    style: AT["ai-art.image"],
    mode: "image",
    title: "Image QR",
    description:
      "A photo shows through every module, around a center that keeps the code scannable.",
  },
];

function useArtImage(src: string | undefined, mode: QRArtMode) {
  const [image, setImage] = useState<QRArtImage | null>(null);
  useEffect(() => {
    if (!src) return;
    let alive = true;
    loadQRArtImage(src, { mode })
      .then((next) => alive && setImage(next))
      .catch(() => {
        // The plain code stays as the example.
      });
    return () => {
      alive = false;
    };
  }, [src, mode]);
  return image;
}

function ArtExample({
  style,
  mode,
  title,
  description,
}: (typeof EXAMPLES)[number]) {
  const art = SHOWCASE_STYLES[style].art;
  const image = useArtImage(art?.src, art?.mode ?? "logo");

  return (
    <Link
      className="group block h-full rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      href={artPlaygroundHref(mode)}
    >
      <SpotlightCard
        as={Card}
        className={cn(
          "h-full gap-5 p-5 shadow-xs group-hover:border-foreground/15 group-hover:bg-accent/40 sm:flex-row sm:items-center",
          PRESSABLE,
        )}
      >
        <div className="grid aspect-square w-full max-w-56 shrink-0 place-items-center self-center rounded-lg bg-white p-4 ring-1 ring-black/5 sm:w-44 sm:self-auto dark:ring-white/10">
          <QRCodeSVG
            {...showcaseProps(style, {
              value: VALUE,
              size: 160,
              artImage: image,
            })}
            className={cn(
              "size-full transition-opacity duration-300",
              !image && "opacity-60",
            )}
          />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold tracking-tight">{title}</h3>
            <Badge
              className="font-normal text-muted-foreground"
              variant="outline"
            >
              Vector
            </Badge>
          </div>
          <p className="text-sm text-pretty text-muted-foreground">
            {description}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-medium">
            Open in the playground
            <ArrowRight
              aria-hidden
              className="size-4 transition-transform group-hover:translate-x-0.5"
            />
          </p>
        </div>
      </SpotlightCard>
    </Link>
  );
}

/** Two live examples of the vector art modes, side by side. */
export function VectorArtExamples() {
  return (
    <ul className="grid gap-4 lg:grid-cols-2">
      {EXAMPLES.map((example) => (
        <li key={example.style}>
          <ArtExample {...example} />
        </li>
      ))}
    </ul>
  );
}
