// The new-barcode modal's requests: what /barcodes/new opens, and where the
// address bar goes as the modal closes. Pure, so the rules are tested
// without a browser.

import type { CodeBuilderRequest } from "./store";

export type BarcodeBuilderRequest = Extract<
  CodeBuilderRequest,
  { mode: "barcode" }
>;

/**
 * /dashboard/<workspace>/barcodes/new (old links and bookmarks to the page
 * the modal replaced): the modal over the list, which stays at `listPath`
 * once it closes.
 */
export function newBarcodePageRequest(listPath: string): BarcodeBuilderRequest {
  return {
    mode: "barcode",
    closeTo: { from: `${listPath}/new`, to: listPath },
  };
}

/**
 * The address to show after closing, or null to leave it. Only on the page
 * it was opened from: someone who went elsewhere meanwhile stays there.
 */
export function addressAfterClose(
  request: BarcodeBuilderRequest,
  pathname: string,
): string | null {
  const { closeTo } = request;
  if (!closeTo) return null;
  const here = pathname.replace(/\/+$/, "");
  return here === closeTo.from ? closeTo.to : null;
}
