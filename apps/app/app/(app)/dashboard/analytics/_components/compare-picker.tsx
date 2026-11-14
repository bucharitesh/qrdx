"use client";

import { Close as X } from "@repo/design-system/components/icons";
import { ModuleOrbit } from "@repo/design-system/components/loaders";
import { Badge } from "@repo/design-system/components/ui/badge";
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
import { ArrowDown2 } from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { searchCompareCodes } from "@/app/(app)/dashboard/analytics/_lib/actions";
import type { CompareOption } from "@/app/(app)/dashboard/analytics/_lib/code-label";

const MAX_COMPARE = 4;
/** Wait this long after the last keystroke before searching. */
const SEARCH_DELAY_MS = 250;

interface Results {
  options: CompareOption[];
  /** More codes match than are listed: type to narrow */
  more: boolean;
}

/**
 * Picks up to four codes (`?compare=id,id`), keeping the other query params.
 * With an empty search it offers the most scanned codes; typing searches the
 * whole workspace by title, back-half or destination on the server.
 */
export function ComparePicker({
  defaults,
  selected,
  path,
  params,
}: {
  /** The most scanned codes, shown before anything is typed */
  defaults: Results;
  /** The codes being compared, in order, with their names */
  selected: CompareOption[];
  path: string;
  /** Other query params of the page (without compare) */
  params: Record<string, string>;
}) {
  const t = useTranslations("app.dashboard.analytics.comparePicker");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Results | null>(null);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  /** The latest search: answers to older ones are dropped. */
  const latest = useRef(0);

  const term = query.trim();
  useEffect(() => {
    const request = ++latest.current;
    if (!term) {
      setFound(null);
      setSearching(false);
      setFailed(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      const result = await searchCompareCodes({ q: term }).catch(() => null);
      if (request !== latest.current) return;
      setSearching(false);
      setFailed(!result?.ok);
      setFound(result?.ok ? result.data : { options: [], more: false });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [term]);

  const go = (ids: string[]) => {
    const search = new URLSearchParams(params);
    if (ids.length > 0) search.set("compare", ids.join(","));
    const next = search.toString();
    startTransition(() => {
      router.push(next ? `${path}?${next}` : path, { scroll: false });
    });
  };

  const selectedIds = selected.map((option) => option.id);
  const results = term ? found : defaults;
  const available = (results?.options ?? []).filter(
    (option) => !selectedIds.includes(option.id),
  );
  const full = selected.length >= MAX_COMPARE;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {selected.map((option) => (
        <Badge className="gap-1 pr-1" key={option.id} variant="secondary">
          <span className="max-w-48 truncate">{option.label}</span>
          <Button
            aria-label={t("stopComparingValue", { value: option.label })}
            className="size-5"
            disabled={isPending}
            onClick={() => go(selectedIds.filter((id) => id !== option.id))}
            size="icon"
            variant="ghost"
          >
            <X className="size-3" />
          </Button>
        </Badge>
      ))}
      <Popover
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
        open={open}
      >
        <PopoverTrigger asChild>
          <Button
            aria-expanded={open}
            aria-label={t("addACodeToCompare")}
            className="w-64 justify-between font-normal"
            disabled={isPending || full}
            role="combobox"
            size="sm"
            variant="outline"
          >
            <span className="truncate text-muted-foreground">
              {full
                ? t("upToMaxCompareCodes", { MAX_COMPARE })
                : t("addACodeToCompare")}
            </span>
            <ArrowDown2 aria-hidden className="size-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-0">
          <Command shouldFilter={false}>
            <CommandInput
              maxLength={200}
              onValueChange={setQuery}
              placeholder={t("searchCodes")}
              value={query}
            />
            <CommandList onWheelCapture={(event) => event.stopPropagation()}>
              {searching && available.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-sm">
                  <ModuleOrbit aria-hidden />
                  {t("searching")}
                </div>
              ) : (
                <CommandEmpty>
                  {failed ? t("couldntSearch") : t("noCodesMatch")}
                </CommandEmpty>
              )}
              {available.length > 0 && (
                <CommandGroup heading={term ? undefined : t("mostScanned")}>
                  {available.map((option) => (
                    <CommandItem
                      key={option.id}
                      onSelect={() => {
                        setOpen(false);
                        setQuery("");
                        go([...selectedIds, option.id].slice(0, MAX_COMPARE));
                      }}
                      value={option.id}
                    >
                      <span className="truncate">{option.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {results?.more && (
                <p className="px-3 py-2 text-muted-foreground text-xs">
                  {t("typeToNarrow", { count: results.options.length })}
                </p>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
