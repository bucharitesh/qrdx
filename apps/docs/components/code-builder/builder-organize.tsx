"use client";

// Folder and tags for the code, in the form, built on the organize actions
// and tag chips.

import { toast } from "@repo/design-system";
import { Tick } from "@repo/design-system/components/icons";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@repo/design-system/components/ui/command";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { Add } from "iconsax-reactjs";
import { type ReactNode, useMemo, useState, useTransition } from "react";
import { createCodeTag } from "@/actions/tags";
import { TagDot } from "@/app/(app)/dashboard/codes/_components/tag-chip";
import type { TagRow } from "@/app/(app)/dashboard/codes/_lib/organize";
import {
  buildFolderTree,
  type FolderRow,
  flattenFolderTree,
  MAX_TAG_NAME,
  MAX_TAGS_PER_CODE,
} from "@/app/(app)/dashboard/codes/_lib/organize-shared";

const NO_FOLDER = "none";

export function FolderField({
  folders,
  value,
  onChange,
  disabled,
}: {
  folders: FolderRow[] | null;
  value: string | null;
  onChange: (folderId: string | null) => void;
  disabled?: boolean;
}) {
  const flat = useMemo(
    () => flattenFolderTree(buildFolderTree(folders ?? [])),
    [folders],
  );
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor="code-builder-folder">Folder</Label>
      <Select
        disabled={disabled || folders === null}
        onValueChange={(next) => onChange(next === NO_FOLDER ? null : next)}
        value={value ?? NO_FOLDER}
      >
        <SelectTrigger className="w-full" id="code-builder-folder">
          <SelectValue placeholder="No folder" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_FOLDER}>No folder</SelectItem>
          {flat.map((folder) => (
            <SelectItem key={folder.id} value={folder.id}>
              <span style={{ paddingLeft: `${folder.depth * 0.75}rem` }}>
                {folder.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function TagsField({
  tags,
  value,
  onChange,
  onCreated,
  disabled,
  action,
  children,
}: {
  tags: TagRow[] | null;
  value: string[];
  onChange: (tagIds: string[]) => void;
  onCreated: (tag: TagRow) => void;
  disabled?: boolean;
  /** A small action on the label row (the builder's "Suggest") */
  action?: ReactNode;
  /** Under the field (the builder's suggested tags) */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isCreating, startCreating] = useTransition();
  const byId = useMemo(
    () => new Map((tags ?? []).map((tag) => [tag.id, tag])),
    [tags],
  );
  const selected = value
    .map((id) => byId.get(id))
    .filter((tag): tag is TagRow => Boolean(tag));
  const full = value.length >= MAX_TAGS_PER_CODE;
  const name = query.trim().slice(0, MAX_TAG_NAME);
  const exists = (tags ?? []).some(
    (tag) => tag.name.toLowerCase() === name.toLowerCase(),
  );

  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((item) => item !== id));
    else if (!full) onChange([...value, id]);
  };

  const create = () => {
    if (!name || exists || full) return;
    startCreating(async () => {
      try {
        const result = await createCodeTag({ name });
        if (!result.success) {
          toast.error(result.error.message);
          return;
        }
        onCreated(result.data);
        onChange([...value, result.data.id]);
        setQuery("");
      } catch {
        toast.error("Couldn't create the tag. Try again.");
      }
    });
  };

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="code-builder-tags">Tags</Label>
        {action}
      </div>
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <button
            className="border-input focus-visible:ring-ring/50 focus-visible:border-ring flex min-h-9 w-full min-w-0 flex-wrap items-center gap-1 rounded-md border px-2 py-1 text-left text-sm shadow-xs outline-none focus-visible:ring-[3px] disabled:opacity-50 dark:bg-input/30"
            disabled={disabled || tags === null}
            id="code-builder-tags"
            type="button"
          >
            {selected.length === 0 ? (
              <span className="text-muted-foreground px-1">Add tags</span>
            ) : (
              selected.map((tag) => (
                <span
                  className="bg-muted/60 inline-flex max-w-40 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-none font-medium"
                  key={tag.id}
                >
                  <TagDot className="size-1.5" color={tag.color} />
                  <span className="truncate">{tag.name}</span>
                </span>
              ))
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <Command>
            <CommandInput
              maxLength={MAX_TAG_NAME}
              onValueChange={setQuery}
              placeholder="Find or create a tag"
              value={query}
            />
            <CommandList>
              <CommandEmpty>
                {name ? "No tag with that name." : "No tags yet."}
              </CommandEmpty>
              {(tags ?? []).length > 0 && (
                <CommandGroup>
                  {(tags ?? []).map((tag) => {
                    const on = value.includes(tag.id);
                    return (
                      <CommandItem
                        disabled={!on && full}
                        key={tag.id}
                        onSelect={() => toggle(tag.id)}
                        value={tag.name}
                      >
                        <TagDot color={tag.color} />
                        <span className="min-w-0 flex-1 truncate">
                          {tag.name}
                        </span>
                        {on && <Tick className="size-3.5" />}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
              {name && !exists && (
                <CommandGroup>
                  <CommandItem
                    disabled={isCreating || full}
                    onSelect={create}
                    value={`create ${name}`}
                  >
                    <Add aria-hidden className="size-4" />
                    Create “{name}”
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
          {full && (
            <p className="text-muted-foreground border-t px-3 py-2 text-xs">
              A code can have up to {MAX_TAGS_PER_CODE} tags.
            </p>
          )}
        </PopoverContent>
      </Popover>
      {children}
    </div>
  );
}
