"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import {
  isUnfiltered,
  parseCodesFilters,
} from "@/app/dashboard/codes/_lib/organize-shared";
import type { QrCodeListItem } from "@/app/dashboard/codes/_lib/qr-codes";
import { mergeOptimisticCodes, settledKeys } from "./optimistic";
import { useCodeBuilderStore } from "./store";

/**
 * The codes list with the builder's saves shown at once: edits while they
 * run, new codes as soon as they exist. The server's rows take over when
 * the refreshed list arrives.
 */
export function useOptimisticCodeList(
  codes: QrCodeListItem[],
): QrCodeListItem[] {
  const params = useSearchParams();
  const optimistic = useCodeBuilderStore((state) => state.optimistic);
  const prune = useCodeBuilderStore((state) => state.pruneOptimistic);
  const entries = useMemo(() => Object.values(optimistic), [optimistic]);

  // A new code belongs on top only of the plain list: all active codes,
  // newest first, page one.
  const acceptNew = useMemo(() => {
    const filters = parseCodesFilters(Object.fromEntries(params.entries()));
    return (
      isUnfiltered(filters) && filters.sort === "newest" && filters.page === 1
    );
  }, [params]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the server sends a new list.
  useEffect(() => {
    prune(
      settledKeys(
        Object.values(useCodeBuilderStore.getState().optimistic),
        Date.now(),
      ),
    );
  }, [codes, prune]);

  return useMemo(
    () => mergeOptimisticCodes(codes, entries, { acceptNew }),
    [codes, entries, acceptNew],
  );
}
