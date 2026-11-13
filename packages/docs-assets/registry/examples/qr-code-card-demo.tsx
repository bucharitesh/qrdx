"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { QrCodeCard, type QrCodeStyle } from "@/registry/qrdx/qr-code-card";
import { QrCodeDownload } from "@/registry/qrdx/qr-code-download";
import { Button } from "@/registry/ui/button";

const url = "https://qrdx.dev";
const style: QrCodeStyle = {
  bodyPattern: "rounded",
  cornerEyePattern: "extra-rounded",
};

export default function QrCodeCardDemo() {
  const [copied, setCopied] = useState(false);

  return (
    <QrCodeCard
      description="Point your phone camera at the code to open the site."
      qr={style}
      title="qrdx.dev"
      value={url}
    >
      <Button
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
        }}
        size="sm"
        variant="outline"
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {copied ? "Copied" : "Copy link"}
      </Button>
      <QrCodeDownload copy={false} label="Save" qr={style} value={url} />
    </QrCodeCard>
  );
}
