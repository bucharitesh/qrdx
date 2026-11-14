/**
 * Docs redirects: short entry points (qrdx.dev/help) and any docs page that
 * moves. next.config.ts serves them on QRdx's own hosts only, so a custom
 * domain's /help short link is never taken over.
 *
 * The docs tabs (Help, Guides, Developers, React library, Self-hosting) kept
 * every page at its old URL (lib/docs-tree.ts), so nothing here is a move yet.
 * When a page moves, add `{ source: old, destination: new, permanent: true }`:
 * tests/lib/docs-structure.test.ts fails while an old docs URL resolves to
 * neither a page nor a redirect.
 */
export interface DocsRedirect {
  source: string;
  destination: string;
  permanent: boolean;
}

export const DOCS_REDIRECTS: readonly DocsRedirect[] = [
  // Where people look for help ("help" and "support" are reserved slugs).
  { source: "/help", destination: "/docs/help", permanent: false },
  { source: "/support", destination: "/docs/help/contact", permanent: false },
];
