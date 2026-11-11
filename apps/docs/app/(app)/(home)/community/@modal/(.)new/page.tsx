import {
  NEW_BUNDLE_INTRO,
  NEW_BUNDLE_TITLE,
  NewBundle,
  newBundleMode,
} from "@/components/community/new-bundle";
import { RouteModal } from "@/components/community/route-modal";
import { LICENSE_SHORT } from "@/lib/community/licence";

// /community/new opened from a community page: the same form, in a modal.
export default async function NewBundleModal({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const mode = newBundleMode((await searchParams).make);
  return (
    <RouteModal description={NEW_BUNDLE_INTRO} title={NEW_BUNDLE_TITLE}>
      <NewBundle mode={mode} />
      <p className="text-muted-foreground text-xs">{LICENSE_SHORT}</p>
    </RouteModal>
  );
}
