"use client";

import { toast } from "@repo/design-system";
import { Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import {
  RadioGroup,
  RadioGroupItem,
} from "@repo/design-system/components/ui/radio-group";
import { cn } from "@repo/design-system/lib/utils";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  listCodeMoveTargets,
  moveQrCodeToWorkspace,
} from "@/actions/move-code";
import type { MoveTarget } from "@/app/(app)/dashboard/codes/_lib/move-workspace";
import { WorkspaceAvatar } from "@/components/workspaces/workspace-avatar";
import { workspaceHref } from "@/lib/workspace-paths";

/**
 * "Move to workspace…": picks one of the person's other workspaces where
 * they may add codes. The short link stays the same; folders and tags stay
 * behind (the server says why when a code can't move).
 */
export function MoveToWorkspaceDialog({
  code,
  open,
  onOpenChange,
}: {
  code: { id: string; title: string | null; shortLink: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [targets, setTargets] = useState<MoveTarget[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPicked(null);
    let live = true;
    listCodeMoveTargets().then((result) => {
      if (!live) return;
      if (result.success) {
        setTargets(result.data);
        setLoadError(null);
      } else {
        setLoadError(result.error.message);
      }
    });
    return () => {
      live = false;
    };
  }, [open]);

  const move = () => {
    if (!picked) return;
    startTransition(async () => {
      setError(null);
      const result = await moveQrCodeToWorkspace({
        id: code.id,
        organizationId: picked,
      });
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      const { target, leftBehind } = result.data;
      const behind = [
        leftBehind.folder && "its folder",
        leftBehind.tags > 0 &&
          `${leftBehind.tags} tag${leftBehind.tags === 1 ? "" : "s"}`,
      ].filter(Boolean);
      toast.success(`Moved to ${target.name}`, {
        description: `Same short link, scans and history.${
          behind.length > 0 ? ` ${behind.join(" and ")} stayed here.` : ""
        }`,
        action: {
          label: "Open",
          onClick: () => router.push(workspaceHref(target.slug, "/codes")),
        },
      });
      onOpenChange(false);
      router.refresh();
    });
  };

  const name = code.title || code.shortLink.replace(/^https?:\/\//, "");

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move to another workspace</DialogTitle>
          <DialogDescription className="text-pretty">
            <span className="text-foreground font-medium">{name}</span> keeps
            its short link, so printed copies keep working. Its scans and
            history move with it; its folder and tags stay here.
          </DialogDescription>
        </DialogHeader>

        {loadError ? (
          <p className="text-destructive text-sm" role="alert">
            {loadError}
          </p>
        ) : targets === null ? (
          <div className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
            <Spinner aria-hidden className="animate-spin" /> Loading workspaces
          </div>
        ) : targets.length === 0 ? (
          <p className="text-muted-foreground py-2 text-sm text-pretty">
            You're not in another workspace where you can add codes. Workspaces
            where you're a viewer or billing member aren't listed.
          </p>
        ) : (
          <RadioGroup
            aria-label="Workspaces"
            className="max-h-64 gap-1 overflow-y-auto"
            disabled={isPending}
            onValueChange={setPicked}
            value={picked ?? ""}
          >
            {targets.map((target) => (
              <label
                className={cn(
                  "flex w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                  picked === target.id
                    ? "border-foreground/40 bg-foreground/[0.04]"
                    : "border-transparent hover:bg-foreground/[0.04]",
                )}
                htmlFor={`move-${target.id}`}
                key={target.id}
              >
                <WorkspaceAvatar
                  logo={target.logo}
                  name={target.name}
                  size="sm"
                  tone="muted"
                />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {target.name}
                </span>
                <RadioGroupItem id={`move-${target.id}`} value={target.id} />
              </label>
            ))}
          </RadioGroup>
        )}

        {error && (
          <p className="text-destructive text-sm text-pretty" role="alert">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button
            disabled={isPending}
            onClick={() => onOpenChange(false)}
            variant="ghost"
          >
            Cancel
          </Button>
          <Button disabled={!picked || isPending} onClick={move}>
            {isPending && <Spinner aria-hidden className="animate-spin" />}
            Move code
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
