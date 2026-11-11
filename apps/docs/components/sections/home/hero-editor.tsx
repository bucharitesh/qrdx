"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowRight } from "iconsax-reactjs";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { QRCode } from "qrdx";
import { useState } from "react";
import { ScanScoreBadge } from "@/components/editor/scan-score";
import { AsciiField } from "@/components/fx";
import { EASE_CLASS } from "@/components/mockups/motion";
import { SegmentedControl } from "@/components/mockups/segmented-control";
import { PRODUCT_FACTS } from "@/lib/product-facts";
import type { QRStyle } from "@/types/theme";
import {
  HERO_FRAMES as FRAMES,
  type HeroFrameKey as FrameKey,
  heroLook,
  heroPlaygroundHref,
  HERO_STYLES as STYLES,
  type HeroStyleKey as StyleKey,
} from "./hero-looks";

const STYLE_KEYS = Object.keys(STYLES) as StyleKey[];
const FRAME_KEYS = Object.keys(FRAMES) as FrameKey[];

/** Hero mini-editor: the real qrdx renderer and scan score, live as you type. */
export function HeroEditor() {
  const t = useTranslations("home.editor");
  const styleOptions = STYLE_KEYS.map((key) => ({
    value: key,
    label: t(`styles.${key}`),
  }));
  // The banner's label is the text it prints ("Scan me"), which the code
  // itself carries in English.
  const frameOptions = FRAME_KEYS.map((key) => ({
    value: key,
    label: key === "banner" ? FRAMES.banner.label : t(`frames.${key}`),
  }));
  const [value, setValue] = useState("https://qrdx.dev");
  const [styleKey, setStyleKey] = useState<StyleKey>("rounded");
  const [frameKey, setFrameKey] = useState<FrameKey>("banner");

  const style: QRStyle = heroLook(styleKey, frameKey);
  const trimmed = value.trim();

  return (
    <Card className="grid gap-0 overflow-hidden py-0 md:grid-cols-[1fr_minmax(0,22rem)]">
      <div className="order-last flex flex-col gap-5 border-t p-5 md:order-first md:border-t-0 md:border-r md:p-8">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t("eyebrow")}
          </p>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="hero-qr-value">{t("valueLabel")}</Label>
          <Input
            id="hero-qr-value"
            value={value}
            maxLength={500}
            autoComplete="off"
            spellCheck={false}
            placeholder="https://example.com"
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t("style")}</span>
          <SegmentedControl
            label={t("style")}
            options={styleOptions}
            value={styleKey}
            onChange={setStyleKey}
            className="w-fit"
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t("frame")}</span>
          <SegmentedControl
            label={t("frame")}
            options={frameOptions}
            value={frameKey}
            onChange={setFrameKey}
            className="w-fit"
          />
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t("more", {
            bodyPatterns: PRODUCT_FACTS.bodyPatterns,
            eyeShapes: PRODUCT_FACTS.eyeShapes,
            eyeCentres: PRODUCT_FACTS.eyeCentres,
          })}
        </p>
        <Button asChild className="w-fit">
          {/* The look and the link carry over; other text is typed again. */}
          <Link href={heroPlaygroundHref(styleKey, frameKey, trimmed)}>
            {t("customize")}
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
      <div className="relative flex flex-col items-center justify-center gap-4 bg-muted/40 p-6 md:p-8">
        <AsciiField
          variant="qr"
          density={1.1}
          radius={120}
          className="opacity-70 [mask-image:radial-gradient(ellipse_at_center,transparent_30%,black_75%)]"
        />
        <div
          aria-live="polite"
          className="relative flex aspect-square w-full max-w-64 items-center justify-center [&_svg]:size-full"
        >
          {trimmed ? (
            <div
              key={`${styleKey}-${frameKey}`}
              // Each new style settles in (CSS, so it plays before hydration
              // too); none with reduced motion.
              className={cn(
                "size-full rounded-2xl bg-white p-2 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_16px_32px_-16px_rgba(0,0,0,0.3)] ring-1 ring-black/5 animate-in fade-in-40 zoom-in-97 duration-220 motion-reduce:animate-none",
                EASE_CLASS,
              )}
              role="img"
              aria-label={t("qrLabel", { value: trimmed })}
            >
              <QRCode
                value={trimmed}
                size={256}
                level="Q"
                hideLogo
                bgColor={style.bgColor}
                fgColor={style.fgColor}
                eyeColor={style.eyeColor}
                dotColor={style.dotColor}
                bodyPattern={style.bodyPattern}
                cornerEyePattern={style.cornerEyePattern}
                cornerEyeDotPattern={style.cornerEyeDotPattern}
                frame={style.frame}
              />
            </div>
          ) : (
            <p className="px-6 text-center text-sm text-muted-foreground">
              {t("empty")}
            </p>
          )}
        </div>
        {trimmed && (
          <ScanScoreBadge className="relative" style={style} value={trimmed} />
        )}
      </div>
    </Card>
  );
}
