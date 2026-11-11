import type { Metadata } from "next";
import {
  NEW_BUNDLE_INTRO,
  NEW_BUNDLE_TITLE,
  NewBundle,
  newBundleMode,
} from "@/components/community/new-bundle";
import { LICENSE_SHORT } from "@/lib/community/licence";
import { createMetadata } from "@/lib/metadata";

// A direct visit (or a sign-in coming back). From a community page the same
// form opens in a modal instead: see ../@modal/(.)new.
export const metadata: Metadata = {
  ...createMetadata({
    title: "Make a collection or kit | Community",
    description:
      "Group community frames, themes and page templates into a collection, or pair a page template with its look as a kit.",
    path: "/community/new",
  }),
  robots: { index: false, follow: false },
};

export default async function CommunityNewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const mode = newBundleMode((await searchParams).make);

  return (
    <main className="w-full border-b">
      <section className="mx-auto max-w-4xl space-y-2 px-4 pt-12 pb-8 sm:px-6">
        <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
          Community
        </p>
        <h1 className="text-2xl font-semibold tracking-tight md:text-4xl">
          {NEW_BUNDLE_TITLE}
        </h1>
        <p className="text-muted-foreground max-w-2xl text-pretty">
          {NEW_BUNDLE_INTRO}
        </p>
        <p className="text-muted-foreground text-xs">{LICENSE_SHORT}</p>
      </section>
      <section className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
        <NewBundle mode={mode} />
      </section>
    </main>
  );
}
