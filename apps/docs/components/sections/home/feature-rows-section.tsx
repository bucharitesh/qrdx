import { Card } from "@repo/design-system/components/ui/card";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowRight } from "iconsax-reactjs";
import Link from "next/link";
import {
  BODY_PATTERN,
  CORNER_EYE_DOT_PATTERNS,
  CORNER_EYE_PATTERNS,
} from "qrdx/types";
import type { ReactNode } from "react";
import { SpotlightCard } from "@/components/fx/spotlight-card";
import { BrowserFrame } from "@/components/mockups/browser-frame";
import {
  HairlineFigure,
  type HairlineFigureName,
} from "@/components/mockups/hairline";
import { LoopVideo } from "@/components/mockups/loop-video";
import { McpTerminal } from "@/components/mockups/mcp-terminal";
import { Reveal } from "@/components/mockups/reveal";
import { loopVideos } from "@/components/mockups/visuals";
import { SectionHeader } from "@/components/sections/section-header";
import { mcpServerUrl } from "@/lib/mcp-clients";
import { baseUrl } from "@/lib/metadata";
import { LiveDemo, type LiveDemoName } from "./live-demos";

const MCP_URL = mcpServerUrl(baseUrl);

function MoreLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="group/link inline-flex w-fit items-center gap-1.5 rounded-sm text-sm font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {children}
      <ArrowRight className="size-3.5 transition-transform duration-200 ease-[cubic-bezier(.32,.72,0,1)] group-hover/link:translate-x-0.5" />
    </Link>
  );
}

interface CardFeature {
  demo: LiveDemoName;
  figure: HairlineFigureName;
  title: string;
  description: string;
  href: string;
  linkText: string;
}

const cards: CardFeature[] = [
  {
    demo: "scan-score",
    figure: "Phosphor",
    title: "Know it scans before you print",
    description:
      "Every design gets a live scan score, decoded in your browser. Lighten the ink and watch it react.",
    href: "/tools/scan-checker",
    linkText: "Check a printed code",
  },
  {
    demo: "print-size",
    figure: "Loupe",
    title: "Print it big enough",
    description:
      "The minimum size depends on how far away people scan from and how much data the code holds.",
    href: "/tools/print-size",
    linkText: "Print size calculator",
  },
  {
    demo: "dynamic",
    figure: "Relay",
    title: "Change the link after printing",
    description:
      "Dynamic codes point to a short link you can edit from your dashboard, so the printed code never needs replacing. Free account required.",
    href: "/docs/dynamic-qr-codes",
    linkText: "About dynamic codes",
  },
  {
    demo: "analytics",
    figure: "Plot",
    title: "See every scan",
    description:
      "Dynamic codes count scans over time, with countries, devices, browsers and referrers.",
    href: "/docs/dynamic-qr-codes",
    linkText: "How analytics work",
  },
];

function Row({
  index,
  title,
  description,
  link,
  visual,
  aside,
  reverse = false,
}: {
  index: string;
  title: string;
  description: string;
  link: ReactNode;
  visual: ReactNode;
  aside?: ReactNode;
  reverse?: boolean;
}) {
  return (
    <Reveal className="grid items-center gap-8 px-6 py-12 md:grid-cols-5 md:gap-12 md:px-10 md:py-16">
      <div
        className={cn(
          "flex flex-col gap-3 md:col-span-2",
          reverse && "md:order-last",
        )}
      >
        <span className="font-mono text-xs text-muted-foreground">{index}</span>
        <h3 className="text-2xl font-medium tracking-tighter text-balance text-foreground md:text-3xl">
          {title}
        </h3>
        <p className="text-muted-foreground text-pretty leading-relaxed">
          {description}
        </p>
        {link}
        {aside}
      </div>
      <div className="min-w-0 md:col-span-3">{visual}</div>
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
          index="01 / Design"
          title="Design every detail"
          description={`Choose from ${BODY_PATTERN.length} body patterns, ${CORNER_EYE_PATTERNS.length} corner eye shapes and ${CORNER_EYE_DOT_PATTERNS.length} eye centres, use solid or gradient colors, and add a call-to-action frame. This is the same renderer the playground and the qrdx React library use.`}
          link={<MoreLink href="/playground">Open the playground</MoreLink>}
          aside={
            <HairlineFigure
              figure="Exploded"
              className="mt-8 hidden aspect-[5/4] w-full max-w-[22rem] md:block"
            />
          }
          visual={
            <SpotlightCard asChild>
              <Card className="gap-0 overflow-hidden py-0">
                <LiveDemo
                  name="studio"
                  className="min-h-[560px] md:h-[340px] md:min-h-0"
                />
              </Card>
            </SpotlightCard>
          }
        />

        <div className="grid gap-4 px-6 py-12 sm:grid-cols-2 md:px-10 md:py-16">
          {cards.map((card, index) => (
            <Reveal key={card.demo} delay={(index % 2) * 70} className="h-full">
              <SpotlightCard asChild>
                <Card className="h-full gap-0 overflow-hidden py-0 transition-colors duration-200 hover:border-foreground/15">
                  <LiveDemo name={card.demo} className="h-[320px] border-b" />
                  <div className="flex flex-1 items-start gap-4 p-5 md:p-6">
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className="font-mono text-xs text-muted-foreground">
                        0{index + 2}
                      </span>
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
                    <HairlineFigure
                      figure={card.figure}
                      surface="card"
                      intensity={0.6}
                      className="hidden aspect-[5/4] w-32 shrink-0 lg:block xl:w-36"
                    />
                  </div>
                </Card>
              </SpotlightCard>
            </Reveal>
          ))}
        </div>

        <Row
          reverse
          index="06 / Bulk"
          title="Hundreds of codes from one CSV"
          description="Map the columns, pick a style and download up to 5,000 codes as PNG or SVG in one ZIP. The file never leaves your browser."
          link={<MoreLink href="/tools/bulk">Open the bulk generator</MoreLink>}
          aside={
            <HairlineFigure
              figure="Cabinet"
              className="mt-8 hidden aspect-[5/4] w-full max-w-[22rem] md:block"
            />
          }
          visual={
            <BrowserFrame url="qrdx.dev/tools/bulk">
              <LoopVideo {...loopVideos.bulk} />
            </BrowserFrame>
          }
        />

        <Row
          index="07 / Developers"
          title="Built for developers"
          description="Render codes in your app with the qrdx React library, get images from a URL with the image API, or let Claude, Cursor and VS Code make them through the MCP server. You can also self-host the whole app."
          link={<MoreLink href="/docs">Read the docs</MoreLink>}
          aside={
            <HairlineFigure
              figure="Hub"
              className="mt-8 hidden aspect-[5/4] w-full max-w-[22rem] md:block"
            />
          }
          visual={<McpTerminal mcpUrl={MCP_URL} />}
        />
      </div>
    </section>
  );
}
