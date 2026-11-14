"use client";

import { useSearchContext } from "fumadocs-ui/contexts/search";
import type { ComponentProps } from "react";

/** A button that opens the docs search dialog (the one ⌘K opens). */
export function HelpSearchTrigger(
  props: Omit<ComponentProps<"button">, "type" | "onClick">,
) {
  const { setOpenSearch } = useSearchContext();
  return (
    <button {...props} onClick={() => setOpenSearch(true)} type="button" />
  );
}
