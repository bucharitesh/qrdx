"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useId, useState } from "react";
import { NewCodeDialog } from "@/app/dashboard/codes/_components/new-code-dialog";
import type { ShellData } from "@/components/app-shell/shell-data";
import { useCodeBuilderStore } from "./store";

// The builder (pickers, presets, panels) loads the first time it opens, not
// with every app page.
const CodeBuilderModal = dynamic(() => import("./code-builder-modal"), {
  ssr: false,
});

/**
 * Renders the builder that openCodeBuilder() asks for. The app shell mounts
 * one; a second host stays idle, so the builder never opens twice.
 */
export function CodeBuilderHost({ usage }: { usage: ShellData["codes"] }) {
  const id = useId();
  const request = useCodeBuilderStore((state) => state.request);
  const session = useCodeBuilderStore((state) => state.session);
  const active = useCodeBuilderStore((state) => state.hosts[0] === id);
  const registerHost = useCodeBuilderStore((state) => state.registerHost);
  const close = useCodeBuilderStore((state) => state.close);
  // "Hosted page" continues in the page template gallery. The type outlives
  // `pageOpen`, so the gallery doesn't change while it closes.
  const [pageType, setPageType] = useState<string | null>(null);
  const [pageOpen, setPageOpen] = useState(false);

  useEffect(() => registerHost(id), [registerHost, id]);

  const onChoosePageType = useCallback((type: string) => {
    setPageType(type);
    setPageOpen(true);
  }, []);

  if (!active) return null;
  return (
    <>
      {request && (
        <CodeBuilderModal
          key={session}
          onChoosePageType={onChoosePageType}
          onClosed={close}
          request={request}
          usage={usage}
        />
      )}
      <NewCodeDialog
        initialType={pageType}
        onOpenChange={setPageOpen}
        open={pageOpen}
        pagesOnly
      />
    </>
  );
}
