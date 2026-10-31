"use client";

import { toast } from "@repo/design-system";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/design-system/components/ui/alert-dialog";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import { cn } from "@repo/design-system/lib/utils";
import { Trash as Trash2 } from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { deleteFormResponses } from "@/actions/form-responses";
import {
  type FormAnswer,
  formatAnswerValue,
} from "@/lib/landing/blocks/form-fields";

export interface ResponseItem {
  id: string;
  /** ISO timestamp */
  createdAt: string;
  codeSlug: string | null;
  formTitle: string | null;
  answers: FormAnswer[];
}

// Fixed locale and UTC so server and client render the same text.
const timeFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

function AnswerValue({ answer }: { answer: FormAnswer }) {
  const text = formatAnswerValue(answer);
  if (answer.type === "email") {
    return (
      <a className="underline-offset-4 hover:underline" href={`mailto:${text}`}>
        {text}
      </a>
    );
  }
  if (answer.type === "phone") {
    return (
      <a
        className="underline-offset-4 hover:underline"
        href={`tel:${text.replace(/[^0-9+]/g, "")}`}
      >
        {text}
      </a>
    );
  }
  return <span className="break-words whitespace-pre-wrap">{text}</span>;
}

export function ResponsesList({
  pageId,
  items,
  canDelete,
}: {
  pageId: string;
  items: ResponseItem[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectAllId = useId();

  const allSelected = items.length > 0 && selected.size === items.length;
  const toggle = (id: string, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  const confirmDelete = () => {
    const ids = pendingDelete;
    if (!ids) return;
    startTransition(async () => {
      const result = await deleteFormResponses({ pageId, ids });
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      toast.success(
        result.data.deleted === 1
          ? "Response deleted"
          : `${result.data.deleted} responses deleted`,
      );
      setSelected((current) => {
        const next = new Set(current);
        for (const id of ids) next.delete(id);
        return next;
      });
      setPendingDelete(null);
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {canDelete && (
        <div className="flex min-h-9 items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={allSelected}
              id={selectAllId}
              onCheckedChange={(checked) =>
                setSelected(
                  checked ? new Set(items.map((item) => item.id)) : new Set(),
                )
              }
            />
            <label htmlFor={selectAllId}>Select all on this page</label>
          </div>
          {selected.size > 0 && (
            <Button
              onClick={() => setPendingDelete([...selected])}
              size="sm"
              variant="outline"
            >
              <Trash2 />
              Delete {selected.size}
            </Button>
          )}
        </div>
      )}

      <ul className="space-y-3">
        {items.map((item) => (
          <li
            className={cn(
              "bg-card rounded-lg border p-4",
              selected.has(item.id) && "ring-primary/40 ring-2",
            )}
            key={item.id}
          >
            <div className="mb-3 flex items-start gap-3">
              {canDelete && (
                <Checkbox
                  aria-label="Select response"
                  checked={selected.has(item.id)}
                  className="mt-0.5"
                  onCheckedChange={(checked) =>
                    toggle(item.id, checked === true)
                  }
                />
              )}
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <time className="font-medium" dateTime={item.createdAt}>
                  {timeFormat.format(new Date(item.createdAt))}
                </time>
                {item.formTitle && (
                  <Badge variant="secondary">{item.formTitle}</Badge>
                )}
                {item.codeSlug && (
                  <span className="text-muted-foreground font-mono text-xs">
                    via {item.codeSlug}
                  </span>
                )}
              </div>
              {canDelete && (
                <Button
                  aria-label="Delete response"
                  className="size-8"
                  onClick={() => setPendingDelete([item.id])}
                  size="icon"
                  variant="ghost"
                >
                  <Trash2 />
                </Button>
              )}
            </div>
            {item.answers.length > 0 ? (
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[minmax(0,14rem)_1fr]">
                {item.answers.map((answer) => (
                  <div className="contents" key={answer.id}>
                    <dt className="text-muted-foreground">{answer.label}</dt>
                    <dd className="min-w-0">
                      <AnswerValue answer={answer} />
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-muted-foreground text-sm">No answers</p>
            )}
          </li>
        ))}
      </ul>

      <AlertDialog
        onOpenChange={(open) => !open && !isPending && setPendingDelete(null)}
        open={pendingDelete !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDelete?.length === 1
                ? "Delete this response?"
                : `Delete ${pendingDelete?.length ?? 0} responses?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Deleted responses can't be recovered and won't be in future CSV
              exports. Export first if you want to keep a copy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <Button
              disabled={isPending}
              onClick={confirmDelete}
              variant="destructive"
            >
              {isPending ? "Deleting…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
