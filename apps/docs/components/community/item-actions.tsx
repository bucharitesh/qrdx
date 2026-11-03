"use client";

import { toast } from "@repo/design-system";
import { Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { Archive, Brush2, FolderAdd, Heart } from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  copyCommunityItem,
  toggleCommunityLike,
  toggleCommunitySave,
} from "@/actions/community";
import { useWorkspaceHref } from "@/components/workspace-provider";
import { defaultThemeState } from "@/config/qr";
import type { CommunityItemDetail } from "@/lib/community/types";
import { useSessionGuard } from "@/lib/hooks/use-gaurds";
import { soundEvent } from "@/lib/sound/emit";
import { useQREditorStore } from "@/store/editor-store";

/** Puts an item into the editor: a frame joins your design, a theme replaces it. */
export function useApplyToEditor() {
  const router = useRouter();
  return (item: Pick<CommunityItemDetail, "type" | "apply">) => {
    const { themeState, setThemeState } = useQREditorStore.getState();
    const styles =
      item.type === "frame"
        ? { ...themeState.styles, ...item.apply }
        : { ...defaultThemeState.styles, ...item.apply };
    setThemeState({ ...themeState, styles });
    soundEvent("apply");
    router.push("/playground?tab=customisations");
  };
}

/** Use in editor (primary), save, like and copy to workspace. */
export function ItemActions({
  item,
  layout = "panel",
}: {
  item: CommunityItemDetail;
  layout?: "panel" | "bar";
}) {
  const router = useRouter();
  const apply = useApplyToEditor();
  const inWorkspace = useWorkspaceHref();
  const { checkValidSession } = useSessionGuard();
  const [liked, setLiked] = useState(item.isLikedByMe);
  const [likes, setLikes] = useState(item.likeCount);
  const [saved, setSaved] = useState(item.isSavedByMe);
  const [busy, setBusy] = useState<"like" | "save" | "copy" | null>(null);
  const stored = item.id !== null;
  const copyable = item.type !== "collection";

  const like = async () => {
    if (!(item.id && checkValidSession("signin"))) return;
    setBusy("like");
    const result = await toggleCommunityLike(item.id);
    setBusy(null);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setLiked(result.data.liked);
    setLikes(result.data.likeCount);
    router.refresh();
  };

  const save = async () => {
    if (!(item.id && checkValidSession("signin"))) return;
    setBusy("save");
    const result = await toggleCommunitySave(item.id);
    setBusy(null);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setSaved(result.data.saved);
    toast.success(
      result.data.saved
        ? item.type === "frame"
          ? "Saved. It's in the editor's frame picker."
          : "Saved."
        : "Removed from saved.",
    );
  };

  const copy = async () => {
    if (!checkValidSession("signin")) return;
    setBusy("copy");
    const result = await copyCommunityItem({
      type: item.type,
      slug: item.slug,
    });
    setBusy(null);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    soundEvent("success");
    const where =
      result.data.where === "team" ? "this workspace's themes" : "your themes";
    toast.success(`Copied to ${where} as "${result.data.name}"`, {
      action: {
        label: "Open",
        onClick: () => router.push(inWorkspace("/themes")),
      },
    });
  };

  if (layout === "bar") {
    return (
      <div className="flex items-center gap-2">
        {copyable && (
          <Button className="flex-1" onClick={() => apply(item)}>
            <Brush2 aria-hidden className="size-4" />
            Use in editor
          </Button>
        )}
        {stored && (
          <>
            <Button
              aria-label={saved ? "Remove from saved" : "Save"}
              aria-pressed={saved}
              disabled={busy !== null}
              onClick={save}
              size="icon"
              variant="outline"
            >
              <Archive className="size-4" variant={saved ? "Bold" : "Linear"} />
            </Button>
            <Button
              aria-label={liked ? "Unlike" : "Like"}
              aria-pressed={liked}
              disabled={busy !== null}
              onClick={like}
              size="icon"
              variant="outline"
            >
              <Heart className="size-4" variant={liked ? "Bold" : "Linear"} />
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {copyable && (
        <Button className="w-full" onClick={() => apply(item)} size="lg">
          <Brush2 aria-hidden className="size-4" />
          Use in editor
        </Button>
      )}
      <div className="flex flex-wrap gap-2">
        {stored && (
          <Button
            aria-pressed={saved}
            disabled={busy !== null}
            onClick={save}
            size="sm"
            variant="outline"
          >
            {busy === "save" ? (
              <Spinner className="size-4" />
            ) : (
              <Archive className="size-4" variant={saved ? "Bold" : "Linear"} />
            )}
            {saved ? "Saved" : "Save"}
          </Button>
        )}
        {stored && (
          <Button
            aria-pressed={liked}
            className={cn("tabular-nums")}
            disabled={busy !== null}
            onClick={like}
            size="sm"
            variant="outline"
          >
            {busy === "like" ? (
              <Spinner className="size-4" />
            ) : (
              <Heart className="size-4" variant={liked ? "Bold" : "Linear"} />
            )}
            {likes > 0 ? likes : "Like"}
          </Button>
        )}
        {copyable && (
          <Button
            disabled={busy !== null}
            onClick={copy}
            size="sm"
            variant="outline"
          >
            {busy === "copy" ? (
              <Spinner className="size-4" />
            ) : (
              <FolderAdd aria-hidden className="size-4" />
            )}
            Copy to workspace
          </Button>
        )}
      </div>
    </div>
  );
}
