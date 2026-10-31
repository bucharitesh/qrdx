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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import { Progress } from "@repo/design-system/components/ui/progress";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@repo/design-system/components/ui/tabs";
import { cn } from "@repo/design-system/lib/utils";
import {
  Forbidden2 as Ban,
  Copy,
  ExportSquare as ExternalLink,
  FolderOpen,
  More as MoreHorizontal,
  Refresh2 as RefreshCw,
  Trash as Trash2,
  Export as Upload,
} from "iconsax-reactjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type DragEvent, useRef, useState, useTransition } from "react";
import { deleteFileAction } from "@/actions/files";
import { UpgradeButton } from "@/app/dashboard/team/_components/small-actions";
import { FileKindIcon } from "@/lib/files/components/file-kind-icon";
import {
  UploadProgress,
  useFileUploads,
} from "@/lib/files/components/upload-button";
import { usagePercent } from "@/lib/files/quota";
import type { StorageOverview } from "@/lib/files/service";
import {
  acceptAttribute,
  FILE_KIND_LABELS,
  FILE_KINDS,
  type FileKind,
  type FileView,
  formatBytes,
  formatsForKinds,
} from "@/lib/files/types";
import { uploadFile } from "@/lib/files/upload-client";
import { soundEvent } from "@/lib/sound/emit";

export interface FileRow extends FileView {
  pages: { id: string; title: string | null }[];
  codeCount: number;
}

type Filter = "all" | FileKind;

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

function usageLabel(file: FileRow): string {
  const parts = [
    file.pages.length > 0 && plural(file.pages.length, "page"),
    file.codeCount > 0 && plural(file.codeCount, "code"),
  ].filter(Boolean);
  return parts.length > 0 ? `Used by ${parts.join(" · ")}` : "Not used yet";
}

function UsageCard({
  overview,
  canUpgrade,
  isTeam,
}: {
  overview: StorageOverview;
  canUpgrade: boolean;
  isTeam: boolean;
}) {
  const quota = overview.storageBytes;
  const percent = quota === null ? 0 : usagePercent(overview.usedBytes, quota);
  const over = quota !== null && overview.usedBytes > quota;
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-base">Storage</CardTitle>
            <CardDescription>
              {formatBytes(overview.usedBytes)} of{" "}
              {quota === null ? "unlimited" : formatBytes(quota)} used ·{" "}
              {formatBytes(overview.maxFileBytes)} max per file on{" "}
              {overview.planName}
            </CardDescription>
          </div>
          {canUpgrade && <UpgradeButton size="sm" />}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-4">
        {quota !== null && (
          <Progress
            aria-label="Storage used"
            className={cn(
              over && "[&>[data-slot=progress-indicator]]:bg-destructive",
            )}
            value={percent}
          />
        )}
        {over && (
          <p className="text-muted-foreground text-xs">
            You're over your plan's storage. Existing files keep working; delete
            files you no longer need
            {isTeam ? "" : " or upgrade"} to upload new ones.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function FilesManager({
  files,
  overview,
  canUpgrade,
  canManageAll,
  isTeam,
}: {
  files: FileRow[];
  overview: StorageOverview;
  canUpgrade: boolean;
  canManageAll: boolean;
  isTeam: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [dragging, setDragging] = useState(false);
  const [replacing, setReplacing] = useState<FileRow | null>(null);
  const [deleting, setDeleting] = useState<FileRow | null>(null);
  const [isPending, startTransition] = useTransition();
  const { upload, current, busy } = useFileUploads({ kinds: FILE_KINDS });

  const counts = new Map<Filter, number>([["all", files.length]]);
  for (const file of files)
    counts.set(file.kind, (counts.get(file.kind) ?? 0) + 1);
  const visible =
    filter === "all" ? files : files.filter((file) => file.kind === filter);

  async function uploadMany(list: File[]) {
    if (list.length === 0) return;
    const uploaded = await upload(list);
    if (uploaded.length > 0) {
      toast.success(
        uploaded.length === 1
          ? `Uploaded ${uploaded[0]?.filename}`
          : `Uploaded ${uploaded.length} files`,
      );
      router.refresh();
    }
  }

  async function replaceWith(file: File) {
    const target = replacing;
    if (!target) return;
    const toastId = toast.loading(`Replacing ${target.filename}…`);
    try {
      await uploadFile(file, { kinds: [target.kind], replaceId: target.id });
      toast.success(
        "File replaced. Pages using it show the new file within a minute.",
        {
          id: toastId,
        },
      );
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message || "Replace failed.", {
        id: toastId,
      });
    } finally {
      setReplacing(null);
    }
  }

  function remove(file: FileRow) {
    const inUse = file.pages.length + file.codeCount > 0;
    startTransition(async () => {
      const result = await deleteFileAction({ id: file.id, force: inUse });
      if (result.success) {
        toast.success(`Deleted ${file.filename}`);
        setDeleting(null);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  async function copyLink(file: FileRow) {
    try {
      await navigator.clipboard.writeText(file.url);
      toast.success("Link copied");
      soundEvent("copy");
    } catch {
      toast.error("Couldn't copy the link.");
    }
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (!busy) uploadMany(Array.from(event.dataTransfer.files));
  };

  return (
    <div className="space-y-6">
      <UsageCard canUpgrade={canUpgrade} isTeam={isTeam} overview={overview} />

      <section
        aria-label="Upload files"
        className={cn(
          "flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
          dragging && "border-primary bg-primary/5",
        )}
        onDragLeave={() => setDragging(false)}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDrop={onDrop}
      >
        <Upload aria-hidden="true" className="size-6 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-medium text-sm">Drop files here or choose them</p>
          <p className="text-muted-foreground text-xs">
            {formatsForKinds()} · up to {formatBytes(overview.maxFileBytes)}{" "}
            each
          </p>
        </div>
        <input
          accept={acceptAttribute()}
          aria-hidden="true"
          className="sr-only"
          multiple
          onChange={(event) => {
            const list = Array.from(event.target.files ?? []);
            event.target.value = "";
            uploadMany(list);
          }}
          ref={inputRef}
          tabIndex={-1}
          type="file"
        />
        <Button
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          size="sm"
        >
          <Upload />
          {busy ? "Uploading…" : "Choose files"}
        </Button>
        <div className="w-full max-w-sm">
          <UploadProgress state={current} />
        </div>
      </section>

      <input
        aria-hidden="true"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) replaceWith(file);
          else setReplacing(null);
        }}
        ref={replaceRef}
        tabIndex={-1}
        type="file"
      />

      {files.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderOpen />
            </EmptyMedia>
            <EmptyTitle>No files yet</EmptyTitle>
            <EmptyDescription>
              Upload a menu PDF, photos, music or a video, then add it to a
              hosted page with the PDF, Gallery, Audio, Video file or Downloads
              block.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-3">
          <Tabs
            onValueChange={(value) => setFilter(value as Filter)}
            value={filter}
          >
            <TabsList className="flex-wrap">
              <TabsTrigger value="all">All ({counts.get("all")})</TabsTrigger>
              {FILE_KINDS.filter((kind) => counts.get(kind)).map((kind) => (
                <TabsTrigger key={kind} value={kind}>
                  {FILE_KIND_LABELS[kind]} ({counts.get(kind)})
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <ul className="divide-y rounded-lg border">
            {visible.map((file) => {
              const canManage = canManageAll || file.mine;
              const blocked = file.status === "blocked";
              return (
                <li className="flex items-center gap-3 p-3" key={file.id}>
                  <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                    {file.kind === "image" && !blocked ? (
                      <img
                        alt=""
                        className="size-full object-cover"
                        decoding="async"
                        loading="lazy"
                        src={file.url}
                      />
                    ) : (
                      <FileKindIcon
                        className="size-5 text-muted-foreground"
                        kind={file.kind}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate font-medium text-sm">
                        {file.filename}
                      </p>
                      {blocked && (
                        <Badge variant="destructive">
                          <Ban />
                          Blocked
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {FILE_KIND_LABELS[file.kind]} · {formatBytes(file.size)} ·{" "}
                      {dateFormat.format(new Date(file.createdAt))} ·{" "}
                      <span
                        title={file.pages
                          .map((page) => page.title || "Untitled page")
                          .join(", ")}
                      >
                        {blocked ? "Not served" : usageLabel(file)}
                      </span>
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        aria-label={`Actions for ${file.filename}`}
                        size="icon-sm"
                        variant="ghost"
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {!blocked && (
                        <>
                          <DropdownMenuItem onSelect={() => copyLink(file)}>
                            <Copy />
                            Copy link
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <a
                              href={file.url}
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              <ExternalLink />
                              Open
                            </a>
                          </DropdownMenuItem>
                        </>
                      )}
                      {canManage && !blocked && (
                        <DropdownMenuItem
                          disabled={busy}
                          onSelect={() => {
                            const input = replaceRef.current;
                            if (!input) return;
                            setReplacing(file);
                            // Open the picker within the click (Safari needs that).
                            input.accept = acceptAttribute([file.kind]);
                            input.click();
                          }}
                        >
                          <RefreshCw />
                          Replace file…
                        </DropdownMenuItem>
                      )}
                      {canManage && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => setDeleting(file)}
                            variant="destructive"
                          >
                            <Trash2 />
                            Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
          {files.length >= 500 && (
            <p className="text-muted-foreground text-xs">
              Showing the 500 newest files.
            </p>
          )}
          {blockedNotice(files)}
        </div>
      )}

      <AlertDialog
        onOpenChange={(open) => !open && setDeleting(null)}
        open={deleting !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.filename}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {deleting && deleting.pages.length + deleting.codeCount > 0 ? (
                  <>
                    <p>
                      This file is {usageLabel(deleting).toLowerCase()}. They
                      will show "File unavailable" instead.
                    </p>
                    {deleting.pages.length > 0 && (
                      <ul className="list-disc pl-5">
                        {deleting.pages.slice(0, 5).map((page) => (
                          <li key={page.id}>
                            <Link
                              className="underline"
                              href={`/dashboard/pages/${page.id}`}
                            >
                              {page.title || "Untitled page"}
                            </Link>
                          </li>
                        ))}
                        {deleting.pages.length > 5 && (
                          <li>and {deleting.pages.length - 5} more</li>
                        )}
                      </ul>
                    )}
                    <p>
                      To keep the link working with new content, use Replace
                      file instead.
                    </p>
                  </>
                ) : (
                  <p>The file and its link are removed for good.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault();
                if (deleting) remove(deleting);
              }}
            >
              {isPending ? "Deleting…" : "Delete file"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function blockedNotice(files: FileRow[]) {
  if (!files.some((file) => file.status === "blocked")) return null;
  return (
    <p className="text-muted-foreground text-xs">
      Blocked files aren't served anywhere. They either failed our upload checks
      or were removed after a report. You can delete them to free the space.
    </p>
  );
}
