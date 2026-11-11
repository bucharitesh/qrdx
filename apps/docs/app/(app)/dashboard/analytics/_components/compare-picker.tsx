"use client";

import { Close as X } from "@repo/design-system/components/icons";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

const MAX_COMPARE = 4;

/** Picks up to four codes (`?compare=id,id`), keeping the other query params. */
export function ComparePicker({
  options,
  selected,
  path,
  params,
}: {
  options: { id: string; label: string }[];
  selected: string[];
  path: string;
  /** Other query params of the page (without compare) */
  params: Record<string, string>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const labels = new Map(options.map((option) => [option.id, option.label]));

  const go = (ids: string[]) => {
    const search = new URLSearchParams(params);
    if (ids.length > 0) search.set("compare", ids.join(","));
    const query = search.toString();
    startTransition(() => {
      router.push(query ? `${path}?${query}` : path, { scroll: false });
    });
  };

  const available = options.filter((option) => !selected.includes(option.id));

  return (
    <div className="flex flex-wrap items-center gap-2">
      {selected.map((id) => (
        <Badge className="gap-1 pr-1" key={id} variant="secondary">
          <span className="max-w-48 truncate">{labels.get(id) ?? id}</span>
          <Button
            aria-label={`Stop comparing ${labels.get(id) ?? id}`}
            className="size-5"
            disabled={isPending}
            onClick={() => go(selected.filter((item) => item !== id))}
            size="icon"
            variant="ghost"
          >
            <X className="size-3" />
          </Button>
        </Badge>
      ))}
      <Select
        disabled={
          isPending || selected.length >= MAX_COMPARE || available.length === 0
        }
        onValueChange={(id) => go([...selected, id].slice(0, MAX_COMPARE))}
        value=""
      >
        <SelectTrigger
          aria-label="Add a code to compare"
          className="w-64"
          size="sm"
        >
          <SelectValue
            placeholder={
              selected.length >= MAX_COMPARE
                ? `Up to ${MAX_COMPARE} codes`
                : "Add a code to compare"
            }
          />
        </SelectTrigger>
        <SelectContent>
          {available.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
