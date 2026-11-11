import type { ReactNode } from "react";
import { Header } from "@/components/header";
import { SeasonalPlayground } from "@/components/seasonal/playground-layer";
import { JsonLd } from "@/components/sections/tools/json-ld";
import { organizationSchema } from "@/lib/seo-schema";
import { Providers } from "./playground-providers";

/**
 * The playground's page frame: the site header over the full-height editor.
 * Shared by /playground in every language (app/[lang]/playground) and the
 * shared theme links (app/(app)/playground/[...qrId]).
 */
export function PlaygroundShell({
  heading,
  children,
}: {
  /** The page's (visually hidden) h1, in the page's language. */
  heading: string;
  children: ReactNode;
}) {
  return (
    <Providers>
      <JsonLd data={organizationSchema} />
      <div className="relative isolate flex h-svh flex-col overflow-hidden">
        <Header />
        <SeasonalPlayground />
        <main className="isolate flex flex-1 flex-col overflow-hidden">
          <h1 className="sr-only">{heading}</h1>
          {children}
        </main>
      </div>
    </Providers>
  );
}
