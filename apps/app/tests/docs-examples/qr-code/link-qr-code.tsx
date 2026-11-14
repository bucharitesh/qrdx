"use client";

import { useState } from "react";
import { QrCode } from "@/registry/qrdx/qr-code";

export function LinkQrCode() {
  const [value, setValue] = useState("https://example.com");
  return (
    <div className="grid justify-items-center gap-4">
      <input
        aria-label="Link"
        className="w-full rounded-md border px-3 py-2"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      {value ? <QrCode value={value} downloadFormats={[]} /> : null}
    </div>
  );
}
