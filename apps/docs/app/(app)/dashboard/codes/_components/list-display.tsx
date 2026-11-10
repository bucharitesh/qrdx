"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  type DisplayList,
  displayCookie,
  type ListDisplay,
} from "@/app/dashboard/codes/_lib/display";

const DisplayContext = createContext<{
  display: ListDisplay;
  setDisplay: (next: ListDisplay) => void;
} | null>(null);

/**
 * The list's Display choices (cards or rows, shown properties). The server
 * passes what the cookie says, so the first paint is already right; a
 * change applies at once and is remembered in this browser.
 */
export function ListDisplayProvider({
  list,
  initial,
  refresh = false,
  children,
}: {
  list: DisplayList;
  initial: ListDisplay;
  /** The list renders on the server: refresh it after a change */
  refresh?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [display, setState] = useState(initial);
  const setDisplay = useCallback(
    (next: ListDisplay) => {
      setState(next);
      try {
        // biome-ignore lint/suspicious/noDocumentCookie: a display preference the server reads on the next visit
        document.cookie = displayCookie(list, next);
      } catch {
        // Blocked cookies: the choice holds until the page reloads.
      }
      if (refresh) router.refresh();
    },
    [list, refresh, router],
  );
  const value = useMemo(() => ({ display, setDisplay }), [display, setDisplay]);
  return (
    <DisplayContext.Provider value={value}>{children}</DisplayContext.Provider>
  );
}

export function useListDisplay() {
  const value = useContext(DisplayContext);
  if (!value) {
    throw new Error("useListDisplay must be used inside ListDisplayProvider");
  }
  return value;
}
