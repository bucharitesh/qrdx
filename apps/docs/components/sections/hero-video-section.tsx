import { ExportSquare, Youtube } from "iconsax-reactjs";
import { BrowserFrame } from "@/components/mockups/browser-frame";
import { LoopVideo } from "@/components/mockups/loop-video";
import { Reveal } from "@/components/mockups/reveal";
import { loopVideos } from "@/components/mockups/visuals";
import { SectionHeader } from "@/components/sections/section-header";

const STEPS = [
  { title: "Paste a link", text: "Or pick Wi-Fi, vCard, UPI and more." },
  { title: "Style it", text: "Patterns, colors, logo and a frame." },
  { title: "Download", text: "PNG, SVG, PDF and more. No account." },
];

/** Short playground loop on the homepage, with a link to the full intro video. */
export function HeroVideoSection() {
  return (
    <section
      id="video"
      aria-labelledby="video-heading"
      className="flex w-full flex-col items-center"
    >
      <SectionHeader eyebrow="Demo" pattern="noise">
        <h2
          id="video-heading"
          className="text-3xl md:text-4xl font-medium tracking-tighter text-center text-balance"
        >
          See QRdx in action
        </h2>
        <p className="text-muted-foreground text-center text-balance font-medium">
          Paste a link, style it and download. No account needed.
        </p>
      </SectionHeader>
      <Reveal className="flex w-full flex-col items-center gap-8 px-6 py-12 md:px-10 md:py-16">
        <BrowserFrame url="qrdx.dev/playground" className="w-full max-w-5xl">
          <LoopVideo {...loopVideos.playground} />
        </BrowserFrame>
        <ol className="grid w-full max-w-5xl gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="flex flex-col gap-1 bg-background p-4 md:p-5"
            >
              <span className="font-mono text-xs text-muted-foreground">
                0{index + 1}
              </span>
              <span className="font-medium text-foreground">{step.title}</span>
              <span className="text-sm text-muted-foreground">{step.text}</span>
            </li>
          ))}
        </ol>
        <a
          href="https://www.youtube.com/watch?v=z7dsFh9Vcco"
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-2 rounded-sm text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Youtube variant="Bold" className="size-4" />
          Watch the full introduction on YouTube
          <ExportSquare className="size-3.5 transition-transform duration-200 group-hover:-translate-y-px group-hover:translate-x-px" />
        </a>
      </Reveal>
    </section>
  );
}
