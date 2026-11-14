"use client";

import { useEffect, useRef } from "react";
import { newBarcodePageRequest } from "@/components/code-builder/barcode-request";
import {
  openCodeBuilder,
  useCodeBuilderStore,
} from "@/components/code-builder/store";

/**
 * /barcodes/new, where old links and bookmarks go: opens the new-barcode
 * modal over the list once, and closing it leaves the list at /barcodes.
 */
export function OpenNewBarcode({ listPath }: { listPath: string }) {
  // The app shell's builder host registers after this page's effects run,
  // so this waits for it instead of finding no host.
  const hosted = useCodeBuilderStore((state) => state.hosts.length > 0);
  const opened = useRef(false);
  useEffect(() => {
    if (!hosted || opened.current) return;
    opened.current = true;
    openCodeBuilder(newBarcodePageRequest(listPath));
  }, [hosted, listPath]);
  return null;
}
