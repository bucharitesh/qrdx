"use client";

import { toast } from "@repo/design-system";
import { ModuleOrbit } from "@repo/design-system/components/loaders";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/design-system/components/ui/alert-dialog";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import {
  Archive,
  Brush2,
  DocumentCopy,
  FolderAdd,
  Heart,
} from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  copyCommunityItem,
  copyCommunityKit,
  copyCommunityTemplate,
  toggleCommunityLike,
  toggleCommunitySave,
  unpublishCommunityItem,
} from "@/actions/community";
import { useWorkspaceHref } from "@/components/workspace-provider";
import { defaultThemeState } from "@/config/qr";
import type { CommunityItemDetail } from "@/lib/community/types";
import { useSessionGuard } from "@/lib/hooks/use-gaurds";
import { playgroundHref } from "@/lib/playground-links";
import { soundEvent } from "@/lib/sound/emit";
import { useQREditorStore } from "@/store/editor-store";

/**
 * Puts an item into the editor: a frame joins your design, a theme replaces
 * it. Through the store, since a link's `style` can only replace a design;
 * one undo step either way, so your old design is one Undo away.
 */
export function useApplyToEditor() {
  const router = useRouter();
  return (item: Pick<CommunityItemDetail, "type" | "apply">) => {
    const { themeState, applyDesign } = useQREditorStore.getState();
    const frame = item.type === "frame";
    applyDesign(
      frame
        ? { ...themeState.styles, ...item.apply }
        : { ...defaultThemeState.styles, ...item.apply },
      { keepPreset: frame },
    );
    soundEvent("apply");
    router.push(playgroundHref({ tab: "design" }));
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
  const t = useTranslations("community.itemActions");
  const router = useRouter();
  const apply = useApplyToEditor();
  const inWorkspace = useWorkspaceHref();
  const { checkValidSession } = useSessionGuard();
  const [liked, setLiked] = useState(item.isLikedByMe);
  const [likes, setLikes] = useState(item.likeCount);
  const [saved, setSaved] = useState(item.isSavedByMe);
  const [busy, setBusy] = useState<
    "like" | "save" | "copy" | "template" | null
  >(null);
  const stored = item.id !== null;
  const copyable = item.type === "frame" || item.type === "theme";
  const template =
    (item.type === "page-template" || item.type === "kit") && !item.unavailable;

  // A page template becomes a draft page in the open workspace.
  const copyTemplate = async () => {
    if (!checkValidSession("signin")) return;
    setBusy("template");
    const result =
      item.type === "kit"
        ? await copyCommunityKit({ slug: item.slug })
        : await copyCommunityTemplate({ slug: item.slug });
    setBusy(null);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    soundEvent("success");
    const look = "themeName" in result.data ? result.data.themeName : null;
    const refused =
      "themeRefused" in result.data ? result.data.themeRefused : null;
    toast.success(
      look
        ? t("nameIsInYourPages", { name: result.data.name })
        : t("nameIsInYourPages2", { name: result.data.name }),
      typeof refused === "string" ? { description: refused } : undefined,
    );
    router.push(
      inWorkspace(`/pages/${encodeURIComponent(result.data.pageId)}`),
    );
  };

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
          ? t("savedItsInTheEditors")
          : t("saved2")
        : t("removedFromSaved"),
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
    toast.success(t("copiedToWhereAsName", { where, name: result.data.name }), {
      action: {
        label: t("open"),
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
            {t("useInEditor")}
          </Button>
        )}
        {stored && (
          <>
            <Button
              aria-label={saved ? t("removeFromSaved") : t("save")}
              aria-pressed={saved}
              disabled={busy !== null}
              onClick={save}
              size="icon"
              variant="outline"
            >
              <Archive className="size-4" variant={saved ? "Bold" : "Linear"} />
            </Button>
            <Button
              aria-label={liked ? t("unlike") : t("like")}
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
          {t("useInEditor")}
        </Button>
      )}
      {template && (
        <Button
          className="w-full"
          disabled={busy !== null}
          onClick={copyTemplate}
          size="lg"
        >
          {busy === "template" ? (
            <ModuleOrbit aria-hidden className="size-4" />
          ) : (
            <DocumentCopy aria-hidden className="size-4" />
          )}
          {item.type === "kit" ? t("useKit") : t("useTemplate")}
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
              <ModuleOrbit aria-hidden className="size-4" />
            ) : (
              <Archive className="size-4" variant={saved ? "Bold" : "Linear"} />
            )}
            {saved ? t("saved") : t("save")}
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
              <ModuleOrbit aria-hidden className="size-4" />
            ) : (
              <Heart className="size-4" variant={liked ? "Bold" : "Linear"} />
            )}
            {likes > 0 ? likes : t("like")}
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
              <ModuleOrbit aria-hidden className="size-4" />
            ) : (
              <FolderAdd aria-hidden className="size-4" />
            )}
            {t("copyToWorkspace")}
          </Button>
        )}
      </div>
      {item.isMine && item.id && <UnpublishButton item={item} />}
    </div>
  );
}

/** The creator's own item: take it out of the community. */
function UnpublishButton({ item }: { item: CommunityItemDetail }) {
  const t = useTranslations("community.itemActions");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const unpublish = async () => {
    if (!item.id) return;
    setPending(true);
    const result = await unpublishCommunityItem(item.id);
    setPending(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setOpen(false);
    toast.success(t("nameIsNoLongerIn", { name: item.name }));
    router.push("/community");
  };

  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger asChild>
        <Button className="px-0" size="sm" variant="link">
          {t("unpublish")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("removeFromTheCommunity")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("itLeavesTheCommunityAt")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              void unpublish();
            }}
          >
            {pending && <ModuleOrbit aria-hidden className="size-4" />}
            {t("unpublish")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
