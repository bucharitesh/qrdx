"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { ArrowDown2 as ChevronDown } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { useFolders } from "@/app/(app)/dashboard/codes/_components/folder-dialogs";
import { TagDot } from "@/app/(app)/dashboard/codes/_components/tag-chip";
import { useTags } from "@/app/(app)/dashboard/codes/_components/tag-dialogs";
import {
  buildFolderTree,
  flattenFolderTree,
  MAX_TAGS_PER_CODE,
} from "@/app/(app)/dashboard/codes/_lib/organize-shared";

const FROM_FILE = "file";

export interface BatchTargets {
  folder: { id: string; name: string } | null;
  tags: { id: string; name: string }[];
}

/**
 * A folder and tags for every imported code: rows with a folder of their own
 * keep it; tags add to the row's.
 */
export function BatchOrganize({
  value,
  onChange,
  disabled,
}: {
  value: BatchTargets;
  onChange: (value: BatchTargets) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("app.dashboard.codes.import.batchOrganize");
  const [folders] = useFolders(true);
  const [tags] = useTags(true);
  const nodes = useMemo(
    () => flattenFolderTree(buildFolderTree(folders ?? [])),
    [folders],
  );
  const picked = new Set(value.tags.map((tag) => tag.id));
  const tagLabel =
    value.tags.length === 0
      ? "Only the file's tags"
      : value.tags.map((tag) => tag.name).join(", ");

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="import-folder">{t("folderForEveryCode")}</Label>
        <Select
          disabled={disabled || folders === null}
          onValueChange={(id) => {
            const node = nodes.find((item) => item.id === id);
            onChange({
              ...value,
              folder: node ? { id: node.id, name: node.name } : null,
            });
          }}
          value={value.folder?.id ?? FROM_FILE}
        >
          <SelectTrigger className="w-full" id="import-folder">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={FROM_FILE}>
              {t("onlyTheFilesFolders")}
            </SelectItem>
            {nodes.map((node) => (
              <SelectItem key={node.id} value={node.id}>
                <span style={{ paddingLeft: `${node.depth * 0.75}rem` }}>
                  {node.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">
          {t("rowsWithAFolderIn")}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="import-tags">{t("tagsForEveryCode")}</Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className="w-full justify-between font-normal"
              disabled={disabled || tags === null}
              id="import-tags"
              variant="outline"
            >
              <span className="truncate">{tagLabel}</span>
              <ChevronDown className="text-muted-foreground size-4 shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
              {t("addedToTheFilesTags", { MAX_TAGS_PER_CODE })}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(tags ?? []).length === 0 ? (
              <p className="text-muted-foreground px-2 py-1.5 text-sm">
                {t("noTagsYetTagsNamed")}
              </p>
            ) : (
              (tags ?? []).map((tag) => (
                <DropdownMenuCheckboxItem
                  checked={picked.has(tag.id)}
                  disabled={
                    !picked.has(tag.id) &&
                    value.tags.length >= MAX_TAGS_PER_CODE
                  }
                  key={tag.id}
                  onCheckedChange={(checked) =>
                    onChange({
                      ...value,
                      tags: checked
                        ? [...value.tags, { id: tag.id, name: tag.name }]
                        : value.tags.filter((item) => item.id !== tag.id),
                    })
                  }
                  onSelect={(event) => event.preventDefault()}
                >
                  <TagDot color={tag.color} />
                  <span className="truncate">{tag.name}</span>
                </DropdownMenuCheckboxItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <p className="text-muted-foreground text-xs">{t("tagsInTheFileAre")}</p>
      </div>
    </div>
  );
}
