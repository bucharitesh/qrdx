"use client";

// Live Logo QR and Image QR examples (vector art modes from the qrdx library,
// no AI). Each card opens the playground's Art section.

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
import { ART_PLAYGROUND_HREF } from "./config";

/** A simple two-tone mark standing in for "your logo". */
const SAMPLE_LOGO = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f43f5e"/><stop offset="1" stop-color="#f59e0b"/></linearGradient></defs><path fill="url(#g)" d="M50 88 14 54C3 43 4 25 17 17c10-6 23-3 33 8 10-11 23-14 33-8 13 8 14 26 3 37Z"/></svg>',
)}`;

const SAMPLE_PHOTO = "/images/use-cases/market-stall-upi.webp";

const EXAMPLES: {
  mode: QRArtMode;
  title: string;
  description: string;
  src: string;
}[] = [
  {
    mode: "logo",
    title: "Logo QR",
    description:
      "Your logo's colors flow into the modules inside its shape; the finder patterns stay solid.",
    src: SAMPLE_LOGO,
  },
  {
    mode: "halftone",
    title: "Image QR",
    description:
      "A photo shows through every module, around a center that keeps the code scannable.",
    src: SAMPLE_PHOTO,
  },
];

function useArtImage(src: string, mode: QRArtMode) {
  const [image, setImage] = useState<QRArtImage | null>(null);
  useEffect(() => {
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
  mode,
  title,
  description,
  src,
}: (typeof EXAMPLES)[number]) {
  const image = useArtImage(src, mode);

  return (
    <Link
      className="group block h-full rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      href={ART_PLAYGROUND_HREF}
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
            art={image ? { mode, image, intensity: 0.7 } : undefined}
            bodyPattern={mode === "logo" ? "circle" : "square"}
            className={cn(
              "size-full transition-opacity duration-300",
              !image && "opacity-60",
            )}
            cornerEyeDotPattern="rounded"
            cornerEyePattern="rounded"
            level="H"
            size={160}
            value="https://qrdx.dev"
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
        <li key={example.mode}>
          <ArtExample {...example} />
        </li>
      ))}
    </ul>
  );
}
