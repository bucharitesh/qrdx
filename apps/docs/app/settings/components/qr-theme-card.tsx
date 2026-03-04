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
import { cn } from "@repo/design-system/lib/utils";
import {
  Copy,
  Edit,
  ExternalLink,
  Globe,
  GlobeLock,
  Loader2,
  MoreVertical,
  Tag,
  Trash2,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { TagSelector } from "@/components/tag-selector";
import { ThemePreview } from "@/components/theme-preview";
import {
  usePublishTheme,
  useUnpublishTheme,
  useUpdateCommunityThemeTags,
} from "@/lib/hooks/themes/use-community-themes";
import { useDeleteTheme } from "@/lib/hooks/themes/use-theme-mutations";
import type { Theme } from "@/types/theme";

interface ThemeCardProps {
  theme: Theme;
  isPublished?: boolean;
  className?: string;
}

export function ThemeCard({
  theme,
  isPublished = false,
  className,
}: ThemeCardProps) {
  const deleteThemeMutation = useDeleteTheme();
  const publishMutation = usePublishTheme();
  const unpublishMutation = useUnpublishTheme();
  const updateTagsMutation = useUpdateCommunityThemeTags();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [showEditTagsDialog, setShowEditTagsDialog] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const handleDelete = () => {
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = () => {
    deleteThemeMutation.mutate(theme.id, {
      onSuccess: () => {
        setShowDeleteDialog(false);
      },
    });
  };

  const handleShare = () => {
    const url = `https://qrdx.dev/playground/${theme.id}`;
    navigator.clipboard.writeText(url);
    toast.success("Theme URL copied to clipboard!");
  };

  const handlePublish = () => {
    setShowPublishDialog(true);
  };

  const handleConfirmPublish = () => {
    publishMutation.mutate(
      { themeId: theme.id, tags: selectedTags },
      {
        onSuccess: () => {
          setShowPublishDialog(false);
          setSelectedTags([]);
        },
      },
    );
  };

  const handleEditTags = () => {
    setSelectedTags([]);
    setShowEditTagsDialog(true);
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

  const handleUnpublish = () => {
    unpublishMutation.mutate(theme.id);
  };

  return (
    <Card
      className={cn(
        "group overflow-hidden border shadow-sm transition-all duration-300 hover:shadow-md py-0 gap-0",
        className,
      )}
    >
      <div className="relative h-36 w-full overflow-hidden bg-muted">
        <ThemePreview
          styles={theme.style}
          name={theme.name}
          className="transition-transform duration-300 group-hover:scale-105"
        />
      </div>

      <div className="bg-background flex items-center justify-between p-4">
        <div className="flex items-center gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h3 className={cn("text-foreground text-sm font-medium")}>
                {theme.name}
              </h3>
              {isPublished && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
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
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger>
            <div className="hover:bg-accent rounded-md p-2">
              <MoreVertical className="text-muted-foreground h-4 w-4" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-popover w-48">
            <DropdownMenuItem asChild className="gap-2">
              <Link href={`/playground/${theme.id}`} target="_blank">
                <ExternalLink className="h-4 w-4" />
                Open Theme
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="gap-2">
              <Link href={`/playground/${theme.id}`}>
                <Edit className="h-4 w-4" />
                Edit Theme
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleShare} className="gap-2">
              <Copy className="h-4 w-4" />
              Copy URL
            </DropdownMenuItem>
            <DropdownMenuSeparator className="mx-2" />
            {isPublished ? (
              <>
                <DropdownMenuItem onClick={handleEditTags} className="gap-2">
                  <Tag className="h-4 w-4" />
                  Edit Tags
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleUnpublish}
                  className="gap-2"
                  disabled={unpublishMutation.isPending}
                >
                  {unpublishMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <GlobeLock className="h-4 w-4" />
                  )}
                  Unpublish from Community
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem
                onClick={handlePublish}
                className="gap-2"
                disabled={publishMutation.isPending}
              >
                {publishMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Globe className="h-4 w-4" />
                )}
                Publish to Community
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator className="mx-2" />
            <DropdownMenuItem
              onClick={handleDelete}
              className="text-destructive focus:text-destructive gap-2"
              disabled={deleteThemeMutation.isPending}
            >
              {deleteThemeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete Theme
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Are you sure you want to delete your {theme.name} theme?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your
              theme.
              {isPublished && " It will also be removed from the community."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteThemeMutation.isPending}
            >
              {deleteThemeMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showPublishDialog} onOpenChange={setShowPublishDialog}>
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
            selectedTags={selectedTags}
            onTagsChange={setSelectedTags}
            disabled={publishMutation.isPending}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowPublishDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmPublish}
              disabled={publishMutation.isPending}
            >
              {publishMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Publishing...
                </>
              ) : (
                "Publish"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditTagsDialog} onOpenChange={setShowEditTagsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Tags</DialogTitle>
            <DialogDescription>
              Update the tags for &quot;{theme.name}&quot;.
            </DialogDescription>
          </DialogHeader>
          <TagSelector
            selectedTags={selectedTags}
            onTagsChange={setSelectedTags}
            disabled={updateTagsMutation.isPending}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowEditTagsDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmEditTags}
              disabled={updateTagsMutation.isPending}
            >
              {updateTagsMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Tags"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
