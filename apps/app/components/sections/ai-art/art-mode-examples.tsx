// Scene and photo modes on /ai/art: what they make, as real examples from
// the pipeline (art-mode-examples-data.ts). A server component.

import { Badge } from "@repo/design-system/components/ui/badge";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/lib/i18n/config";
import { ART_MODE_EXAMPLES, artModeExampleSrc } from "./art-mode-examples-data";

export async function ArtModeExamples({ locale }: { locale: Locale }) {
  const t = await getTranslations({
    locale,
    namespace: "aiArt.artModes.examples",
  });
  return (
    <section
      aria-labelledby="scene-and-photo"
      className="w-full px-10 py-14 md:px-12 md:py-16"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <div className="flex max-w-2xl flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("eyebrow")}
          </p>
          <h2
            className="text-2xl font-semibold tracking-tight text-balance md:text-3xl"
            id="scene-and-photo"
          >
            {t("title")}
          </h2>
          <p className="text-pretty text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {ART_MODE_EXAMPLES.map((example) => (
            <li className="flex flex-col gap-2" key={example.id}>
              <div className="relative overflow-hidden rounded-lg border bg-muted/40">
                <img
                  alt={t(`alt.${example.id}`)}
                  className="aspect-square w-full object-cover"
                  decoding="async"
                  height={512}
                  loading="lazy"
                  src={artModeExampleSrc(example.id)}
                  width={512}
                />
                <Badge
                  className="absolute top-2 left-2 bg-background/85 backdrop-blur-sm"
                  variant="outline"
                >
                  {t(example.mode === "scene" ? "scene" : "photo")}
                </Badge>
              </div>
              <p className="text-sm text-pretty text-muted-foreground">
                {t(`caption.${example.id}`)}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
