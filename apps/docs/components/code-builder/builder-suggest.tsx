"use client";

// "Suggest" next to the builder's back-half and tags fields (the Dub study's
// gap 11; Dub's AI key button and tag suggestions in
// ui/links/link-builder/, AGPL-3.0: the flow, not the code). One request
// fills both: up to three free back-halves and up to three tags, shown as
// chips under each field. Picking one only fills the form; nothing is saved
// until the code is.

import { toast } from "@repo/design-system";
import { Spinner } from "@repo/design-system/components/icons";
import { cn } from "@repo/design-system/lib/utils";
import { Add, Magicpen } from "iconsax-reactjs";
import {
  type ReactNode,
  useCallback,
  useRef,
  useState,
  useTransition,
} from "react";
import { suggestCodeDetailsAction } from "@/actions/code-suggestions";
import { createCodeTag } from "@/actions/tags";
import type { TagRow } from "@/app/dashboard/codes/_lib/organize";
import { MAX_TAGS_PER_CODE } from "@/app/dashboard/codes/_lib/organize-shared";

type SuggestState =
  | { status: "idle" }
  | { status: "loading"; key: string }
  | { status: "ready"; key: string; slugs: string[]; tags: string[] }
  | { status: "error"; key: string; message: string };

export interface CodeSuggestionsState {
  state: SuggestState;
  /** Suggestions for the current destination and domain, when loaded */
  current: { slugs: string[]; tags: string[] } | null;
  loading: boolean;
  /** Which field asked last, so its chips show first */
  field: "slug" | "tags" | null;
  request: (field: "slug" | "tags") => void;
}

/**
 * Suggestions for one destination on one domain: asked for on demand, kept
 * until either changes (so clicking Suggest by the other field is free).
 */
export function useCodeSuggestions({
  destination,
  domainId,
  codeId,
  tags,
  currentTagIds,
}: {
  /** A valid destination URL, or null */
  destination: string | null;
  domainId: string | null;
  codeId: string | null;
  tags: TagRow[] | null;
  currentTagIds: string[];
}): CodeSuggestionsState {
  const [state, setState] = useState<SuggestState>({ status: "idle" });
  const [field, setField] = useState<"slug" | "tags" | null>(null);
  const latest = useRef("");
  const key = destination ? `${destination}\n${domainId ?? ""}` : "";

  const request = useCallback(
    (asking: "slug" | "tags") => {
      setField(asking);
      if (!(destination && key)) return;
      if (
        (state.status === "ready" || state.status === "loading") &&
        state.key === key
      ) {
        return;
      }
      latest.current = key;
      setState({ status: "loading", key });
      const byId = new Map((tags ?? []).map((tag) => [tag.id, tag.name]));
      suggestCodeDetailsAction({
        destination,
        domainId,
        codeId,
        existingTags: (tags ?? []).map((tag) => tag.name),
        currentTags: currentTagIds.flatMap((id) => byId.get(id) ?? []),
      })
        .then((result) => {
          if (latest.current !== key) return;
          if (result.success) {
            setState({ status: "ready", key, ...result.data });
          } else {
            setState({ status: "error", key, message: result.error.message });
          }
        })
        .catch(() => {
          if (latest.current === key) {
            setState({
              status: "error",
              key,
              message: "Couldn't get suggestions right now. Try again.",
            });
          }
        });
    },
    [destination, domainId, codeId, key, state, tags, currentTagIds],
  );

  const fresh = "key" in state && state.key === key;
  return {
    state,
    current:
      fresh && state.status === "ready"
        ? { slugs: state.slugs, tags: state.tags }
        : null,
    loading: fresh && state.status === "loading",
    field,
    request,
  };
}

/** The small "Suggest" action on a field's label row. */
export function SuggestButton({
  onClick,
  loading,
  disabled,
  label,
}: {
  onClick: () => void;
  loading: boolean;
  disabled?: boolean;
  /** For screen readers: "Suggest back-halves" */
  label: string;
}) {
  return (
    <button
      aria-label={label}
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium transition-colors outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50"
      disabled={disabled || loading}
      onClick={onClick}
      title={disabled ? "Enter a destination first" : undefined}
      type="button"
    >
      {loading ? (
        <Spinner aria-hidden className="size-3.5 animate-spin" />
      ) : (
        <Magicpen aria-hidden className="size-3.5" />
      )}
      Suggest
    </button>
  );
}

const CHIP =
  "bg-muted/60 hover:bg-muted focus-visible:ring-ring/50 inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors outline-none focus-visible:ring-[3px] disabled:opacity-50";

/** Chips under a field; also says when there's nothing to suggest. */
function ChipRow({
  label,
  children,
  empty,
}: {
  label: string;
  children: ReactNode;
  empty: string | null;
}) {
  return (
    <fieldset
      aria-live="polite"
      className="m-0 flex min-w-0 flex-wrap items-center gap-1.5 border-0 p-0 pt-0.5"
    >
      <legend className="sr-only">{label}</legend>
      {empty ? (
        <span className="text-muted-foreground text-xs">{empty}</span>
      ) : (
        children
      )}
    </fieldset>
  );
}

/** Back-half chips: picking one fills the field (the live check runs as usual). */
export function SlugSuggestions({
  suggestions,
  error,
  value,
  onPick,
}: {
  suggestions: string[] | null;
  error: string | null;
  value: string;
  onPick: (slug: string) => void;
}) {
  if (!(suggestions || error)) return null;
  return (
    <ChipRow
      empty={
        error ??
        (suggestions?.length === 0
          ? "No free back-halves came up. Try typing one."
          : null)
      }
      label="Suggested back-halves"
    >
      {suggestions?.map((slug) => (
        <button
          aria-pressed={value === slug}
          className={cn(CHIP, "font-mono", value === slug && "bg-muted")}
          key={slug}
          onClick={() => onPick(slug)}
          type="button"
        >
          {slug}
        </button>
      ))}
    </ChipRow>
  );
}

/**
 * Tag chips: an existing tag is added, a new one is created first (as the
 * tags field does when you type a new name).
 */
export function TagSuggestions({
  suggestions,
  error,
  tags,
  value,
  onChange,
  onCreated,
}: {
  suggestions: string[] | null;
  error: string | null;
  tags: TagRow[] | null;
  value: string[];
  onChange: (tagIds: string[]) => void;
  onCreated: (tag: TagRow) => void;
}) {
  const [isPending, startTransition] = useTransition();
  if (!(suggestions || error)) return null;
  const byName = new Map(
    (tags ?? []).map((tag) => [tag.name.toLowerCase(), tag]),
  );
  const open = (suggestions ?? []).filter((name) => {
    const existing = byName.get(name.toLowerCase());
    return !(existing && value.includes(existing.id));
  });
  const full = value.length >= MAX_TAGS_PER_CODE;

  const add = (name: string) => {
    const existing = byName.get(name.toLowerCase());
    if (existing) {
      onChange([...value, existing.id]);
      return;
    }
    startTransition(async () => {
      try {
        const result = await createCodeTag({ name });
        if (!result.success) {
          toast.error(result.error.message);
          return;
        }
        onCreated(result.data);
        onChange([...value, result.data.id]);
      } catch {
        toast.error("Couldn't create the tag. Try again.");
      }
    });
  };

  return (
    <ChipRow
      empty={
        error ??
        (suggestions?.length === 0 ? "No tag ideas for this link." : null)
      }
      label="Suggested tags"
    >
      {open.map((name) => (
        <button
          className={CHIP}
          disabled={isPending || full}
          key={name}
          onClick={() => add(name)}
          type="button"
        >
          <Add aria-hidden className="size-3" />
          <span className="truncate">{name}</span>
        </button>
      ))}
      {open.length === 0 && (suggestions?.length ?? 0) > 0 && (
        <span className="text-muted-foreground text-xs">
          All suggested tags added.
        </span>
      )}
    </ChipRow>
  );
}
