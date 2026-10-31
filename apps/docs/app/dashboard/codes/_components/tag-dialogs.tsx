"use client";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/design-system/components/ui/alert-dialog";
import { Button } from "@repo/design-system/components/ui/button";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { cn } from "@repo/design-system/lib/utils";
import { Check, Plus } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  createCodeTag,
  deleteCodeTag,
  listCodeTags,
  tagQrCodes,
  updateCodeTag,
} from "@/actions/tags";
import type { TagRow } from "@/app/dashboard/codes/_lib/organize";
import {
  MAX_TAG_NAME,
  MAX_TAGS_PER_CODE,
  TAG_COLORS,
  TAG_DOT_CLASS,
  type TagColor,
  tagColor,
} from "@/app/dashboard/codes/_lib/organize-shared";
import type { TagRef } from "@/app/dashboard/codes/_lib/qr-codes";
import { TagDot } from "./tag-chip";
import { plural, useOrganizeAction } from "./use-organize-action";

/** Tags from props, or loaded when a dialog opens outside the list. */
export function useTags(open: boolean, initial?: TagRow[]) {
  const [tags, setTags] = useState<TagRow[] | null>(initial ?? null);
  useEffect(() => {
    if (initial) {
      setTags(initial);
      return;
    }
    if (!open) return;
    let cancelled = false;
    listCodeTags().then((result) => {
      if (!cancelled) setTags(result.success ? result.data : []);
    });
    return () => {
      cancelled = true;
    };
  }, [open, initial]);
  return [tags, setTags] as const;
}

function ColorPicker({
  value,
  onChange,
}: {
  value: TagColor;
  onChange: (color: TagColor) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm leading-none font-medium">Color</legend>
      <div className="flex flex-wrap gap-2">
        {TAG_COLORS.map((color) => (
          <button
            aria-label={color}
            aria-pressed={value === color}
            className={cn(
              "focus-visible:ring-ring flex size-7 items-center justify-center rounded-full outline-none focus-visible:ring-2",
              TAG_DOT_CLASS[color],
              value === color && "ring-foreground ring-2 ring-offset-2",
            )}
            key={color}
            onClick={() => onChange(color)}
            type="button"
          >
            {value === color && <Check className="size-3.5 text-white" />}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Create a tag (no `tag`) or edit one. */
export function TagEditDialog({
  open,
  tag,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  tag?: TagRow | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: (tag: TagRow) => void;
}) {
  const { run, isPending } = useOrganizeAction();
  const [name, setName] = useState("");
  const [color, setColor] = useState<TagColor>("blue");

  useEffect(() => {
    if (open) {
      setName(tag?.name ?? "");
      setColor(tag ? tagColor(tag.color) : "blue");
    }
  }, [open, tag]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (tag) {
      const done = await run(() => updateCodeTag({ id: tag.id, name, color }), {
        success: "Tag saved",
      });
      if (done !== null) {
        onSaved?.({ ...tag, name: name.trim(), color });
        onOpenChange(false);
      }
      return;
    }
    const created = await run(() => createCodeTag({ name, color }), {
      success: (row) => `Created tag "${row.name}"`,
    });
    if (created) {
      onSaved?.(created);
      onOpenChange(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-sm">
        <form className="space-y-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{tag ? "Edit tag" : "New tag"}</DialogTitle>
            <DialogDescription>
              Tags work across folders. Filter the list by one or more tags.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="tag-name">Name</Label>
            <Input
              autoFocus
              id="tag-name"
              maxLength={MAX_TAG_NAME}
              onChange={(event) => setName(event.target.value)}
              placeholder="print"
              required
              value={name}
            />
          </div>
          <ColorPicker onChange={setColor} value={color} />
          <DialogFooter>
            <Button
              disabled={isPending}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button disabled={isPending || !name.trim()} type="submit">
              {tag ? "Save" : "Create tag"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteTagDialog({
  tag,
  onOpenChange,
  onDeleted,
}: {
  tag: TagRow | null;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const { run, isPending } = useOrganizeAction();
  const remove = async () => {
    if (!tag) return;
    const done = await run(() => deleteCodeTag({ id: tag.id }), {
      success: `Deleted tag "${tag.name}"`,
    });
    if (done !== null) {
      onOpenChange(false);
      onDeleted?.();
    }
  };
  return (
    <AlertDialog onOpenChange={onOpenChange} open={tag !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete tag "{tag?.name}"?</AlertDialogTitle>
          <AlertDialogDescription>
            The tag is removed from{" "}
            {tag ? plural(tag.codeCount, "code") : "its codes"}. The codes
            themselves are not changed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <Button disabled={isPending} onClick={remove} variant="destructive">
            Delete tag
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type TagState = boolean | "indeterminate";

/**
 * Adds or removes tags on one or more codes. A tag some (not all) selected
 * codes carry starts indeterminate and is left alone unless toggled.
 */
export function TagsDialog({
  codes,
  open,
  onOpenChange,
  tags: initialTags,
}: {
  codes: { id: string; tags: TagRef[] }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tags?: TagRow[];
}) {
  const [tags, setTags] = useTags(open, initialTags);
  const { run, isPending } = useOrganizeAction();
  const [creating, setCreating] = useState(false);

  const initial = useMemo(() => {
    const state = new Map<string, TagState>();
    for (const row of tags ?? []) {
      const having = codes.filter((code) =>
        code.tags.some((ref) => ref.id === row.id),
      ).length;
      state.set(
        row.id,
        having === 0 ? false : having === codes.length ? true : "indeterminate",
      );
    }
    return state;
  }, [tags, codes]);
  // Only what the user toggled; everything else keeps its initial state.
  const [changes, setChanges] = useState<Map<string, boolean>>(new Map());
  useEffect(() => {
    if (open) setChanges(new Map());
  }, [open]);
  const stateOf = (id: string): TagState =>
    changes.get(id) ?? initial.get(id) ?? false;

  const add = [...changes].flatMap(([id, value]) =>
    value && initial.get(id) !== true ? [id] : [],
  );
  const remove = [...changes].flatMap(([id, value]) =>
    !value && initial.get(id) !== false ? [id] : [],
  );
  const single = codes.length === 1;
  const checkedCount = (tags ?? []).filter(
    (row) => stateOf(row.id) === true,
  ).length;

  const save = async () => {
    if (add.length + remove.length === 0) {
      onOpenChange(false);
      return;
    }
    const done = await run(
      () => tagQrCodes({ ids: codes.map((code) => code.id), add, remove }),
      {
        success: single
          ? "Tags saved"
          : ({ updated }) => `Updated tags on ${plural(updated, "code")}`,
      },
    );
    if (done) onOpenChange(false);
  };

  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {single ? "Tags" : `Tags for ${plural(codes.length, "code")}`}
            </DialogTitle>
            <DialogDescription>
              Up to {MAX_TAGS_PER_CODE} tags per code.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {tags === null ? (
              <p className="text-muted-foreground py-3 text-sm">
                Loading tags...
              </p>
            ) : tags.length === 0 ? (
              <p className="text-muted-foreground py-3 text-sm">
                No tags yet. Create one to start labelling codes.
              </p>
            ) : (
              tags.map((row) => {
                const value = stateOf(row.id);
                const id = `tag-${row.id}`;
                return (
                  <div
                    className="hover:bg-accent flex items-center gap-3 rounded-md px-2 py-1.5"
                    key={row.id}
                  >
                    <Checkbox
                      checked={value}
                      disabled={
                        isPending ||
                        (value !== true &&
                          single &&
                          checkedCount >= MAX_TAGS_PER_CODE)
                      }
                      id={id}
                      onCheckedChange={(checked) =>
                        setChanges((current) =>
                          new Map(current).set(row.id, checked === true),
                        )
                      }
                    />
                    <Label
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 font-normal"
                      htmlFor={id}
                    >
                      <TagDot color={row.color} />
                      <span className="truncate">{row.name}</span>
                    </Label>
                    {value === "indeterminate" && (
                      <span className="text-muted-foreground text-xs">
                        Some
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
          <DialogFooter className="sm:justify-between">
            <Button
              disabled={isPending}
              onClick={() => setCreating(true)}
              size="sm"
              variant="outline"
            >
              <Plus />
              New tag
            </Button>
            <div className="flex gap-2">
              <Button
                disabled={isPending}
                onClick={() => onOpenChange(false)}
                size="sm"
                variant="ghost"
              >
                Cancel
              </Button>
              <Button disabled={isPending} onClick={save} size="sm">
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <TagEditDialog
        onOpenChange={setCreating}
        onSaved={(row) => {
          setTags((current) => [...(current ?? []), row]);
          setChanges((current) => new Map(current).set(row.id, true));
        }}
        open={creating}
      />
    </>
  );
}
