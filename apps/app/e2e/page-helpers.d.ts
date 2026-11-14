// The in-page helpers that e2e/cdp.mjs installs in every page as
// window.__e2e (PAGE_HELPERS). One declaration for every e2e script, so two
// scripts can't declare the global with different types.

type E2eRoot = Document | Element;

interface E2ePageHelpers {
  /** Lower-cases and collapses whitespace. */
  norm: (text: string | null | undefined) => string;
  visible: (element: Element | null | undefined) => boolean;
  /** The element's accessible-ish name, normalised. */
  name: (element: Element) => string;
  all: (role: string, root?: E2eRoot) => HTMLElement[];
  byRole: (
    role: string,
    text: string,
    // cdp.mjs reads `root || document`, so null means the whole page.
    options?: { exact?: boolean; root?: E2eRoot | null },
  ) => HTMLElement | null;
  byLabel: (text: string, root?: E2eRoot) => HTMLElement | null;
  byText: (text: string, root?: E2eRoot) => HTMLElement | null;
  setValue: (element: Element, value: string) => void;
  click: (element: Element) => void;
}

interface Window {
  __e2e: E2ePageHelpers;
}
