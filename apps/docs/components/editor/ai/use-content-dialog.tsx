"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import { useQREditorStore } from "@/store/editor-store";
import type { ContentType } from "@/types/qr-content";
import { type ContentSnapshot, snapshotContent } from "./content-request";

// The content dialog (and every content form) loads on first open.
const ContentDialog = dynamic(
  () => import("./content-dialog").then((mod) => mod.ContentDialog),
  { ssr: false },
);

/**
 * The content dialog for a chat card: `show()` opens it and remembers what
 * the editor holds, so Cancel (or Back from a type's form) puts it back.
 */
export function useContentDialog({
  onDone,
  onCancel,
}: {
  onDone: (type: ContentType) => void;
  onCancel?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const snapshot = useRef<ContentSnapshot | null>(null);

  const show = useCallback(() => {
    snapshot.current = snapshotContent(useQREditorStore.getState());
    setMounted(true);
    setOpen(true);
  }, []);

  const restore = () => {
    if (snapshot.current) useQREditorStore.setState(snapshot.current);
  };

  const dialog = mounted ? (
    <ContentDialog
      onCancel={() => {
        restore();
        snapshot.current = null;
        setOpen(false);
        onCancel?.();
      }}
      onDone={(type) => {
        snapshot.current = null;
        setOpen(false);
        onDone(type);
      }}
      open={open}
      restore={restore}
    />
  ) : null;

  return { show, open, dialog };
}
