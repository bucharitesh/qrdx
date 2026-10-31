import { Bot } from "@repo/design-system/components/icons";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import { MagicStar } from "iconsax-reactjs";
import Link from "next/link";
import { AsciiField } from "@/components/fx";
import { ART_PLAYGROUND_HREF } from "./config";
import { AI_ART_PRESETS } from "./presets";

const SWATCHES = AI_ART_PRESETS.slice(0, 10);

/**
 * Shown when AI artwork can't be generated. Visitor-facing copy only: the
 * self-hosting setup lives in the docs.
 */
export function AIArtComingSoon() {
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
              AI-painted QR art
            </h2>
            <Badge className="text-muted-foreground" variant="outline">
              Coming soon
            </Badge>
          </div>
          <p className="max-w-xl text-sm text-pretty text-muted-foreground">
            Describe a scene or pick one of {AI_ART_PRESETS.length} styles, and
            an image model paints it around your QR code. Every result gets a
            scan check before you download it.
          </p>
        </div>
      </div>

      <ul
        aria-label="A few of the styles"
        className="relative flex flex-wrap gap-2"
      >
        {SWATCHES.map((preset) => (
          <li key={preset.id}>
            <Badge
              className="gap-1.5 bg-background py-1 pl-1 font-normal text-muted-foreground"
              variant="outline"
            >
              <span
                aria-hidden
                className="size-4 rounded-full"
                style={{ background: preset.swatch }}
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
            Make Logo QR or Image QR now
          </Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/ai">Generate a theme with AI</Link>
        </Button>
      </div>
    </Card>
  );
}
