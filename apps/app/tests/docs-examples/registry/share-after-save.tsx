"use client";

import { useState } from "react";
import { QrCodeShareDialog } from "@/registry/qrdx/qr-code-share-dialog";

export function ShareAfterSave({ url }: { url: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Save and share
      </button>
      <QrCodeShareDialog url={url} open={open} onOpenChange={setOpen} />
    </>
  );
}
