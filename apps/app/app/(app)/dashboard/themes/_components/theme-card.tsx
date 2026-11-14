"use client";

import { CANONICAL_ORIGIN } from "@repo/config";
import { toast } from "@repo/design-system";
import { Star } from "@repo/design-system/components/icons";
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
} from "@repo/design-system/components/ui/alert-dialog";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Copy,
  ExportSquare as ExternalLink,
  Maximize4 as FrameIcon,
  Global as Globe,
  Lock as GlobeLock,
  More as MoreVertical,
  Edit2 as Pencil,
  StarSlash as StarOff,
  Tag,
  Trash as Trash2,
  Profile2User as Users,
} from "iconsax-reactjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  copyThemeToTeam,
  setDefaultTheme,
  updateTheme,
} from "@/actions/qr-themes";
import { CodeQr } from "@/app/(app)/dashboard/codes/_components/code-qr";
import { PublishFrameDialog } from "@/components/community/publish-frame-dialog";
import { PublishThemeDialog } from "@/components/community/publish-theme-dialog";
import { TagSelector } from "@/components/tag-selector";
import { defaultThemeState } from "@/config/qr";
import {
  useUnpublishTheme,
  useUpdateCommunityThemeTags,
} from "@/lib/hooks/themes/use-community-themes";
import { useDeleteTheme } from "@/lib/hooks/themes/use-theme-mutations";
import { playgroundHref } from "@/lib/playground-links";
import { soundEvent } from "@/lib/sound/emit";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";
import type { SavedTheme, ThemeActionResult } from "../_lib/theme";

interface ThemeCardProps {
  theme: SavedTheme;
  /** Your own workspace ("personal") or another one ("team") */
  workspace: "personal" | "team";
  /** Shown as "Copy to this workspace" on your themes in another workspace */
  canCopyToTeam: boolean;
}

export function ThemeCard({ theme, workspace, canCopyToTeam }: ThemeCardProps) {
  const t = useTranslations("app.dashboard.themes.themeCard");
  const router = useRouter();
  const openGetProDialog = useGetProDialogStore((s) => s.openGetProDialog);
  const deleteThemeMutation = useDeleteTheme();
  const unpublishMutation = useUnpublishTheme();
  const updateTagsMutation = useUpdateCommunityThemeTags();
  const [isPending, startTransition] = useTransition();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [showFrameDialog, setShowFrameDialog] = useState(false);
  const [showEditTagsDialog, setShowEditTagsDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [name, setName] = useState(theme.name);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const isTeamTheme = theme.scope === "team";
  // Only the active workspace's own themes can be its default.
  const canSetDefault = theme.canEdit && theme.scope === workspace;
  // Your themes, and a workspace's themes for its owners and admins. The
  // community item is a snapshot credited to whoever publishes it.
  const canPublish = !isTeamTheme || theme.canEdit;
  // A custom frame can also go out on its own (the server reads it from the
  // saved theme, with the same access rules).
  const hasCustomFrame = theme.style?.frame?.style === "custom";
  const busy = isPending || deleteThemeMutation.isPending;

  const run = (
    action: () => Promise<ThemeActionResult<unknown>>,
    success: string,
  ) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error, {
          action: result.upgrade
            ? { label: t("upgrade"), onClick: openGetProDialog }
            : undefined,
        });
        return;
      }
      toast.success(success);
      router.refresh();
    });

  const toggleDefault = () =>
    run(
      () => setDefaultTheme(theme.id, !theme.isDefault),
      theme.isDefault
        ? `${theme.name} is no longer the default`
        : `New codes now start from ${theme.name}`,
    );

  const copyToTeam = () =>
    run(() => copyThemeToTeam(theme.id), `Shared a copy of ${theme.name}`);

  const handleRename = () => {
    const next = name.trim();
    if (!next || next === theme.name) {
      setShowRenameDialog(false);
      return;
    }
    startTransition(async () => {
      try {
        await updateTheme({ id: theme.id, name: next });
        setShowRenameDialog(false);
        toast.success(t("themeRenamed"));
        router.refresh();
      } catch {
        toast.error(t("couldNotRenameTheTheme"));
      }
    });
  };

  const handleShare = async () => {
    const url = new URL(
      playgroundHref({ themeId: theme.id }),
      window.location.origin,
    ).toString();
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("themeLinkCopied"));
      soundEvent("copy");
    } catch {
      toast.error(t("couldNotCopyTheLink"));
    }
  };

  const handleConfirmDelete = () => {
    deleteThemeMutation.mutate(theme.id, {
      onSuccess: () => setShowDeleteDialog(false),
    });
  };

  const handleConfirmEditTags = () => {
    updateTagsMutation.mutate(
      { themeId: theme.id, tags: selectedTags },
      {
        onSuccess: () => {
          setShowEditTagsDialog(false);
          setSelectedTags([]);
        },
      },
    );
  };

  return (
    <Card className="group gap-0 overflow-hidden border py-0 shadow-sm transition-shadow hover:shadow-md">
      <Link
        aria-label={t("openNameInThePlayground", { name: theme.name })}
        className="bg-muted/40 flex items-center justify-center p-6"
        href={playgroundHref({ themeId: theme.id })}
      >
        <CodeQr
          className="w-32 transition-transform duration-300 group-hover:scale-105"
          style={{ ...defaultThemeState.styles, ...theme.style }}
          value={CANONICAL_ORIGIN}
        />
      </Link>

      <div className="bg-background flex items-center justify-between gap-2 border-t p-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <h3 className="text-foreground truncate text-sm font-medium">
              {theme.name}
            </h3>
            {theme.isActiveDefault ? (
              <Badge className="px-1.5 py-0 text-[10px]">{t("default")}</Badge>
            ) : (
              theme.isDefault &&
              !isTeamTheme && (
                <Badge className="px-1.5 py-0 text-[10px]" variant="outline">
                  {t("yourDefault")}
                </Badge>
              )
            )}
            {theme.isPublished && (
              <Badge className="px-1.5 py-0 text-[10px]" variant="secondary">
                {t("published")}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            {new Date(theme.createdAt).toLocaleDateString("en-US", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t("actionsForName", { name: theme.name })}
              disabled={busy}
              size="icon"
              variant="ghost"
            >
              {busy ? (
                <ModuleOrbit aria-hidden className="size-4" />
              ) : (
                <MoreVertical className="text-muted-foreground size-4 rotate-90" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem asChild>
              <Link href={playgroundHref({ themeId: theme.id })}>
                <ExternalLink className="size-4" />
                {theme.canEdit ? t("editInPlayground") : t("openInPlayground")}
              </Link>
            </DropdownMenuItem>
            {theme.canEdit && (
              <DropdownMenuItem
                onSelect={() => {
                  setName(theme.name);
                  setShowRenameDialog(true);
                }}
              >
                <Pencil className="size-4" />
                {t("rename")}
              </DropdownMenuItem>
            )}
            {canSetDefault && (
              <DropdownMenuItem onSelect={toggleDefault}>
                {theme.isDefault ? (
                  <StarOff className="size-4" />
                ) : (
                  <Star className="size-4" />
                )}
                {theme.isDefault
                  ? t("removeAsDefault")
                  : isTeamTheme
                    ? t("setAsWorkspaceDefault")
                    : t("setAsDefault")}
              </DropdownMenuItem>
            )}
            {canCopyToTeam && !isTeamTheme && (
              <DropdownMenuItem onSelect={copyToTeam}>
                <Users className="size-4" />
                {t("copyToThisWorkspace")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={handleShare}>
              <Copy className="size-4" />
              {t("copyLink")}
            </DropdownMenuItem>
            {canPublish && (
              <>
                <DropdownMenuSeparator />
                {theme.isPublished ? (
                  <>
                    <DropdownMenuItem
                      onSelect={() => {
                        setSelectedTags([]);
                        setShowEditTagsDialog(true);
                      }}
                    >
                      <Tag className="size-4" />
                      {t("editTags")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={unpublishMutation.isPending}
                      onSelect={() =>
                        unpublishMutation.mutate(theme.id, {
                          onSuccess: () => router.refresh(),
                        })
                      }
                    >
                      <GlobeLock className="size-4" />
                      {t("unpublishFromCommunity")}
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem onSelect={() => setShowPublishDialog(true)}>
                    <Globe className="size-4" />
                    {t("publishToCommunity")}
                  </DropdownMenuItem>
                )}
                {hasCustomFrame && (
                  <DropdownMenuItem onSelect={() => setShowFrameDialog(true)}>
                    <FrameIcon className="size-4" />
                    {t("publishItsFrame")}
                  </DropdownMenuItem>
                )}
              </>
            )}
            {theme.canEdit && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="size-4" />
                  {t("delete")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog onOpenChange={setShowRenameDialog} open={showRenameDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("renameTheme")}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              handleRename();
            }}
          >
            <Label htmlFor={`theme-name-${theme.id}`}>{t("name")}</Label>
            <Input
              autoFocus
              id={`theme-name-${theme.id}`}
              maxLength={50}
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </form>
          <DialogFooter>
            <Button
              onClick={() => setShowRenameDialog(false)}
              variant="outline"
            >
              {t("cancel")}
            </Button>
            <Button disabled={isPending || !name.trim()} onClick={handleRename}>
              {isPending && <ModuleOrbit aria-hidden className="size-4" />}
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog onOpenChange={setShowDeleteDialog} open={showDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("deleteName", { name: theme.name })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isTeamTheme ? t("deleteThemeTeam") : t("deleteTheme")}
              {theme.isPublished && ` ${t("itIsAlsoRemovedFrom")}`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteThemeMutation.isPending}>
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-white"
              disabled={deleteThemeMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                handleConfirmDelete();
              }}
            >
              {deleteThemeMutation.isPending && (
                <ModuleOrbit aria-hidden className="size-4" />
              )}
              {t("deleteTheme")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PublishThemeDialog
        onOpenChange={setShowPublishDialog}
        onPublished={() => router.refresh()}
        open={showPublishDialog}
        themeId={theme.id}
        themeName={theme.name}
        themeStyle={theme.style}
        workspaceTheme={isTeamTheme}
      />

      {hasCustomFrame && (
        <PublishFrameDialog
          defaultName={theme.name}
          onOpenChange={setShowFrameDialog}
          open={showFrameDialog}
          themeId={theme.id}
        />
      )}

      <Dialog onOpenChange={setShowEditTagsDialog} open={showEditTagsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editTags")}</DialogTitle>
            <DialogDescription>
              {t("updateTheTagsForName", { name: theme.name })}
            </DialogDescription>
          </DialogHeader>
          <TagSelector
            disabled={updateTagsMutation.isPending}
            onTagsChange={setSelectedTags}
            selectedTags={selectedTags}
          />
          <DialogFooter>
            <Button
              onClick={() => setShowEditTagsDialog(false)}
              variant="outline"
            >
              {t("cancel")}
            </Button>
            <Button
              disabled={updateTagsMutation.isPending}
              onClick={handleConfirmEditTags}
            >
              {updateTagsMutation.isPending && (
                <ModuleOrbit aria-hidden className="size-4" />
              )}
              {t("saveTags")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
