import { Card } from "@repo/design-system/components/ui/card";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowRight } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { LocaleLink } from "@/components/i18n/locale-link";
import { BrowserFrame } from "@/components/mockups/browser-frame";
import { LoopVideo } from "@/components/mockups/loop-video";
import { McpTerminal } from "@/components/mockups/mcp-terminal";
import { Reveal } from "@/components/mockups/reveal";
import { loopVideos } from "@/components/mockups/visuals";
import { SectionHeader } from "@/components/sections/section-header";
import { MAX_BULK_ROWS } from "@/components/sections/tools/bulk-utils";
import { mcpServerUrl } from "@/lib/mcp-clients";
import { baseUrl } from "@/lib/metadata";
import { PLAN_LIMITS } from "@/lib/plans";
import { playgroundHref } from "@/lib/playground-links";
import { PRODUCT_FACTS } from "@/lib/product-facts";
import { LiveDemo, type LiveDemoName } from "./live-demos";

const MCP_URL = mcpServerUrl(baseUrl);
const FREE = PLAN_LIMITS.free;

function MoreLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <LocaleLink
      href={href}
      className="group/link inline-flex w-fit items-center gap-1.5 rounded-sm text-sm font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {children}
      <ArrowRight
        aria-hidden="true"
        className="size-3.5 transition-transform duration-200 ease-[cubic-bezier(.32,.72,0,1)] group-hover/link:translate-x-0.5 motion-reduce:transition-none"
      />
    </LocaleLink>
  );
}

/** Names the feature above each title, in the same place on rows and cards. */
function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-xs text-muted-foreground">{children}</span>
  );
}

interface CardFeature {
  demo: LiveDemoName;
  /** Its copy: messages (home.features.<key>). */
  key: "scanScore" | "printSize" | "dynamic" | "analytics";
  href: string;
}

// Two print features, then two dynamic-code features: each pair shares a row.
const cards: CardFeature[] = [
  { demo: "scan-score", key: "scanScore", href: "/tools/scan-checker" },
  { demo: "print-size", key: "printSize", href: "/tools/print-size" },
  { demo: "dynamic", key: "dynamic", href: "/docs/dynamic-qr-codes" },
  {
    demo: "analytics",
    key: "analytics",
    href: "/docs/help/dynamic-codes/scans",
  },
];

function Row({
  eyebrow,
  title,
  description,
  link,
  visual,
  reverse = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  link: ReactNode;
  visual: ReactNode;
  reverse?: boolean;
}) {
  return (
    <Reveal className="grid items-center gap-8 px-10 py-12 md:py-16 lg:grid-cols-5 lg:gap-12">
      <div
        className={cn(
          "flex max-w-xl flex-col gap-3 lg:col-span-2",
          reverse && "lg:order-last",
        )}
      >
        <Eyebrow>{eyebrow}</Eyebrow>
        <h3 className="text-2xl font-medium tracking-tighter text-balance text-foreground md:text-3xl">
          {title}
        </h3>
        <p className="text-muted-foreground text-pretty leading-relaxed">
          {description}
        </p>
        <div className="pt-1">{link}</div>
      </div>
      <div className="min-w-0 lg:col-span-3">{visual}</div>
    </Reveal>
  );
}

export function FeatureRowsSection() {
  const t = useTranslations("home.features");
  // Counts come from code (lib/plans, lib/product-facts), never the catalog.
  const cardValues = {
    count: FREE.dynamicCodes,
    days: FREE.analyticsRetentionDays,
  };
  return (
    <section
      id="features"
      aria-labelledby="features-heading"
      className="flex w-full flex-col items-center"
    >
      <SectionHeader eyebrow={t("eyebrow")} pattern="topo">
        <h2
          id="features-heading"
          className="text-3xl md:text-4xl font-medium tracking-tighter text-center text-balance"
        >
          {t("title")}
        </h2>
        <p className="text-muted-foreground text-center text-balance font-medium">
          {t("description")}
        </p>
      </SectionHeader>

      <div className="w-full divide-y divide-border">
        <Row
          eyebrow={t("design.eyebrow")}
          title={t("design.title")}
          description={t("design.description", {
            bodyPatterns: PRODUCT_FACTS.bodyPatterns,
            eyeShapes: PRODUCT_FACTS.eyeShapes,
            frames: PRODUCT_FACTS.frames,
          })}
          link={<MoreLink href={playgroundHref()}>{t("design.link")}</MoreLink>}
          visual={
            <Card className="gap-0 overflow-hidden py-0">
              {/* The demo mounts as it nears the viewport, so the skeleton
                  must already be its full height or everything below jumps
                  (fast scrolls on phones). Below md the controls stack on the
                  preview and the pattern buttons wrap, so the height depends
                  on the width: these are the measured Patterns-tab heights
                  (the tallest tab), rounded up. Re-measure if the demo's
                  controls change. */}
              <LiveDemo
                name="studio"
                className="min-h-[770px] min-[360px]:min-h-[724px] min-[390px]:min-h-[690px] min-[450px]:min-h-[654px] min-[570px]:min-h-[634px] md:h-[340px] md:min-h-0 lg:h-[400px] xl:h-[340px]"
              />
            </Card>
          }
        />

        <ul className="grid gap-4 px-10 py-12 md:grid-cols-2 md:py-16">
          {cards.map((card, index) => (
            <li key={card.demo}>
              <Reveal delay={(index % 2) * 70} className="h-full">
                <Card className="h-full gap-0 py-0 transition-colors duration-200 hover:border-foreground/15">
                  <div className="p-1.5 pb-0">
                    <LiveDemo
                      name={card.demo}
                      className="h-[19rem] overflow-hidden rounded-[20px] bg-muted/60 dark:bg-muted/50"
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5 px-5 pt-5 pb-5 md:px-6 md:pb-6">
                    <Eyebrow>{t(`${card.key}.eyebrow`)}</Eyebrow>
                    <h3 className="text-lg font-medium tracking-tight text-foreground">
                      {t(`${card.key}.title`)}
                    </h3>
                    <p className="text-sm text-muted-foreground text-pretty leading-relaxed">
                      {t(`${card.key}.description`, cardValues)}
                    </p>
                    <div className="mt-auto pt-3">
                      <MoreLink href={card.href}>
                        {t(`${card.key}.link`)}
                      </MoreLink>
                    </div>
                  </div>
                </Card>
              </Reveal>
            </li>
          ))}
        </ul>

        <Row
          reverse
          eyebrow={t("bulk.eyebrow")}
          title={t("bulk.title")}
          description={t("bulk.description", { max: MAX_BULK_ROWS })}
          link={<MoreLink href="/tools/bulk">{t("bulk.link")}</MoreLink>}
          visual={
            <BrowserFrame url="qrdx.dev/tools/bulk">
              <LoopVideo {...loopVideos.bulk} />
            </BrowserFrame>
          }
        />

        <Row
          eyebrow={t("developers.eyebrow")}
          title={t("developers.title")}
          description={t("developers.description")}
          link={
            <MoreLink href="/docs/developers">{t("developers.link")}</MoreLink>
          }
          visual={<McpTerminal mcpUrl={MCP_URL} />}
        />
      </div>
    </section>
  );
}
