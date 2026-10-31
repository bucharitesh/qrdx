import { cn } from "@repo/design-system/lib/utils";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BrowserFrame } from "@/components/mockups/browser-frame";
import { HairlineFigure } from "@/components/mockups/hairline";
import { LoopVideo } from "@/components/mockups/loop-video";
import { McpTerminal } from "@/components/mockups/mcp-terminal";
import { Reveal } from "@/components/mockups/reveal";
import { loopVideos } from "@/components/mockups/visuals";
import { SectionHeader } from "@/components/sections/section-header";
import { baseUrl } from "@/lib/metadata";
import { LiveDemo, type LiveDemoName } from "./live-demos";

const MCP_URL = new URL("/api/mcp", baseUrl).toString();

function MoreLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex w-fit items-center gap-1 text-sm font-medium text-secondary-foreground hover:underline"
    >
      {children}
      <ArrowRight className="size-3.5 transition-transform duration-200 ease-[cubic-bezier(.32,.72,0,1)] group-hover:translate-x-0.5" />
    </Link>
  );
}

interface CardFeature {
  demo: LiveDemoName;
  title: string;
  description: string;
  href: string;
  linkText: string;
}

const cards: CardFeature[] = [
  {
    demo: "scan-score",
    title: "Know it scans before you print",
    description:
      "Every design gets a live scan score. Drag the slider to lighten the code and watch it react.",
    href: "/tools/scan-checker",
    linkText: "Check a printed code",
  },
  {
    demo: "print-size",
    title: "Print it big enough",
    description:
      "The minimum size depends on how far away people scan from and how much data the code holds.",
    href: "/tools/print-size",
    linkText: "Print size calculator",
  },
  {
    demo: "dynamic",
    title: "Change the link after printing",
    description:
      "Dynamic codes point to a short link you can edit from your dashboard, so the printed code never needs replacing. Free account required.",
    href: "/docs/dynamic-qr-codes",
    linkText: "About dynamic codes",
  },
  {
    demo: "analytics",
    title: "See every scan",
    description:
      "Dynamic codes count scans over time, with countries, devices, browsers and referrers.",
    href: "/docs/dynamic-qr-codes",
    linkText: "How analytics work",
  },
];

function Row({
  title,
  description,
  link,
  visual,
  reverse = false,
}: {
  title: string;
  description: string;
  link: ReactNode;
  visual: ReactNode;
  reverse?: boolean;
}) {
  return (
    <Reveal className="grid items-center gap-8 px-6 py-10 md:grid-cols-5 md:gap-12 md:px-10 md:py-14">
      <div
        className={cn(
          "flex flex-col gap-3 md:col-span-2",
          reverse && "md:order-last",
        )}
      >
        <h3 className="text-2xl font-medium tracking-tighter text-secondary-foreground text-balance">
          {title}
        </h3>
        <p className="text-muted-foreground leading-relaxed">{description}</p>
        {link}
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
      <SectionHeader>
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
          title="Design every detail"
          description="Choose from 9 body patterns, 9 corner eye shapes and 11 eye dot styles, use solid or gradient colors, and add a call-to-action frame. This is the same renderer the playground and the qrdx React library use."
          link={<MoreLink href="/playground">Open the playground</MoreLink>}
          visual={
            <div className="rounded-2xl border border-border bg-background p-5 shadow-sm md:p-6">
              <LiveDemo
                name="studio"
                className="min-h-[540px] md:h-[300px] md:min-h-0"
              />
            </div>
          }
        />

        <div className="grid gap-4 px-6 py-10 sm:grid-cols-2 md:px-10 md:py-14">
          {cards.map((card, index) => (
            <Reveal key={card.demo} delay={index * 60} className="h-full">
              <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-accent/30 transition-colors duration-200 hover:border-foreground/15">
                <LiveDemo
                  name={card.demo}
                  className="h-[340px] border-b border-border bg-background p-5"
                />
                <div className="flex flex-1 flex-col gap-1.5 p-5">
                  <h3 className="font-semibold text-secondary-foreground">
                    {card.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {card.description}
                  </p>
                  <div className="mt-auto pt-2">
                    <MoreLink href={card.href}>{card.linkText}</MoreLink>
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
        </div>

        <Row
          reverse
          title="Hundreds of codes from one CSV"
          description="Map the columns, pick a style and download up to 5,000 codes as PNG or SVG in one ZIP. The file never leaves your browser."
          link={<MoreLink href="/tools/bulk">Open the bulk generator</MoreLink>}
          visual={
            <BrowserFrame url="qrdx.dev/tools/bulk">
              <LoopVideo {...loopVideos.bulk} />
            </BrowserFrame>
          }
        />

        <Row
          title="Built for developers"
          description="Render codes in your app with the qrdx React library, get images from a URL with the image API, or let Claude, Cursor and VS Code make them through the MCP server. You can also self-host the whole app."
          link={
            <>
              <MoreLink href="/docs">Read the docs</MoreLink>
              <HairlineFigure
                figure="Hub"
                className="mt-4 hidden aspect-square w-40 md:block"
              />
            </>
          }
          visual={<McpTerminal mcpUrl={MCP_URL} />}
        />
      </div>
    </section>
  );
}
