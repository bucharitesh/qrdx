"use client";

import type { Item, Node } from "fumadocs-core/page-tree";
import { useDocsSearch } from "fumadocs-core/search/client";
import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogOverlay,
  type SearchItemType,
  type SharedProps,
} from "fumadocs-ui/components/dialog/search";
import { useTreeContext } from "fumadocs-ui/contexts/tree";
import { ArrowRight } from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { track } from "@/lib/analytics";

/** docs_search once a query settles: its length and result count, never the text. */
function useTrackDocsSearch(search: string, loading: boolean, results: number) {
  const last = useRef("");
  useEffect(() => {
    const query = search.trim();
    if (query.length < 2 || loading || query === last.current) return;
    const timer = setTimeout(() => {
      last.current = query;
      track("docs_search", {
        query_length: query.length,
        result_count: results,
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [search, loading, results]);
}

export default function CustomSearchDialog(props: SharedProps) {
  const { search, setSearch, query } = useDocsSearch({
    type: "fetch",
  });
  const { full } = useTreeContext();
  const router = useRouter();
  useTrackDocsSearch(
    search,
    query.isLoading,
    Array.isArray(query.data) ? query.data.length : 0,
  );
  const searchMap = useMemo(() => {
    const map = new Map<string, Item>();

    function onNode(node: Node) {
      if (node.type === "page" && typeof node.name === "string") {
        map.set(node.name.toLowerCase(), node);
      } else if (node.type === "folder") {
        if (node.index) onNode(node.index);
        for (const item of node.children) onNode(item);
      }
    }

    for (const item of full.children) onNode(item);
    return map;
  }, [full]);
  const pageTreeAction = useMemo<SearchItemType | undefined>(() => {
    if (search.length === 0) return;

    const normalized = search.toLowerCase();
    for (const [k, page] of searchMap) {
      if (!k.startsWith(normalized)) continue;

      return {
        id: "quick-action",
        type: "action",
        node: (
          <div className="inline-flex items-center gap-2 text-fd-muted-foreground">
            <ArrowRight className="size-4" />
            <p>
              Jump to{" "}
              <span className="font-medium text-fd-foreground">
                {page.name}
              </span>
            </p>
          </div>
        ),
        onSelect: () => router.push(page.url),
      };
    }
  }, [router, search, searchMap]);

  return (
    <SearchDialog
      search={search}
      onSearchChange={setSearch}
      isLoading={query.isLoading}
      {...props}
    >
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList
          items={
            query.data !== "empty" || pageTreeAction
              ? [
                  ...(pageTreeAction ? [pageTreeAction] : []),
                  ...(Array.isArray(query.data) ? query.data : []),
                ]
              : null
          }
        />
      </SearchDialogContent>
    </SearchDialog>
  );
}
