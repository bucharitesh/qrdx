import type { Metadata } from "next";
import { NotFoundScreen } from "@/components/not-found-screen";
import { RootDocument } from "@/components/root-document";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { rootMetadata, rootViewport } from "@/lib/root-metadata";

// URLs that match no route at all (/, /pricing on this app's own host). The
// only root layout is app/[lang], so this one brings its own document
// (experimental.globalNotFound in next.config.ts). On qrdx.dev the main app
// answers every path outside the docs, so readers don't see it there.
export const metadata: Metadata = {
  ...rootMetadata(),
  title: "Page not found",
  robots: { index: false },
};

export const viewport = rootViewport;

export default function GlobalNotFound() {
  return (
    <RootDocument locale={DEFAULT_LOCALE}>
      <NotFoundScreen />
    </RootDocument>
  );
}
