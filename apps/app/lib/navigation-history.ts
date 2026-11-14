// The site's pages visited in this tab, newest last: pathnames only, kept in
// memory, never stored or sent. document.referrer names the page that loaded
// the document, and an App Router navigation doesn't load a new one, so after
// an in-app link it still names wherever the visit started. The playground
// asks here where a link into it came from (lib/hooks/use-playground-params.ts).
// Recorded by components/navigation-history.tsx.

/** Two distinct pathnames are enough to know the page before this one. */
const KEEP = 2;

export interface NavigationHistory {
  record: (pathname: string) => void;
  /** The latest page other than `current`, or null on the tab's first page. */
  previous: (current: string) => string | null;
}

export function createNavigationHistory(): NavigationHistory {
  let recent: string[] = [];
  return {
    record(pathname) {
      if (!pathname.startsWith("/") || recent.at(-1) === pathname) return;
      recent = [...recent, pathname].slice(-KEEP);
    },
    // The current page may or may not be recorded yet: effects run children
    // first, so the playground can ask before the recorder has seen it.
    previous(current) {
      for (let index = recent.length - 1; index >= 0; index--) {
        if (recent[index] !== current) return recent[index] ?? null;
      }
      return null;
    },
  };
}

const tabHistory = createNavigationHistory();

export const recordPathname = tabHistory.record;
export const previousPathname = tabHistory.previous;
