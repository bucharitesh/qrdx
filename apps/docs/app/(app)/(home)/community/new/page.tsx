import { auth } from "@repo/auth/server";
import { Button } from "@repo/design-system/components/ui/button";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { CreateBundle } from "@/components/community/create-bundle";
import { bundleSources } from "@/lib/community/bundles";
import { LICENSE_SHORT } from "@/lib/community/licence";
import { createMetadata } from "@/lib/metadata";

export const metadata: Metadata = {
  ...createMetadata({
    title: "Make a collection or kit | Community",
    description:
      "Group community frames, themes and page templates into a collection, or pair a page template with its look as a kit.",
    path: "/community/new",
  }),
  robots: { index: false, follow: false },
};

async function viewerId(): Promise<string | null> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

export default async function CommunityNewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [userId, query] = await Promise.all([viewerId(), searchParams]);
  const mode = query.make === "kit" ? "kit" : "collection";

  return (
    <main className="w-full border-b">
      <section className="mx-auto max-w-4xl space-y-2 px-4 pt-12 pb-8 sm:px-6">
        <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
          Community
        </p>
        <h1 className="text-2xl font-semibold tracking-tight md:text-4xl">
          Make a collection or kit
        </h1>
        <p className="text-muted-foreground max-w-2xl text-pretty">
          Put together items from the community: the ones you saved and the ones
          you published.
        </p>
        <p className="text-muted-foreground text-xs">{LICENSE_SHORT}</p>
      </section>
      <section className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
        {userId ? (
          <CreateBundle
            initialMode={mode}
            sources={await bundleSources(userId)}
          />
        ) : (
          <div className="space-y-3 rounded-xl border p-6 text-sm">
            <p>Sign in to make a collection or kit from items you saved.</p>
            <Button asChild size="sm">
              <Link
                href={`/sign-in?next=${encodeURIComponent(
                  mode === "kit" ? "/community/new?make=kit" : "/community/new",
                )}`}
              >
                Sign in
              </Link>
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
