"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { NewCodeDialog } from "@/app/(app)/dashboard/codes/_components/new-code-dialog";
import type { ShellData } from "@/components/app-shell/shell-data";
import type { QRStyle } from "@/types/theme";
import { useCodeBuilderHostSlot, useCodeBuilderStore } from "./store";

// The builder (pickers, presets, panels) loads the first time it opens, not
// with every app page.
const CodeBuilderModal = dynamic(() => import("./code-builder-modal"), {
  ssr: false,
});
// The barcode drawing (bwip-js) too: only once a new barcode is asked for.
const BarcodeBuilderModal = dynamic(() => import("./barcode-builder-modal"), {
  ssr: false,
});

/** What the page gallery opens at. */
interface PageGallery {
  type: string | null;
  template: string | null;
  style: QRStyle | null;
}

/**
 * The builder, the new-barcode modal and the hosted page gallery, as the
 * store asks. Rendered by the active host only (CodeBuilderHost here, or the
 * playground's).
 */
export function CodeBuilderSurfaces({ usage }: { usage: ShellData["codes"] }) {
  const request = useCodeBuilderStore((state) => state.request);
  const session = useCodeBuilderStore((state) => state.session);
  const close = useCodeBuilderStore((state) => state.close);
  // "Hosted page" continues in the page template gallery. Its settings
  // outlive `pageOpen`, so the gallery doesn't change while it closes.
  const [page, setPage] = useState<PageGallery>({
    type: null,
    template: null,
    style: null,
  });
  const [pageOpen, setPageOpen] = useState(false);

  const onChoosePageType = useCallback(
    (type: string, style: QRStyle | null) => {
      setPage({ type, template: null, style });
      setPageOpen(true);
    },
    [],
  );

  // A page gallery request opens the gallery and frees the store for the
  // next request (the gallery isn't the builder modal).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `session` marks each new request
  useEffect(() => {
    if (request?.mode !== "page") return;
    setPage({
      type: request.type ?? null,
      template: request.template ?? null,
      style: request.style ?? null,
    });
    setPageOpen(true);
    close();
  }, [request, session, close]);

  return (
    <>
      {(request?.mode === "create" || request?.mode === "edit") && (
        <CodeBuilderModal
          key={session}
          onChoosePageType={onChoosePageType}
          onClosed={close}
          request={request}
          usage={usage}
        />
      )}
      {request?.mode === "barcode" && (
        <BarcodeBuilderModal key={session} onClosed={close} request={request} />
      )}
      <NewCodeDialog
        initialType={page.type}
        initialVariant={page.template}
        onOpenChange={setPageOpen}
        open={pageOpen}
        pagesOnly
        style={page.style}
      />
    </>
  );
}

/**
 * Renders the builder that openCodeBuilder() asks for. The app shell mounts
 * one; a second host stays idle, so the builder never opens twice.
 */
export function CodeBuilderHost({ usage }: { usage: ShellData["codes"] }) {
  const active = useCodeBuilderHostSlot();
  if (!active) return null;
  return <CodeBuilderSurfaces usage={usage} />;
}
