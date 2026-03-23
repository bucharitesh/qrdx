import { Button } from "@repo/design-system/components/ui/button";
import Link from "next/link";

export function IntegrationsHero() {
  return (
    <section className="w-full relative border-b">
      <div className="absolute inset-0 -z-10 h-full w-full [background:radial-gradient(125%_125%_at_50%_10%,var(--background)_40%,#ff5a2d_100%)]" />
      <div className="flex flex-col items-center justify-center gap-6 px-6 py-24 md:py-32 text-center">
        <p className="border border-border bg-muted rounded-full text-sm h-8 px-3 flex items-center gap-2 text-muted-foreground">
          Integrations
        </p>
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tighter text-balance max-w-2xl text-secondary-foreground">
          Seamless integrations with QRdx
        </h1>
        <p className="text-base md:text-lg text-muted-foreground font-medium text-balance max-w-xl leading-relaxed tracking-tight">
          Connect your favourite tools in just a few clicks and supercharge your
          QR code workflow.
        </p>
        <Link href="#all-integrations">
          <Button>View integrations</Button>
        </Link>
      </div>
    </section>
  );
}
