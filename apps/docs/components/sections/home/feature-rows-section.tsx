import { Card } from "@repo/design-system/components/ui/card";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowRight } from "iconsax-reactjs";
import Link from "next/link";
import type { ReactNode } from "react";
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
import { PRODUCT_FACTS } from "@/lib/product-facts";
import { LiveDemo, type LiveDemoName } from "./live-demos";

const MCP_URL = mcpServerUrl(baseUrl);
const FREE = PLAN_LIMITS.free;

function MoreLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="group/link inline-flex w-fit items-center gap-1.5 rounded-sm text-sm font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {children}
      <ArrowRight
        aria-hidden="true"
        className="size-3.5 transition-transform duration-200 ease-[cubic-bezier(.32,.72,0,1)] group-hover/link:translate-x-0.5 motion-reduce:transition-none"
      />
    </Link>
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
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  linkText: string;
}

// Two print features, then two dynamic-code features: each pair shares a row.
const cards: CardFeature[] = [
  {
    demo: "scan-score",
    eyebrow: "Scan score",
    title: "Know it scans before you print",
    description:
      "Every design is decoded in your browser at three sizes, with camera blur. Lighten the ink to see the score react.",
    href: "/tools/scan-checker",
    linkText: "Check a printed code",
  },
  {
    demo: "print-size",
    eyebrow: "Print size",
    title: "Print it big enough",
    description:
      "The minimum size depends on how far away people scan from and how much the code holds.",
    href: "/tools/print-size",
    linkText: "Print size calculator",
  },
  {
    demo: "dynamic",
    eyebrow: "Dynamic codes",
    title: "Change the link after printing",
    description: `A dynamic code opens a short link you can point somewhere new at any time. Free accounts get ${FREE.dynamicCodes}.`,
    href: "/docs/dynamic-qr-codes",
    linkText: "About dynamic codes",
  },
  {
    demo: "analytics",
    eyebrow: "Analytics",
    title: "See every scan",
    description: `Scans over time, countries, devices, browsers and referrers for every dynamic code. Free accounts keep ${FREE.analyticsRetentionDays} days.`,
    href: "/docs/help/dynamic-codes/scans",
    linkText: "How scan analytics work",
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
  return (
    <section
      id="features"
      aria-labelledby="features-heading"
      className="flex w-full flex-col items-center"
    >
      <SectionHeader eyebrow="Features" pattern="topo">
        <h2
          id="features-heading"
          className="text-3xl md:text-4xl font-medium tracking-tighter text-center text-balance"
        >
          Everything around the QR code
        </h2>
        <p className="text-muted-foreground text-center text-balance font-medium">
          Design it, check it scans, print it the right size and keep it up to
          date. Try each one right here.
        </p>
      </SectionHeader>

      <div className="w-full divide-y divide-border">
        <Row
          eyebrow="Design"
          title="Design every detail"
          description={`${PRODUCT_FACTS.bodyPatterns} body patterns, ${PRODUCT_FACTS.eyeShapes} eye shapes and ${PRODUCT_FACTS.frames} frames, in solid colors or gradients. The playground and the qrdx React library draw with this same renderer.`}
          link={<MoreLink href="/playground">Open the playground</MoreLink>}
          visual={
            <Card className="gap-0 overflow-hidden py-0">
              <LiveDemo
                name="studio"
                className="min-h-[560px] md:h-[340px] md:min-h-0 lg:h-[400px] xl:h-[340px]"
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
                    <Eyebrow>{card.eyebrow}</Eyebrow>
                    <h3 className="text-lg font-medium tracking-tight text-foreground">
                      {card.title}
                    </h3>
                    <p className="text-sm text-muted-foreground text-pretty leading-relaxed">
                      {card.description}
                    </p>
                    <div className="mt-auto pt-3">
                      <MoreLink href={card.href}>{card.linkText}</MoreLink>
                    </div>
                  </div>
                </Card>
              </Reveal>
            </li>
          ))}
        </ul>

        <Row
          reverse
          eyebrow="Bulk"
          title="Hundreds of codes from one CSV"
          description={`Map the columns, pick a style and download up to ${MAX_BULK_ROWS.toLocaleString("en-US")} codes as PNG or SVG in one ZIP. The file never leaves your browser.`}
          link={<MoreLink href="/tools/bulk">Open the bulk generator</MoreLink>}
          visual={
            <BrowserFrame url="qrdx.dev/tools/bulk">
              <LoopVideo {...loopVideos.bulk} />
            </BrowserFrame>
          }
        />

        <Row
          eyebrow="Developers"
          title="Built for developers"
          description="Render codes with the qrdx React library, get images from a URL with the image API, or let Claude, Cursor and VS Code make them through the MCP server. You can also self-host the whole app."
          link={<MoreLink href="/docs/developers">Developer docs</MoreLink>}
          visual={<McpTerminal mcpUrl={MCP_URL} />}
        />
      </div>
    </section>
  );
}
