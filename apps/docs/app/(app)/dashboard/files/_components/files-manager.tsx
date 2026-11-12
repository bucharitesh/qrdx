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
import { useTranslations } from "next-intl";
import { type DragEvent, useRef, useState, useTransition } from "react";
import { deleteFileAction } from "@/actions/files";
import { UpgradeButton } from "@/app/(app)/dashboard/team/_components/small-actions";
import { useCan, useWorkspaceHref } from "@/components/workspace-provider";
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
import type { Translator } from "@/lib/i18n/translator";
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

function usageLabel(
  file: FileRow,
  t: Translator<"app.dashboard.files.filesManager">,
): string {
  const parts = [
    file.pages.length > 0 && plural(file.pages.length, "page"),
    file.codeCount > 0 && plural(file.codeCount, "code"),
  ].filter(Boolean);
  return parts.length > 0
    ? t("usedByValue", { value: parts.join(" · ") })
    : t("notUsedYet");
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
  const t = useTranslations("app.dashboard.files.filesManager");
  const quota = overview.storageBytes;
  const percent = quota === null ? 0 : usagePercent(overview.usedBytes, quota);
  const over = quota !== null && overview.usedBytes > quota;
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-base">{t("storage")}</CardTitle>
            <CardDescription>
              {formatBytes(overview.usedBytes)} {t("of")}{" "}
              {quota === null ? t("unlimited") : formatBytes(quota)} {t("used")}{" "}
              {formatBytes(overview.maxFileBytes)} {t("maxPerFileOn")}{" "}
              {overview.planName}
            </CardDescription>
          </div>
          {canUpgrade && <UpgradeButton size="sm" />}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-4">
        {quota !== null && (
          <Progress
            aria-label={t("storageUsed")}
            className={cn(
              over && "[&>[data-slot=progress-indicator]]:bg-destructive",
            )}
            value={percent}
          />
        )}
        {over && (
          <p className="text-muted-foreground text-xs">
            {t("youreOverYourPlansStorage")}
            {isTeam ? "" : t("orUpgrade")} {t("toUploadNewOnes")}
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
  const t = useTranslations("app.dashboard.files.filesManager");
  const inWorkspace = useWorkspaceHref();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [dragging, setDragging] = useState(false);
  const [replacing, setReplacing] = useState<FileRow | null>(null);
  const [deleting, setDeleting] = useState<FileRow | null>(null);
  const [isPending, startTransition] = useTransition();
  const { upload, current, busy } = useFileUploads({ kinds: FILE_KINDS });
  // Viewers and billing members browse and copy links; no uploads, replaces
  // or deletes (lib/permissions.ts; the server refuses them too).
  const canWrite = useCan("content.write");

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
          ? t("uploadedFilename", { filename: uploaded[0]?.filename })
          : t("uploadedLengthFiles", { length: uploaded.length }),
      );
      router.refresh();
    }
  }

  async function replaceWith(file: File) {
    const target = replacing;
    if (!target) return;
    const toastId = toast.loading(
      t("replacingFilename", { filename: target.filename }),
    );
    try {
      await uploadFile(file, { kinds: [target.kind], replaceId: target.id });
      toast.success(t("fileReplacedPagesUsingIt"), {
        id: toastId,
      });
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message || t("replaceFailed"), {
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
        toast.success(t("deletedFilename", { filename: file.filename }));
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
      toast.success(t("linkCopied"));
      soundEvent("copy");
    } catch {
      toast.error(t("couldntCopyTheLink"));
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

      {canWrite && (
        <section
          aria-label={t("uploadFiles")}
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
            <p className="font-medium text-sm">{t("dropFilesHereOrChoose")}</p>
            <p className="text-muted-foreground text-xs">
              {t("valueUpToMaxfilebytesEach", {
                value: formatsForKinds(),
                maxFileBytes: formatBytes(overview.maxFileBytes),
              })}
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
            {busy ? t("uploading") : t("chooseFiles")}
          </Button>
          <div className="w-full max-w-sm">
            <UploadProgress state={current} />
          </div>
        </section>
      )}

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
            <EmptyTitle>{t("noFilesYet")}</EmptyTitle>
            <EmptyDescription>
              {canWrite
                ? t("uploadAMenuPdfPhotos")
                : t("filesThisWorkspaceUploadsShow")}
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
              <TabsTrigger value="all">
                {t("allValue", { value: counts.get("all") ?? 0 })}
              </TabsTrigger>
              {FILE_KINDS.filter((kind) => counts.get(kind)).map((kind) => (
                <TabsTrigger key={kind} value={kind}>
                  {FILE_KIND_LABELS[kind]} ({counts.get(kind)})
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <ul className="divide-y rounded-lg border">
            {visible.map((file) => {
              const canManage = canWrite && (canManageAll || file.mine);
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
                          {t("blocked")}
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
                        {blocked ? t("notServed") : usageLabel(file, t)}
                      </span>
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        aria-label={t("actionsForFilename", {
                          filename: file.filename,
                        })}
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
                            {t("copyLink")}
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <a
                              href={file.url}
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              <ExternalLink />
                              {t("open")}
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
                          {t("replaceFile")}
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
                            {t("delete")}
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
              {t("showingThe500NewestFiles")}
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
            <AlertDialogTitle>
              {t("deleteFilename", { filename: deleting?.filename ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {deleting && deleting.pages.length + deleting.codeCount > 0 ? (
                  <>
                    <p>
                      {t("thisFileIsValueThey", {
                        value: usageLabel(deleting, t).toLowerCase(),
                      })}{" "}
                    </p>
                    {deleting.pages.length > 0 && (
                      <ul className="list-disc pl-5">
                        {deleting.pages.slice(0, 5).map((page) => (
                          <li key={page.id}>
                            <Link
                              className="underline"
                              href={inWorkspace(
                                `/pages/${encodeURIComponent(page.id)}`,
                              )}
                            >
                              {page.title || t("untitledPage")}
                            </Link>
                          </li>
                        ))}
                        {deleting.pages.length > 5 && (
                          <li>
                            {t("andValueMore", {
                              value: deleting.pages.length - 5,
                            })}
                          </li>
                        )}
                      </ul>
                    )}
                    <p>{t("toKeepTheLinkWorking")}</p>
                  </>
                ) : (
                  <p>{t("theFileAndItsLink")}</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault();
                if (deleting) remove(deleting);
              }}
            >
              {isPending ? t("deleting") : t("deleteFile")}
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
