"use client";

import { useEffect, useState } from "react";

const WIDE_SCREEN = "(min-width: 640px)";

/**
 * The browser's own PDF viewer, inline. Only mounted where it's useful:
 * browsers that render PDFs inline (navigator.pdfViewerEnabled) on screens
 * wide enough to read a page. Phones use the "Open PDF" button instead,
 * which opens their full-screen viewer.
 */
export function PdfInlineViewer({
  src,
  title,
}: {
  src: string;
  title: string;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(WIDE_SCREEN);
    const update = () =>
      setShow(query.matches && navigator.pdfViewerEnabled !== false);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  if (!show) return null;
  return (
    <iframe
      className="block h-[70vh] max-h-[720px] min-h-[420px] w-full rounded-(--lp-radius) border-0 bg-(--lp-muted)"
      loading="lazy"
      src={src}
      title={title}
    />
  );
}
