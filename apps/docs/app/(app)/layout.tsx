import type { Metadata, Viewport } from "next";
import { RootDocument } from "@/components/root-document";
import { rootMetadata, rootViewport } from "@/lib/root-metadata";

// The root layout for every page that isn't translated yet: the signed-in
// app, docs, the playground, hosted pages and the marketing pages not moved
// to app/[lang]. No `[lang]` root param here, so they render in English.
export const metadata: Metadata = rootMetadata();

export const viewport: Viewport = rootViewport;

/**
 * Catalog parts for client components that also render on translated pages
 * (lib/i18n): here they're in English.
 */
const SHARED_CLIENT_MESSAGES = [
  // components/sections/tools/scan-checker.tsx, in the editor's photo check.
  "scanChecker",
  // components/sections/tools/barcode-generator.tsx, in the dashboard.
  "barcodeTool",
  // components/landing/demo/demo-qr-button.tsx, on the template demo pages.
  "templateDemo",
];

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <RootDocument messages={SHARED_CLIENT_MESSAGES}>{children}</RootDocument>
  );
}
