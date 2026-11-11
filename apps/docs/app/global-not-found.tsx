import type { Metadata } from "next";
import { NotFoundScreen } from "@/components/not-found-screen";
import { RootDocument } from "@/components/root-document";
import { rootMetadata, rootViewport } from "@/lib/root-metadata";

// URLs that match no route at all (/fr when French isn't a locale, /es/docs,
// /anything/else). With two root layouts there is no single layout to
// render a 404 inside, so this one brings its own document
// (experimental.globalNotFound in next.config.ts). notFound() inside a page
// still renders that root's not-found.tsx.
export const metadata: Metadata = {
  ...rootMetadata(),
  title: "Page not found",
  robots: { index: false },
};

export const viewport = rootViewport;

export default function GlobalNotFound() {
  return (
    <RootDocument>
      <NotFoundScreen />
    </RootDocument>
  );
}
