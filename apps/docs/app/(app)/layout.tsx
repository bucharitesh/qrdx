import type { Metadata, Viewport } from "next";
import { RootDocument } from "@/components/root-document";
import { rootMetadata, rootViewport } from "@/lib/root-metadata";

// The root layout for every page that isn't translated yet: the signed-in
// app, docs, the playground, hosted pages and the marketing pages not moved
// to app/[lang]. No `[lang]` root param here, so they render in English.
export const metadata: Metadata = rootMetadata();

export const viewport: Viewport = rootViewport;

export default function Layout({ children }: LayoutProps<"/">) {
  return <RootDocument>{children}</RootDocument>;
}
