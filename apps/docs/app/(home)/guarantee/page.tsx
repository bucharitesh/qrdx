import { Button } from "@repo/design-system/components/ui/button";
import { ArrowRight } from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import {
  GUARANTEE_NAME,
  GUARANTEE_PROMISES,
} from "@/components/sections/pricing/guarantee-block";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import { siteConfig } from "@/config/site";
import { createMetadata } from "@/lib/metadata";

export const metadata: Metadata = createMetadata({
  title: `${GUARANTEE_NAME}: Your QR Codes Keep Working`,
  description:
    "QRdx never holds printed QR codes hostage: dynamic codes keep redirecting after a downgrade, failed payment or cancellation, with no pausing, no ads and full export.",
  path: "/guarantee",
});

const UPDATED = "2026-10-31";

const scenarios: { when: string; outcome: string }[] = [
  {
    when: "You cancel",
    outcome:
      "Your plan stays active until the end of the period you paid for, then your account moves to Free. Every dynamic code keeps redirecting and every scan is still recorded.",
  },
  {
    when: "A payment fails",
    outcome:
      "The same as a cancellation once the subscription lapses. Codes are never paused while billing is sorted out.",
  },
  {
    when: "You move to a smaller plan",
    outcome:
      "Existing codes, landing pages and verified custom domains keep working. Analytics show the history your new plan includes.",
  },
  {
    when: "You go over a limit",
    outcome:
      "You can't create more until you're back under it. You can still change where existing codes point, archive them and export them.",
  },
  {
    when: "A team owner's plan changes",
    outcome:
      "Team codes keep working and current members stay. The team's limits follow the best plan among its owners.",
  },
  {
    when: "A code you scheduled, paused or capped ends",
    outcome:
      'Scanners go to the fallback URL you chose, or to a neutral "This campaign has ended" page. Never to a QRdx sign-up or upsell page.',
  },
  {
    when: "QRdx shuts down",
    outcome:
      "You get at least 12 months' notice, time to export everything, and a documented path to run the open-source app on your own server.",
  },
];

export default function GuaranteePage() {
  return (
    <main className="flex flex-col divide-y divide-border min-h-screen w-full">
      <ToolHero
        pattern="halo"
        focus={[0.5, 0.4]}
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Pricing", path: "/pricing" },
          { name: GUARANTEE_NAME, path: "/guarantee" },
        ]}
        title={`The ${GUARANTEE_NAME}`}
        intro={[
          "A printed QR code can't be reprinted when a subscription ends. So on QRdx, the codes you put on packaging, menus and posters keep working whatever happens to your plan.",
          "This applies to every account, including Free.",
        ]}
      >
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <Button asChild>
            <Link href="/pricing">
              See pricing
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/docs/self-hosting">Self-hosting guide</Link>
          </Button>
        </div>
      </ToolHero>

      <section
        aria-labelledby="promises"
        className="w-full px-6 md:px-10 py-12 flex flex-col gap-6"
      >
        <h2
          className="text-2xl font-medium tracking-tighter text-secondary-foreground"
          id="promises"
        >
          Our promises
        </h2>
        <ol className="grid gap-4 md:grid-cols-2">
          {GUARANTEE_PROMISES.map((promise) => (
            <li
              className="flex gap-4 rounded-xl border border-border bg-card p-5 shadow-sm"
              key={promise.title}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/40">
                <promise.icon
                  aria-hidden
                  className="size-4 text-foreground/80"
                />
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="font-medium text-secondary-foreground">
                  {promise.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {promise.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="scenarios"
        className="w-full px-6 md:px-10 py-12 flex flex-col gap-6"
      >
        <h2
          className="text-2xl font-medium tracking-tighter text-secondary-foreground"
          id="scenarios"
        >
          What happens when...
        </h2>
        <dl className="divide-y divide-border rounded-xl border border-border">
          {scenarios.map((scenario) => (
            <div
              className="grid gap-1 p-5 md:grid-cols-[16rem_1fr] md:gap-6"
              key={scenario.when}
            >
              <dt className="font-medium text-secondary-foreground">
                {scenario.when}
              </dt>
              <dd className="text-sm leading-relaxed text-muted-foreground">
                {scenario.outcome}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        aria-labelledby="exception"
        className="w-full px-6 md:px-10 py-12 flex flex-col gap-3 max-w-3xl"
      >
        <h2
          className="text-2xl font-medium tracking-tighter text-secondary-foreground"
          id="exception"
        >
          The one exception: abuse
        </h2>
        <p className="leading-relaxed text-muted-foreground">
          We disable a code only when it breaks our{" "}
          <Link
            className="font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground"
            href="/legal/terms-of-service"
          >
            terms of service
          </Link>
          , for example by pointing to phishing or malware. That's a safety
          decision made after a report or a review, never a billing one. Anyone
          can{" "}
          <Link
            className="font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground"
            href="/report-abuse"
          >
            report a code
          </Link>
          .
        </p>
        <p className="text-sm text-muted-foreground">
          Questions about the guarantee? Email{" "}
          <a
            className="font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground"
            href={`mailto:${siteConfig.links.email}`}
          >
            {siteConfig.links.email}
          </a>
          . Last updated <time dateTime={UPDATED}>October 31, 2026</time>.
        </p>
      </section>
    </main>
  );
}
