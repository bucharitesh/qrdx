"use client";

import dynamic from "next/dynamic";

/**
 * The playground editor as its own chunk. A visit still server-renders it
 * and preloads its code with the page, but a <Link> prefetch of the static
 * /playground no longer downloads the whole editor on every page that links
 * to it.
 */
export const LazyEditor = dynamic(() => import("./editor"));
