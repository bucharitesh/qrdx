// What "Make a collection or kit" shows, on its own page (a direct visit) and
// in the modal over a community page (a click from one). A server component:
// it reads the visitor's saved and published items.
import { Button } from "@repo/design-system/components/ui/button";
import Link from "next/link";
import { bundleSources } from "@/lib/community/bundles";
import { viewerId } from "@/lib/community/viewer";
import { CreateBundle } from "./create-bundle";

export const NEW_BUNDLE_TITLE = "Make a collection or kit";
export const NEW_BUNDLE_INTRO =
  "Put together items from the community: the ones you saved and the ones you published.";

export type NewBundleMode = "collection" | "kit";

export function newBundleMode(
  make: string | string[] | undefined,
): NewBundleMode {
  return make === "kit" ? "kit" : "collection";
}

export async function NewBundle({ mode }: { mode: NewBundleMode }) {
  const userId = await viewerId();
  if (!userId) {
    return (
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
    );
  }
  return (
    <CreateBundle initialMode={mode} sources={await bundleSources(userId)} />
  );
}
