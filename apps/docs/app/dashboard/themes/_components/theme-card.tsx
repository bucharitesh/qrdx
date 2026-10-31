"use client";

import { toast } from "@repo/design-system";
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
  ExternalLink,
  Globe,
  GlobeLock,
  Loader2,
  MoreVertical,
  Pencil,
  Star,
  StarOff,
  Tag,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  copyThemeToTeam,
  setDefaultTheme,
  updateTheme,
} from "@/actions/qr-themes";
import { CodeQr } from "@/app/dashboard/codes/_components/code-qr";
import { TagSelector } from "@/components/tag-selector";
import { defaultThemeState } from "@/config/qr";
import {
  usePublishTheme,
  useUnpublishTheme,
  useUpdateCommunityThemeTags,
} from "@/lib/hooks/themes/use-community-themes";
import { useDeleteTheme } from "@/lib/hooks/themes/use-theme-mutations";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";
import type { SavedTheme, ThemeActionResult } from "../_lib/theme";

interface ThemeCardProps {
  theme: SavedTheme;
  /** The workspace picked in the team switcher */
  workspace: "personal" | "team";
  /** Shown as "Copy to team" on personal themes inside a team */
  canCopyToTeam: boolean;
}

export function ThemeCard({ theme, workspace, canCopyToTeam }: ThemeCardProps) {
  const router = useRouter();
  const openGetProDialog = useGetProDialogStore((s) => s.openGetProDialog);
  const deleteThemeMutation = useDeleteTheme();
  const publishMutation = usePublishTheme();
  const unpublishMutation = useUnpublishTheme();
  const updateTagsMutation = useUpdateCommunityThemeTags();
  const [isPending, startTransition] = useTransition();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [showEditTagsDialog, setShowEditTagsDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [name, setName] = useState(theme.name);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const isTeamTheme = theme.scope === "team";
  // Only the active workspace's own themes can be its default.
  const canSetDefault = theme.canEdit && theme.scope === workspace;
  // Community publishing stays personal: the gallery credits one author.
  const canPublish = !isTeamTheme;
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
            ? { label: "Upgrade", onClick: openGetProDialog }
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
        toast.success("Theme renamed");
        router.refresh();
      } catch {
        toast.error("Could not rename the theme. Please try again.");
      }
    });
  };

  const handleShare = async () => {
    const url = new URL(
      `/playground/${encodeURIComponent(theme.id)}`,
      window.location.origin,
    ).toString();
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Theme link copied");
    } catch {
      toast.error("Could not copy the link");
    }
  };

  const handleConfirmDelete = () => {
    deleteThemeMutation.mutate(theme.id, {
      onSuccess: () => setShowDeleteDialog(false),
    });
  };

  const handleConfirmPublish = () => {
    publishMutation.mutate(
      { themeId: theme.id, tags: selectedTags },
      {
        onSuccess: () => {
          setShowPublishDialog(false);
          setSelectedTags([]);
          router.refresh();
        },
      },
    );
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
        aria-label={`Open ${theme.name} in the playground`}
        className="bg-muted/40 flex items-center justify-center p-6"
        href={`/playground/${theme.id}`}
      >
        <CodeQr
          className="w-32 transition-transform duration-300 group-hover:scale-105"
          style={{ ...defaultThemeState.styles, ...theme.style }}
          value="https://qrdx.dev"
        />
      </Link>

      <div className="bg-background flex items-center justify-between gap-2 border-t p-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <h3 className="text-foreground truncate text-sm font-medium">
              {theme.name}
            </h3>
            {theme.isActiveDefault ? (
              <Badge className="px-1.5 py-0 text-[10px]">Default</Badge>
            ) : (
              theme.isDefault &&
              !isTeamTheme && (
                <Badge className="px-1.5 py-0 text-[10px]" variant="outline">
                  Personal default
                </Badge>
              )
            )}
            {theme.isPublished && (
              <Badge className="px-1.5 py-0 text-[10px]" variant="secondary">
                Published
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
              aria-label={`Actions for ${theme.name}`}
              disabled={busy}
              size="icon"
              variant="ghost"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <MoreVertical className="text-muted-foreground size-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem asChild>
              <Link href={`/playground/${theme.id}`}>
                <ExternalLink className="size-4" />
                {theme.canEdit ? "Edit in playground" : "Open in playground"}
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
                Rename
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
                  ? "Remove as default"
                  : isTeamTheme
                    ? "Set as team default"
                    : "Set as default"}
              </DropdownMenuItem>
            )}
            {canCopyToTeam && !isTeamTheme && (
              <DropdownMenuItem onSelect={copyToTeam}>
                <Users className="size-4" />
                Copy to team
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={handleShare}>
              <Copy className="size-4" />
              Copy link
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
                      Edit tags
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
                      Unpublish from community
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem
                    disabled={publishMutation.isPending}
                    onSelect={() => setShowPublishDialog(true)}
                  >
                    <Globe className="size-4" />
                    Publish to community
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
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog onOpenChange={setShowRenameDialog} open={showRenameDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename theme</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              handleRename();
            }}
          >
            <Label htmlFor={`theme-name-${theme.id}`}>Name</Label>
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
              Cancel
            </Button>
            <Button disabled={isPending || !name.trim()} onClick={handleRename}>
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog onOpenChange={setShowDeleteDialog} open={showDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {theme.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              QR codes you already made with this theme keep their look. This
              only removes the saved theme
              {isTeamTheme ? " for everyone in the team" : ""}.
              {theme.isPublished && " It is also removed from the community."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteThemeMutation.isPending}>
              Cancel
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
                <Loader2 className="size-4 animate-spin" />
              )}
              Delete theme
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog onOpenChange={setShowPublishDialog} open={showPublishDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Publish &quot;{theme.name}&quot; to the community?
            </DialogTitle>
            <DialogDescription>
              Your theme will be publicly visible on the community page. You can
              unpublish it at any time.
            </DialogDescription>
          </DialogHeader>
          <TagSelector
            disabled={publishMutation.isPending}
            onTagsChange={setSelectedTags}
            selectedTags={selectedTags}
          />
          <DialogFooter>
            <Button
              onClick={() => setShowPublishDialog(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={publishMutation.isPending}
              onClick={handleConfirmPublish}
            >
              {publishMutation.isPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setShowEditTagsDialog} open={showEditTagsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit tags</DialogTitle>
            <DialogDescription>
              Update the tags for &quot;{theme.name}&quot;.
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
              Cancel
            </Button>
            <Button
              disabled={updateTagsMutation.isPending}
              onClick={handleConfirmEditTags}
            >
              {updateTagsMutation.isPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              Save tags
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
