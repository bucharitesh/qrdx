/**
 * Site pages (outside the docs, which have lib/docs-redirects.ts) that moved
 * to a new URL. next.config.ts serves each as a permanent (308) redirect on
 * QRdx's own hosts only, so a custom domain's short link with the same path
 * is never taken over. Keep an entry for as long as the old URL may be
 * linked from somewhere.
 */
export interface MovedPage {
  source: string;
  destination: string;
  permanent: true;
}

export const MOVED_PAGES: readonly MovedPage[] = [
  // Flam's story was a blog post (live from 2026-11-13) before customer
  // stories got their own section.
  {
    source: "/blog/flam-branded-qr-codes",
    destination: "/customers/flam",
    permanent: true,
  },
];
