"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@repo/design-system/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import { Plus } from "lucide-react";
import { useState } from "react";
import { BLOCK_CATEGORIES, listBlocks } from "@/lib/landing/blocks";
import { PAGE_SETTINGS_TYPE } from "../page-settings-block";

/** Searchable, categorized list of every registered block type. */
export function AddBlockMenu({
  onAdd,
  disabled,
}: {
  onAdd: (type: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const blocks = listBlocks().filter(
    (block) => block.type !== PAGE_SETTINGS_TYPE,
  );

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button className="w-full" disabled={disabled} variant="outline">
          <Plus />
          Add block
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <Command>
          <CommandInput placeholder="Search blocks" />
          <CommandList className="max-h-96">
            <CommandEmpty>No blocks found.</CommandEmpty>
            {BLOCK_CATEGORIES.map((category) => {
              const items = blocks.filter(
                (block) => block.category === category.id,
              );
              if (items.length === 0) return null;
              return (
                <CommandGroup heading={category.label} key={category.id}>
                  {items.map((block) => {
                    const Icon = block.icon;
                    return (
                      <CommandItem
                        key={block.type}
                        keywords={[block.description ?? "", category.label]}
                        onSelect={() => {
                          onAdd(block.type);
                          setOpen(false);
                        }}
                        value={block.label}
                      >
                        <Icon className="size-4" />
                        <span className="min-w-0">
                          <span className="block text-sm">{block.label}</span>
                          {block.description && (
                            <span className="text-muted-foreground block truncate text-xs">
                              {block.description}
                            </span>
                          )}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
