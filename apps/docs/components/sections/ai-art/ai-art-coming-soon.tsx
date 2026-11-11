"use client";

import { Bot } from "@repo/design-system/components/icons";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import { MagicStar } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { AsciiField } from "@/components/fx";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { ART_PLAYGROUND_HREF } from "./config";
import { useAIArtPresets } from "./load-presets";
import { AI_ART_PRESET_COUNT, aiArtPresetPreview } from "./preset-meta";

/**
 * Shown when AI artwork can't be generated. Visitor-facing copy only: the
 * self-hosting setup lives in the docs.
 */
export function AIArtComingSoon() {
  const t = useTranslations("aiArt.comingSoon");
  // A few featured styles, once the catalogue has loaded (it isn't bundled).
  const { catalogue } = useAIArtPresets();
  const samples = (catalogue?.AI_ART_FEATURED_PRESET_IDS ?? [])
    .slice(0, 10)
    .flatMap((id) => catalogue?.AI_ART_PRESETS.find((p) => p.id === id) ?? []);

  return (
    <Card className="relative mx-auto max-w-5xl gap-6 overflow-hidden p-6 shadow-xs md:p-8">
      <AsciiField
        className="opacity-40 [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_60%)]"
        variant="qr"
      />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start">
        <span className="grid size-10 shrink-0 place-items-center rounded-full border bg-muted/40">
          <Bot aria-hidden className="size-5 text-foreground/80" />
        </span>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">
              {t("title")}
            </h2>
            <Badge className="text-muted-foreground" variant="outline">
              {t("badge")}
            </Badge>
          </div>
          <p className="max-w-xl text-sm text-pretty text-muted-foreground">
            {t("description", { count: AI_ART_PRESET_COUNT })}
          </p>
        </div>
      </div>

      <ul
        aria-label={t("styles")}
        className="relative flex min-h-7 flex-wrap gap-2"
      >
        {samples.map((preset) => (
          <li key={preset.id}>
            <Badge
              className="gap-1.5 bg-background py-1 pl-1 font-normal text-muted-foreground"
              variant="outline"
            >
              <img
                alt=""
                className="size-4 rounded-full bg-muted object-cover"
                height={16}
                loading="lazy"
                src={aiArtPresetPreview(preset.id)}
                width={16}
              />
              {preset.name}
            </Badge>
          </li>
        ))}
      </ul>

      <div className="relative flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href={ART_PLAYGROUND_HREF}>
            <MagicStar aria-hidden />
            {t("makeNow")}
          </Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/ai">{t("theme")}</Link>
        </Button>
      </div>
    </Card>
  );
}
