"use client";

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
import { QRCode } from "qrdx";
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
import { useState } from "react";
import { useDeleteQRTheme } from "@/lib/hooks/use-qr-themes";
import { useQREditorStore } from "@/store/editor-store";
import { useRouter } from "next/navigation";
import { toast } from "@repo/design-system";

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
  const { applyPreset } = useQREditorStore();
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
    const preset = {
      id: theme.id,
      name: theme.name,
      description: "",
      source: "SAVED" as const,
      createdAt: typeof theme.createdAt === "string" 
        ? theme.createdAt 
        : theme.createdAt.toISOString(),
      style: theme.style,
    };
    applyPreset(preset);
    router.push("/editor/qr");
  };

  const handleShare = () => {
    const url = `${window.location.origin}/editor/qr/${theme.id}`;
    navigator.clipboard.writeText(url);
    toast.success("Theme URL copied to clipboard!");
  };

  return (
    <Card
      className={cn(
        "group overflow-hidden border shadow-sm transition-all duration-300 hover:shadow-md",
        className,
      )}
    >
      <div className="relative flex h-36 items-center justify-center bg-muted/30 p-4">
        <QRCode
          bgColor={theme.style.bgColor || "#ffffff"}
          fgColor={theme.style.fgColor || "#000000"}
          eyeColor={theme.style.eyeColor || theme.style.fgColor || "#000000"}
          dotColor={theme.style.dotColor || theme.style.fgColor || "#000000"}
          bodyPattern={theme.style.bodyPattern}
          cornerEyePattern={theme.style.cornerEyePattern}
          cornerEyeDotPattern={theme.style.cornerEyeDotPattern}
          level={theme.style.level as any}
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
              <Link href={`/editor/qr/${theme.id}`} target="_blank">
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

