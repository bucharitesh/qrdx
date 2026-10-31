import { ExternalLink } from "lucide-react";
import { BrowserFrame } from "@/components/mockups/browser-frame";
import { LoopVideo } from "@/components/mockups/loop-video";
import { Reveal } from "@/components/mockups/reveal";
import { loopVideos } from "@/components/mockups/visuals";
import { SectionHeader } from "@/components/sections/section-header";

/** Short playground loop on the homepage, with a link to the full intro video. */
export function HeroVideoSection() {
  return (
    <section
      id="video"
      aria-labelledby="video-heading"
      className="flex w-full flex-col items-center"
    >
      <SectionHeader>
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
      <Reveal className="flex w-full flex-col items-center gap-4 px-6 py-10 md:px-10">
        <BrowserFrame url="qrdx.dev/playground" className="w-full max-w-5xl">
          <LoopVideo {...loopVideos.playground} />
        </BrowserFrame>
        <a
          href="https://www.youtube.com/watch?v=z7dsFh9Vcco"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Watch the full introduction on YouTube
          <ExternalLink className="size-3.5" />
        </a>
      </Reveal>
    </section>
  );
}
