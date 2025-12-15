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
import { Card } from "@repo/design-system/components/ui/card";
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
  ExternalLink,
  Loader2,
  MoreVertical,
  Trash2,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QRCode } from "qrdx";
import type {
  BodyPattern,
  CornerEyeDotPattern,
  CornerEyePattern,
  ErrorLevel,
} from "qrdx/types";
import { useState } from "react";
import { useDeleteQRTheme } from "@/lib/hooks/use-themes";
import { useQREditorStore } from "@/store/editor-store";
import type { ThemePreset } from "@/types/theme";

interface QRThemeCardProps {
  theme: {
    id: string;
    name: string;
    style: {
      bgColor?: string;
      fgColor?: string;
      eyeColor?: string;
      dotColor?: string;
      bodyPattern?: string;
      cornerEyePattern?: string;
      cornerEyeDotPattern?: string;
      level?: string;
      templateId?: string;
      showLogo?: boolean;
      customLogo?: string;
    };
    createdAt: Date | string;
  };
  className?: string;
}

export function QRThemeCard({ theme, className }: QRThemeCardProps) {
  const { applyThemePreset } = useQREditorStore();
  const deleteThemeMutation = useDeleteQRTheme();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const router = useRouter();

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

  const handleQuickApply = () => {
    applyThemePreset(theme.id);
    router.push("/playground");
  };

  const handleShare = () => {
    const url = `${window.location.origin}/playground/${theme.id}`;
    navigator.clipboard.writeText(url);
    toast.success("Theme URL copied to clipboard!");
  };

  return (
    <Card
      className={cn(
        "group overflow-hidden border shadow-sm transition-all duration-300 hover:shadow-md py-0 gap-0",
        className,
      )}
    >
      <div className="relative flex items-center justify-center bg-muted/30 py-4">
        <QRCode
          bgColor={theme.style.bgColor || "#ffffff"}
          fgColor={theme.style.fgColor || "#000000"}
          eyeColor={theme.style.eyeColor || theme.style.fgColor || "#000000"}
          dotColor={theme.style.dotColor || theme.style.fgColor || "#000000"}
          bodyPattern={theme.style.bodyPattern as BodyPattern | undefined}
          cornerEyePattern={
            theme.style.cornerEyePattern as CornerEyePattern | undefined
          }
          cornerEyeDotPattern={
            theme.style.cornerEyeDotPattern as CornerEyeDotPattern | undefined
          }
          level={theme.style.level as ErrorLevel | undefined}
          templateId={theme.style.templateId}
          hideLogo={!theme.style.showLogo}
          logo={theme.style.customLogo}
          scale={1.2}
          value="https://example.com"
        />
      </div>

      <div className="bg-background flex items-center justify-between p-4">
        <div>
          <h3 className={cn("text-foreground text-sm font-medium")}>
            {theme.name}
          </h3>
          <p className="text-muted-foreground text-xs">
            {new Date(theme.createdAt).toLocaleDateString("en-US", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger>
            <div className="hover:bg-accent rounded-md p-2">
              <MoreVertical className="text-muted-foreground h-4 w-4" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-popover w-48">
            <DropdownMenuItem onClick={handleQuickApply} className="gap-2">
              <Zap className="h-4 w-4" />
              Quick Apply
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="gap-2">
              <Link href={`/playground/${theme.id}`} target="_blank">
                <ExternalLink className="h-4 w-4" />
                Open Theme
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleShare} className="gap-2">
              <Copy className="h-4 w-4" />
              Copy URL
            </DropdownMenuItem>
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
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
